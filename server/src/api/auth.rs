use axum::extract::State;
use axum::http::{header::HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

/// Extract client IP from X-Forwarded-For or X-Real-IP headers, fallback to 127.0.0.1
fn client_ip(headers: &HeaderMap) -> std::net::IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse().ok())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse().ok())
        })
        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST))
}

// ── Registration (first user = admin) ──

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub profile: AuthProfile,
}

#[derive(Serialize, Clone)]
pub struct AuthProfile {
    pub id: String,
    pub name: String,
    pub is_admin: bool,
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    // Rate limit
    let ip = client_ip(&headers);
    if !state.auth_rate_limiter.check(ip).await {
        return Err(AppError::BadRequest("Too many requests. Please try again later.".to_string()));
    }

    let username = body.username.trim().to_string();
    if username.is_empty() {
        return Err(AppError::BadRequest("Username is required".to_string()));
    }
    if body.password.len() < 4 {
        return Err(AppError::BadRequest(
            "Password must be at least 4 characters".to_string(),
        ));
    }

    // Check if any profiles exist — first profile becomes admin
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles")
        .fetch_one(&state.db)
        .await?;
    let is_admin = count.0 == 0;

    // Hash password
    let pw = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || bcrypt::hash(pw, 10))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?
        .map_err(|e| AppError::Internal(format!("Bcrypt error: {}", e)))?;

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO profiles (id, name, password_hash, is_admin) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&username)
        .bind(&hash)
        .bind(is_admin)
        .execute(&state.db)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref db_err) if db_err.message().contains("UNIQUE") => {
                AppError::BadRequest("Username already taken".to_string())
            }
            _ => AppError::Database(e),
        })?;

    // Create session (1 year expiry)
    let token = generate_token();
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(365)).to_rfc3339();

    sqlx::query("INSERT INTO sessions (id, profile_id, token, expires_at) VALUES (?, ?, ?, ?)")
        .bind(&session_id)
        .bind(&id)
        .bind(&token)
        .bind(&expires_at)
        .execute(&state.db)
        .await?;

    // Also initialize admin_config if this is the first user
    if is_admin {
        let existing: Option<(i32,)> =
            sqlx::query_as("SELECT id FROM admin_config WHERE id = 1")
                .fetch_optional(&state.db)
                .await?;
        if existing.is_none() {
            sqlx::query(
                "INSERT INTO admin_config (id, session_timeout_min, remote_enabled, guest_enabled) VALUES (1, 60, 0, 0)",
            )
            .execute(&state.db)
            .await?;
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token,
            profile: AuthProfile {
                id,
                name: username,
                is_admin,
            },
        }),
    ))
}

// ── Login ──

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    // Rate limit
    let ip = client_ip(&headers);
    if !state.auth_rate_limiter.check(ip).await {
        return Err(AppError::BadRequest("Too many requests. Please try again later.".to_string()));
    }

    let username = body.username.trim().to_string();

    let row: Option<(String, String, Option<String>, bool)> =
        sqlx::query_as("SELECT id, name, password_hash, is_admin FROM profiles WHERE name = ?")
            .bind(&username)
            .fetch_optional(&state.db)
            .await?;

    let (id, name, password_hash, is_admin) = row.ok_or(AppError::Unauthorized)?;

    let hash = password_hash.ok_or(AppError::Unauthorized)?;

    let pw = body.password.clone();
    let h = hash.clone();
    let valid = tokio::task::spawn_blocking(move || bcrypt::verify(pw, &h).unwrap_or(false))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    // Create session (1 year expiry)
    let token = generate_token();
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(365)).to_rfc3339();

    sqlx::query("INSERT INTO sessions (id, profile_id, token, expires_at) VALUES (?, ?, ?, ?)")
        .bind(&session_id)
        .bind(&id)
        .bind(&token)
        .bind(&expires_at)
        .execute(&state.db)
        .await?;

    Ok(Json(AuthResponse {
        token,
        profile: AuthProfile {
            id,
            name,
            is_admin,
        },
    }))
}

// ── Logout ──

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, AppError> {
    if let Some(token) = extract_bearer_token(&headers) {
        sqlx::query("DELETE FROM sessions WHERE token = ?")
            .bind(token)
            .execute(&state.db)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── Get Current User ──

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuthProfile>, AppError> {
    let profile = require_auth(&state, &headers).await?;
    Ok(Json(profile))
}

// ── Auth Status (is setup complete? how many users?) ──

#[derive(Serialize)]
pub struct AuthStatusResponse {
    pub setup_complete: bool,
    pub user_count: i64,
}

pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<AuthStatusResponse>, AppError> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles")
        .fetch_one(&state.db)
        .await?;

    Ok(Json(AuthStatusResponse {
        setup_complete: count.0 > 0,
        user_count: count.0,
    }))
}

// ── Helpers ──

/// Extract bearer token from Authorization header
pub fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
}

/// Require a valid authenticated session, return the profile
pub async fn require_auth(state: &AppState, headers: &HeaderMap) -> Result<AuthProfile, AppError> {
    let token = extract_bearer_token(headers).ok_or(AppError::Unauthorized)?;

    let row: Option<(String, String, bool, String)> = sqlx::query_as(
        "SELECT p.id, p.name, p.is_admin, s.expires_at
         FROM sessions s
         JOIN profiles p ON s.profile_id = p.id
         WHERE s.token = ?",
    )
    .bind(token)
    .fetch_optional(&state.db)
    .await?;

    let (id, name, is_admin, expires_at) = row.ok_or(AppError::Unauthorized)?;

    // Check expiry
    if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(&expires_at) {
        if exp < chrono::Utc::now() {
            // Clean up expired session
            sqlx::query("DELETE FROM sessions WHERE token = ?")
                .bind(token)
                .execute(&state.db)
                .await?;
            return Err(AppError::Unauthorized);
        }
    }

    Ok(AuthProfile {
        id,
        name,
        is_admin,
    })
}

/// Require admin privileges
pub async fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<AuthProfile, AppError> {
    let profile = require_auth(state, headers).await?;
    if !profile.is_admin {
        return Err(AppError::Unauthorized);
    }
    Ok(profile)
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    hex::encode(bytes)
}
