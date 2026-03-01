use axum::extract::{Query, State};
use axum::http::header::HeaderMap;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ProgressQuery {
    pub book_id: String,
}

#[derive(Serialize)]
pub struct ProgressResponse {
    pub book_id: String,
    pub page: i32,
    pub is_completed: bool,
    pub updated_at: String,
}

pub async fn get_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ProgressQuery>,
) -> Result<Json<Option<ProgressResponse>>, AppError> {
    let profile_id = extract_profile_id(&state, &headers).await;
    let device_id = extract_device_id(&state, &headers).await;

    // Try profile progress first, then device
    let row: Option<(String, i32, i32, String)> = if let Some(pid) = &profile_id {
        sqlx::query_as(
            "SELECT book_id, page_number, is_completed, updated_at
             FROM reading_progress WHERE profile_id = ? AND book_id = ?",
        )
        .bind(pid)
        .bind(&query.book_id)
        .fetch_optional(&state.db)
        .await?
    } else if let Some(did) = &device_id {
        sqlx::query_as(
            "SELECT book_id, page_number, is_completed, updated_at
             FROM reading_progress WHERE device_id = ? AND book_id = ? AND profile_id IS NULL",
        )
        .bind(did)
        .bind(&query.book_id)
        .fetch_optional(&state.db)
        .await?
    } else {
        None
    };

    let progress = row.map(|(book_id, page, is_completed, updated_at)| ProgressResponse {
        book_id,
        page: page + 1, // Convert to 1-indexed
        is_completed: is_completed != 0,
        updated_at,
    });

    Ok(Json(progress))
}

#[derive(Deserialize)]
pub struct UpdateProgressRequest {
    pub book_id: String,
    pub page: i32,
    pub is_completed: Option<bool>,
}

pub async fn update_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateProgressRequest>,
) -> Result<StatusCode, AppError> {
    let profile_id = extract_profile_id(&state, &headers).await;
    let device_id = extract_device_id(&state, &headers).await;

    // Verify book exists
    let _: (String,) = sqlx::query_as("SELECT id FROM books WHERE id = ?")
        .bind(&body.book_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Book not found".to_string()))?;

    let page_internal = (body.page - 1).max(0); // Convert to 0-indexed
    let completed = body.is_completed.unwrap_or(false) as i32;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(pid) = &profile_id {
        // Upsert profile progress
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM reading_progress WHERE profile_id = ? AND book_id = ?",
        )
        .bind(pid)
        .bind(&body.book_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some((id,)) = existing {
            sqlx::query(
                "UPDATE reading_progress SET page_number = ?, is_completed = ?, updated_at = ? WHERE id = ?",
            )
            .bind(page_internal)
            .bind(completed)
            .bind(&now)
            .bind(&id)
            .execute(&state.db)
            .await?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO reading_progress (id, profile_id, book_id, page_number, is_completed, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(pid)
            .bind(&body.book_id)
            .bind(page_internal)
            .bind(completed)
            .bind(&now)
            .execute(&state.db)
            .await?;
        }
    } else if let Some(did) = &device_id {
        // Upsert device progress
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM reading_progress WHERE device_id = ? AND book_id = ? AND profile_id IS NULL",
        )
        .bind(did)
        .bind(&body.book_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some((id,)) = existing {
            sqlx::query(
                "UPDATE reading_progress SET page_number = ?, is_completed = ?, updated_at = ? WHERE id = ?",
            )
            .bind(page_internal)
            .bind(completed)
            .bind(&now)
            .bind(&id)
            .execute(&state.db)
            .await?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO reading_progress (id, device_id, book_id, page_number, is_completed, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(did)
            .bind(&body.book_id)
            .bind(page_internal)
            .bind(completed)
            .bind(&now)
            .execute(&state.db)
            .await?;
        }
    } else {
        return Err(AppError::BadRequest(
            "Either a profile session or X-Device-Id header is required".to_string(),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn migrate_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, AppError> {
    let profile_id = extract_profile_id(&state, &headers)
        .await
        .ok_or(AppError::Unauthorized)?;
    let device_id = extract_device_id(&state, &headers)
        .await
        .ok_or_else(|| AppError::BadRequest("X-Device-Id header required".to_string()))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Get all device-local progress
    let device_progress: Vec<(String, String, i32, i32, String)> = sqlx::query_as(
        "SELECT id, book_id, page_number, is_completed, updated_at
         FROM reading_progress WHERE device_id = ? AND profile_id IS NULL",
    )
    .bind(&device_id)
    .fetch_all(&state.db)
    .await?;

    for (dp_id, book_id, page_number, is_completed, updated_at) in device_progress {
        // Check if profile already has progress for this book
        let existing: Option<(String, String)> = sqlx::query_as(
            "SELECT id, updated_at FROM reading_progress WHERE profile_id = ? AND book_id = ?",
        )
        .bind(&profile_id)
        .bind(&book_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some((existing_id, existing_updated)) = existing {
            // Keep the more recent one
            if updated_at > existing_updated {
                sqlx::query(
                    "UPDATE reading_progress SET page_number = ?, is_completed = ?, updated_at = ? WHERE id = ?",
                )
                .bind(page_number)
                .bind(is_completed)
                .bind(&now)
                .bind(&existing_id)
                .execute(&state.db)
                .await?;
            }
        } else {
            // Move device progress to profile
            sqlx::query(
                "UPDATE reading_progress SET profile_id = ?, updated_at = ? WHERE id = ?",
            )
            .bind(&profile_id)
            .bind(&now)
            .bind(&dp_id)
            .execute(&state.db)
            .await?;
        }

        // Delete the device-local entry
        sqlx::query("DELETE FROM reading_progress WHERE id = ? AND profile_id IS NULL")
            .bind(&dp_id)
            .execute(&state.db)
            .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ──

async fn extract_profile_id(state: &AppState, headers: &HeaderMap) -> Option<String> {
    let auth = headers.get("authorization")?.to_str().ok()?;
    let token = auth.strip_prefix("Bearer ")?;

    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT profile_id, expires_at FROM sessions WHERE token = ?",
    )
    .bind(token)
    .fetch_optional(&state.db)
    .await
    .ok()?;

    let (profile_id, expires_at) = row?;
    // Check expiry
    if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(&expires_at) {
        if exp < chrono::Utc::now() {
            return None;
        }
    }

    Some(profile_id)
}

async fn extract_device_id(state: &AppState, headers: &HeaderMap) -> Option<String> {
    let fingerprint = headers.get("x-device-id")?.to_str().ok()?;

    // Ensure device record exists
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM devices WHERE device_fingerprint = ?")
            .bind(fingerprint)
            .fetch_optional(&state.db)
            .await
            .ok()?;

    if let Some((id,)) = existing {
        // Update last_seen
        let _ = sqlx::query("UPDATE devices SET last_seen_at = datetime('now') WHERE id = ?")
            .bind(&id)
            .execute(&state.db)
            .await;
        Some(id)
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO devices (id, device_fingerprint) VALUES (?, ?)",
        )
        .bind(&id)
        .bind(fingerprint)
        .execute(&state.db)
        .await;
        Some(id)
    }
}
