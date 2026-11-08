//! A light novel's files, one at a time: the reader fetches the text it lays out and leaves each
//! picture to load as it comes into view, instead of downloading the whole book first.

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use std::io::{Cursor, Read};

use crate::error::AppError;
use crate::state::AppState;

/// The largest file served from inside a book; a picture or chapter is far smaller.
const MAX_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
/// How much of a picture is read to learn its size: the header, wherever the format keeps it.
const HEADER_BYTES: u64 = 256 * 1024;

#[derive(Serialize)]
pub struct EpubEntry {
    pub path: String,
    pub size: u64,
    /// A picture's size in pixels, so the reader keeps its room before it loads.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Serialize)]
pub struct EpubListing {
    /// Pass as `v` when fetching a file, and the browser keeps it for good.
    pub version: String,
    pub entries: Vec<EpubEntry>,
}

/// The book's file on disk and its version, when it is an EPUB.
async fn epub_file(
    state: &AppState,
    book_id: &str,
) -> Result<(std::path::PathBuf, String), AppError> {
    let row: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT b.path, l.path, b.file_mtime, b.format
         FROM books b
         JOIN series s ON b.series_id = s.id
         JOIN libraries l ON s.library_id = l.id
         WHERE b.id = ?",
    )
    .bind(book_id)
    .fetch_optional(&state.db)
    .await?;
    let (book_path, lib_path, mtime, format) =
        row.ok_or_else(|| AppError::NotFound(format!("Book {} not found", book_id)))?;
    if format != "epub" {
        return Err(AppError::BadRequest("This book isn't an EPUB".to_string()));
    }
    let path = std::path::PathBuf::from(lib_path).join(book_path);
    Ok((path, super::reader::book_version(book_id, &mtime)))
}

/// Every file in the book, with the size of each picture.
pub async fn list_epub(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(book_id): Path<String>,
) -> Result<Json<EpubListing>, AppError> {
    let _profile = super::auth::require_auth(&state, &headers).await?;
    let (path, version) = epub_file(&state, &book_id).await?;
    let entries = tokio::task::spawn_blocking(move || list_entries(&path))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .map_err(|e| AppError::Internal(format!("Failed to read the book: {e}")))?;
    Ok(Json(EpubListing { version, entries }))
}

fn list_entries(path: &std::path::Path) -> anyhow::Result<Vec<EpubEntry>> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let mut entries = Vec::with_capacity(zip.len());
    for i in 0..zip.len() {
        let mut file = zip.by_index(i)?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().to_string();
        let size = file.size();
        let (width, height) = if is_picture(&name) {
            let mut head = Vec::new();
            (&mut file).take(HEADER_BYTES).read_to_end(&mut head)?;
            image::ImageReader::new(Cursor::new(head))
                .with_guessed_format()
                .ok()
                .and_then(|r| r.into_dimensions().ok())
                .map_or((None, None), |(w, h)| (Some(w), Some(h)))
        } else {
            (None, None)
        };
        entries.push(EpubEntry {
            path: name,
            size,
            width,
            height,
        });
    }
    Ok(entries)
}

/// One file of the book, by its path in the archive. Kept by the browser for good when `v` is
/// the book's version.
pub async fn epub_entry(
    State(state): State<AppState>,
    Path((book_id, entry)): Path<(String, String)>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Response, AppError> {
    // Pictures and fonts are fetched by the book's own markup, with ?token=
    let _profile = super::auth::require_auth_with_query(&state, req.headers(), req.uri()).await?;
    let (path, version) = epub_file(&state, &book_id).await?;
    let versioned = req
        .uri()
        .query()
        .and_then(|q| q.split('&').find_map(|p| p.strip_prefix("v=")))
        .is_some_and(|v| v == version);

    let name = entry.clone();
    let bytes = tokio::task::spawn_blocking(move || read_entry(&path, &name))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .map_err(|e| AppError::Internal(format!("Failed to read the book: {e}")))?
        .ok_or_else(|| AppError::NotFound(format!("{entry} isn't in the book")))?;

    let cache = if versioned {
        "private, max-age=31536000, immutable"
    } else {
        "private, max-age=300"
    };
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type(&entry)),
            (header::CACHE_CONTROL, cache),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            // A book is someone else's markup: opened on its own, nothing in it runs
            (
                header::CONTENT_SECURITY_POLICY,
                "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
            ),
        ],
        bytes,
    )
        .into_response())
}

fn read_entry(path: &std::path::Path, name: &str) -> anyhow::Result<Option<Vec<u8>>> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let Ok(file) = zip.by_name(name) else {
        return Ok(None);
    };
    if file.size() > MAX_ENTRY_BYTES {
        anyhow::bail!("{name} is too large");
    }
    let mut bytes = Vec::with_capacity(file.size() as usize);
    file.take(MAX_ENTRY_BYTES).read_to_end(&mut bytes)?;
    Ok(Some(bytes))
}

fn extension(name: &str) -> String {
    name.rsplit('.').next().unwrap_or("").to_ascii_lowercase()
}

fn is_picture(name: &str) -> bool {
    matches!(
        extension(name).as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp"
    )
}

/// Markup goes out as plain text: the reader rebuilds it, and nothing else should render it.
fn content_type(name: &str) -> &'static str {
    match extension(name).as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "css" => "text/css; charset=utf-8",
        "otf" => "font/otf",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "xhtml" | "html" | "htm" | "xml" | "opf" | "ncx" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn lists_files_with_picture_sizes_and_serves_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.epub");
        let mut png = Vec::new();
        image::RgbImage::new(30, 40)
            .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        {
            let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
            let opts = zip::write::SimpleFileOptions::default();
            zip.start_file("OEBPS/Text/one.xhtml", opts).unwrap();
            zip.write_all(b"<html><body><p>Hello</p></body></html>")
                .unwrap();
            zip.start_file("OEBPS/Images/a b.png", opts).unwrap();
            zip.write_all(&png).unwrap();
            zip.finish().unwrap();
        }
        let entries = list_entries(&path).unwrap();
        let pic = entries
            .iter()
            .find(|e| e.path == "OEBPS/Images/a b.png")
            .unwrap();
        assert_eq!((pic.width, pic.height), (Some(30), Some(40)));
        let text = entries
            .iter()
            .find(|e| e.path.ends_with("one.xhtml"))
            .unwrap();
        assert_eq!(text.width, None);

        let bytes = read_entry(&path, "OEBPS/Images/a b.png").unwrap().unwrap();
        assert_eq!(bytes, png);
        assert!(read_entry(&path, "missing.png").unwrap().is_none());
        assert_eq!(content_type("x/one.xhtml"), "text/plain; charset=utf-8");
    }
}
