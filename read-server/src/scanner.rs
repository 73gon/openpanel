use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::RwLock;
use walkdir::WalkDir;

use crate::zip::ZipIndex;

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ScanStatus {
    pub running: bool,
    pub scanned: usize,
    pub total: usize,
    pub errors: usize,
    pub message: String,
}

/// Scan all library roots and populate the database.
/// Library paths are read from the `libraries` table in the database.
pub async fn scan_libraries(
    pool: &SqlitePool,
    _library_roots: &[PathBuf],
    status: &RwLock<ScanStatus>,
) {
    // Resolve data_dir for thumbnail cleanup
    let data_dir =
        PathBuf::from(std::env::var("OPENPANEL_DATA_DIR").unwrap_or_else(|_| "./data".to_string()));
    {
        let mut s = status.write().await;
        s.running = true;
        s.scanned = 0;
        s.errors = 0;
        s.message = "Starting scan...".to_string();
    }

    // Read library roots from the database
    let db_libraries: Vec<(String, String)> = match sqlx::query_as("SELECT id, path FROM libraries")
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Failed to load libraries from DB: {}", e);
            let mut s = status.write().await;
            s.running = false;
            s.message = "Failed to load libraries".to_string();
            return;
        }
    };

    if db_libraries.is_empty() {
        tracing::info!("No libraries in database to scan");
        let mut s = status.write().await;
        s.running = false;
        s.message = "No libraries configured. Add a library in Admin first.".to_string();
        return;
    }

    for (lib_id, lib_path_str) in &db_libraries {
        let root = PathBuf::from(lib_path_str);

        if !root.exists() {
            tracing::warn!("Library path does not exist: {}", root.display());
            let mut s = status.write().await;
            s.errors += 1;
            continue;
        }

        // Find all CBZ files
        let cbz_files: Vec<PathBuf> = WalkDir::new(&root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_type().is_file()
                    && e.path()
                        .extension()
                        .map(|ext| ext.eq_ignore_ascii_case("cbz"))
                        .unwrap_or(false)
            })
            .map(|e| e.into_path())
            .collect();

        {
            let mut s = status.write().await;
            s.total += cbz_files.len();
            s.message = format!("Found {} CBZ files in {}", cbz_files.len(), root.display());
        }

        // Collect all relative paths we found on disk for this library
        let mut found_rel_paths: Vec<String> = Vec::with_capacity(cbz_files.len());

        for cbz_path in &cbz_files {
            let rel_path = cbz_path
                .strip_prefix(&root)
                .unwrap_or(cbz_path)
                .to_string_lossy()
                .to_string();
            found_rel_paths.push(rel_path);

            match process_cbz(pool, lib_id, &root, cbz_path).await {
                Ok(_) => {
                    let mut s = status.write().await;
                    s.scanned += 1;
                    s.message = format!("Scanned: {}", cbz_path.display());
                }
                Err(e) => {
                    tracing::error!("Error scanning {}: {}", cbz_path.display(), e);
                    let mut s = status.write().await;
                    s.errors += 1;
                    s.scanned += 1;
                }
            }
        }

        // Clean up: remove books from DB that no longer exist on disk
        cleanup_stale_books(pool, lib_id, &found_rel_paths, &data_dir).await;
    }

    // Clean up empty series (no books left)
    if let Err(e) = cleanup_empty_series(pool).await {
        tracing::error!("Failed to cleanup empty series: {}", e);
    }

    {
        let mut s = status.write().await;
        s.running = false;
        s.message = format!("Scan complete. {} scanned, {} errors", s.scanned, s.errors);
    }

    tracing::info!("Library scan complete");

    // Fetch AniList metadata for series that don't have it yet (background)
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        match crate::anilist::fetch_missing_metadata(&pool_clone).await {
            Ok(count) => {
                if count > 0 {
                    tracing::info!("[anilist] Fetched metadata for {} new series", count);
                }
            }
            Err(e) => tracing::error!("[anilist] Error fetching missing metadata: {}", e),
        }
    });
}

/// Rescan all books in a specific series (force re-index).
pub async fn rescan_series(
    pool: &SqlitePool,
    series_id: &str,
    anilist_id: Option<i64>,
) -> anyhow::Result<usize> {
    // Get series info including its library path
    let series_info: Option<(String, String, String)> = sqlx::query_as(
        "SELECT s.id, s.path, l.path FROM series s
         JOIN libraries l ON s.library_id = l.id
         WHERE s.id = ?",
    )
    .bind(series_id)
    .fetch_optional(pool)
    .await?;

    let (_sid, series_rel_path, lib_path) =
        series_info.ok_or_else(|| anyhow::anyhow!("Series not found"))?;

    let lib_root = PathBuf::from(&lib_path);
    let series_abs_path = lib_root.join(&series_rel_path);

    if !series_abs_path.exists() {
        return Err(anyhow::anyhow!(
            "Series path does not exist: {}",
            series_abs_path.display()
        ));
    }

    // Delete all existing books and pages for this series
    let old_books: Vec<(String,)> = sqlx::query_as("SELECT id FROM books WHERE series_id = ?")
        .bind(series_id)
        .fetch_all(pool)
        .await?;

    let data_dir =
        PathBuf::from(std::env::var("OPENPANEL_DATA_DIR").unwrap_or_else(|_| "./data".to_string()));
    let thumb_dir = data_dir.join("thumbnails");

    for (book_id,) in &old_books {
        sqlx::query("DELETE FROM pages WHERE book_id = ?")
            .bind(book_id)
            .execute(pool)
            .await?;
        // Delete cached thumbnails
        let _ = tokio::fs::remove_file(thumb_dir.join(format!("{}.jpg", book_id))).await;
        let _ = tokio::fs::remove_file(thumb_dir.join(format!("{}.mtime", book_id))).await;
    }
    sqlx::query("DELETE FROM books WHERE series_id = ?")
        .bind(series_id)
        .execute(pool)
        .await?;

    // Get the library_id
    let (library_id,): (String,) = sqlx::query_as("SELECT library_id FROM series WHERE id = ?")
        .bind(series_id)
        .fetch_one(pool)
        .await?;

    // Re-scan all CBZ files in the series directory
    let cbz_files: Vec<PathBuf> = WalkDir::new(&series_abs_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("cbz"))
                    .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect();

    let mut scanned = 0;
    for cbz_path in &cbz_files {
        match process_cbz(pool, &library_id, &lib_root, cbz_path).await {
            Ok(_) => scanned += 1,
            Err(e) => tracing::error!("Error rescanning {}: {}", cbz_path.display(), e),
        }
    }

    tracing::info!("Rescanned series {} — {} books", series_id, scanned);

    // Handle AniList metadata
    if let Some(al_id) = anilist_id {
        // User explicitly provided an AniList ID → fetch by ID and save as manual
        match crate::anilist::fetch_by_id(al_id).await {
            Ok(Some(media)) => {
                if let Err(e) =
                    crate::anilist::save_metadata(pool, series_id, &media, "manual").await
                {
                    tracing::error!("[anilist] Failed to save manual metadata: {}", e);
                }
            }
            Ok(None) => {
                tracing::warn!("[anilist] No media found for AniList ID {}", al_id);
            }
            Err(e) => {
                tracing::error!("[anilist] Error fetching by ID {}: {}", al_id, e);
            }
        }
    } else {
        // Re-fetch by name search (respects manual/folder sources)
        let name: Option<(String,)> =
            sqlx::query_as("SELECT name FROM series WHERE id = ?")
                .bind(series_id)
                .fetch_optional(pool)
                .await?;
        if let Some((name,)) = name {
            // force=true for single-series rescan so auto sources get refreshed
            if let Err(e) =
                crate::anilist::fetch_and_save_for_series(pool, series_id, &name, false).await
            {
                tracing::error!("[anilist] Error refreshing metadata for {}: {}", name, e);
            }
        }
    }

    Ok(scanned)
}

/// Remove books from DB that are no longer on disk.
async fn cleanup_stale_books(
    pool: &SqlitePool,
    library_id: &str,
    found_paths: &[String],
    data_dir: &Path,
) {
    let found_set: HashSet<&str> = found_paths.iter().map(|s| s.as_str()).collect();

    let db_books: Vec<(String, String)> = match sqlx::query_as(
        "SELECT b.id, b.path FROM books b
         JOIN series s ON b.series_id = s.id
         WHERE s.library_id = ?",
    )
    .bind(library_id)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Failed to query books for cleanup: {}", e);
            return;
        }
    };

    let thumb_dir = data_dir.join("thumbnails");

    for (book_id, book_path) in &db_books {
        if !found_set.contains(book_path.as_str()) {
            tracing::info!("Removing stale book: {}", book_path);
            let _ = sqlx::query("DELETE FROM pages WHERE book_id = ?")
                .bind(book_id)
                .execute(pool)
                .await;
            let _ = sqlx::query("DELETE FROM reading_progress WHERE book_id = ?")
                .bind(book_id)
                .execute(pool)
                .await;
            let _ = sqlx::query("DELETE FROM books WHERE id = ?")
                .bind(book_id)
                .execute(pool)
                .await;
            // Delete cached thumbnail
            let _ = tokio::fs::remove_file(thumb_dir.join(format!("{}.jpg", book_id))).await;
            let _ = tokio::fs::remove_file(thumb_dir.join(format!("{}.mtime", book_id))).await;
        }
    }
}

/// Remove empty series (series with no books).
async fn cleanup_empty_series(pool: &SqlitePool) -> anyhow::Result<()> {
    let result =
        sqlx::query("DELETE FROM series WHERE id NOT IN (SELECT DISTINCT series_id FROM books)")
            .execute(pool)
            .await?;

    if result.rows_affected() > 0 {
        tracing::info!("Cleaned up {} empty series", result.rows_affected());
    }

    Ok(())
}

#[allow(dead_code)]
async fn ensure_library(pool: &SqlitePool, name: &str, path: &str) -> anyhow::Result<String> {
    // Check if library exists
    let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM libraries WHERE path = ?")
        .bind(path)
        .fetch_optional(pool)
        .await?;

    if let Some((id,)) = existing {
        return Ok(id);
    }

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO libraries (id, name, path) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(path)
        .execute(pool)
        .await?;

    tracing::info!("Created library '{}' at {}", name, path);
    Ok(id)
}

async fn process_cbz(
    pool: &SqlitePool,
    library_id: &str,
    library_root: &Path,
    cbz_path: &Path,
) -> anyhow::Result<()> {
    let metadata = std::fs::metadata(cbz_path)?;
    let file_size = metadata.len() as i64;
    let file_mtime = metadata
        .modified()
        .map(|t| {
            let dt: chrono::DateTime<Utc> = t.into();
            dt.to_rfc3339()
        })
        .unwrap_or_default();

    let rel_path = cbz_path
        .strip_prefix(library_root)
        .unwrap_or(cbz_path)
        .to_string_lossy()
        .to_string();

    // Determine series from parent directory
    let parent = cbz_path.parent().unwrap_or(cbz_path);
    let series_rel = parent
        .strip_prefix(library_root)
        .unwrap_or(parent)
        .to_string_lossy()
        .to_string();

    let series_name = if series_rel.is_empty() || series_rel == "." {
        // CBZ file directly in library root — use filename stem as series name
        cbz_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    } else {
        // Use the immediate parent directory name
        parent
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    };

    // Check if book already exists and is unchanged
    let existing: Option<(String, i64, String)> = sqlx::query_as(
        "SELECT b.id, b.file_size, b.file_mtime FROM books b
         JOIN series s ON b.series_id = s.id
         WHERE s.library_id = ? AND b.path = ?",
    )
    .bind(library_id)
    .bind(&rel_path)
    .fetch_optional(pool)
    .await?;

    if let Some((existing_id, existing_size, existing_mtime)) = existing {
        if existing_size == file_size && existing_mtime == file_mtime {
            tracing::debug!("Skipping unchanged book: {}", rel_path);
            return Ok(());
        }
        // Book changed — delete old data and re-index
        sqlx::query("DELETE FROM pages WHERE book_id = ?")
            .bind(&existing_id)
            .execute(pool)
            .await?;
        sqlx::query("DELETE FROM books WHERE id = ?")
            .bind(&existing_id)
            .execute(pool)
            .await?;
    }

    // Ensure series exists
    let series_path = if series_rel.is_empty() || series_rel == "." {
        rel_path.clone()
    } else {
        series_rel.clone()
    };
    let series_id = ensure_series(pool, library_id, &series_name, &series_path).await?;

    // Parse ZIP central directory
    let zip_index = tokio::task::spawn_blocking({
        let path = cbz_path.to_path_buf();
        move || ZipIndex::from_file(&path)
    })
    .await??;

    let page_count = zip_index.pages.len() as i32;
    let filename = cbz_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let stem = cbz_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.clone());

    // Detect if this is a volume or chapter from the filename prefix
    let title = classify_book_title(&stem);

    // Compute sort order from filename
    let sort_order = compute_sort_order(&filename);

    let book_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO books (id, series_id, title, filename, path, file_size, file_mtime, page_count, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&book_id)
    .bind(&series_id)
    .bind(&title)
    .bind(&filename)
    .bind(&rel_path)
    .bind(file_size)
    .bind(&file_mtime)
    .bind(page_count)
    .bind(sort_order)
    .execute(pool)
    .await?;

    // Insert pages in batched transaction for performance
    {
        let mut tx = pool.begin().await?;
        for chunk in zip_index.pages.chunks(50) {
            let mut query = String::from(
                "INSERT INTO pages (book_id, page_number, entry_name, entry_offset, compressed_size, uncompressed_size, compression) VALUES ",
            );
            let chunk_start_idx = zip_index
                .pages
                .iter()
                .position(|p| std::ptr::eq(p, &chunk[0]))
                .unwrap_or(0);
            for (j, _page) in chunk.iter().enumerate() {
                if j > 0 {
                    query.push_str(", ");
                }
                query.push_str("(?, ?, ?, ?, ?, ?, ?)");
            }
            let mut q = sqlx::query(&query);
            for (j, page) in chunk.iter().enumerate() {
                let i = chunk_start_idx + j;
                q = q
                    .bind(&book_id)
                    .bind(i as i32)
                    .bind(&page.entry_name)
                    .bind(page.local_header_offset as i64)
                    .bind(page.compressed_size as i64)
                    .bind(page.uncompressed_size as i64)
                    .bind(page.compression_method as i32);
            }
            q.execute(&mut *tx).await?;
        }
        tx.commit().await?;
    }

    tracing::info!("Indexed book '{}' with {} pages", title, page_count);
    Ok(())
}

async fn ensure_series(
    pool: &SqlitePool,
    library_id: &str,
    name: &str,
    path: &str,
) -> anyhow::Result<String> {
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM series WHERE library_id = ? AND path = ?")
            .bind(library_id)
            .bind(path)
            .fetch_optional(pool)
            .await?;

    if let Some((id,)) = existing {
        // Update name and sort_name in case folder was renamed or previously cleaned
        let sort_name = clean_folder_name(name).to_lowercase();
        sqlx::query("UPDATE series SET name = ?, sort_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(name)
            .bind(&sort_name)
            .bind(&id)
            .execute(pool)
            .await?;
        return Ok(id);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let sort_name = clean_folder_name(name).to_lowercase();

    sqlx::query(
        "INSERT INTO series (id, library_id, name, path, sort_name) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(library_id)
    .bind(name)
    .bind(path)
    .bind(&sort_name)
    .execute(pool)
    .await?;

    Ok(id)
}

fn compute_sort_order(filename: &str) -> i32 {
    // Extract first number found in filename for sorting
    let mut num_str = String::new();
    let mut found = false;
    for c in filename.chars() {
        if c.is_ascii_digit() {
            num_str.push(c);
            found = true;
        } else if found {
            break;
        }
    }
    num_str.parse().unwrap_or(0)
}

/// Detect whether a filename refers to a volume or chapter and create a clean title.
///
/// Recognises prefixes like:
///   Chapter / chapter / Chap / chap / Ch / ch / c / C  → "Chapter NNN"
///   Volume  / volume  / Vol  / vol  / V  / v           → "Volume NNN"
///
/// If no recognised prefix is found the original stem is returned unchanged.
fn classify_book_title(stem: &str) -> String {
    use regex::Regex;
    use std::sync::OnceLock;

    // Volume patterns (checked first — "v01" should be Volume, not ambiguous)
    static VOL_RE: OnceLock<Regex> = OnceLock::new();
    let vol_re = VOL_RE
        .get_or_init(|| Regex::new(r"(?i)^(?:volume|vol|v)\.?\s*([0-9]+(?:\.[0-9]+)?)").unwrap());

    // Chapter patterns
    static CH_RE: OnceLock<Regex> = OnceLock::new();
    let ch_re = CH_RE.get_or_init(|| {
        Regex::new(r"(?i)^(?:chapter|chap|ch|c)\.?\s*([0-9]+(?:\.[0-9]+)?)").unwrap()
    });

    let trimmed = stem.trim();

    if let Some(caps) = vol_re.captures(trimmed) {
        let num = &caps[1];
        // Format: "Volume 001" (zero-padded to at least 3 digits)
        if let Ok(n) = num.parse::<f64>() {
            if n.fract() == 0.0 {
                return format!("Volume {:04}", n as i64);
            }
            return format!("Volume {}", num);
        }
        return format!("Volume {}", num);
    }

    if let Some(caps) = ch_re.captures(trimmed) {
        let num = &caps[1];
        if let Ok(n) = num.parse::<f64>() {
            if n.fract() == 0.0 {
                return format!("Chapter {:04}", n as i64);
            }
            return format!("Chapter {}", num);
        }
        return format!("Chapter {}", num);
    }

    // No recognised prefix — try to detect a bare number (e.g. "001", "42")
    // and keep the original stem as-is
    stem.to_string()
}

/// Strip year patterns from folder names for clean display.
/// "Naruto (1999)" → "Naruto"
/// "One Punch Man (2012)" → "One Punch Man"
/// "Naruto - 1999" → "Naruto"
/// "Naruto(1999)" → "Naruto"
fn clean_folder_name(name: &str) -> String {
    use regex::Regex;
    use std::sync::OnceLock;

    static YEAR_RE: OnceLock<Regex> = OnceLock::new();
    let re = YEAR_RE.get_or_init(|| {
        Regex::new(r"(?:\s*[\(\[]\s*\d{4}\s*[\)\]]|\s*[-\x{2013}\x{2014}]\s*\d{4}\s*$)").unwrap()
    });

    let cleaned = re.replace(name, "").trim().to_string();
    if cleaned.is_empty() {
        name.to_string()
    } else {
        cleaned
    }
}
