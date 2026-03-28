use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::db::models::{BookDetailRow, SeriesMetadataRow, SeriesRow};
use crate::error::AppError;
use crate::scanner;
use crate::state::AppState;
use crate::utils::extract_year;

/// SQL fragment: determines whether a series contains volumes or chapters
/// based on the title of the first book by sort order.
const BOOK_TYPE_SUBQUERY: &str =
    "(SELECT CASE WHEN b2.title LIKE 'Volume%' THEN 'volume' ELSE 'chapter' END \
     FROM books b2 WHERE b2.series_id = s.id ORDER BY b2.sort_order LIMIT 1) as book_type";

/// Helper to map a series query row into a SeriesItem.
fn map_series_row(row: SeriesRow) -> SeriesItem {
    SeriesItem {
        year: extract_year(&row.name),
        id: row.id,
        name: row.name,
        book_count: row.book_count,
        book_type: row.book_type.unwrap_or_else(|| "chapter".to_string()),
        anilist_cover_url: row.anilist_cover_url,
        anilist_score: row.anilist_score,
        anilist_id: row.anilist_id,
    }
}

#[derive(Serialize)]
pub struct LibraryResponse {
    pub id: String,
    pub name: String,
    pub path: String,
    pub series_count: i64,
}

#[derive(Serialize)]
pub struct LibrariesResponse {
    pub libraries: Vec<LibraryResponse>,
}

pub async fn list_libraries(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LibrariesResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let rows: Vec<(String, String, String, i64)> = sqlx::query_as(
        "SELECT l.id, l.name, l.path, COUNT(s.id) as series_count
         FROM libraries l
         LEFT JOIN series s ON s.library_id = l.id
         GROUP BY l.id
         ORDER BY l.name",
    )
    .fetch_all(&state.db)
    .await?;

    let libraries = rows
        .into_iter()
        .map(|(id, name, path, series_count)| LibraryResponse {
            id,
            name,
            path,
            series_count,
        })
        .collect();

    Ok(Json(LibrariesResponse { libraries }))
}

// ── Series listing ──

#[derive(Serialize)]
pub struct SeriesItem {
    pub id: String,
    pub name: String,
    pub book_count: i64,
    pub book_type: String,
    pub year: Option<i32>,
    pub anilist_cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anilist_score: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anilist_id: Option<i64>,
}

#[derive(Serialize)]
pub struct SeriesListResponse {
    pub series: Vec<SeriesItem>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

#[derive(Deserialize)]
pub struct PaginationParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Deserialize)]
pub struct AllSeriesParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub sort: Option<String>,     // name, year, score, recently_added
    pub sort_dir: Option<String>, // asc or desc (default depends on sort field)
    pub genre: Option<String>,    // filter by genre (substring match in anilist_genres)
    pub status: Option<String>,   // filter by anilist_status
    pub year: Option<i32>,        // filter by anilist_start_year
}

pub async fn list_series(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(library_id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<SeriesListResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * per_page;

    // Verify library exists
    let _lib: (String,) = sqlx::query_as("SELECT id FROM libraries WHERE id = ?")
        .bind(&library_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Library not found".to_string()))?;

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM series WHERE library_id = ?")
        .bind(&library_id)
        .fetch_one(&state.db)
        .await?;

    #[allow(clippy::type_complexity)]
    let rows: Vec<SeriesRow> = sqlx::query_as(&format!(
        "SELECT s.id, s.name, COUNT(b.id) as book_count,
                {BOOK_TYPE_SUBQUERY},
                s.anilist_cover_url,
                s.anilist_score,
                s.anilist_id
         FROM series s
         LEFT JOIN books b ON b.series_id = s.id
         WHERE s.library_id = ?
         GROUP BY s.id
         ORDER BY s.sort_name
         LIMIT ? OFFSET ?"
    ))
    .bind(&library_id)
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let series = rows.into_iter().map(map_series_row).collect();

    Ok(Json(SeriesListResponse {
        series,
        total: total.0,
        page,
        per_page,
    }))
}

// ── Books listing ──

#[derive(Serialize)]
pub struct BookItem {
    pub id: String,
    pub title: String,
    pub page_count: i32,
    pub sort_order: i32,
}

#[derive(Serialize)]
pub struct SeriesInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct BooksListResponse {
    pub series: SeriesInfo,
    pub books: Vec<BookItem>,
}

pub async fn list_books(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
) -> Result<Json<BooksListResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let series: (String, String) = sqlx::query_as("SELECT id, name FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    let rows: Vec<(String, String, i32, i32)> = sqlx::query_as(
        "SELECT id, title, page_count, sort_order FROM books
         WHERE series_id = ?
         ORDER BY sort_order, title",
    )
    .bind(&series_id)
    .fetch_all(&state.db)
    .await?;

    let books = rows
        .into_iter()
        .map(|(id, title, page_count, sort_order)| BookItem {
            id,
            title,
            page_count,
            sort_order,
        })
        .collect();

    Ok(Json(BooksListResponse {
        series: SeriesInfo {
            id: series.0,
            name: series.1,
        },
        books,
    }))
}

// ── All series (global, across all libraries) ──

#[derive(Serialize)]
pub struct AllSeriesResponse {
    pub series: Vec<SeriesItem>,
    pub total: i64,
}

pub async fn all_series(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<AllSeriesParams>,
) -> Result<Json<AllSeriesResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(200).clamp(1, 500);
    let offset = (page - 1) * per_page;

    // Build WHERE clause from filters
    let mut where_clauses: Vec<String> = Vec::new();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(ref genre) = params.genre {
        where_clauses.push("s.anilist_genres LIKE ?".to_string());
        bind_values.push(format!("%{}%", genre));
    }
    if let Some(ref status) = params.status {
        where_clauses.push("s.anilist_status = ?".to_string());
        bind_values.push(status.clone());
    }
    if let Some(year) = params.year {
        where_clauses.push("s.anilist_start_year = ?".to_string());
        bind_values.push(year.to_string());
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // Build ORDER BY from sort param
    let is_desc = params.sort_dir.as_deref() == Some("desc");
    let is_asc = params.sort_dir.as_deref() == Some("asc");
    let order_sql = match params.sort.as_deref() {
        Some("year") => {
            if is_asc {
                "ORDER BY s.anilist_start_year ASC NULLS LAST, s.sort_name"
            } else {
                "ORDER BY s.anilist_start_year DESC NULLS LAST, s.sort_name"
            }
        }
        Some("score") => {
            if is_asc {
                "ORDER BY s.anilist_score ASC NULLS LAST, s.sort_name"
            } else {
                "ORDER BY s.anilist_score DESC NULLS LAST, s.sort_name"
            }
        }
        Some("recently_added") => {
            if is_asc {
                "ORDER BY s.created_at ASC"
            } else {
                "ORDER BY s.created_at DESC"
            }
        }
        _ => {
            // Default name sort
            if is_desc {
                "ORDER BY s.sort_name DESC"
            } else {
                "ORDER BY s.sort_name ASC"
            }
        }
    };

    let count_sql = format!("SELECT COUNT(*) FROM series s {}", where_sql);
    let mut count_q = sqlx::query_as::<_, (i64,)>(&count_sql);
    for v in &bind_values {
        count_q = count_q.bind(v);
    }
    let total = count_q.fetch_one(&state.db).await?.0;

    let data_sql = format!(
        "SELECT s.id, s.name, COUNT(b.id) as book_count,
                {BOOK_TYPE_SUBQUERY},
                s.anilist_cover_url,
                s.anilist_score,
                s.anilist_id
         FROM series s
         LEFT JOIN books b ON b.series_id = s.id
         {}
         GROUP BY s.id
         {} LIMIT ? OFFSET ?",
        where_sql, order_sql
    );

    #[allow(clippy::type_complexity)]
    let mut data_q = sqlx::query_as::<_, SeriesRow>(&data_sql);
    for v in &bind_values {
        data_q = data_q.bind(v);
    }
    data_q = data_q.bind(per_page).bind(offset);
    let rows = data_q.fetch_all(&state.db).await?;

    let series = rows.into_iter().map(map_series_row).collect();

    Ok(Json(AllSeriesResponse { series, total }))
}

// ── Available genres ──

pub async fn available_genres(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<String>>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT anilist_genres FROM series WHERE anilist_genres IS NOT NULL AND anilist_genres != ''"
    )
    .fetch_all(&state.db)
    .await?;

    let mut genres = std::collections::BTreeSet::new();
    for (raw,) in rows {
        // anilist_genres is stored as JSON array string like '["Action","Drama"]'
        if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&raw) {
            for g in parsed {
                genres.insert(g);
            }
        }
    }

    Ok(Json(genres.into_iter().collect()))
}

// ── Recently added series ──

#[derive(Deserialize)]
pub struct LimitParams {
    pub limit: Option<i64>,
}

pub async fn recently_added(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<SeriesItem>>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let limit = params.limit.unwrap_or(10).clamp(1, 50);

    #[allow(clippy::type_complexity)]
    let rows: Vec<SeriesRow> = sqlx::query_as(&format!(
        "SELECT s.id, s.name, COUNT(b.id) as book_count,
                {BOOK_TYPE_SUBQUERY},
                s.anilist_cover_url,
                s.anilist_score,
                s.anilist_id
         FROM series s
         LEFT JOIN books b ON b.series_id = s.id
         GROUP BY s.id
         ORDER BY s.created_at DESC
         LIMIT ?"
    ))
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let series = rows.into_iter().map(map_series_row).collect();

    Ok(Json(series))
}

// ── Recently updated series ──

pub async fn recently_updated(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<SeriesItem>>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let limit = params.limit.unwrap_or(10).clamp(1, 50);

    #[allow(clippy::type_complexity)]
    let rows: Vec<SeriesRow> = sqlx::query_as(&format!(
        "SELECT s.id, s.name, COUNT(b.id) as book_count,
                {BOOK_TYPE_SUBQUERY},
                s.anilist_cover_url,
                s.anilist_score,
                s.anilist_id
         FROM series s
         LEFT JOIN books b ON b.series_id = s.id
         GROUP BY s.id
         ORDER BY s.updated_at DESC
         LIMIT ?"
    ))
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let series = rows.into_iter().map(map_series_row).collect();

    Ok(Json(series))
}

// ── Book detail ──

#[derive(Serialize)]
pub struct BookMetadata {
    pub writer: Option<String>,
    pub year: Option<i32>,
    pub summary: Option<String>,
}

#[derive(Serialize)]
pub struct BookDetailResponse {
    pub id: String,
    pub title: String,
    pub series_id: String,
    pub series_name: String,
    pub page_count: i32,
    pub file_size: i64,
    pub metadata: BookMetadata,
}

pub async fn book_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(book_id): Path<String>,
) -> Result<Json<BookDetailResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let row: Option<BookDetailRow> = sqlx::query_as(
        "SELECT b.id, b.title, b.series_id, s.name AS series_name, b.page_count, b.file_size,
                    b.meta_writer, b.meta_year, b.meta_summary
             FROM books b
             JOIN series s ON b.series_id = s.id
             WHERE b.id = ?",
    )
    .bind(&book_id)
    .fetch_optional(&state.db)
    .await?;

    let r = row.ok_or_else(|| AppError::NotFound("Book not found".to_string()))?;

    Ok(Json(BookDetailResponse {
        id: r.id,
        title: r.title,
        series_id: r.series_id,
        series_name: r.series_name,
        page_count: r.page_count,
        file_size: r.file_size,
        metadata: BookMetadata {
            writer: r.meta_writer,
            year: r.meta_year,
            summary: r.meta_summary,
        },
    }))
}

// ── Book chapters (detected from CBZ structure) ──

#[derive(Serialize)]
pub struct BookChapter {
    pub chapter_number: i32,
    pub title: String,
    pub start_page: i32,
    pub end_page: i32,
}

#[derive(Serialize)]
pub struct BookChaptersResponse {
    pub book_id: String,
    pub chapters: Vec<BookChapter>,
}

pub async fn book_chapters(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(book_id): Path<String>,
) -> Result<Json<BookChaptersResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    // Verify book exists
    let _: (String,) = sqlx::query_as("SELECT id FROM books WHERE id = ?")
        .bind(&book_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Book not found".to_string()))?;

    let rows: Vec<(i32, String, i32, i32)> = sqlx::query_as(
        "SELECT chapter_number, title, start_page, end_page
         FROM book_chapters WHERE book_id = ? ORDER BY chapter_number",
    )
    .bind(&book_id)
    .fetch_all(&state.db)
    .await?;

    let chapters = rows
        .into_iter()
        .map(
            |(chapter_number, title, start_page, end_page)| BookChapter {
                chapter_number,
                title,
                start_page,
                end_page,
            },
        )
        .collect();

    Ok(Json(BookChaptersResponse {
        book_id: book_id.to_string(),
        chapters,
    }))
}

// ── Series-level chapters (aggregated from all books) ──

#[derive(Serialize)]
pub struct SeriesChapter {
    pub book_id: String,
    pub book_title: String,
    pub chapter_number: i32,
    pub title: String,
    pub start_page: i32,
    pub end_page: i32,
}

#[derive(Serialize)]
pub struct SeriesChaptersResponse {
    pub series_id: String,
    pub total_chapters: usize,
    pub chapters: Vec<SeriesChapter>,
}

pub async fn series_chapters(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
) -> Result<Json<SeriesChaptersResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    // Verify series exists
    let _: (String,) = sqlx::query_as("SELECT id FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    let rows: Vec<(String, String, i32, String, i32, i32)> = sqlx::query_as(
        "SELECT b.id, b.title, bc.chapter_number, bc.title, bc.start_page, bc.end_page
         FROM book_chapters bc
         JOIN books b ON bc.book_id = b.id
         WHERE b.series_id = ?
         ORDER BY b.sort_order, bc.chapter_number",
    )
    .bind(&series_id)
    .fetch_all(&state.db)
    .await?;

    let chapters: Vec<SeriesChapter> = rows
        .into_iter()
        .map(
            |(book_id, book_title, chapter_number, title, start_page, end_page)| SeriesChapter {
                book_id,
                book_title,
                chapter_number,
                title,
                start_page,
                end_page,
            },
        )
        .collect();

    let total = chapters.len();

    Ok(Json(SeriesChaptersResponse {
        series_id: series_id.to_string(),
        total_chapters: total,
        chapters,
    }))
}

// ── Rescan series ──

#[derive(Serialize)]
pub struct RescanResponse {
    pub status: String,
    pub books_scanned: usize,
}

#[derive(Deserialize)]
pub struct RescanBody {
    pub anilist_id: Option<i64>,
}

pub async fn rescan_series(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
    body: Option<Json<RescanBody>>,
) -> Result<Json<RescanResponse>, AppError> {
    let _profile = super::auth::require_admin(&state, &headers).await?;

    // Verify series exists
    let _: (String,) = sqlx::query_as("SELECT id FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    let anilist_id = body.and_then(|b| b.anilist_id);

    let scanned = scanner::rescan_series(
        &state.db,
        &series_id,
        anilist_id,
        &state.config.data_dir,
        &state.http_client,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Rescan failed: {}", e)))?;

    Ok(Json(RescanResponse {
        status: "completed".to_string(),
        books_scanned: scanned,
    }))
}

// ── Series metadata (AniList) ──

#[derive(Serialize)]
pub struct SeriesMetadataResponse {
    pub anilist_id: Option<i64>,
    pub anilist_id_source: Option<String>,
    pub title_english: Option<String>,
    pub title_romaji: Option<String>,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub banner_url: Option<String>,
    pub genres: Option<Vec<String>>,
    pub status: Option<String>,
    pub chapters: Option<i64>,
    pub volumes: Option<i64>,
    pub score: Option<i64>,
    pub author: Option<String>,
    pub start_year: Option<i64>,
    pub end_year: Option<i64>,
}

pub async fn get_series_metadata(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;
    fetch_series_metadata_inner(&state.db, &series_id).await
}

/// Internal helper for fetching series metadata (no auth check).
async fn fetch_series_metadata_inner(
    db: &sqlx::SqlitePool,
    series_id: &str,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    let row: Option<SeriesMetadataRow> = sqlx::query_as(
        "SELECT anilist_id, anilist_id_source, anilist_title_english, anilist_title_romaji,
                anilist_description, anilist_cover_url, anilist_banner_url, anilist_genres,
                anilist_status, anilist_chapters, anilist_volumes, anilist_score,
                anilist_author, anilist_start_year, anilist_end_year
         FROM series WHERE id = ?",
    )
    .bind(series_id)
    .fetch_optional(db)
    .await?;

    let r = row.ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    let genres: Option<Vec<String>> = r
        .anilist_genres
        .as_deref()
        .and_then(|g| serde_json::from_str(g).ok());

    Ok(Json(SeriesMetadataResponse {
        anilist_id: r.anilist_id,
        anilist_id_source: r.anilist_id_source,
        title_english: r.anilist_title_english,
        title_romaji: r.anilist_title_romaji,
        description: r.anilist_description,
        cover_url: r.anilist_cover_url,
        banner_url: r.anilist_banner_url,
        genres,
        status: r.anilist_status,
        chapters: r.anilist_chapters,
        volumes: r.anilist_volumes,
        score: r.anilist_score,
        author: r.anilist_author,
        start_year: r.anilist_start_year,
        end_year: r.anilist_end_year,
    }))
}

#[derive(Deserialize)]
pub struct SetMetadataBody {
    pub anilist_id: i64,
}

pub async fn set_series_metadata(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
    Json(body): Json<SetMetadataBody>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    let _profile = super::auth::require_admin(&state, &headers).await?;

    // Verify series exists
    let _: (String,) = sqlx::query_as("SELECT id FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    // Fetch from AniList by ID
    let media = crate::anilist::fetch_by_id(&state.http_client, body.anilist_id)
        .await
        .map_err(|e| AppError::Internal(format!("AniList fetch failed: {}", e)))?
        .ok_or_else(|| AppError::NotFound(format!("AniList ID {} not found", body.anilist_id)))?;

    // Save with manual source
    crate::anilist::save_metadata(&state.db, &series_id, &media, "manual")
        .await
        .map_err(|e| AppError::Internal(format!("Failed to save metadata: {}", e)))?;

    // Return updated metadata
    fetch_series_metadata_inner(&state.db, &series_id).await
}

pub async fn refresh_series_metadata(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    let _profile = super::auth::require_admin(&state, &headers).await?;

    // Get series info
    let row: Option<(String, Option<i64>, Option<String>)> =
        sqlx::query_as("SELECT name, anilist_id, anilist_id_source FROM series WHERE id = ?")
            .bind(&series_id)
            .fetch_optional(&state.db)
            .await?;

    let (name, existing_id, source) =
        row.ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    // If manual source with existing ID, re-fetch by stored ID
    if source.as_deref() == Some("manual") {
        if let Some(al_id) = existing_id {
            if let Ok(Some(media)) = crate::anilist::fetch_by_id(&state.http_client, al_id).await {
                let _ =
                    crate::anilist::save_metadata(&state.db, &series_id, &media, "manual").await;
            }
            return fetch_series_metadata_inner(&state.db, &series_id).await;
        }
    }

    // Otherwise, clear and re-fetch by name search
    let _ = crate::anilist::clear_metadata(&state.db, &series_id).await;
    let _ = crate::anilist::fetch_and_save_for_series(
        &state.http_client,
        &state.db,
        &series_id,
        &name,
        true,
    )
    .await;

    fetch_series_metadata_inner(&state.db, &series_id).await
}

pub async fn clear_series_metadata(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(series_id): Path<String>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    let _profile = super::auth::require_admin(&state, &headers).await?;

    // Verify series exists and get name
    let row: Option<(String,)> = sqlx::query_as("SELECT name FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?;

    let (name,) = row.ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    // Clear all metadata
    crate::anilist::clear_metadata(&state.db, &series_id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to clear metadata: {}", e)))?;

    // Re-fetch by name search (auto mode)
    let _ = crate::anilist::fetch_and_save_for_series(
        &state.http_client,
        &state.db,
        &series_id,
        &name,
        true,
    )
    .await;

    fetch_series_metadata_inner(&state.db, &series_id).await
}

// ── Server-side Search (Task 31) ──

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<i64>,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub series: Vec<SeriesItem>,
    pub books: Vec<SearchBookItem>,
}

#[derive(Serialize)]
pub struct SearchBookItem {
    pub id: String,
    pub title: String,
    pub series_id: String,
    pub series_name: String,
}

pub async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<SearchQuery>,
) -> Result<Json<SearchResult>, AppError> {
    super::auth::require_auth(&state, &headers).await?;

    let q = params.q.trim().to_string();
    if q.is_empty() {
        return Ok(Json(SearchResult {
            series: vec![],
            books: vec![],
        }));
    }

    let limit = params.limit.unwrap_or(20).min(100);
    let like = format!("%{}%", q);

    let series_rows: Vec<SeriesRow> = sqlx::query_as(&format!(
        "SELECT s.id, s.name,
                (SELECT COUNT(*) FROM books b WHERE b.series_id = s.id) as book_count,
                {},
                s.anilist_cover_url,
                s.anilist_score,
                s.anilist_id
         FROM series s
         WHERE s.name LIKE ? OR s.sort_name LIKE ?
            OR s.anilist_title_english LIKE ? OR s.anilist_title_romaji LIKE ?
         ORDER BY s.sort_name
         LIMIT ?",
        BOOK_TYPE_SUBQUERY
    ))
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let series: Vec<SeriesItem> = series_rows.into_iter().map(map_series_row).collect();

    let book_rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT b.id, b.title, b.series_id, s.name as series_name
         FROM books b JOIN series s ON b.series_id = s.id
         WHERE b.title LIKE ? OR b.filename LIKE ?
         ORDER BY b.title
         LIMIT ?",
    )
    .bind(&like)
    .bind(&like)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let books: Vec<SearchBookItem> = book_rows
        .into_iter()
        .map(|(id, title, series_id, series_name)| SearchBookItem {
            id,
            title,
            series_id,
            series_name,
        })
        .collect();

    Ok(Json(SearchResult { series, books }))
}
