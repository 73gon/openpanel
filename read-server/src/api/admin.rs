use axum::extract::State;
use axum::http::{header::HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

// ── Admin Unlock ──

#[derive(Deserialize)]
pub struct UnlockRequest {
    pub password: String,
}

#[derive(Serialize)]
pub struct UnlockResponse {
    pub admin_token: String,
    pub expires_at: String,
}

pub async fn unlock(
    State(state): State<AppState>,
    Json(body): Json<UnlockRequest>,
) -> Result<Json<UnlockResponse>, AppError> {
    let config: Option<(Option<String>, i32)> =
        sqlx::query_as("SELECT password_hash, session_timeout_min FROM admin_config WHERE id = 1")
            .fetch_optional(&state.db)
            .await?;

    let (password_hash, timeout_min) =
        config.ok_or_else(|| AppError::Internal("Admin config not found".to_string()))?;

    let hash = password_hash.ok_or_else(|| {
        AppError::BadRequest("Admin password not set. Use initial setup.".to_string())
    })?;

    let pw = body.password.clone();
    let h = hash.clone();
    let valid = tokio::task::spawn_blocking(move || bcrypt::verify(pw, &h).unwrap_or(false))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    let token = generate_token();
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at =
        (chrono::Utc::now() + chrono::Duration::minutes(timeout_min as i64)).to_rfc3339();

    sqlx::query("INSERT INTO admin_sessions (id, token, expires_at) VALUES (?, ?, ?)")
        .bind(&session_id)
        .bind(&token)
        .bind(&expires_at)
        .execute(&state.db)
        .await?;

    Ok(Json(UnlockResponse {
        admin_token: token,
        expires_at,
    }))
}

// ── Initial Setup (set password if none exists) ──

#[derive(Deserialize)]
pub struct SetupRequest {
    pub password: String,
}

pub async fn setup(
    State(state): State<AppState>,
    Json(body): Json<SetupRequest>,
) -> Result<StatusCode, AppError> {
    // Only allow if no password is set yet
    let config: Option<(Option<String>,)> =
        sqlx::query_as("SELECT password_hash FROM admin_config WHERE id = 1")
            .fetch_optional(&state.db)
            .await?;

    if let Some((Some(_),)) = &config {
        return Err(AppError::BadRequest(
            "Admin password already set. Use unlock + change password.".to_string(),
        ));
    }

    if body.password.len() < 4 {
        return Err(AppError::BadRequest(
            "Password must be at least 4 characters".to_string(),
        ));
    }

    let pw = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || bcrypt::hash(pw, 10))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?
        .map_err(|e| AppError::Internal(format!("Bcrypt error: {}", e)))?;

    sqlx::query("UPDATE admin_config SET password_hash = ? WHERE id = 1")
        .bind(&hash)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Admin Status (password set?) ──

#[derive(Serialize)]
pub struct AdminStatusResponse {
    pub password_set: bool,
    pub remote_enabled: bool,
}

pub async fn admin_status(
    State(state): State<AppState>,
) -> Result<Json<AdminStatusResponse>, AppError> {
    let config: Option<(Option<String>, i32)> =
        sqlx::query_as("SELECT password_hash, remote_enabled FROM admin_config WHERE id = 1")
            .fetch_optional(&state.db)
            .await?;

    let (password_hash, remote_enabled) = config.unwrap_or((None, 0));

    Ok(Json(AdminStatusResponse {
        password_set: password_hash.is_some(),
        remote_enabled: remote_enabled != 0,
    }))
}

// ── Settings ──

#[derive(Serialize, Deserialize)]
pub struct SettingsResponse {
    pub remote_enabled: bool,
    pub scan_on_startup: bool,
    pub admin_session_timeout_min: i32,
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SettingsResponse>, AppError> {
    require_admin_token(&state, &headers).await?;

    let config: (i32, i32) =
        sqlx::query_as("SELECT remote_enabled, session_timeout_min FROM admin_config WHERE id = 1")
            .fetch_one(&state.db)
            .await?;

    let scan_on_startup = get_setting(&state.db, "scan_on_startup")
        .await
        .unwrap_or_else(|| "true".to_string())
        == "true";

    Ok(Json(SettingsResponse {
        remote_enabled: config.0 != 0,
        scan_on_startup,
        admin_session_timeout_min: config.1,
    }))
}

pub async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SettingsResponse>,
) -> Result<StatusCode, AppError> {
    require_admin_token(&state, &headers).await?;

    sqlx::query("UPDATE admin_config SET remote_enabled = ?, session_timeout_min = ? WHERE id = 1")
        .bind(body.remote_enabled as i32)
        .bind(body.admin_session_timeout_min)
        .execute(&state.db)
        .await?;

    set_setting(
        &state.db,
        "scan_on_startup",
        &body.scan_on_startup.to_string(),
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Scan trigger ──

#[derive(Serialize)]
pub struct ScanTriggerResponse {
    pub status: String,
}

pub async fn trigger_scan(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ScanTriggerResponse>, AppError> {
    require_admin_token(&state, &headers).await?;

    let is_running = state.scan_status.read().await.running;
    if is_running {
        return Ok(Json(ScanTriggerResponse {
            status: "already_running".to_string(),
        }));
    }

    // Spawn scan in background
    let pool = state.db.clone();
    let roots = state.config.library_roots.clone();
    let scan_status = state.scan_status.clone();

    tokio::spawn(async move {
        crate::scanner::scan_libraries(&pool, &roots, &scan_status).await;
    });

    Ok(Json(ScanTriggerResponse {
        status: "started".to_string(),
    }))
}

pub async fn scan_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<crate::scanner::ScanStatus>, AppError> {
    require_admin_token(&state, &headers).await?;
    let status = state.scan_status.read().await.clone();
    Ok(Json(status))
}

// ── Library management ──

#[derive(Deserialize)]
pub struct AddLibraryRequest {
    pub name: String,
    pub path: String,
}

pub async fn add_library(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AddLibraryRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    require_admin_token(&state, &headers).await?;

    // Validate path exists
    let path = std::path::Path::new(&body.path);
    if !path.exists() {
        return Err(AppError::BadRequest(format!(
            "Path does not exist: {}",
            body.path
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO libraries (id, name, path) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&body.name)
        .bind(&body.path)
        .execute(&state.db)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref db_err) if db_err.message().contains("UNIQUE") => {
                AppError::BadRequest("Library path already exists".to_string())
            }
            _ => AppError::Database(e),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": id, "name": body.name })),
    ))
}

pub async fn remove_library(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(library_id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    require_admin_token(&state, &headers).await?;

    let result = sqlx::query("DELETE FROM libraries WHERE id = ?")
        .bind(&library_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Library not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Profile management ──

#[derive(Deserialize)]
pub struct CreateProfileRequest {
    pub name: String,
    pub pin: Option<String>,
}

pub async fn create_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateProfileRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    require_admin_token(&state, &headers).await?;

    let pin_hash = if let Some(pin) = &body.pin {
        let p = pin.clone();
        let hash = tokio::task::spawn_blocking(move || bcrypt::hash(p, 10))
            .await
            .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?
            .map_err(|e| AppError::Internal(format!("Bcrypt error: {}", e)))?;
        Some(hash)
    } else {
        None
    };

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO profiles (id, name, pin_hash) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&body.name)
        .bind(&pin_hash)
        .execute(&state.db)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref db_err) if db_err.message().contains("UNIQUE") => {
                AppError::BadRequest("Profile name already exists".to_string())
            }
            _ => AppError::Database(e),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": id, "name": body.name })),
    ))
}

pub async fn delete_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(profile_id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    require_admin_token(&state, &headers).await?;

    let result = sqlx::query("DELETE FROM profiles WHERE id = ?")
        .bind(&profile_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Profile not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Change password ──

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<StatusCode, AppError> {
    require_admin_token(&state, &headers).await?;

    let config: Option<(Option<String>,)> =
        sqlx::query_as("SELECT password_hash FROM admin_config WHERE id = 1")
            .fetch_optional(&state.db)
            .await?;

    let hash = config
        .and_then(|(h,)| h)
        .ok_or_else(|| AppError::Internal("No password set".to_string()))?;

    let pw = body.current_password.clone();
    let h = hash.clone();
    let valid = tokio::task::spawn_blocking(move || bcrypt::verify(pw, &h).unwrap_or(false))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    if body.new_password.len() < 4 {
        return Err(AppError::BadRequest(
            "Password must be at least 4 characters".to_string(),
        ));
    }

    let new_pw = body.new_password.clone();
    let new_hash = tokio::task::spawn_blocking(move || bcrypt::hash(new_pw, 10))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?
        .map_err(|e| AppError::Internal(format!("Bcrypt error: {}", e)))?;

    sqlx::query("UPDATE admin_config SET password_hash = ? WHERE id = 1")
        .bind(&new_hash)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ──

async fn require_admin_token(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Admin "))
        .ok_or(AppError::Unauthorized)?;

    let session: Option<(String, String)> =
        sqlx::query_as("SELECT id, expires_at FROM admin_sessions WHERE token = ?")
            .bind(token)
            .fetch_optional(&state.db)
            .await?;

    let (_, expires_at) = session.ok_or(AppError::Unauthorized)?;

    if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(&expires_at) {
        if exp < chrono::Utc::now() {
            return Err(AppError::Unauthorized);
        }
    }

    Ok(())
}

async fn get_setting(db: &sqlx::SqlitePool, key: &str) -> Option<String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()?;
    row.map(|(v,)| v)
}

async fn set_setting(db: &sqlx::SqlitePool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await?;
    Ok(())
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    hex::encode(bytes)
}
