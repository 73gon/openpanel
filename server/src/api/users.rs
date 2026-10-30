//! Looking after accounts: where each one is signed in, signing devices out, and who is an
//! administrator.

use axum::extract::{Path, State};
use axum::http::{header::HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;

use super::admin::{log_admin_event_ext, LogContext};
use super::auth::{
    client_ip, extract_bearer_token, require_admin, sessions_of, user_agent, AuthProfile,
    RevokedResponse, SessionsResponse,
};
use crate::error::AppError;
use crate::state::AppState;

/// Writes down what an administrator did, and who and where they were.
async fn log_action(state: &AppState, admin: &AuthProfile, headers: &HeaderMap, message: &str) {
    let ip = client_ip(headers).to_string();
    let ctx = LogContext {
        profile_id: Some(&admin.id),
        profile_name: Some(&admin.name),
        ip_address: Some(&ip),
        user_agent: Some(user_agent(headers)),
        ..Default::default()
    };
    log_admin_event_ext(&state.db, "info", "users", message, None, &ctx).await;
}

async fn profile_name(db: &sqlx::SqlitePool, profile_id: &str) -> Result<String, AppError> {
    let row: Option<(String,)> = sqlx::query_as("SELECT name FROM profiles WHERE id = ?")
        .bind(profile_id)
        .fetch_optional(db)
        .await?;
    row.map(|(name,)| name)
        .ok_or_else(|| AppError::NotFound("Profile not found".to_string()))
}

/// Where a user is signed in, most recently used first.
pub async fn list_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(profile_id): Path<String>,
) -> Result<Json<SessionsResponse>, AppError> {
    require_admin(&state, &headers).await?;
    profile_name(&state.db, &profile_id).await?;
    let sessions = sessions_of(&state.db, &profile_id, extract_bearer_token(&headers)).await?;
    Ok(Json(SessionsResponse { sessions }))
}

/// Signs a user out everywhere. An administrator doing it to themselves keeps this session.
pub async fn revoke_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(profile_id): Path<String>,
) -> Result<Json<RevokedResponse>, AppError> {
    let admin = require_admin(&state, &headers).await?;
    let name = profile_name(&state.db, &profile_id).await?;
    let token = extract_bearer_token(&headers).unwrap_or_default();

    let result = sqlx::query("DELETE FROM sessions WHERE profile_id = ? AND token != ?")
        .bind(&profile_id)
        .bind(token)
        .execute(&state.db)
        .await?;

    log_action(
        &state,
        &admin,
        &headers,
        &format!(
            "{} signed {} out of {} device(s)",
            admin.name,
            name,
            result.rows_affected()
        ),
    )
    .await;

    Ok(Json(RevokedResponse {
        revoked: result.rows_affected(),
    }))
}

/// Signs one device out, whoever's it is.
pub async fn revoke_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let admin = require_admin(&state, &headers).await?;

    let row: Option<(String,)> = sqlx::query_as(
        "SELECT p.name FROM sessions s JOIN profiles p ON p.id = s.profile_id WHERE s.id = ?",
    )
    .bind(&session_id)
    .fetch_optional(&state.db)
    .await?;
    let (name,) = row.ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    sqlx::query("DELETE FROM sessions WHERE id = ?")
        .bind(&session_id)
        .execute(&state.db)
        .await?;

    log_action(
        &state,
        &admin,
        &headers,
        &format!("{} signed a device of {} out", admin.name, name),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct RoleRequest {
    pub is_admin: bool,
}

/// Makes a user an administrator, or a reader again. Nobody changes their own role, and the
/// last administrator stays one.
pub async fn set_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(profile_id): Path<String>,
    Json(body): Json<RoleRequest>,
) -> Result<StatusCode, AppError> {
    let admin = require_admin(&state, &headers).await?;
    if admin.id == profile_id {
        return Err(AppError::BadRequest(
            "You can't change your own role.".to_string(),
        ));
    }

    let row: Option<(String, bool)> =
        sqlx::query_as("SELECT name, is_admin FROM profiles WHERE id = ?")
            .bind(&profile_id)
            .fetch_optional(&state.db)
            .await?;
    let (name, was_admin) =
        row.ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?;
    if was_admin == body.is_admin {
        return Ok(StatusCode::NO_CONTENT);
    }

    // One statement, so two administrators demoting each other at once can't leave none.
    let result = sqlx::query(
        "UPDATE profiles SET is_admin = ? WHERE id = ?
           AND (? = 1 OR (SELECT COUNT(*) FROM profiles WHERE is_admin = 1) > 1)",
    )
    .bind(body.is_admin)
    .bind(&profile_id)
    .bind(body.is_admin)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "The server needs at least one administrator.".to_string(),
        ));
    }

    log_action(
        &state,
        &admin,
        &headers,
        &if body.is_admin {
            format!("{} made {} an administrator", admin.name, name)
        } else {
            format!("{} made {} a reader", admin.name, name)
        },
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
