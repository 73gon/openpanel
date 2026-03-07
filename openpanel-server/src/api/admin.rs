use axum::extract::State;
use axum::http::header::HeaderMap;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

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
            "INSERT INTO admin_config (id, session_timeout_min, remote_enabled, guest_enabled) VALUES (1, 60, 0, 0)",
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

    let pw = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || bcrypt::hash(pw, 10))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?
        .map_err(|e| AppError::Internal(format!("Bcrypt error: {}", e)))?;

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

    let new_pw = body.new_password.clone();
    let new_hash = tokio::task::spawn_blocking(move || bcrypt::hash(new_pw, 10))
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?
        .map_err(|e| AppError::Internal(format!("Bcrypt error: {}", e)))?;

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
}

#[derive(Deserialize)]
pub struct LogsQuery {
    pub level: Option<String>,
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

    let rows: Vec<(i64, String, String, String, Option<String>, String)> = if let Some(level) =
        &params.level
    {
        sqlx::query_as(
            "SELECT id, level, category, message, details, created_at FROM admin_logs WHERE level = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(level)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, level, category, message, details, created_at FROM admin_logs ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    let logs = rows
        .into_iter()
        .map(
            |(id, level, category, message, details, created_at)| LogEntry {
                id,
                level,
                category,
                message,
                details,
                created_at,
            },
        )
        .collect();

    Ok(Json(LogsListResponse { logs }))
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
    sqlx::query(&format!("VACUUM INTO '{}'", backup_path_str))
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

    let url = if channel == "stable" {
        format!(
            "https://api.github.com/repos/{}/releases/latest",
            github_repo
        )
    } else {
        format!(
            "https://api.github.com/repos/{}/releases/tags/nightly",
            github_repo
        )
    };

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "OpenPanel-Server")
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

    let release: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to parse GitHub response: {}", e)))?;

    let latest_version = release["tag_name"]
        .as_str()
        .or_else(|| release["name"].as_str())
        .unwrap_or("unknown")
        .to_string();

    let update_available = if channel == "nightly" {
        let body = release["body"].as_str().unwrap_or("");
        let latest_commit = body
            .lines()
            .find(|l| l.contains("Commit:"))
            .and_then(|l| l.split("Commit:").nth(1))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        !latest_commit.is_empty() && !latest_commit.starts_with(current_commit)
    } else {
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
pub async fn log_admin_event(
    db: &sqlx::SqlitePool,
    level: &str,
    category: &str,
    message: &str,
    details: Option<&str>,
) {
    let _ = sqlx::query(
        "INSERT INTO admin_logs (level, category, message, details) VALUES (?, ?, ?, ?)",
    )
    .bind(level)
    .bind(category)
    .bind(message)
    .bind(details)
    .execute(db)
    .await;

    // Keep only last 5000 entries
    let _ = sqlx::query(
        "DELETE FROM admin_logs WHERE id NOT IN (SELECT id FROM admin_logs ORDER BY id DESC LIMIT 5000)",
    )
    .execute(db)
    .await;
}
