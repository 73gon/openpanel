use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct ProfileItem {
    pub id: String,
    pub name: String,
    pub has_pin: bool,
    pub avatar_url: Option<String>,
}

#[derive(Serialize)]
pub struct ProfilesResponse {
    pub profiles: Vec<ProfileItem>,
}

pub async fn list_profiles(
    State(state): State<AppState>,
) -> Result<Json<ProfilesResponse>, AppError> {
    let rows: Vec<(String, String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, name, pin_hash, avatar_url FROM profiles ORDER BY name",
    )
    .fetch_all(&state.db)
    .await?;

    let profiles = rows
        .into_iter()
        .map(|(id, name, pin_hash, avatar_url)| ProfileItem {
            id,
            name,
            has_pin: pin_hash.is_some(),
            avatar_url,
        })
        .collect();

    Ok(Json(ProfilesResponse { profiles }))
}

#[derive(Deserialize)]
pub struct SelectProfileRequest {
    pub pin: Option<String>,
}

#[derive(Serialize)]
pub struct SelectProfileResponse {
    pub token: String,
    pub profile: ProfileItem,
    pub expires_at: String,
}

pub async fn select_profile(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
    Json(body): Json<SelectProfileRequest>,
) -> Result<Json<SelectProfileResponse>, AppError> {
    let row: Option<(String, String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, name, pin_hash, avatar_url FROM profiles WHERE id = ?",
    )
    .bind(&profile_id)
    .fetch_optional(&state.db)
    .await?;

    let (id, name, pin_hash, avatar_url) =
        row.ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?;

    // Verify PIN if set
    if let Some(hash) = &pin_hash {
        let pin = body
            .pin
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("PIN required".to_string()))?;

        let hash_clone = hash.clone();
        let pin_clone = pin.to_string();
        let valid = tokio::task::spawn_blocking(move || {
            bcrypt::verify(pin_clone, &hash_clone).unwrap_or(false)
        })
        .await
        .map_err(|e| AppError::Internal(format!("Task error: {}", e)))?;

        if !valid {
            return Err(AppError::Unauthorized);
        }
    }

    // Create session
    let token = generate_token();
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339();

    sqlx::query(
        "INSERT INTO sessions (id, profile_id, token, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(&id)
    .bind(&token)
    .bind(&expires_at)
    .execute(&state.db)
    .await?;

    Ok(Json(SelectProfileResponse {
        token,
        profile: ProfileItem {
            id,
            name,
            has_pin: pin_hash.is_some(),
            avatar_url,
        },
        expires_at,
    }))
}

/// Logout / deselect profile
pub async fn logout(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                sqlx::query("DELETE FROM sessions WHERE token = ?")
                    .bind(token)
                    .execute(&state.db)
                    .await?;
            }
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
    hex::encode(bytes)
}
