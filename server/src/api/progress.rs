use axum::extract::{Query, State};
use axum::http::header::HeaderMap;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

// -- Progress --

#[derive(Deserialize)]
pub struct ProgressQuery {
    pub book_id: String,
}

#[derive(Serialize, Clone)]
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
    let profile = super::auth::require_auth(&state, &headers).await?;

    let row: Option<(String, i32, i32, String)> = sqlx::query_as(
        "SELECT book_id, page_number, is_completed, updated_at
         FROM reading_progress WHERE profile_id = ? AND book_id = ?",
    )
    .bind(&profile.id)
    .bind(&query.book_id)
    .fetch_optional(&state.db)
    .await?;

    let progress = row.map(
        |(book_id, page, is_completed, updated_at)| ProgressResponse {
            book_id,
            page: page + 1,
            is_completed: is_completed != 0,
            updated_at,
        },
    );

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
    let profile = super::auth::require_auth(&state, &headers).await?;

    // Verify book exists
    let _: (String,) = sqlx::query_as("SELECT id FROM books WHERE id = ?")
        .bind(&body.book_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Book not found".to_string()))?;

    let page_internal = (body.page - 1).max(0);
    let completed = body.is_completed.unwrap_or(false) as i32;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO reading_progress (id, profile_id, book_id, page_number, is_completed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, book_id) WHERE profile_id IS NOT NULL
         DO UPDATE SET page_number = excluded.page_number,
                       is_completed = excluded.is_completed,
                       updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&profile.id)
    .bind(&body.book_id)
    .bind(page_internal)
    .bind(completed)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// -- Batch progress --

#[derive(Deserialize)]
pub struct BatchProgressQuery {
    pub book_ids: String,
}

#[derive(Serialize)]
pub struct BatchProgressResponse {
    pub progress: std::collections::HashMap<String, ProgressResponse>,
}

pub async fn batch_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<BatchProgressQuery>,
) -> Result<Json<BatchProgressResponse>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let book_ids: Vec<&str> = query
        .book_ids
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    let mut progress_map = std::collections::HashMap::new();

    if book_ids.is_empty() {
        return Ok(Json(BatchProgressResponse {
            progress: progress_map,
        }));
    }

    let placeholders: String = book_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT book_id, page_number, is_completed, updated_at
         FROM reading_progress WHERE profile_id = ? AND book_id IN ({})",
        placeholders
    );
    let mut q = sqlx::query_as::<_, (String, i32, i32, String)>(&sql).bind(&profile.id);
    for bid in &book_ids {
        q = q.bind(*bid);
    }
    let rows = q.fetch_all(&state.db).await?;

    for (bid, page, is_completed, updated_at) in rows {
        progress_map.insert(
            bid.clone(),
            ProgressResponse {
                book_id: bid,
                page: page + 1,
                is_completed: is_completed != 0,
                updated_at,
            },
        );
    }

    Ok(Json(BatchProgressResponse {
        progress: progress_map,
    }))
}

// -- Bulk mark read/unread --

#[derive(Deserialize)]
pub struct BulkMarkRequest {
    pub book_ids: Vec<String>,
    pub is_completed: bool,
}

pub async fn bulk_mark_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BulkMarkRequest>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    if body.book_ids.is_empty() {
        return Ok(StatusCode::NO_CONTENT);
    }

    let now = chrono::Utc::now().to_rfc3339();

    for book_id in &body.book_ids {
        if body.is_completed {
            // Mark read: set page to last page
            let page: i32 = {
                let row: Option<(i32,)> =
                    sqlx::query_as("SELECT page_count FROM books WHERE id = ?")
                        .bind(book_id)
                        .fetch_optional(&state.db)
                        .await?;
                row.map(|(c,)| (c - 1).max(0)).unwrap_or(0)
            };

            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO reading_progress (id, profile_id, book_id, page_number, is_completed, updated_at)
                 VALUES (?, ?, ?, ?, 1, ?)
                 ON CONFLICT(profile_id, book_id) WHERE profile_id IS NOT NULL
                 DO UPDATE SET page_number = excluded.page_number,
                               is_completed = 1,
                               updated_at = excluded.updated_at",
            )
            .bind(&id)
            .bind(&profile.id)
            .bind(book_id)
            .bind(page)
            .bind(&now)
            .execute(&state.db)
            .await?;
        } else {
            // Mark unread: delete the progress row entirely
            sqlx::query("DELETE FROM reading_progress WHERE profile_id = ? AND book_id = ?")
                .bind(&profile.id)
                .bind(book_id)
                .execute(&state.db)
                .await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

// -- Continue Reading (server-side) --

#[derive(Serialize)]
pub struct ContinueReadingItem {
    pub book_id: String,
    pub book_title: String,
    pub series_id: String,
    pub series_name: String,
    pub page: i32,
    pub total_pages: i32,
    pub cover_url: Option<String>,
    pub updated_at: String,
}

pub async fn continue_reading(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ContinueReadingItem>>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    #[derive(sqlx::FromRow)]
    struct ContinueRow {
        book_id: String,
        title: String,
        sid: String,
        sname: String,
        page_number: i32,
        page_count: i32,
        anilist_cover_url: Option<String>,
        updated_at: String,
    }

    let rows: Vec<ContinueRow> = sqlx::query_as(
        "SELECT book_id, title, sid, sname, page_number, page_count, anilist_cover_url, updated_at
         FROM (
           SELECT rp.book_id, b.title, s.id AS sid, s.name AS sname, rp.page_number, b.page_count,
                  s.anilist_cover_url, rp.updated_at,
                  ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY rp.updated_at DESC) AS rn
           FROM reading_progress rp
           JOIN books b ON rp.book_id = b.id
           JOIN series s ON b.series_id = s.id
           WHERE rp.profile_id = ? AND rp.is_completed = 0
         ) WHERE rn = 1
         ORDER BY updated_at DESC
         LIMIT 10",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let items = rows
        .into_iter()
        .map(|r| ContinueReadingItem {
            book_id: r.book_id,
            book_title: r.title,
            series_id: r.sid,
            series_name: r.sname,
            page: r.page_number + 1,
            total_pages: r.page_count,
            cover_url: r.anilist_cover_url,
            updated_at: r.updated_at,
        })
        .collect();

    Ok(Json(items))
}

// -- Series Continue (Task 47) --

#[derive(Serialize)]
pub struct SeriesContinueResponse {
    /// "start" | "continue" | "reread"
    pub action: String,
    pub book_id: String,
    pub book_title: String,
    pub page: i32,
    pub total_pages: i32,
    pub progress_percent: f64,
}

#[derive(Deserialize)]
pub struct SeriesContinueQuery {
    pub series_id: String,
}

/// For the series page: determine the best book to continue/start reading.
pub async fn series_continue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<SeriesContinueQuery>,
) -> Result<Json<Option<SeriesContinueResponse>>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    // Find the most recently read incomplete book in this series
    #[derive(sqlx::FromRow)]
    #[allow(dead_code)]
    struct ProgressRow {
        book_id: String,
        title: String,
        page_number: i32,
        page_count: i32,
        is_completed: i32,
    }

    let in_progress: Option<ProgressRow> = sqlx::query_as(
        "SELECT b.id AS book_id, b.title, rp.page_number, b.page_count, rp.is_completed
         FROM reading_progress rp
         JOIN books b ON rp.book_id = b.id
         WHERE b.series_id = ? AND rp.profile_id = ? AND rp.is_completed = 0 AND rp.page_number > 0
         ORDER BY rp.updated_at DESC
         LIMIT 1",
    )
    .bind(&params.series_id)
    .bind(&profile.id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(row) = in_progress {
        let percent = if row.page_count > 0 {
            ((row.page_number + 1) as f64 / row.page_count as f64 * 100.0).min(100.0)
        } else {
            0.0
        };
        return Ok(Json(Some(SeriesContinueResponse {
            action: "continue".to_string(),
            book_id: row.book_id,
            book_title: row.title,
            page: row.page_number + 1,
            total_pages: row.page_count,
            progress_percent: percent,
        })));
    }

    // Check if all books are completed
    let total_books: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM books WHERE series_id = ?")
        .bind(&params.series_id)
        .fetch_one(&state.db)
        .await?;

    let completed_books: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reading_progress rp
         JOIN books b ON rp.book_id = b.id
         WHERE b.series_id = ? AND rp.profile_id = ? AND rp.is_completed = 1",
    )
    .bind(&params.series_id)
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    if total_books.0 > 0 && completed_books.0 >= total_books.0 {
        // All completed → reread the first book
        let first: Option<(String, String, i32)> = sqlx::query_as(
            "SELECT id, title, page_count FROM books WHERE series_id = ? ORDER BY sort_order LIMIT 1",
        )
        .bind(&params.series_id)
        .fetch_optional(&state.db)
        .await?;

        if let Some((book_id, title, page_count)) = first {
            return Ok(Json(Some(SeriesContinueResponse {
                action: "reread".to_string(),
                book_id,
                book_title: title,
                page: 1,
                total_pages: page_count,
                progress_percent: 100.0,
            })));
        }
    }

    // No progress at all → start the first book
    let first: Option<(String, String, i32)> = sqlx::query_as(
        "SELECT id, title, page_count FROM books WHERE series_id = ? ORDER BY sort_order LIMIT 1",
    )
    .bind(&params.series_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some((book_id, title, page_count)) = first {
        return Ok(Json(Some(SeriesContinueResponse {
            action: "start".to_string(),
            book_id,
            book_title: title,
            page: 1,
            total_pages: page_count,
            progress_percent: 0.0,
        })));
    }

    Ok(Json(None))
}

// -- Bookmarks --

#[derive(Serialize)]
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub page: i32,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateBookmarkRequest {
    pub book_id: String,
    pub page: i32,
    pub note: Option<String>,
}

#[derive(Deserialize)]
pub struct BookmarkQuery {
    pub book_id: String,
}

pub async fn list_bookmarks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<BookmarkQuery>,
) -> Result<Json<Vec<Bookmark>>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let rows: Vec<(String, String, i32, Option<String>, String)> = sqlx::query_as(
        "SELECT id, book_id, page, note, created_at FROM bookmarks
         WHERE profile_id = ? AND book_id = ? ORDER BY page",
    )
    .bind(&profile.id)
    .bind(&query.book_id)
    .fetch_all(&state.db)
    .await?;

    let bookmarks = rows
        .into_iter()
        .map(|(id, book_id, page, note, created_at)| Bookmark {
            id,
            book_id,
            page,
            note,
            created_at,
        })
        .collect();

    Ok(Json(bookmarks))
}

pub async fn create_bookmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateBookmarkRequest>,
) -> Result<(StatusCode, Json<Bookmark>), AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO bookmarks (id, profile_id, book_id, page, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, book_id, page) DO UPDATE SET note = excluded.note",
    )
    .bind(&id)
    .bind(&profile.id)
    .bind(&body.book_id)
    .bind(body.page)
    .bind(&body.note)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(Bookmark {
            id,
            book_id: body.book_id,
            page: body.page,
            note: body.note,
            created_at: now,
        }),
    ))
}

pub async fn delete_bookmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(bookmark_id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let result = sqlx::query("DELETE FROM bookmarks WHERE id = ? AND profile_id = ?")
        .bind(&bookmark_id)
        .bind(&profile.id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Bookmark not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// -- Collections --

#[derive(Serialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub item_count: i64,
    pub created_at: String,
}

pub async fn list_collections(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Collection>>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let rows: Vec<(String, String, i32, i64, String)> = sqlx::query_as(
        "SELECT c.id, c.name, c.sort_order,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id),
                c.created_at
         FROM collections c
         WHERE c.profile_id = ?
         ORDER BY c.sort_order, c.name",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let collections = rows
        .into_iter()
        .map(
            |(id, name, sort_order, item_count, created_at)| Collection {
                id,
                name,
                sort_order,
                item_count,
                created_at,
            },
        )
        .collect();

    Ok(Json(collections))
}

#[derive(Deserialize)]
pub struct CreateCollectionRequest {
    pub name: String,
}

pub async fn create_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateCollectionRequest>,
) -> Result<(StatusCode, Json<Collection>), AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO collections (id, profile_id, name, created_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&profile.id)
        .bind(&body.name)
        .bind(&now)
        .execute(&state.db)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(ref db_err) if db_err.message().contains("UNIQUE") => {
                AppError::BadRequest("Collection name already exists".to_string())
            }
            _ => AppError::Database(e),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(Collection {
            id,
            name: body.name,
            sort_order: 0,
            item_count: 0,
            created_at: now,
        }),
    ))
}

pub async fn delete_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(collection_id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let result = sqlx::query("DELETE FROM collections WHERE id = ? AND profile_id = ?")
        .bind(&collection_id)
        .bind(&profile.id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Collection not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct AddCollectionItemRequest {
    pub series_id: String,
}

pub async fn add_collection_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(collection_id): axum::extract::Path<String>,
    Json(body): Json<AddCollectionItemRequest>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    // Verify collection belongs to user
    let _: (String,) = sqlx::query_as("SELECT id FROM collections WHERE id = ? AND profile_id = ?")
        .bind(&collection_id)
        .bind(&profile.id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Collection not found".to_string()))?;

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT OR IGNORE INTO collection_items (id, collection_id, series_id) VALUES (?, ?, ?)",
    )
    .bind(&id)
    .bind(&collection_id)
    .bind(&body.series_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::CREATED)
}

pub async fn remove_collection_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((collection_id, series_id)): axum::extract::Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    // Verify collection belongs to user
    let _: (String,) = sqlx::query_as("SELECT id FROM collections WHERE id = ? AND profile_id = ?")
        .bind(&collection_id)
        .bind(&profile.id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Collection not found".to_string()))?;

    sqlx::query("DELETE FROM collection_items WHERE collection_id = ? AND series_id = ?")
        .bind(&collection_id)
        .bind(&series_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub struct CollectionWithItems {
    pub id: String,
    pub name: String,
    pub items: Vec<CollectionItemDetail>,
}

#[derive(Serialize)]
pub struct CollectionItemDetail {
    pub series_id: String,
    pub series_name: String,
    pub cover_url: Option<String>,
    pub book_count: i64,
}

pub async fn get_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(collection_id): axum::extract::Path<String>,
) -> Result<Json<CollectionWithItems>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let coll: Option<(String, String)> =
        sqlx::query_as("SELECT id, name FROM collections WHERE id = ? AND profile_id = ?")
            .bind(&collection_id)
            .bind(&profile.id)
            .fetch_optional(&state.db)
            .await?;

    let (id, name) = coll.ok_or_else(|| AppError::NotFound("Collection not found".to_string()))?;

    let rows: Vec<(String, String, Option<String>, i64)> = sqlx::query_as(
        "SELECT s.id, s.name, s.anilist_cover_url,
                (SELECT COUNT(*) FROM books b WHERE b.series_id = s.id)
         FROM collection_items ci
         JOIN series s ON ci.series_id = s.id
         WHERE ci.collection_id = ?
         ORDER BY ci.added_at DESC",
    )
    .bind(&collection_id)
    .fetch_all(&state.db)
    .await?;

    let items = rows
        .into_iter()
        .map(
            |(series_id, series_name, cover_url, book_count)| CollectionItemDetail {
                series_id,
                series_name,
                cover_url,
                book_count,
            },
        )
        .collect();

    Ok(Json(CollectionWithItems { id, name, items }))
}

// -- Preferences --

#[derive(Serialize)]
pub struct PreferencesResponse {
    pub preferences: serde_json::Value,
}

pub async fn get_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PreferencesResponse>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let row: Option<(String,)> =
        sqlx::query_as("SELECT preferences FROM user_preferences WHERE profile_id = ?")
            .bind(&profile.id)
            .fetch_optional(&state.db)
            .await?;

    let prefs = row
        .and_then(|(json_str,)| serde_json::from_str(&json_str).ok())
        .unwrap_or(serde_json::json!({}));

    Ok(Json(PreferencesResponse { preferences: prefs }))
}

#[derive(Deserialize)]
pub struct UpdatePreferencesRequest {
    pub preferences: serde_json::Value,
}

pub async fn update_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdatePreferencesRequest>,
) -> Result<StatusCode, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;
    let now = chrono::Utc::now().to_rfc3339();
    let prefs_json = serde_json::to_string(&body.preferences)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {}", e)))?;

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO user_preferences (id, profile_id, preferences, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(profile_id) DO UPDATE SET preferences = excluded.preferences, updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&profile.id)
    .bind(&prefs_json)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// -- Reading Statistics --

#[derive(Serialize)]
pub struct ReadingStats {
    pub volumes_completed: i64,
    pub chapters_completed: i64,
    pub volumes_in_progress: i64,
    pub chapters_in_progress: i64,
    pub total_pages_read: i64,
    pub total_series_touched: i64,
    pub completion_rate: f64,
    pub daily_activity: Vec<DailyActivity>,
    pub top_genres: Vec<GenreStat>,
    pub current_streak: i64,
    pub longest_streak: i64,
}

#[derive(Serialize)]
pub struct DailyActivity {
    pub date: String,
    pub books_completed: i64,
    pub pages_read: i64,
}

#[derive(Serialize)]
pub struct GenreStat {
    pub genre: String,
    pub count: i64,
}

pub async fn reading_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ReadingStats>, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let (volumes_completed,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reading_progress rp
         JOIN books b ON b.id = rp.book_id
         WHERE rp.profile_id = ? AND rp.is_completed = 1 AND b.title LIKE 'Volume%'",
    )
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    let (chapters_completed,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reading_progress rp
         JOIN books b ON b.id = rp.book_id
         WHERE rp.profile_id = ? AND rp.is_completed = 1 AND b.title NOT LIKE 'Volume%'",
    )
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    let total_books_read = volumes_completed + chapters_completed;

    let (volumes_in_progress,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reading_progress rp
         JOIN books b ON b.id = rp.book_id
         WHERE rp.profile_id = ? AND rp.is_completed = 0 AND rp.page_number > 0 AND b.title LIKE 'Volume%'",
    )
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    let (chapters_in_progress,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reading_progress rp
         JOIN books b ON b.id = rp.book_id
         WHERE rp.profile_id = ? AND rp.is_completed = 0 AND rp.page_number > 0 AND b.title NOT LIKE 'Volume%'",
    )
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    let (total_pages_read,): (i64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(page_number + 1), 0) FROM reading_progress WHERE profile_id = ? AND page_number > 0",
    )
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    let (total_series_touched,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT b.series_id)
         FROM reading_progress rp JOIN books b ON b.id = rp.book_id
         WHERE rp.profile_id = ?",
    )
    .bind(&profile.id)
    .fetch_one(&state.db)
    .await?;

    let (total_tracked,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM reading_progress WHERE profile_id = ?")
            .bind(&profile.id)
            .fetch_one(&state.db)
            .await?;
    let completion_rate = if total_tracked > 0 {
        (total_books_read as f64) / (total_tracked as f64)
    } else {
        0.0
    };

    let daily_rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT date(updated_at) as d,
                SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(page_number + 1) as pages
         FROM reading_progress
         WHERE profile_id = ? AND updated_at >= datetime('now', '-30 days')
         GROUP BY d ORDER BY d",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let daily_activity: Vec<DailyActivity> = daily_rows
        .into_iter()
        .map(|(date, books_completed, pages_read)| DailyActivity {
            date,
            books_completed,
            pages_read,
        })
        .collect();

    let genre_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT j.value AS genre, COUNT(*) AS cnt
         FROM reading_progress rp
         JOIN books b ON b.id = rp.book_id
         JOIN series s ON s.id = b.series_id,
              json_each(s.anilist_genres) j
         WHERE rp.profile_id = ? AND rp.is_completed = 1
           AND s.anilist_genres IS NOT NULL AND s.anilist_genres != ''
         GROUP BY j.value ORDER BY cnt DESC LIMIT 10",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let top_genres: Vec<GenreStat> = genre_rows
        .into_iter()
        .map(|(genre, count)| GenreStat { genre, count })
        .collect();

    let all_dates: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT date(updated_at) as d
         FROM reading_progress WHERE profile_id = ? ORDER BY d",
    )
    .bind(&profile.id)
    .fetch_all(&state.db)
    .await?;

    let (mut current_streak, mut longest_streak, mut streak) = (0i64, 0i64, 0i64);
    let today = chrono::Utc::now().date_naive();
    let dates: Vec<chrono::NaiveDate> = all_dates
        .iter()
        .filter_map(|(d,)| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .collect();

    for (i, &date) in dates.iter().enumerate() {
        if i == 0 {
            streak = 1;
        } else {
            let prev = dates[i - 1];
            if (date - prev).num_days() == 1 {
                streak += 1;
            } else {
                if streak > longest_streak {
                    longest_streak = streak;
                }
                streak = 1;
            }
        }
    }
    if streak > longest_streak {
        longest_streak = streak;
    }
    if let Some(&last_date) = dates.last() {
        let gap = (today - last_date).num_days();
        if gap <= 1 {
            current_streak = streak;
        }
    }

    Ok(Json(ReadingStats {
        volumes_completed,
        chapters_completed,
        volumes_in_progress,
        chapters_in_progress,
        total_pages_read,
        total_series_touched,
        completion_rate,
        daily_activity,
        top_genres,
        current_streak,
        longest_streak,
    }))
}
