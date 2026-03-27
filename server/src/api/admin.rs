use axum::extract::State;
use axum::http::header::HeaderMap;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::db::models::LogRow;
use crate::error::AppError;
use crate::state::AppState;

// -- Version --

/// Captured once when the process starts; changes on every restart.
pub static STARTUP_TIME: std::sync::OnceLock<u64> = std::sync::OnceLock::new();

#[derive(Serialize)]
pub struct VersionInfo {
    pub version: &'static str,
    pub commit: &'static str,
    pub channel: &'static str,
    pub startup_time: u64,
}

pub async fn get_version() -> Json<VersionInfo> {
    Json(VersionInfo {
        version: env!("BUILD_VERSION"),
        commit: env!("GIT_COMMIT_SHA"),
        channel: env!("BUILD_CHANNEL"),
        startup_time: *STARTUP_TIME.get().unwrap_or(&0),
    })
}

// -- Settings --

#[derive(Serialize, Deserialize)]
pub struct SettingsResponse {
    pub remote_enabled: bool,
    pub scan_on_startup: bool,
    pub update_channel: String,
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SettingsResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let remote_enabled: Option<(i32,)> =
        sqlx::query_as("SELECT remote_enabled FROM admin_config WHERE id = 1")
            .fetch_optional(&state.db)
            .await?;

    let scan_on_startup = get_setting(&state.db, "scan_on_startup")
        .await
        .unwrap_or_else(|| "true".to_string())
        == "true";

    let update_channel = get_setting(&state.db, "update_channel")
        .await
        .unwrap_or_else(|| "stable".to_string());

    Ok(Json(SettingsResponse {
        remote_enabled: remote_enabled.map(|(v,)| v != 0).unwrap_or(false),
        scan_on_startup,
        update_channel,
    }))
}

pub async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SettingsResponse>,
) -> Result<StatusCode, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    // Ensure admin_config row exists
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

    sqlx::query("UPDATE admin_config SET remote_enabled = ? WHERE id = 1")
        .bind(body.remote_enabled as i32)
        .execute(&state.db)
        .await?;

    set_setting(
        &state.db,
        "scan_on_startup",
        &body.scan_on_startup.to_string(),
    )
    .await?;

    let channel = match body.update_channel.as_str() {
        "nightly" => "nightly",
        _ => "stable",
    };
    set_setting(&state.db, "update_channel", channel).await?;

    log_admin_event(
        &state.db,
        "info",
        "settings",
        &format!(
            "Settings updated (remote={}, scan_on_startup={}, channel={})",
            body.remote_enabled, body.scan_on_startup, channel
        ),
        None,
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- Scan trigger --

#[derive(Serialize)]
pub struct ScanTriggerResponse {
    pub status: String,
}

pub async fn trigger_scan(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ScanTriggerResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let is_running = state.scan_status.read().await.running;
    if is_running {
        return Ok(Json(ScanTriggerResponse {
            status: "already_running".to_string(),
        }));
    }

    let pool = state.db.clone();
    let data_dir = state.config.data_dir.clone();
    let scan_status = state.scan_status.clone();
    let http_client = state.http_client.clone();
    let notify_tx = state.notify_tx.clone();

    tokio::spawn(async move {
        crate::scanner::scan_libraries(
            &pool,
            &scan_status,
            &data_dir,
            http_client,
            Some(&notify_tx),
        )
        .await;
    });

    Ok(Json(ScanTriggerResponse {
        status: "started".to_string(),
    }))
}

pub async fn scan_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<crate::scanner::ScanStatus>, AppError> {
    super::auth::require_admin(&state, &headers).await?;
    let status = state.scan_status.read().await.clone();
    Ok(Json(status))
}

// -- Library management --

#[derive(Deserialize)]
pub struct AddLibraryRequest {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct BrowseDirectoriesResponse {
    pub entries: Vec<DirectoryEntry>,
    pub current_path: String,
}

pub async fn browse_directories(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<BrowseDirectoriesResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let base_path = match params.get("path") {
        Some(p) if !p.is_empty() => std::path::Path::new(p).to_path_buf(),
        _ => {
            #[cfg(target_os = "windows")]
            {
                std::path::PathBuf::from("C:\\")
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::path::PathBuf::from("/")
            }
        }
    };

    if !base_path.exists() {
        return Err(AppError::BadRequest(format!(
            "Path does not exist: {}",
            base_path.display()
        )));
    }

    if !base_path.is_dir() {
        return Err(AppError::BadRequest("Path is not a directory".to_string()));
    }

    let mut entries = Vec::new();

    if let Some(parent) = base_path.parent() {
        if parent != base_path {
            entries.push(DirectoryEntry {
                name: "..".to_string(),
                path: parent.to_string_lossy().to_string(),
                is_dir: true,
            });
        }
    }

    match std::fs::read_dir(&base_path) {
        Ok(dir_entries) => {
            let mut subdirs: Vec<_> = dir_entries
                .filter_map(|entry| {
                    let entry = entry.ok()?;
                    let path = entry.path();
                    if path.is_dir() {
                        let name = path.file_name()?.to_string_lossy().to_string();
                        #[cfg(unix)]
                        if name.starts_with('.') {
                            return None;
                        }
                        Some(DirectoryEntry {
                            name,
                            path: path.to_string_lossy().to_string(),
                            is_dir: true,
                        })
                    } else {
                        None
                    }
                })
                .collect();
            subdirs.sort_by(|a, b| a.name.cmp(&b.name));
            entries.extend(subdirs);
        }
        Err(_) => return Err(AppError::BadRequest("Failed to read directory".to_string())),
    }

    Ok(Json(BrowseDirectoriesResponse {
        entries,
        current_path: base_path.to_string_lossy().to_string(),
    }))
}

pub async fn add_library(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AddLibraryRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let path = std::path::Path::new(&body.path);
    if !path.exists() {
        return Err(AppError::BadRequest(format!(
            "Path does not exist: {}",
            body.path
        )));
    }

    // Canonicalize to get the absolute, normalized path
    let canonical = std::fs::canonicalize(path)
        .map_err(|_| AppError::BadRequest(format!("Cannot resolve path: {}", body.path)))?
        .to_string_lossy()
        .to_string();
    // On Windows, canonicalize returns UNC prefix (\\?\), strip it for cleanliness
    let canonical = canonical
        .strip_prefix(r"\\?\")
        .unwrap_or(&canonical)
        .to_string();

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO libraries (id, name, path) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&body.name)
        .bind(&canonical)
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
    super::auth::require_admin(&state, &headers).await?;

    let result = sqlx::query("DELETE FROM libraries WHERE id = ?")
        .bind(&library_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Library not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct UpdateLibraryRequest {
    pub name: Option<String>,
    pub path: Option<String>,
}

pub async fn update_library(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(library_id): axum::extract::Path<String>,
    Json(body): Json<UpdateLibraryRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let existing: Option<(String, String)> =
        sqlx::query_as("SELECT name, path FROM libraries WHERE id = ?")
            .bind(&library_id)
            .fetch_optional(&state.db)
            .await?;

    let (current_name, current_path) =
        existing.ok_or_else(|| AppError::NotFound("Library not found".to_string()))?;

    let new_name = body.name.unwrap_or(current_name);
    let raw_path = body.path.unwrap_or(current_path);

    let path = std::path::Path::new(&raw_path);
    if !path.exists() {
        return Err(AppError::BadRequest(format!(
            "Path does not exist: {}",
            raw_path
        )));
    }

    // Canonicalize to get the absolute, normalized path
    let new_path = std::fs::canonicalize(path)
        .map_err(|_| AppError::BadRequest(format!("Cannot resolve path: {}", raw_path)))?
        .to_string_lossy()
        .to_string();
    let new_path = new_path
        .strip_prefix(r"\\?\")
        .unwrap_or(&new_path)
        .to_string();

    sqlx::query("UPDATE libraries SET name = ?, path = ? WHERE id = ?")
        .bind(&new_name)
        .bind(&new_path)
        .bind(&library_id)
        .execute(&state.db)
        .await?;

    Ok(Json(
        serde_json::json!({ "id": library_id, "name": new_name, "path": new_path }),
    ))
}

// -- Profile management (admin creates users) --

#[derive(Deserialize)]
pub struct CreateProfileRequest {
    pub name: String,
    pub password: String,
}

pub async fn create_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateProfileRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    super::auth::require_admin(&state, &headers).await?;

    if body.password.len() < 4 {
        return Err(AppError::BadRequest(
            "Password must be at least 4 characters".to_string(),
        ));
    }

    let hash = crate::utils::hash_password(body.password.clone()).await?;

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO profiles (id, name, password_hash, is_admin) VALUES (?, ?, ?, 0)")
        .bind(&id)
        .bind(&body.name)
        .bind(&hash)
        .execute(&state.db)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref db_err) if db_err.message().contains("UNIQUE") => {
                AppError::BadRequest("Username already exists".to_string())
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
    super::auth::require_admin(&state, &headers).await?;

    // Prevent deleting admin profile
    let is_admin: Option<(bool,)> = sqlx::query_as("SELECT is_admin FROM profiles WHERE id = ?")
        .bind(&profile_id)
        .fetch_optional(&state.db)
        .await?;

    if let Some((true,)) = is_admin {
        return Err(AppError::BadRequest(
            "Cannot delete the admin profile".to_string(),
        ));
    }

    let result = sqlx::query("DELETE FROM profiles WHERE id = ?")
        .bind(&profile_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Profile not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// -- List profiles (admin only) --

#[derive(Serialize)]
pub struct ProfileListItem {
    pub id: String,
    pub name: String,
    pub is_admin: bool,
}

#[derive(Serialize)]
pub struct ProfilesListResponse {
    pub profiles: Vec<ProfileListItem>,
}

pub async fn list_profiles(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ProfilesListResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let rows: Vec<(String, String, bool)> =
        sqlx::query_as("SELECT id, name, is_admin FROM profiles ORDER BY created_at")
            .fetch_all(&state.db)
            .await?;

    let profiles = rows
        .into_iter()
        .map(|(id, name, is_admin)| ProfileListItem { id, name, is_admin })
        .collect();

    Ok(Json(ProfilesListResponse { profiles }))
}

// -- Change password (authenticated user changes own password) --

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
    let profile = super::auth::require_auth(&state, &headers).await?;

    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT password_hash FROM profiles WHERE id = ?")
            .bind(&profile.id)
            .fetch_optional(&state.db)
            .await?;

    let hash = row
        .and_then(|(h,)| h)
        .ok_or_else(|| AppError::Internal("No password set".to_string()))?;

    let pw = body.current_password.clone();
    let h = hash.clone();
    let valid = crate::utils::verify_password(pw, h).await?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    if body.new_password.len() < 4 {
        return Err(AppError::BadRequest(
            "Password must be at least 4 characters".to_string(),
        ));
    }

    let new_hash = crate::utils::hash_password(body.new_password.clone()).await?;

    sqlx::query("UPDATE profiles SET password_hash = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(&profile.id)
        .execute(&state.db)
        .await?;

    // Log password change
    log_admin_event(
        &state.db,
        "info",
        "password",
        &format!("User '{}' changed their password", profile.name),
        None,
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- Admin resets another user's password --

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

pub async fn reset_user_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(profile_id): axum::extract::Path<String>,
    Json(body): Json<ResetPasswordRequest>,
) -> Result<StatusCode, AppError> {
    let admin = super::auth::require_admin(&state, &headers).await?;

    if body.new_password.len() < 4 {
        return Err(AppError::BadRequest(
            "Password must be at least 4 characters".to_string(),
        ));
    }

    // Verify target profile exists
    let target: Option<(String,)> = sqlx::query_as("SELECT name FROM profiles WHERE id = ?")
        .bind(&profile_id)
        .fetch_optional(&state.db)
        .await?;

    let (target_name,) =
        target.ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?;

    let new_hash = crate::utils::hash_password(body.new_password.clone()).await?;

    sqlx::query("UPDATE profiles SET password_hash = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(&profile_id)
        .execute(&state.db)
        .await?;

    // Invalidate all sessions for the target user
    sqlx::query("DELETE FROM sessions WHERE profile_id = ?")
        .bind(&profile_id)
        .execute(&state.db)
        .await?;

    // Log the reset
    log_admin_event(
        &state.db,
        "info",
        "password",
        &format!(
            "Admin '{}' reset password for user '{}'",
            admin.name, target_name
        ),
        Some(&format!("profile_id={}", profile_id)),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// -- Admin Logs --

#[derive(Serialize)]
pub struct LogEntry {
    pub id: i64,
    pub level: String,
    pub category: String,
    pub message: String,
    pub details: Option<String>,
    pub created_at: String,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub request_duration_ms: Option<i64>,
    pub request_id: Option<String>,
}

#[derive(Deserialize)]
pub struct LogsQuery {
    pub level: Option<String>,
    pub category: Option<String>,
    pub profile_id: Option<String>,
    pub ip_address: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize)]
pub struct LogsListResponse {
    pub logs: Vec<LogEntry>,
}

pub async fn get_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<LogsQuery>,
) -> Result<Json<LogsListResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let limit = params.limit.unwrap_or(100).min(1000);

    // Build dynamic WHERE clause
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(ref level) = params.level {
        conditions.push("level = ?".to_string());
        bind_values.push(level.clone());
    }
    if let Some(ref category) = params.category {
        conditions.push("category = ?".to_string());
        bind_values.push(category.clone());
    }
    if let Some(ref profile_id) = params.profile_id {
        conditions.push("profile_id = ?".to_string());
        bind_values.push(profile_id.clone());
    }
    if let Some(ref ip_address) = params.ip_address {
        conditions.push("ip_address = ?".to_string());
        bind_values.push(ip_address.clone());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT id, level, category, message, details, created_at, \
         profile_id, profile_name, ip_address, user_agent, request_duration_ms, request_id \
         FROM admin_logs {} ORDER BY created_at DESC LIMIT ?",
        where_clause
    );

    let mut query = sqlx::query_as::<_, LogRow>(&sql);
    for val in &bind_values {
        query = query.bind(val);
    }
    query = query.bind(limit);

    let rows: Vec<LogRow> = query.fetch_all(&state.db).await?;

    let logs = rows
        .into_iter()
        .map(|r| LogEntry {
            id: r.id,
            level: r.level,
            category: r.category,
            message: r.message,
            details: r.details,
            created_at: r.created_at,
            profile_id: r.profile_id,
            profile_name: r.profile_name,
            ip_address: r.ip_address,
            user_agent: r.user_agent,
            request_duration_ms: r.request_duration_ms,
            request_id: r.request_id,
        })
        .collect();

    Ok(Json(LogsListResponse { logs }))
}

// -- Client-side log submission --

#[derive(Deserialize)]
pub struct ClientLogRequest {
    pub level: String,
    pub category: String,
    pub message: String,
    pub details: Option<String>,
}

pub async fn add_client_log(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ClientLogRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Any authenticated user can submit logs (not just admin)
    super::auth::require_auth(&state, &headers).await?;

    // Rate limit log submissions per IP
    let ip = super::auth::client_ip(&headers);
    if !state.auth_rate_limiter.check(ip).await {
        return Err(AppError::TooManyRequests);
    }

    // Validate category to prevent abuse
    let allowed_categories = ["download", "auth", "scanner", "admin"];
    if !allowed_categories.contains(&body.category.as_str()) {
        return Err(AppError::BadRequest("Invalid log category".to_string()));
    }

    log_admin_event(
        &state.db,
        &body.level,
        &body.category,
        &body.message,
        body.details.as_deref(),
    )
    .await;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// -- Database Backup --

#[derive(Serialize)]
pub struct BackupResponse {
    pub filename: String,
    pub size: u64,
}

pub async fn trigger_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let backup_dir = state.config.data_dir.join("backups");
    tokio::fs::create_dir_all(&backup_dir).await?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("openpanel_{}.db", timestamp);
    let backup_path = backup_dir.join(&filename);

    let backup_path_str = backup_path.to_string_lossy().to_string();
    sqlx::query("VACUUM INTO ?")
        .bind(&backup_path_str)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Backup failed: {}", e)))?;

    cleanup_old_backups(&backup_dir, 10).await;

    log_admin_event(
        &state.db,
        "info",
        "backup",
        &format!("Database backup created: {}", filename),
        None,
    )
    .await;

    let file_size = tokio::fs::metadata(&backup_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(Json(BackupResponse {
        filename,
        size: file_size,
    }))
}

#[derive(Serialize)]
pub struct BackupListItem {
    pub filename: String,
    pub size: u64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct BackupsListResponse {
    pub backups: Vec<BackupListItem>,
}

pub async fn list_backups(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupsListResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let backup_dir = state.config.data_dir.join("backups");
    let mut backups = Vec::new();

    if backup_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&backup_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.extension().map(|e| e == "db").unwrap_or(false) {
                    if let Ok(meta) = entry.metadata().await {
                        let filename = path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        let created_at = meta
                            .modified()
                            .map(|t| {
                                let dt: chrono::DateTime<chrono::Utc> = t.into();
                                dt.to_rfc3339()
                            })
                            .unwrap_or_default();
                        backups.push(BackupListItem {
                            filename,
                            size: meta.len(),
                            created_at,
                        });
                    }
                }
            }
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(Json(BackupsListResponse { backups }))
}

async fn cleanup_old_backups(backup_dir: &std::path::Path, keep: usize) {
    let mut files: Vec<(std::path::PathBuf, std::time::SystemTime)> = Vec::new();

    if let Ok(mut entries) = tokio::fs::read_dir(backup_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.extension().map(|e| e == "db").unwrap_or(false) {
                if let Ok(meta) = entry.metadata().await {
                    if let Ok(modified) = meta.modified() {
                        files.push((path, modified));
                    }
                }
            }
        }
    }

    files.sort_by(|a, b| b.1.cmp(&a.1));

    for (path, _) in files.iter().skip(keep) {
        let _ = tokio::fs::remove_file(path).await;
    }
}

// -- Trigger Update --

#[derive(Serialize)]
pub struct UpdateResponse {
    pub status: String,
    pub message: String,
}

pub async fn trigger_update(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<UpdateResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let channel = get_setting(&state.db, "update_channel")
        .await
        .unwrap_or_else(|| "stable".to_string());

    let trigger_path = state.config.data_dir.join("update-trigger");
    let payload = format!("{}\n{}", channel, chrono::Utc::now().to_rfc3339());
    tokio::fs::write(&trigger_path, &payload)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to write update trigger: {}", e)))?;

    tracing::info!(
        "Update triggered (channel={}) -- wrote {}",
        channel,
        trigger_path.display()
    );

    log_admin_event(
        &state.db,
        "info",
        "update",
        &format!("Update triggered (channel={})", channel),
        None,
    )
    .await;

    Ok(Json(UpdateResponse {
        status: "triggered".to_string(),
        message: format!(
            "Update triggered. Pulling {} channel and restarting...",
            channel
        ),
    }))
}

// -- Check for Updates --

#[derive(Serialize)]
pub struct UpdateCheckResponse {
    pub update_available: bool,
    pub current_version: String,
    pub current_commit: String,
    pub latest_version: Option<String>,
    pub channel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn check_update(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<UpdateCheckResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let channel = get_setting(&state.db, "update_channel")
        .await
        .unwrap_or_else(|| "stable".to_string());

    let github_repo = env!("GITHUB_REPO");
    let current_version = env!("BUILD_VERSION");
    let current_commit = env!("GIT_COMMIT_SHA");

    if github_repo.is_empty() {
        tracing::warn!("GITHUB_REPO is empty — update checks disabled");
        log_admin_event(
            &state.db,
            "warn",
            "update",
            "Update check skipped: GITHUB_REPO not configured at build time",
            None,
        )
        .await;
        return Ok(Json(UpdateCheckResponse {
            update_available: false,
            current_version: current_version.to_string(),
            current_commit: current_commit.to_string(),
            latest_version: None,
            channel,
            error: Some("Repository not configured".to_string()),
        }));
    }

    // For stable, fetch the latest non-prerelease; for nightly, fetch the latest prerelease
    let url = if channel == "stable" {
        format!(
            "https://api.github.com/repos/{}/releases/latest",
            github_repo
        )
    } else {
        // List releases and pick the first prerelease
        format!(
            "https://api.github.com/repos/{}/releases?per_page=5",
            github_repo
        )
    };

    let resp = state
        .http_client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("GitHub API error: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let msg = format!(
            "GitHub API returned {} for update check (url={})",
            status, url
        );
        tracing::warn!("{}", msg);
        log_admin_event(&state.db, "warn", "update", &msg, None).await;
        return Ok(Json(UpdateCheckResponse {
            update_available: false,
            current_version: current_version.to_string(),
            current_commit: current_commit.to_string(),
            latest_version: None,
            channel,
            error: Some(format!("GitHub API returned {}", status)),
        }));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to parse GitHub response: {}", e)))?;

    // For nightly, pick the first prerelease from the list; for stable, use the object directly
    let release = if channel == "nightly" {
        data.as_array()
            .and_then(|arr| arr.iter().find(|r| r["prerelease"].as_bool() == Some(true)))
            .cloned()
            .unwrap_or(serde_json::Value::Null)
    } else {
        data
    };

    if release.is_null() {
        return Ok(Json(UpdateCheckResponse {
            update_available: false,
            current_version: current_version.to_string(),
            current_commit: current_commit.to_string(),
            latest_version: None,
            channel,
            error: Some("No nightly release found".to_string()),
        }));
    }

    let latest_version = release["tag_name"]
        .as_str()
        .or_else(|| release["name"].as_str())
        .unwrap_or("unknown")
        .to_string();

    // Compare versions: strip leading 'v' and compare as strings
    let update_available = {
        let tag = release["tag_name"].as_str().unwrap_or("");
        let tag_clean = tag.trim_start_matches('v');
        let current_clean = current_version.trim_start_matches('v');
        !tag.is_empty() && tag_clean != current_clean
    };

    if update_available {
        log_admin_event(
            &state.db,
            "info",
            "update",
            &format!(
                "Update available: {} (current: {}, commit: {})",
                latest_version, current_version, current_commit
            ),
            None,
        )
        .await;
    }

    Ok(Json(UpdateCheckResponse {
        update_available,
        current_version: current_version.to_string(),
        current_commit: current_commit.to_string(),
        latest_version: Some(latest_version),
        channel,
        error: None,
    }))
}

// -- Helpers --

pub async fn get_setting(db: &sqlx::SqlitePool, key: &str) -> Option<String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()?;
    row.map(|(v,)| v)
}

pub async fn set_setting(db: &sqlx::SqlitePool, key: &str, value: &str) -> Result<(), AppError> {
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

/// Log an admin event to the admin_logs table
/// Counter for periodic log pruning — only prune every 100th insert.
static LOG_INSERT_COUNT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Optional structured context for a log event.
#[derive(Default)]
pub struct LogContext<'a> {
    pub profile_id: Option<&'a str>,
    pub profile_name: Option<&'a str>,
    pub ip_address: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    pub request_duration_ms: Option<i64>,
    pub request_id: Option<&'a str>,
}

pub async fn log_admin_event(
    db: &sqlx::SqlitePool,
    level: &str,
    category: &str,
    message: &str,
    details: Option<&str>,
) {
    log_admin_event_ext(
        db,
        level,
        category,
        message,
        details,
        &LogContext::default(),
    )
    .await;
}

pub async fn log_admin_event_ext(
    db: &sqlx::SqlitePool,
    level: &str,
    category: &str,
    message: &str,
    details: Option<&str>,
    ctx: &LogContext<'_>,
) {
    let _ = sqlx::query(
        "INSERT INTO admin_logs (level, category, message, details, profile_id, profile_name, ip_address, user_agent, request_duration_ms, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(level)
    .bind(category)
    .bind(message)
    .bind(details)
    .bind(ctx.profile_id)
    .bind(ctx.profile_name)
    .bind(ctx.ip_address)
    .bind(ctx.user_agent)
    .bind(ctx.request_duration_ms)
    .bind(ctx.request_id)
    .execute(db)
    .await;

    // Keep only last 5000 entries — prune every 100th insert to avoid overhead
    let count = LOG_INSERT_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if count.is_multiple_of(100) {
        let _ = sqlx::query(
            "DELETE FROM admin_logs WHERE id NOT IN (SELECT id FROM admin_logs ORDER BY id DESC LIMIT 5000)",
        )
        .execute(db)
        .await;
    }
}

// ═══════════════════════════════════════════════
//  Phase 5: New Features
// ═══════════════════════════════════════════════

// -- Task 33: SSE scan progress stream --

pub async fn scan_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<
    axum::response::Sse<
        impl futures_core::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>,
    >,
    AppError,
> {
    super::auth::require_admin(&state, &headers).await?;

    let scan_status = state.scan_status.clone();

    let stream = async_stream::stream! {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
        let mut was_running = false;

        loop {
            interval.tick().await;
            let status = scan_status.read().await.clone();
            let data = serde_json::to_string(&status).unwrap_or_default();
            yield Ok(axum::response::sse::Event::default().data(data));

            // If we transitioned from running to not-running, send one final event and stop
            if was_running && !status.running {
                break;
            }
            was_running = status.running;

            // If it was never running, keep the stream alive for up to 30s
            // (client can reconnect if a scan starts later)
            if !status.running && !was_running {
                // Send keepalive for at most 60 ticks (30s)
                // but break immediately if scan starts
                for _ in 0..60 {
                    interval.tick().await;
                    let s = scan_status.read().await.clone();
                    let d = serde_json::to_string(&s).unwrap_or_default();
                    yield Ok(axum::response::sse::Event::default().data(d));
                    if s.running { was_running = true; break; }
                }
                if !was_running { break; }
            }
        }
    };

    Ok(axum::response::Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping"),
    ))
}

// -- Task 36: Graceful shutdown is handled in main.rs --

// -- Task 37: Periodic session purge is a background task in main.rs --

pub async fn purge_expired_sessions(db: &sqlx::SqlitePool) {
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query("DELETE FROM sessions WHERE expires_at < ?")
        .bind(&now)
        .execute(db)
        .await;
    match result {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("Purged {} expired sessions", r.rows_affected());
        }
        _ => {}
    }
}

// -- Task 38: Device tracking --

#[derive(Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub display_name: Option<String>,
    pub last_seen_at: String,
}

pub async fn list_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<DeviceInfo>>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let rows: Vec<(String, Option<String>, String)> = sqlx::query_as(
        "SELECT id, display_name, last_seen_at FROM devices ORDER BY last_seen_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let devices = rows
        .into_iter()
        .map(|(id, display_name, last_seen_at)| DeviceInfo {
            id,
            display_name,
            last_seen_at,
        })
        .collect();

    Ok(Json(devices))
}

pub async fn delete_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(device_id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let result = sqlx::query("DELETE FROM devices WHERE id = ?")
        .bind(&device_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Device not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// -- Task 39: Scheduled backups (background task logic) --

pub async fn run_scheduled_backup(db: &sqlx::SqlitePool, data_dir: &std::path::Path) {
    let backup_dir = data_dir.join("backups");
    if let Err(e) = tokio::fs::create_dir_all(&backup_dir).await {
        tracing::error!("Cannot create backup dir: {}", e);
        return;
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("openpanel_auto_{}.db", timestamp);
    let backup_path = backup_dir.join(&filename);
    let backup_path_str = backup_path.to_string_lossy().to_string();

    match sqlx::query("VACUUM INTO ?")
        .bind(&backup_path_str)
        .execute(db)
        .await
    {
        Ok(_) => {
            tracing::info!("Scheduled backup created: {}", filename);
            log_admin_event(
                db,
                "info",
                "backup",
                &format!("Scheduled backup: {}", filename),
                None,
            )
            .await;
        }
        Err(e) => {
            tracing::error!("Scheduled backup failed: {}", e);
            log_admin_event(
                db,
                "error",
                "backup",
                &format!("Scheduled backup failed: {}", e),
                None,
            )
            .await;
        }
    }

    cleanup_old_backups(&backup_dir, 10).await;
}

// -- Task 40: Richer health check --

#[derive(Serialize)]
pub struct HealthDetail {
    pub status: String,
    pub version: &'static str,
    pub uptime_seconds: u64,
    pub database_ok: bool,
    pub db_size_bytes: Option<u64>,
    pub disk_free_bytes: Option<u64>,
    pub library_count: i64,
    pub series_count: i64,
    pub book_count: i64,
}

pub async fn health_detail(State(state): State<AppState>) -> Json<HealthDetail> {
    let startup = *STARTUP_TIME.get().unwrap_or(&0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let uptime = now.saturating_sub(startup) / 1000;

    let database_ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();

    let db_size_bytes = std::fs::metadata(state.config.data_dir.join("openpanel.db"))
        .map(|m| m.len())
        .ok();

    let library_count: i64 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM libraries")
        .fetch_one(&state.db)
        .await
        .map(|(c,)| c)
        .unwrap_or(0);
    let series_count: i64 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM series")
        .fetch_one(&state.db)
        .await
        .map(|(c,)| c)
        .unwrap_or(0);
    let book_count: i64 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM books")
        .fetch_one(&state.db)
        .await
        .map(|(c,)| c)
        .unwrap_or(0);

    Json(HealthDetail {
        status: if database_ok { "healthy" } else { "degraded" }.to_string(),
        version: env!("BUILD_VERSION"),
        uptime_seconds: uptime,
        database_ok,
        db_size_bytes,
        disk_free_bytes: None, // platform-specific; omit for now
        library_count,
        series_count,
        book_count,
    })
}

// -- Task 41: User data export/import --

#[derive(Serialize, Deserialize)]
pub struct UserDataExport {
    pub profile_name: String,
    pub exported_at: String,
    pub progress: Vec<ExportedProgress>,
    pub bookmarks: Vec<ExportedBookmark>,
    pub collections: Vec<ExportedCollection>,
    pub preferences: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct ExportedProgress {
    pub book_path: String,
    pub page_number: i32,
    pub is_completed: bool,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportedBookmark {
    pub book_path: String,
    pub page: i32,
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportedCollection {
    pub name: String,
    pub series_paths: Vec<String>,
}

pub async fn export_user_data(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<UserDataExport>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let progress: Vec<(String, i32, i32, String)> = sqlx::query_as(
        "SELECT b.path, rp.page_number, rp.is_completed, rp.updated_at
         FROM reading_progress rp JOIN books b ON rp.book_id = b.id
         WHERE rp.profile_id = ?",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let bookmarks: Vec<(String, i32, Option<String>)> = sqlx::query_as(
        "SELECT b.path, bm.page, bm.note
         FROM bookmarks bm JOIN books b ON bm.book_id = b.id
         WHERE bm.profile_id = ?",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let collections: Vec<(String, String)> =
        sqlx::query_as("SELECT c.name, c.id FROM collections WHERE profile_id = ?")
            .bind(&profile.id)
            .fetch_all(&state.db)
            .await?;

    let mut exported_collections = Vec::new();
    for (name, coll_id) in collections {
        let items: Vec<(String,)> = sqlx::query_as(
            "SELECT s.path FROM collection_items ci JOIN series s ON ci.series_id = s.id WHERE ci.collection_id = ?",
        )
        .bind(&coll_id)
        .fetch_all(&state.db)
        .await?;
        exported_collections.push(ExportedCollection {
            name,
            series_paths: items.into_iter().map(|(p,)| p).collect(),
        });
    }

    let prefs: Option<(String,)> =
        sqlx::query_as("SELECT preferences FROM user_preferences WHERE profile_id = ?")
            .bind(&profile.id)
            .fetch_optional(&state.db)
            .await?;

    let preferences = prefs
        .and_then(|(json,)| serde_json::from_str(&json).ok())
        .unwrap_or(serde_json::json!({}));

    Ok(Json(UserDataExport {
        profile_name: profile.name,
        exported_at: chrono::Utc::now().to_rfc3339(),
        progress: progress
            .into_iter()
            .map(|(bp, pn, ic, ua)| ExportedProgress {
                book_path: bp,
                page_number: pn,
                is_completed: ic != 0,
                updated_at: ua,
            })
            .collect(),
        bookmarks: bookmarks
            .into_iter()
            .map(|(bp, pg, n)| ExportedBookmark {
                book_path: bp,
                page: pg,
                note: n,
            })
            .collect(),
        collections: exported_collections,
        preferences,
    }))
}

pub async fn import_user_data(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(data): Json<UserDataExport>,
) -> Result<Json<serde_json::Value>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let mut imported_progress = 0i64;
    let mut imported_bookmarks = 0i64;

    // Import progress
    for p in &data.progress {
        let book: Option<(String,)> = sqlx::query_as("SELECT id FROM books WHERE path = ?")
            .bind(&p.book_path)
            .fetch_optional(&state.db)
            .await?;
        if let Some((book_id,)) = book {
            let id = uuid::Uuid::new_v4().to_string();
            let completed = p.is_completed as i32;
            sqlx::query(
                "INSERT INTO reading_progress (id, profile_id, book_id, page_number, is_completed, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(profile_id, book_id) WHERE profile_id IS NOT NULL
                 DO UPDATE SET page_number = excluded.page_number,
                               is_completed = excluded.is_completed,
                               updated_at = excluded.updated_at",
            )
            .bind(&id).bind(&profile.id).bind(&book_id).bind(p.page_number).bind(completed).bind(&p.updated_at)
            .execute(&state.db).await?;
            imported_progress += 1;
        }
    }

    // Import bookmarks
    for bm in &data.bookmarks {
        let book: Option<(String,)> = sqlx::query_as("SELECT id FROM books WHERE path = ?")
            .bind(&bm.book_path)
            .fetch_optional(&state.db)
            .await?;
        if let Some((book_id,)) = book {
            let id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT INTO bookmarks (id, profile_id, book_id, page, note, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(profile_id, book_id, page) DO UPDATE SET note = excluded.note",
            )
            .bind(&id)
            .bind(&profile.id)
            .bind(&book_id)
            .bind(bm.page)
            .bind(&bm.note)
            .bind(&now)
            .execute(&state.db)
            .await?;
            imported_bookmarks += 1;
        }
    }

    Ok(Json(serde_json::json!({
        "imported_progress": imported_progress,
        "imported_bookmarks": imported_bookmarks,
    })))
}

// -- Task 42: DB size monitoring --

#[derive(Serialize)]
pub struct DbSizeInfo {
    pub total_bytes: u64,
    pub wal_bytes: u64,
    pub table_counts: TableCounts,
}

#[derive(Serialize)]
pub struct TableCounts {
    pub libraries: i64,
    pub series: i64,
    pub books: i64,
    pub pages: i64,
    pub profiles: i64,
    pub sessions: i64,
    pub reading_progress: i64,
    pub admin_logs: i64,
}

pub async fn db_size(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DbSizeInfo>, AppError> {
    super::auth::require_admin(&state, &headers).await?;

    let db_path = state.config.data_dir.join("openpanel.db");
    let total_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    let wal_bytes = std::fs::metadata(db_path.with_extension("db-wal"))
        .map(|m| m.len())
        .unwrap_or(0);

    let count = |table: &str| {
        let sql = format!("SELECT COUNT(*) FROM {}", table);
        let db = state.db.clone();
        async move {
            sqlx::query_as::<_, (i64,)>(&sql)
                .fetch_one(&db)
                .await
                .map(|(c,)| c)
                .unwrap_or(0)
        }
    };

    let (libraries, series, books, pages, profiles, sessions, reading_progress, admin_logs) = tokio::join!(
        count("libraries"),
        count("series"),
        count("books"),
        count("pages"),
        count("profiles"),
        count("sessions"),
        count("reading_progress"),
        count("admin_logs"),
    );

    Ok(Json(DbSizeInfo {
        total_bytes,
        wal_bytes,
        table_counts: TableCounts {
            libraries,
            series,
            books,
            pages,
            profiles,
            sessions,
            reading_progress,
            admin_logs,
        },
    }))
}

// -- Task 43: SSE notifications --

pub async fn notifications_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    req: axum::extract::Request,
) -> Result<
    axum::response::Sse<
        impl futures_core::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>,
    >,
    AppError,
> {
    // EventSource API doesn't support custom headers, so accept ?token= query param
    super::auth::require_auth_with_query(&state, &headers, req.uri()).await?;

    let mut rx = state.notify_tx.subscribe();

    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let data = serde_json::to_string(&event).unwrap_or_default();
                    yield Ok(axum::response::sse::Event::default().data(data));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("SSE client lagged by {} messages", n);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Ok(axum::response::Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(30))
            .text("ping"),
    ))
}

// -- Task 44: Reading statistics --

#[derive(Serialize)]
pub struct ReadingStatsResponse {
    pub total_pages_read: i64,
    pub total_time_seconds: i64,
    pub total_books_completed: i64,
    pub current_streak_days: i64,
    pub daily: Vec<DailyReadingStat>,
}

#[derive(Serialize)]
pub struct DailyReadingStat {
    pub date: String,
    pub pages_read: i64,
    pub time_spent_seconds: i64,
    pub books_completed: i64,
}

pub async fn get_reading_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ReadingStatsResponse>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let rows: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT date, pages_read, time_spent_seconds, books_completed
         FROM reading_stats WHERE profile_id = ?
         ORDER BY date DESC LIMIT 90",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let total_pages_read: i64 = rows.iter().map(|r| r.1).sum();
    let total_time_seconds: i64 = rows.iter().map(|r| r.2).sum();
    let total_books_completed: i64 = rows.iter().map(|r| r.3).sum();

    // Calculate streak
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let mut streak = 0i64;
    let date_set: std::collections::HashSet<&str> = rows.iter().map(|r| r.0.as_str()).collect();
    let mut current = chrono::Utc::now().date_naive();
    loop {
        let ds = current.format("%Y-%m-%d").to_string();
        if date_set.contains(ds.as_str()) {
            streak += 1;
            current -= chrono::Duration::days(1);
        } else if ds == today {
            // Today hasn't had activity yet; check yesterday
            current -= chrono::Duration::days(1);
        } else {
            break;
        }
    }

    let daily = rows
        .into_iter()
        .map(
            |(date, pages_read, time_spent_seconds, books_completed)| DailyReadingStat {
                date,
                pages_read,
                time_spent_seconds,
                books_completed,
            },
        )
        .collect();

    Ok(Json(ReadingStatsResponse {
        total_pages_read,
        total_time_seconds,
        total_books_completed,
        current_streak_days: streak,
        daily,
    }))
}

#[derive(Deserialize)]
pub struct RecordReadingRequest {
    pub pages_read: Option<i64>,
    pub time_spent_seconds: Option<i64>,
    pub books_completed: Option<i64>,
}

pub async fn record_reading(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RecordReadingRequest>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let pages = body.pages_read.unwrap_or(0);
    let time = body.time_spent_seconds.unwrap_or(0);
    let completed = body.books_completed.unwrap_or(0);

    sqlx::query(
        "INSERT INTO reading_stats (id, profile_id, date, pages_read, time_spent_seconds, books_completed)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, date) DO UPDATE SET
           pages_read = reading_stats.pages_read + excluded.pages_read,
           time_spent_seconds = reading_stats.time_spent_seconds + excluded.time_spent_seconds,
           books_completed = reading_stats.books_completed + excluded.books_completed",
    )
    .bind(&id).bind(&profile.id).bind(&today).bind(pages).bind(time).bind(completed)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}
