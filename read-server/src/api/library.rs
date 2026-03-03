use axum::extract::{Path, Query, State};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::scanner;
use crate::state::AppState;

/// Extract year from folder-name patterns like "(1999)", "[1999]", or "- 1999"
fn extract_year_from_name(name: &str) -> Option<i32> {
    use regex::Regex;
    use std::sync::OnceLock;

    static YEAR_RE: OnceLock<Regex> = OnceLock::new();
    let re = YEAR_RE.get_or_init(|| {
        Regex::new(r"[\(\[]\s*(\d{4})\s*[\)\]]|[-\u{2013}\u{2014}]\s*(\d{4})\s*$").unwrap()
    });

    re.captures(name)
        .and_then(|caps| {
            let year_match = caps.get(1).or_else(|| caps.get(2))?;
            let year_str = year_match.as_str();
            year_str.parse::<i32>().ok()
        })
        .and_then(|y| {
            if (1900..=2100).contains(&y) {
                Some(y)
            } else {
                None
            }
        })
}

#[derive(Serialize)]
pub struct LibraryResponse {
    pub id: String,
    pub name: String,
    pub series_count: i64,
}

#[derive(Serialize)]
pub struct LibrariesResponse {
    pub libraries: Vec<LibraryResponse>,
}

pub async fn list_libraries(
    State(state): State<AppState>,
) -> Result<Json<LibrariesResponse>, AppError> {
    let rows: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT l.id, l.name, COUNT(s.id) as series_count
         FROM libraries l
         LEFT JOIN series s ON s.library_id = l.id
         GROUP BY l.id
         ORDER BY l.name",
    )
    .fetch_all(&state.db)
    .await?;

    let libraries = rows
        .into_iter()
        .map(|(id, name, series_count)| LibraryResponse {
            id,
            name,
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

pub async fn list_series(
    State(state): State<AppState>,
    Path(library_id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<SeriesListResponse>, AppError> {
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

    let rows: Vec<(String, String, i64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT s.id, s.name, COUNT(b.id) as book_count,
                (SELECT CASE WHEN b2.title LIKE 'Volume%' THEN 'volume' ELSE 'chapter' END
                 FROM books b2 WHERE b2.series_id = s.id ORDER BY b2.sort_order LIMIT 1) as book_type,
                s.anilist_cover_url
         FROM series s
         LEFT JOIN books b ON b.series_id = s.id
         WHERE s.library_id = ?
         GROUP BY s.id
         ORDER BY s.sort_name
         LIMIT ? OFFSET ?",
    )
    .bind(&library_id)
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let series = rows
        .into_iter()
        .map(|(id, name, book_count, book_type, anilist_cover_url)| SeriesItem {
            id,
            name: name.clone(),
            book_count,
            book_type: book_type.unwrap_or_else(|| "chapter".to_string()),
            year: extract_year_from_name(&name),
            anilist_cover_url,
        })
        .collect();

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
    Path(series_id): Path<String>,
) -> Result<Json<BooksListResponse>, AppError> {
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
    Query(params): Query<PaginationParams>,
) -> Result<Json<AllSeriesResponse>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(200).clamp(1, 500);
    let offset = (page - 1) * per_page;

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM series")
        .fetch_one(&state.db)
        .await?;

    let rows: Vec<(String, String, i64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT s.id, s.name, COUNT(b.id) as book_count,
                (SELECT CASE WHEN b2.title LIKE 'Volume%' THEN 'volume' ELSE 'chapter' END
                 FROM books b2 WHERE b2.series_id = s.id ORDER BY b2.sort_order LIMIT 1) as book_type,
                s.anilist_cover_url
         FROM series s
         LEFT JOIN books b ON b.series_id = s.id
         GROUP BY s.id
         ORDER BY s.sort_name
         LIMIT ? OFFSET ?",
    )
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let series = rows
        .into_iter()
        .map(|(id, name, book_count, book_type, anilist_cover_url)| SeriesItem {
            id,
            name: name.clone(),
            book_count,
            book_type: book_type.unwrap_or_else(|| "chapter".to_string()),
            year: extract_year_from_name(&name),
            anilist_cover_url,
        })
        .collect();

    Ok(Json(AllSeriesResponse {
        series,
        total: total.0,
    }))
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
    Path(book_id): Path<String>,
) -> Result<Json<BookDetailResponse>, AppError> {
    #[allow(clippy::type_complexity)]
    let row: Option<(
        String,
        String,
        String,
        String,
        i32,
        i64,
        Option<String>,
        Option<i32>,
        Option<String>,
    )> = sqlx::query_as(
        "SELECT b.id, b.title, b.series_id, s.name, b.page_count, b.file_size,
                    b.meta_writer, b.meta_year, b.meta_summary
             FROM books b
             JOIN series s ON b.series_id = s.id
             WHERE b.id = ?",
    )
    .bind(&book_id)
    .fetch_optional(&state.db)
    .await?;

    let (id, title, series_id, series_name, page_count, file_size, writer, year, summary) =
        row.ok_or_else(|| AppError::NotFound("Book not found".to_string()))?;

    Ok(Json(BookDetailResponse {
        id,
        title,
        series_id,
        series_name,
        page_count,
        file_size,
        metadata: BookMetadata {
            writer,
            year,
            summary,
        },
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
    Path(series_id): Path<String>,
    body: Option<Json<RescanBody>>,
) -> Result<Json<RescanResponse>, AppError> {
    // Verify series exists
    let _: (String,) = sqlx::query_as("SELECT id FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    let anilist_id = body.and_then(|b| b.anilist_id);

    let scanned = scanner::rescan_series(&state.db, &series_id, anilist_id)
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
    Path(series_id): Path<String>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    #[allow(clippy::type_complexity)]
    let row: Option<(
        Option<i64>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<String>,
        Option<i64>,
        Option<i64>,
    )> = sqlx::query_as(
        "SELECT anilist_id, anilist_id_source, anilist_title_english, anilist_title_romaji,
                anilist_description, anilist_cover_url, anilist_banner_url, anilist_genres,
                anilist_status, anilist_chapters, anilist_volumes, anilist_score,
                anilist_author, anilist_start_year, anilist_end_year
         FROM series WHERE id = ?",
    )
    .bind(&series_id)
    .fetch_optional(&state.db)
    .await?;

    let (
        anilist_id,
        anilist_id_source,
        title_english,
        title_romaji,
        description,
        cover_url,
        banner_url,
        genres_json,
        status,
        chapters,
        volumes,
        score,
        author,
        start_year,
        end_year,
    ) = row.ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    let genres: Option<Vec<String>> = genres_json
        .as_deref()
        .and_then(|g| serde_json::from_str(g).ok());

    Ok(Json(SeriesMetadataResponse {
        anilist_id,
        anilist_id_source,
        title_english,
        title_romaji,
        description,
        cover_url,
        banner_url,
        genres,
        status,
        chapters,
        volumes,
        score,
        author,
        start_year,
        end_year,
    }))
}

#[derive(Deserialize)]
pub struct SetMetadataBody {
    pub anilist_id: i64,
}

pub async fn set_series_metadata(
    State(state): State<AppState>,
    Path(series_id): Path<String>,
    Json(body): Json<SetMetadataBody>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
    // Verify series exists
    let _: (String,) = sqlx::query_as("SELECT id FROM series WHERE id = ?")
        .bind(&series_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Series not found".to_string()))?;

    // Fetch from AniList by ID
    let media = crate::anilist::fetch_by_id(body.anilist_id)
        .await
        .map_err(|e| AppError::Internal(format!("AniList fetch failed: {}", e)))?
        .ok_or_else(|| {
            AppError::NotFound(format!("AniList ID {} not found", body.anilist_id))
        })?;

    // Save with manual source
    crate::anilist::save_metadata(&state.db, &series_id, &media, "manual")
        .await
        .map_err(|e| AppError::Internal(format!("Failed to save metadata: {}", e)))?;

    // Return updated metadata
    get_series_metadata(State(state), Path(series_id)).await
}

pub async fn refresh_series_metadata(
    State(state): State<AppState>,
    Path(series_id): Path<String>,
) -> Result<Json<SeriesMetadataResponse>, AppError> {
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
            if let Ok(Some(media)) = crate::anilist::fetch_by_id(al_id).await {
                let _ = crate::anilist::save_metadata(&state.db, &series_id, &media, "manual")
                    .await;
            }
            return get_series_metadata(State(state), Path(series_id)).await;
        }
    }

    // Otherwise, clear and re-fetch by name search
    let _ = crate::anilist::clear_metadata(&state.db, &series_id).await;
    let _ = crate::anilist::fetch_and_save_for_series(&state.db, &series_id, &name, true).await;

    get_series_metadata(State(state), Path(series_id)).await
}
