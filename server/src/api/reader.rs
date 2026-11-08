use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::sync::Arc;

use crate::db::models::{BookDownloadRow, PageDataRow, PageManifestRow};
use crate::error::AppError;
use crate::state::AppState;
use crate::zip::archive::{self, Kind, Unpacked};
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
        "SELECT b.path AS book_path, l.path AS lib_path, b.file_mtime, b.format,
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

    let unpack = Kind::from_format(&p.format);
    let (book_rel_path, lib_path, file_mtime) = (p.book_path, p.lib_path, p.file_mtime);
    let (entry_name, entry_offset, compressed_size, uncompressed_size, compression) = (
        p.entry_name,
        p.entry_offset,
        p.compressed_size,
        p.uncompressed_size,
        p.compression,
    );

    let full_path = std::path::PathBuf::from(&lib_path).join(&book_rel_path);

    // A page asked for at a screen's width (`w`): one far bigger is sent made smaller
    let fit = query_param(req.uri(), "w")
        .and_then(|w| w.parse::<u32>().ok())
        .and_then(fit_width);

    // Check If-None-Match first: a page the browser has costs no disk access at all
    let mut etag = compute_etag(&book_id, page_index, &file_mtime);
    if let Some(w) = fit {
        etag.push_str(&format!("-w{w}"));
    }
    if let Some(inm) = req.headers().get(header::IF_NONE_MATCH) {
        if let Ok(inm_str) = inm.to_str() {
            let inm_clean = inm_str.trim_matches('"');
            if inm_clean == etag {
                return Ok(StatusCode::NOT_MODIFIED.into_response());
            }
        }
    }

    // A URL that names the book's current version always gets these same bytes, so the browser
    // keeps it for good; a replaced file gets a new version, and so a new URL.
    let versioned =
        query_param(req.uri(), "v").is_some_and(|v| v == book_version(&book_id, &file_mtime));
    let cache_control = if versioned {
        "private, max-age=31536000, immutable"
    } else {
        // Revalidate against the ETag: a book re-indexed in place after its file was
        // replaced keeps its id, so the URL alone can't tell the new pages apart.
        "private, no-cache"
    };

    let data = match unpack {
        // A RAR or 7z book is read from its unpacked copy
        Some(kind) => {
            let book = unpacked_book(&state, &book_id, &file_mtime, &full_path, kind).await?;
            let entry = book
                .index
                .pages
                .get(page_index as usize)
                .cloned()
                .ok_or_else(|| AppError::NotFound(format!("Page {} not found", page_num)))?;
            tokio::task::spawn_blocking(move || ZipIndex::read_page_data(&book.path, &entry))
                .await
                .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))?
                .map_err(|e| AppError::Internal(e.to_string()))?
        }
        // Read page data using pre-indexed offsets
        None => {
            read_page_blocking(
                &full_path,
                &entry_name,
                entry_offset,
                compressed_size,
                uncompressed_size,
                compression,
            )
            .await?
        }
    };

    let mut content_type = content_type_for_entry(&entry_name);
    let mut data = data;
    if let Some(w) = fit {
        let version = book_version(&book_id, &file_mtime);
        if let Some(smaller) = fitted_page(&state, &book_id, page_index, &version, w, &data).await {
            data = smaller;
            content_type = "image/jpeg";
        }
    }

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_LENGTH, data.len().to_string()),
            (header::CACHE_CONTROL, cache_control.to_string()),
            (header::ETAG, format!("\"{}\"", etag)),
        ],
        data,
    )
        .into_response())
}

/// The widths a page is made smaller to: a few, so the copies kept are few.
const FIT_WIDTHS: [u32; 5] = [800, 1200, 1600, 2000, 2400];
/// How much room the smaller copies of pages may take on disk, before the oldest go.
const FITTED_CACHE_BYTES: u64 = 1024 * 1024 * 1024;

/// The width a page is made for: the first of FIT_WIDTHS at least as wide as asked, or none past
/// the widest (the page as it is).
fn fit_width(asked: u32) -> Option<u32> {
    FIT_WIDTHS.iter().copied().find(|&w| w >= asked)
}

/// A page made `width` wide, as a JPEG, when it is wider than that: kept in `<data>/fitted`, so
/// it's made once. None sends the page as it is (narrow enough already, or not a picture this
/// can read).
async fn fitted_page(
    state: &AppState,
    book_id: &str,
    page_index: i32,
    version: &str,
    width: u32,
    original: &[u8],
) -> Option<Vec<u8>> {
    // The scan knows most pages' sizes: one narrow enough is sent as it is, unread
    let known: Option<(Option<i32>,)> =
        sqlx::query_as("SELECT width FROM pages WHERE book_id = ? AND page_number = ?")
            .bind(book_id)
            .bind(page_index)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
    if let Some((Some(w),)) = known {
        if w as u32 <= width {
            return None;
        }
    }

    let dir = state.config.data_dir.join("fitted").join(book_id);
    let path = dir.join(format!("{page_index}-{width}-{version}.jpg"));
    if let Ok(bytes) = tokio::fs::read(&path).await {
        return Some(bytes);
    }

    // A few at a time: each decodes a whole page, and a reader asks for several ahead
    static MAKING: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(3);
    let _permit = MAKING.acquire().await.ok()?;
    let original = original.to_vec();
    let made = tokio::task::spawn_blocking(move || shrink(&original, width))
        .await
        .ok()??;
    if tokio::fs::create_dir_all(&dir).await.is_ok() && tokio::fs::write(&path, &made).await.is_ok()
    {
        let root = state.config.data_dir.join("fitted");
        tokio::task::spawn_blocking(move || prune(&root, FITTED_CACHE_BYTES));
    }
    Some(made)
}

/// A picture made `width` wide (its height in proportion), as a JPEG; None when it isn't wider.
fn shrink(bytes: &[u8], width: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?;
    if img.width() <= width {
        return None;
    }
    let height = ((img.height() as u64 * width as u64) / img.width() as u64).max(1) as u32;
    let small = img
        .resize_exact(width, height, image::imageops::FilterType::Triangle)
        .into_rgb8();
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85)
        .encode_image(&small)
        .ok()?;
    Some(out)
}

/// Lets the oldest smaller copies go until all of them take no more than `limit` bytes.
fn prune(root: &std::path::Path, limit: u64) {
    let mut files: Vec<(std::time::SystemTime, u64, std::path::PathBuf)> = Vec::new();
    let Ok(books) = std::fs::read_dir(root) else {
        return;
    };
    for book in books.flatten() {
        let Ok(pages) = std::fs::read_dir(book.path()) else {
            continue;
        };
        for page in pages.flatten() {
            if let Ok(meta) = page.metadata() {
                let used = meta.accessed().or_else(|_| meta.modified());
                files.push((
                    used.unwrap_or(std::time::UNIX_EPOCH),
                    meta.len(),
                    page.path(),
                ));
            }
        }
    }
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    if total <= limit {
        return;
    }
    files.sort_by_key(|f| f.0);
    for (_, size, path) in files {
        if total <= limit {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
}

/// A RAR or 7z book, unpacked for reading (see `zip::archive`). The first time, its page sizes are
/// read from the copy and kept, as a scan does for a ZIP.
async fn unpacked_book(
    state: &AppState,
    book_id: &str,
    file_mtime: &str,
    source: &std::path::Path,
    kind: Kind,
) -> Result<Unpacked, AppError> {
    if !source.exists() {
        return Err(AppError::NotFound(
            "The book's file isn't there anymore".to_string(),
        ));
    }
    let book = state
        .unpacked
        .get(book_id, &book_version(book_id, file_mtime), source, kind)
        .await
        .map_err(|e| {
            tracing::error!("Couldn't unpack {}: {}", source.display(), e);
            AppError::Internal(format!("The book couldn't be unpacked: {}", e))
        })?;
    if book.fresh {
        let (db, book_id, path, pages) = (
            state.db.clone(),
            book_id.to_string(),
            book.path.clone(),
            book.index.pages.clone(),
        );
        tokio::spawn(async move {
            let Ok(sizes) =
                tokio::task::spawn_blocking(move || ZipIndex::read_dimensions(&path, &pages)).await
            else {
                return;
            };
            let Ok(mut tx) = db.begin().await else {
                return;
            };
            for (i, size) in sizes.iter().enumerate() {
                if let Some((w, h)) = size {
                    let _ = sqlx::query(
                        "UPDATE pages SET width = ?, height = ? WHERE book_id = ? AND page_number = ?",
                    )
                    .bind(*w as i32)
                    .bind(*h as i32)
                    .bind(&book_id)
                    .bind(i as i32)
                    .execute(&mut *tx)
                    .await;
                }
            }
            let _ = tx.commit().await;
        });
    }
    Ok(book)
}

/// A short tag for a book's file as it is now (see `BookDetailResponse::version`).
pub fn book_version(book_id: &str, mtime: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(book_id.as_bytes());
    hasher.update(mtime.as_bytes());
    hex::encode(&hasher.finalize()[..6])
}

/// One parameter from a URI's query string.
fn query_param<'a>(uri: &'a axum::http::Uri, name: &str) -> Option<&'a str> {
    uri.query()?
        .split('&')
        .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))
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
        "SELECT b.path AS book_path, l.path AS lib_path, b.filename, b.file_size,
                b.file_mtime, b.format
         FROM books b
         JOIN series s ON b.series_id = s.id
         JOIN libraries l ON s.library_id = l.id
         WHERE b.id = ?",
    )
    .bind(&book_id)
    .fetch_optional(&state.db)
    .await?;

    let dl = row.ok_or_else(|| AppError::NotFound(format!("Book {} not found", book_id)))?;
    let (book_rel_path, lib_path, mut filename, mut file_size) =
        (dl.book_path, dl.lib_path, dl.filename, dl.file_size);

    let mut full_path = std::path::PathBuf::from(&lib_path).join(&book_rel_path);

    if !full_path.exists() {
        return Err(AppError::NotFound(
            "Book file not found on disk".to_string(),
        ));
    }

    // A RAR or 7z book goes out as its unpacked ZIP, which the app reads offline
    if let Some(kind) = Kind::from_format(&dl.format) {
        let book = unpacked_book(&state, &book_id, &dl.file_mtime, &full_path, kind).await?;
        full_path = book.path;
        file_size = tokio::fs::metadata(&full_path)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .len() as i64;
        filename = std::path::Path::new(&filename)
            .with_extension("cbz")
            .to_string_lossy()
            .to_string();
    }

    let content_type = match dl.format.as_str() {
        "epub" => "application/epub+zip",
        "pdf" => "application/pdf",
        _ => "application/zip",
    };

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
            (header::CONTENT_TYPE, content_type.to_string()),
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
    book_thumbnail(&state, &book_id, req.headers(), req.uri()).await
}

/// A book's cover: its first page, made small, kept on disk. A request whose `?v=` names the
/// book's current version is kept by the browser for good.
async fn book_thumbnail(
    state: &AppState,
    book_id: &str,
    headers: &axum::http::HeaderMap,
    uri: &axum::http::Uri,
) -> Result<Response, AppError> {
    // Get book info + page 0 entry data
    let row: Option<PageDataRow> = sqlx::query_as(
        "SELECT b.path AS book_path, l.path AS lib_path, b.file_mtime, b.format,
                p.entry_name, p.entry_offset, p.compressed_size,
                p.uncompressed_size, p.compression
         FROM pages p
         JOIN books b ON p.book_id = b.id
         JOIN series s ON b.series_id = s.id
         JOIN libraries l ON s.library_id = l.id
         WHERE p.book_id = ? AND p.page_number = 0",
    )
    .bind(book_id)
    .fetch_optional(&state.db)
    .await?;

    let p = row.ok_or_else(|| AppError::NotFound(format!("Book {} not found", book_id)))?;
    let unpack = Kind::from_format(&p.format);
    let (book_rel_path, lib_path, file_mtime) = (p.book_path, p.lib_path, p.file_mtime);
    let (entry_name, entry_offset, compressed_size, uncompressed_size, compression) = (
        p.entry_name,
        p.entry_offset,
        p.compressed_size,
        p.uncompressed_size,
        p.compression,
    );

    // ETag based on book_id + mtime
    let etag = compute_etag(book_id, -1, &file_mtime);
    let versioned = query_param(uri, "v").is_some_and(|v| v == book_version(book_id, &file_mtime));

    // 304 check
    if let Some(inm) = headers.get(header::IF_NONE_MATCH) {
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
                return Ok(serve_thumbnail(data, &etag, versioned));
            }
        }
    }

    // Acquire per-book semaphore to coalesce concurrent thumbnail generation
    let semaphore = {
        let mut locks = state.thumb_locks.lock().await;
        locks
            .entry(book_id.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Semaphore::new(1)))
            .clone()
    };
    let _permit = semaphore
        .acquire()
        .await
        .map_err(|_| AppError::Internal("Thumbnail lock closed".to_string()))?;

    // Re-check disk cache after acquiring the lock (another request may have generated it)
    if thumb_path.exists() && mtime_path.exists() {
        if let Ok(cached_mtime) = tokio::fs::read_to_string(&mtime_path).await {
            if cached_mtime.trim() == file_mtime {
                let data = tokio::fs::read(&thumb_path).await.map_err(|e| {
                    AppError::Internal(format!("Failed to read cached thumbnail: {}", e))
                })?;
                return Ok(serve_thumbnail(data, &etag, versioned));
            }
        }
    }

    // Generate thumbnail: read page 0 from CBZ. A few at a time: each decodes a full page, and a
    // grid of new covers would otherwise decode them all at once.
    static MAKING: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);
    let _making = MAKING
        .acquire()
        .await
        .map_err(|_| AppError::Internal("Thumbnail queue closed".to_string()))?;
    let full_path = std::path::PathBuf::from(&lib_path).join(&book_rel_path);

    let page_data = match unpack {
        // Just the first page of a RAR or 7z book, without unpacking the rest
        Some(kind) => {
            if !full_path.exists() {
                return Err(AppError::NotFound(
                    "The book's file isn't there anymore".to_string(),
                ));
            }
            tokio::task::spawn_blocking(move || {
                archive::extract_page(&full_path, kind, &entry_name)
            })
            .await
            .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))?
            .map_err(|e| AppError::Internal(e.to_string()))?
        }
        None => {
            read_page_blocking(
                &full_path,
                &entry_name,
                entry_offset,
                compressed_size,
                uncompressed_size,
                compression,
            )
            .await?
        }
    };

    // Decode, resize, encode as JPEG — using CatmullRom (faster than Lanczos3)
    let thumb_data = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let mut reader = ImageReader::new(Cursor::new(&page_data))
            .with_guessed_format()
            .map_err(|e| format!("Failed to guess image format: {}", e))?;
        // A page that claims to be enormous is refused before it is decoded
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(20_000);
        limits.max_image_height = Some(40_000);
        limits.max_alloc = Some(512 * 1024 * 1024);
        reader.limits(limits);
        let img = reader
            .decode()
            .map_err(|e| format!("Failed to decode image: {}", e))?;

        // At most 300 px wide and 600 px high, keeping the shape, so a strange page (a long strip,
        // a sliver) still makes a small cover; `thumbnail` also resizes faster than a filter pass
        let resized = img.thumbnail(300, 600).to_rgb8();

        let mut buf = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 80)
            .encode_image(&resized)
            .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
        Ok(buf)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))
    .and_then(|r| r.map_err(AppError::Internal))?;

    // Save to disk cache
    tokio::fs::create_dir_all(&thumb_dir).await.ok();
    tokio::fs::write(&thumb_path, &thumb_data).await.ok();
    tokio::fs::write(&mtime_path, &file_mtime).await.ok();

    Ok(serve_thumbnail(thumb_data, &etag, versioned))
}

/// Helper to build a thumbnail response.
fn serve_thumbnail(data: Vec<u8>, etag: &str, versioned: bool) -> Response {
    let cache_control = if versioned {
        "private, max-age=31536000, immutable"
    } else {
        // Revalidate against the ETag, which changes with the file: a replaced book
        // keeps its id, so the URL stays the same
        "private, no-cache"
    };
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/jpeg".to_string()),
            (header::CONTENT_LENGTH, data.len().to_string()),
            (header::CACHE_CONTROL, cache_control.to_string()),
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
                // A missing file is the reader's 404; where it should have been is for the log
                let missing = e
                    .downcast_ref::<std::io::Error>()
                    .is_some_and(|io| io.kind() == std::io::ErrorKind::NotFound);
                if missing {
                    tracing::error!("Book file not found: {}", display_path);
                    return AppError::NotFound("The book's file isn't there anymore".to_string());
                }
                tracing::error!("Failed to read page from {}: {}", display_path, e);
                AppError::Internal(e.to_string())
            })
        })
}

/// The thumbnail of the series' representative book (thumb_book_id or first book), served here
/// rather than through a redirect, which cost every cover in a grid a second request.
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
    book_thumbnail(&state, &bid, req.headers(), req.uri()).await
}

#[cfg(test)]
mod fit_tests {
    use super::*;

    #[test]
    fn a_page_is_made_for_the_next_width_up() {
        assert_eq!(fit_width(390), Some(800));
        assert_eq!(fit_width(1200), Some(1200));
        assert_eq!(fit_width(1201), Some(1600));
        assert_eq!(fit_width(5000), None);
    }

    #[test]
    fn a_wide_page_is_shrunk_and_a_narrow_one_left_alone() {
        let mut png = Vec::new();
        image::RgbImage::new(3000, 4000)
            .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let small = shrink(&png, 1200).unwrap();
        let img = image::load_from_memory(&small).unwrap();
        assert_eq!((img.width(), img.height()), (1200, 1600));
        assert!(shrink(&png, 4000).is_none());
    }
}
