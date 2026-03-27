use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use image::imageops::FilterType;
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::sync::Arc;

use crate::db::models::{BookDownloadRow, PageDataRow, PageManifestRow};
use crate::error::AppError;
use crate::state::AppState;
use crate::zip::{content_type_for_entry, PageEntry, ZipIndex};

pub async fn page(
    State(state): State<AppState>,
    Path((book_id, page_num)): Path<(String, i32)>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Response, AppError> {
    // Auth check (supports both header and ?token= query param for <img src>)
    let _profile = super::auth::require_auth_with_query(&state, req.headers(), req.uri()).await?;

    // page_num is 1-indexed in API, 0-indexed internally
    let page_index = page_num - 1;

    if page_index < 0 {
        return Err(AppError::BadRequest("Page number must be >= 1".to_string()));
    }

    // Single query: book path + page entry data
    let row: Option<PageDataRow> = sqlx::query_as(
        "SELECT b.path AS book_path, l.path AS lib_path, b.file_mtime,
                p.entry_name, p.entry_offset, p.compressed_size,
                p.uncompressed_size, p.compression
         FROM pages p
         JOIN books b ON p.book_id = b.id
         JOIN series s ON b.series_id = s.id
         JOIN libraries l ON s.library_id = l.id
         WHERE p.book_id = ? AND p.page_number = ?",
    )
    .bind(&book_id)
    .bind(page_index)
    .fetch_optional(&state.db)
    .await?;

    let p = row.ok_or_else(|| {
        AppError::NotFound(format!("Page {} not found for book {}", page_num, book_id))
    })?;

    let (book_rel_path, lib_path, file_mtime) = (p.book_path, p.lib_path, p.file_mtime);
    let (entry_name, entry_offset, compressed_size, uncompressed_size, compression) =
        (p.entry_name, p.entry_offset, p.compressed_size, p.uncompressed_size, p.compression);

    let full_path = std::path::PathBuf::from(&lib_path).join(&book_rel_path);

    if !full_path.exists() {
        tracing::error!(
            "Page: file not found at '{}' (lib='{}', book='{}')",
            full_path.display(),
            lib_path,
            book_rel_path
        );
        return Err(AppError::NotFound(format!(
            "Book file not found: {}",
            full_path.display()
        )));
    }

    // Compute ETag
    let etag = compute_etag(&book_id, page_index, &file_mtime);

    // Check If-None-Match
    if let Some(inm) = req.headers().get(header::IF_NONE_MATCH) {
        if let Ok(inm_str) = inm.to_str() {
            let inm_clean = inm_str.trim_matches('"');
            if inm_clean == etag {
                return Ok(StatusCode::NOT_MODIFIED.into_response());
            }
        }
    }

    // Read page data using pre-indexed offsets
    let data = read_page_blocking(&full_path, &entry_name, entry_offset, compressed_size, uncompressed_size, compression).await?;

    let content_type = content_type_for_entry(&entry_name);

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_LENGTH, data.len().to_string()),
            (
                header::CACHE_CONTROL,
                "private, max-age=86400, immutable".to_string(),
            ),
            (header::ETAG, format!("\"{}\"", etag)),
        ],
        data,
    )
        .into_response())
}

fn compute_etag(book_id: &str, page_num: i32, mtime: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(book_id.as_bytes());
    hasher.update(page_num.to_le_bytes());
    hasher.update(mtime.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8])
}

/// Download the raw CBZ file for a book (for offline reading).
/// Uses streaming to avoid loading the entire file into memory.
pub async fn download_book(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(book_id): Path<String>,
) -> Result<Response, AppError> {
    let profile = super::auth::require_auth(&state, &headers).await?;

    let row: Option<BookDownloadRow> = sqlx::query_as(
        "SELECT b.path AS book_path, l.path AS lib_path, b.filename, b.file_size
         FROM books b
         JOIN series s ON b.series_id = s.id
         JOIN libraries l ON s.library_id = l.id
         WHERE b.id = ?",
    )
    .bind(&book_id)
    .fetch_optional(&state.db)
    .await?;

    let dl = row.ok_or_else(|| AppError::NotFound(format!("Book {} not found", book_id)))?;
    let (book_rel_path, lib_path, filename, file_size) =
        (dl.book_path, dl.lib_path, dl.filename, dl.file_size);

    let full_path = std::path::PathBuf::from(&lib_path).join(&book_rel_path);

    if !full_path.exists() {
        return Err(AppError::NotFound(
            "Book file not found on disk".to_string(),
        ));
    }

    // Stream the file instead of reading it all into memory
    let file = tokio::fs::File::open(&full_path).await.map_err(|e| {
        tracing::error!("Failed to open book file {}: {}", full_path.display(), e);
        AppError::Internal(e.to_string())
    })?;
    let stream = tokio_util::io::ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    // Log the download
    super::admin::log_admin_event(
        &state.db,
        "info",
        "download",
        &format!("User '{}' downloaded '{}'", profile.name, filename),
        Some(&format!("book_id={}, size={}", book_id, file_size)),
    )
    .await;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (header::CONTENT_LENGTH, file_size.to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
            (header::CACHE_CONTROL, "private, max-age=86400".to_string()),
        ],
        body,
    )
        .into_response())
}

/// Return a manifest of all pages for a book (dimensions, sizes)
pub async fn page_manifest(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(book_id): Path<String>,
) -> Result<Json<PageManifestResponse>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;

    let book: Option<(String, i32)> =
        sqlx::query_as("SELECT id, page_count FROM books WHERE id = ?")
            .bind(&book_id)
            .fetch_optional(&state.db)
            .await?;

    let (_, page_count) =
        book.ok_or_else(|| AppError::NotFound(format!("Book {} not found", book_id)))?;

    let pages: Vec<PageManifestRow> = sqlx::query_as(
        "SELECT page_number, entry_name, compressed_size, uncompressed_size, width, height
         FROM pages WHERE book_id = ? ORDER BY page_number",
    )
    .bind(&book_id)
    .fetch_all(&state.db)
    .await?;

    let entries: Vec<PageManifestEntry> = pages
        .into_iter()
        .map(|p| PageManifestEntry {
            page: p.page_number + 1, // 1-indexed for API
            url: format!("/api/books/{}/pages/{}", book_id, p.page_number + 1),
            entry_name: p.entry_name,
            compressed_size: p.compressed_size,
            uncompressed_size: p.uncompressed_size,
            width: p.width,
            height: p.height,
        })
        .collect();

    Ok(Json(PageManifestResponse {
        book_id: book_id.clone(),
        page_count,
        pages: entries,
    }))
}

#[derive(serde::Serialize)]
pub struct PageManifestResponse {
    pub book_id: String,
    pub page_count: i32,
    pub pages: Vec<PageManifestEntry>,
}

#[derive(serde::Serialize)]
pub struct PageManifestEntry {
    pub page: i32,
    pub url: String,
    pub entry_name: String,
    pub compressed_size: i64,
    pub uncompressed_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

/// Generate or serve a cached thumbnail for a book's cover (page 1).
/// Thumbnails are 300px wide JPEG files cached to disk.
/// Uses per-book semaphore to coalesce concurrent requests for the same thumbnail.
pub async fn thumbnail(
    State(state): State<AppState>,
    Path(book_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Response, AppError> {
    // Auth check (supports both header and ?token= query param for <img src>)
    let _profile = super::auth::require_auth_with_query(&state, req.headers(), req.uri()).await?;

    // Get book info + page 0 entry data
    let row: Option<PageDataRow> = sqlx::query_as(
        "SELECT b.path AS book_path, l.path AS lib_path, b.file_mtime,
                p.entry_name, p.entry_offset, p.compressed_size,
                p.uncompressed_size, p.compression
         FROM pages p
         JOIN books b ON p.book_id = b.id
         JOIN series s ON b.series_id = s.id
         JOIN libraries l ON s.library_id = l.id
         WHERE p.book_id = ? AND p.page_number = 0",
    )
    .bind(&book_id)
    .fetch_optional(&state.db)
    .await?;

    let p = row.ok_or_else(|| AppError::NotFound(format!("Book {} not found", book_id)))?;
    let (book_rel_path, lib_path, file_mtime) = (p.book_path, p.lib_path, p.file_mtime);
    let (entry_name, entry_offset, compressed_size, uncompressed_size, compression) =
        (p.entry_name, p.entry_offset, p.compressed_size, p.uncompressed_size, p.compression);

    // ETag based on book_id + mtime
    let etag = compute_etag(&book_id, -1, &file_mtime);

    // 304 check
    if let Some(inm) = req.headers().get(header::IF_NONE_MATCH) {
        if let Ok(inm_str) = inm.to_str() {
            if inm_str.trim_matches('"') == etag {
                return Ok(StatusCode::NOT_MODIFIED.into_response());
            }
        }
    }

    // Check disk cache
    let thumb_dir = state.config.data_dir.join("thumbnails");
    let thumb_path = thumb_dir.join(format!("{}.jpg", book_id));
    let mtime_path = thumb_dir.join(format!("{}.mtime", book_id));

    // Serve from cache if file exists and mtime file matches
    if thumb_path.exists() && mtime_path.exists() {
        if let Ok(cached_mtime) = tokio::fs::read_to_string(&mtime_path).await {
            if cached_mtime.trim() == file_mtime {
                let data = tokio::fs::read(&thumb_path).await.map_err(|e| {
                    AppError::Internal(format!("Failed to read cached thumbnail: {}", e))
                })?;
                return Ok(serve_thumbnail(data, &etag));
            }
        }
    }

    // Acquire per-book semaphore to coalesce concurrent thumbnail generation
    let semaphore = {
        let mut locks = state.thumb_locks.lock().await;
        locks
            .entry(book_id.clone())
            .or_insert_with(|| Arc::new(tokio::sync::Semaphore::new(1)))
            .clone()
    };
    let _permit = semaphore.acquire().await.map_err(|_| {
        AppError::Internal("Thumbnail lock closed".to_string())
    })?;

    // Re-check disk cache after acquiring the lock (another request may have generated it)
    if thumb_path.exists() && mtime_path.exists() {
        if let Ok(cached_mtime) = tokio::fs::read_to_string(&mtime_path).await {
            if cached_mtime.trim() == file_mtime {
                let data = tokio::fs::read(&thumb_path).await.map_err(|e| {
                    AppError::Internal(format!("Failed to read cached thumbnail: {}", e))
                })?;
                return Ok(serve_thumbnail(data, &etag));
            }
        }
    }

    // Generate thumbnail: read page 0 from CBZ
    let full_path = std::path::PathBuf::from(&lib_path).join(&book_rel_path);
    if !full_path.exists() {
        tracing::error!(
            "Thumbnail: file not found at '{}' (lib='{}', book='{}')",
            full_path.display(),
            lib_path,
            book_rel_path
        );
        return Err(AppError::NotFound(format!(
            "Book file not found: {}",
            full_path.display()
        )));
    }

    let page_data = read_page_blocking(&full_path, &entry_name, entry_offset, compressed_size, uncompressed_size, compression).await?;

    // Decode, resize, encode as JPEG — using CatmullRom (faster than Lanczos3)
    let thumb_data = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let reader = ImageReader::new(Cursor::new(&page_data))
            .with_guessed_format()
            .map_err(|e| format!("Failed to guess image format: {}", e))?;
        let img = reader
            .decode()
            .map_err(|e| format!("Failed to decode image: {}", e))?;

        // Resize to 300px wide, preserve aspect ratio
        let new_width = 300u32;
        let new_height = (img.height() as f64 / img.width() as f64 * new_width as f64) as u32;
        let resized = img.resize_exact(new_width, new_height, FilterType::CatmullRom);

        // Encode as JPEG quality 80
        let mut buf = Cursor::new(Vec::new());
        resized
            .write_to(&mut buf, image::ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
        Ok(buf.into_inner())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))
    .and_then(|r| r.map_err(AppError::Internal))?;

    // Save to disk cache
    tokio::fs::create_dir_all(&thumb_dir).await.ok();
    tokio::fs::write(&thumb_path, &thumb_data).await.ok();
    tokio::fs::write(&mtime_path, &file_mtime).await.ok();

    Ok(serve_thumbnail(thumb_data, &etag))
}

/// Helper to build a thumbnail response.
fn serve_thumbnail(data: Vec<u8>, etag: &str) -> Response {
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/jpeg".to_string()),
            (header::CONTENT_LENGTH, data.len().to_string()),
            (
                header::CACHE_CONTROL,
                "public, max-age=604800, immutable".to_string(),
            ),
            (header::ETAG, format!("\"{}\"", etag)),
        ],
        data,
    )
        .into_response()
}

/// Helper to read page data in a blocking task.
async fn read_page_blocking(
    full_path: &std::path::Path,
    entry_name: &str,
    entry_offset: i64,
    compressed_size: i64,
    uncompressed_size: i64,
    compression: i32,
) -> Result<Vec<u8>, AppError> {
    let path = full_path.to_path_buf();
    let entry = PageEntry {
        entry_name: entry_name.to_string(),
        local_header_offset: entry_offset as u64,
        compressed_size: compressed_size as u64,
        uncompressed_size: uncompressed_size as u64,
        compression_method: compression as u16,
        crc32: 0,
    };
    let display_path = full_path.display().to_string();
    tokio::task::spawn_blocking(move || ZipIndex::read_page_data(&path, &entry))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))
        .and_then(|r| {
            r.map_err(|e| {
                tracing::error!("Failed to read page from {}: {}", display_path, e);
                AppError::Internal(e.to_string())
            })
        })
}

/// Redirect to the thumbnail of the series' representative book (thumb_book_id or first book).
pub async fn series_thumbnail(
    State(state): State<AppState>,
    Path(series_id): Path<String>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Response, AppError> {
    let _profile = super::auth::require_auth_with_query(&state, req.headers(), req.uri()).await?;

    // Try thumb_book_id first, fallback to first book by sort_order
    let book_id: Option<(String,)> = sqlx::query_as(
        "SELECT COALESCE(
            (SELECT thumb_book_id FROM series WHERE id = ? AND thumb_book_id IS NOT NULL),
            (SELECT id FROM books WHERE series_id = ? ORDER BY sort_order ASC LIMIT 1)
        )",
    )
    .bind(&series_id)
    .bind(&series_id)
    .fetch_optional(&state.db)
    .await?;

    let (bid,) = book_id.ok_or_else(|| AppError::NotFound("Series has no books".to_string()))?;

    // Forward query params (including ?token=) to the redirect target
    let query = req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();

    Ok((
        StatusCode::TEMPORARY_REDIRECT,
        [(header::LOCATION, format!("/api/books/{}/thumbnail{}", bid, query))],
        "",
    )
        .into_response())
}
