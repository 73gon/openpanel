use axum::extract::State;
use axum::http::{header::HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::db::models::{LoginRow, SessionAuthRow};
use crate::error::AppError;
use crate::state::AppState;

/// Extract client IP from X-Forwarded-For or X-Real-IP headers, fallback to 127.0.0.1
pub fn client_ip(headers: &HeaderMap) -> std::net::IpAddr {
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
        return Err(AppError::TooManyRequests);
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

    // Only the first account signs itself up, and becomes the administrator. After that,
    // administrators add accounts (Administration → Users).
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM profiles")
        .fetch_one(&state.db)
        .await?;
    if count.0 > 0 {
        return Err(AppError::Forbidden);
    }
    let is_admin = true;

    // Hash password
    let hash = crate::utils::hash_password(body.password.clone()).await?;

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

    let token = create_session(&state, &id, &headers).await?;

    // Also initialize admin_config if this is the first user
    if is_admin {
        let existing: Option<(i32,)> = sqlx::query_as("SELECT id FROM admin_config WHERE id = 1")
            .fetch_optional(&state.db)
            .await?;
        if existing.is_none() {
            sqlx::query(
                "INSERT INTO admin_config (id, session_timeout_min, remote_enabled) VALUES (1, 60, 0)",
            )
            .execute(&state.db)
            .await?;
        }
    }

    // Log registration event
    let ip_str = ip.to_string();
    let ua = user_agent(&headers);
    let ctx = super::admin::LogContext {
        profile_id: Some(&id),
        profile_name: Some(&username),
        ip_address: Some(&ip_str),
        user_agent: Some(ua),
        ..Default::default()
    };
    super::admin::log_admin_event_ext(
        &state.db,
        "info",
        "auth",
        &format!("User registered: {} (admin={})", username, is_admin),
        None,
        &ctx,
    )
    .await;

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
        return Err(AppError::TooManyRequests);
    }

    let username = body.username.trim().to_string();

    let row: Option<LoginRow> =
        sqlx::query_as("SELECT id, name, password_hash, is_admin FROM profiles WHERE name = ?")
            .bind(&username)
            .fetch_optional(&state.db)
            .await?;

    let r = row.ok_or(AppError::Unauthorized)?;
    let (id, name, is_admin) = (r.id, r.name, r.is_admin);

    let hash = r.password_hash.ok_or(AppError::Unauthorized)?;

    let valid = crate::utils::verify_password(body.password.clone(), hash.clone()).await?;

    let ip_str = ip.to_string();
    let ua = user_agent(&headers);

    if !valid {
        let ctx = super::admin::LogContext {
            profile_id: Some(&id),
            profile_name: Some(&name),
            ip_address: Some(&ip_str),
            user_agent: Some(ua),
            ..Default::default()
        };
        super::admin::log_admin_event_ext(
            &state.db,
            "warn",
            "auth",
            &format!("Failed login attempt for user: {}", name),
            None,
            &ctx,
        )
        .await;
        return Err(AppError::Unauthorized);
    }

    let token = create_session(&state, &id, &headers).await?;

    // Log successful login
    let ctx = super::admin::LogContext {
        profile_id: Some(&id),
        profile_name: Some(&name),
        ip_address: Some(&ip_str),
        user_agent: Some(ua),
        ..Default::default()
    };
    super::admin::log_admin_event_ext(
        &state.db,
        "info",
        "auth",
        &format!("User logged in: {}", name),
        None,
        &ctx,
    )
    .await;

    Ok(Json(AuthResponse {
        token,
        profile: AuthProfile { id, name, is_admin },
    }))
}

// ── Logout ──

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, AppError> {
    if let Some(token) = extract_bearer_token(&headers) {
        // Try to resolve profile before deleting session for logging
        let profile: Option<(String, String)> = sqlx::query_as(
            "SELECT p.id, p.name FROM sessions s JOIN profiles p ON s.profile_id = p.id WHERE s.token = ?",
        )
        .bind(token)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        sqlx::query("DELETE FROM sessions WHERE token = ?")
            .bind(token)
            .execute(&state.db)
            .await?;

        if let Some((pid, pname)) = profile {
            let ip_str = client_ip(&headers).to_string();
            let ctx = super::admin::LogContext {
                profile_id: Some(&pid),
                profile_name: Some(&pname),
                ip_address: Some(&ip_str),
                ..Default::default()
            };
            super::admin::log_admin_event_ext(
                &state.db,
                "info",
                "auth",
                &format!("User logged out: {}", pname),
                None,
                &ctx,
            )
            .await;
        }
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

pub async fn status(State(state): State<AppState>) -> Result<Json<AuthStatusResponse>, AppError> {
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

/// Extract bearer token from Authorization header OR ?token= query parameter.
/// Used for resource endpoints (images, downloads) where <img src> can't send headers.
pub fn extract_token_with_query(headers: &HeaderMap, uri: &axum::http::Uri) -> Option<String> {
    // Try Authorization header first
    if let Some(token) = extract_bearer_token(headers) {
        return Some(token.to_string());
    }
    // Fall back to ?token= query parameter
    uri.query().and_then(|q| {
        q.split('&')
            .find_map(|pair| pair.strip_prefix("token="))
            .map(|t| t.to_string())
    })
}

/// Like require_auth but also checks ?token= query param. For resource endpoints.
pub async fn require_auth_with_query(
    state: &AppState,
    headers: &HeaderMap,
    uri: &axum::http::Uri,
) -> Result<AuthProfile, AppError> {
    let token = extract_token_with_query(headers, uri).ok_or(AppError::Unauthorized)?;
    authenticate(state, headers, &token).await
}

/// Require a valid authenticated session, return the profile
pub async fn require_auth(state: &AppState, headers: &HeaderMap) -> Result<AuthProfile, AppError> {
    let token = extract_bearer_token(headers).ok_or(AppError::Unauthorized)?;
    authenticate(state, headers, token).await
}

/// How often, at most, a session's last use is written down: reading stays read-only.
const SESSION_TOUCH_MINUTES: i64 = 5;

/// The profile behind a session token. Ends an expired session, and notes when and from where
/// a session was last used.
async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    token: &str,
) -> Result<AuthProfile, AppError> {
    let row: Option<SessionAuthRow> = sqlx::query_as(
        "SELECT p.id, p.name, p.is_admin, s.expires_at, s.id AS session_id, s.last_seen_at
         FROM sessions s
         JOIN profiles p ON s.profile_id = p.id
         WHERE s.token = ?",
    )
    .bind(token)
    .fetch_optional(&state.db)
    .await?;

    let r = row.ok_or(AppError::Unauthorized)?;

    // Check expiry
    if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(&r.expires_at) {
        if exp < chrono::Utc::now() {
            // Clean up expired session
            sqlx::query("DELETE FROM sessions WHERE token = ?")
                .bind(token)
                .execute(&state.db)
                .await?;
            return Err(AppError::Unauthorized);
        }
    }

    if seen_long_ago(r.last_seen_at.as_deref(), chrono::Utc::now().naive_utc()) {
        // Best effort: a busy database must not fail the request it rides on.
        let _ = sqlx::query(
            "UPDATE sessions SET last_seen_at = datetime('now'), ip_address = ?,
                    user_agent = COALESCE(user_agent, ?)
             WHERE id = ?",
        )
        .bind(client_ip(headers).to_string())
        .bind(user_agent(headers))
        .bind(&r.session_id)
        .execute(&state.db)
        .await;
    }

    Ok(AuthProfile {
        id: r.id,
        name: r.name,
        is_admin: r.is_admin,
    })
}

/// Whether a session's last use (SQLite time, UTC) is older than the touch interval, or unknown.
fn seen_long_ago(last_seen_at: Option<&str>, now: chrono::NaiveDateTime) -> bool {
    match last_seen_at
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok())
    {
        Some(seen) => now - seen >= chrono::Duration::minutes(SESSION_TOUCH_MINUTES),
        None => true,
    }
}

/// A new session for a profile, a year long, remembering the device it was made on.
async fn create_session(
    state: &AppState,
    profile_id: &str,
    headers: &HeaderMap,
) -> Result<String, AppError> {
    let token = generate_token();
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(365)).to_rfc3339();

    sqlx::query(
        "INSERT INTO sessions (id, profile_id, token, expires_at, user_agent, ip_address, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(&session_id)
    .bind(profile_id)
    .bind(&token)
    .bind(&expires_at)
    .bind(user_agent(headers))
    .bind(client_ip(headers).to_string())
    .execute(&state.db)
    .await?;

    Ok(token)
}

/// The User-Agent header, or "" when there is none.
pub fn user_agent(headers: &HeaderMap) -> &str {
    headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

// ── Sessions: where an account is signed in ──

/// One signed-in device. Times are SQLite time (UTC), "YYYY-MM-DD HH:MM:SS".
#[derive(Serialize, sqlx::FromRow)]
pub struct SessionInfo {
    pub id: String,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    /// The session making this request.
    pub current: bool,
}

#[derive(Serialize)]
pub struct SessionsResponse {
    pub sessions: Vec<SessionInfo>,
}

/// A profile's sessions, most recently used first, with the one behind `token` marked current.
pub async fn sessions_of(
    db: &sqlx::SqlitePool,
    profile_id: &str,
    token: Option<&str>,
) -> Result<Vec<SessionInfo>, AppError> {
    let rows: Vec<SessionInfo> = sqlx::query_as(
        "SELECT id, user_agent, ip_address, created_at, last_seen_at,
                token = COALESCE(?, '') AS current
         FROM sessions
         WHERE profile_id = ?
         ORDER BY COALESCE(last_seen_at, created_at) DESC",
    )
    .bind(token)
    .bind(profile_id)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn list_my_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionsResponse>, AppError> {
    let profile = require_auth(&state, &headers).await?;
    let sessions = sessions_of(&state.db, &profile.id, extract_bearer_token(&headers)).await?;
    Ok(Json(SessionsResponse { sessions }))
}

/// Sign one of your own devices out (your current one too: that is signing out).
pub async fn revoke_my_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(session_id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    let profile = require_auth(&state, &headers).await?;
    let result = sqlx::query("DELETE FROM sessions WHERE id = ? AND profile_id = ?")
        .bind(&session_id)
        .bind(&profile.id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Session not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub struct RevokedResponse {
    pub revoked: u64,
}

/// Sign every other device of yours out, keeping this one.
pub async fn revoke_my_other_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<RevokedResponse>, AppError> {
    let profile = require_auth(&state, &headers).await?;
    let token = extract_bearer_token(&headers).unwrap_or_default();
    let result = sqlx::query("DELETE FROM sessions WHERE profile_id = ? AND token != ?")
        .bind(&profile.id)
        .bind(token)
        .execute(&state.db)
        .await?;

    let ip_str = client_ip(&headers).to_string();
    let ctx = super::admin::LogContext {
        profile_id: Some(&profile.id),
        profile_name: Some(&profile.name),
        ip_address: Some(&ip_str),
        user_agent: Some(user_agent(&headers)),
        ..Default::default()
    };
    super::admin::log_admin_event_ext(
        &state.db,
        "info",
        "auth",
        &format!(
            "{} signed out {} other device(s)",
            profile.name,
            result.rows_affected()
        ),
        None,
        &ctx,
    )
    .await;

    Ok(Json(RevokedResponse {
        revoked: result.rows_affected(),
    }))
}

/// Require admin privileges
pub async fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<AuthProfile, AppError> {
    let profile = require_auth(state, headers).await?;
    if !profile.is_admin {
        return Err(AppError::Forbidden);
    }
    Ok(profile)
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, Uri};

    // ── client_ip ──

    #[test]
    fn client_ip_from_x_forwarded_for() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("1.2.3.4, 10.0.0.1"),
        );
        let ip = client_ip(&headers);
        assert_eq!(ip.to_string(), "1.2.3.4");
    }

    #[test]
    fn client_ip_from_x_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", HeaderValue::from_static("5.6.7.8"));
        let ip = client_ip(&headers);
        assert_eq!(ip.to_string(), "5.6.7.8");
    }

    #[test]
    fn client_ip_fallback_localhost() {
        let headers = HeaderMap::new();
        let ip = client_ip(&headers);
        assert_eq!(ip.to_string(), "127.0.0.1");
    }

    #[test]
    fn client_ip_forwarded_for_takes_priority() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("1.1.1.1"));
        headers.insert("x-real-ip", HeaderValue::from_static("2.2.2.2"));
        let ip = client_ip(&headers);
        assert_eq!(ip.to_string(), "1.1.1.1");
    }

    // ── extract_bearer_token ──

    #[test]
    fn extract_bearer_valid() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_static("Bearer abc123"));
        assert_eq!(extract_bearer_token(&headers), Some("abc123"));
    }

    #[test]
    fn extract_bearer_missing() {
        let headers = HeaderMap::new();
        assert_eq!(extract_bearer_token(&headers), None);
    }

    #[test]
    fn extract_bearer_wrong_scheme() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_static("Basic abc123"));
        assert_eq!(extract_bearer_token(&headers), None);
    }

    // ── extract_token_with_query ──

    #[test]
    fn extract_token_prefers_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer header_tok"),
        );
        let uri: Uri = "/api/page?token=query_tok".parse().unwrap();
        let result = extract_token_with_query(&headers, &uri);
        assert_eq!(result, Some("header_tok".to_string()));
    }

    #[test]
    fn extract_token_falls_back_to_query() {
        let headers = HeaderMap::new();
        let uri: Uri = "/api/page?token=query_tok".parse().unwrap();
        let result = extract_token_with_query(&headers, &uri);
        assert_eq!(result, Some("query_tok".to_string()));
    }

    #[test]
    fn extract_token_with_other_params() {
        let headers = HeaderMap::new();
        let uri: Uri = "/api/page?foo=bar&token=my_token&baz=1".parse().unwrap();
        let result = extract_token_with_query(&headers, &uri);
        assert_eq!(result, Some("my_token".to_string()));
    }

    #[test]
    fn extract_token_none_when_missing() {
        let headers = HeaderMap::new();
        let uri: Uri = "/api/page".parse().unwrap();
        let result = extract_token_with_query(&headers, &uri);
        assert_eq!(result, None);
    }

    // ── seen_long_ago ──

    #[test]
    fn session_touch_waits_for_the_interval() {
        let now = chrono::NaiveDateTime::parse_from_str("2026-10-30 12:00:00", "%Y-%m-%d %H:%M:%S")
            .unwrap();
        assert!(seen_long_ago(None, now));
        assert!(seen_long_ago(Some("not a time"), now));
        assert!(!seen_long_ago(Some("2026-10-30 11:57:00"), now));
        assert!(seen_long_ago(Some("2026-10-30 11:55:00"), now));
    }

    // ── generate_token ──

    #[test]
    fn generated_token_has_correct_format() {
        let t = generate_token();
        assert_eq!(t.len(), 64); // 32 bytes = 64 hex chars
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn generated_tokens_are_unique() {
        let t1 = generate_token();
        let t2 = generate_token();
        assert_ne!(t1, t2);
    }
}
