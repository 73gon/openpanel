use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::RwLock;
use walkdir::WalkDir;

use crate::zip::ZipIndex;

/// Supported book file extensions.
const SUPPORTED_EXTENSIONS: &[&str] = &["cbz", "cbr", "pdf", "epub"];

fn is_supported_book(path: &Path) -> bool {
    path.extension()
        .map(|ext| {
            let e = ext.to_string_lossy().to_lowercase();
            SUPPORTED_EXTENSIONS.contains(&e.as_str())
        })
        .unwrap_or(false)
}

fn format_from_path(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        e if e.eq_ignore_ascii_case("cbz") => "cbz",
        e if e.eq_ignore_ascii_case("cbr") => "cbr",
        e if e.eq_ignore_ascii_case("pdf") => "pdf",
        e if e.eq_ignore_ascii_case("epub") => "epub",
        _ => "cbz",
    }
}

/// Metadata parsed from ComicInfo.xml inside a CBZ/CBR file.
#[derive(serde::Deserialize, Default, Debug)]
#[serde(default)]
struct ComicInfo {
    #[serde(rename = "Title")]
    title: Option<String>,
    #[serde(rename = "Series")]
    series: Option<String>,
    #[serde(rename = "Number")]
    number: Option<String>,
    #[serde(rename = "Volume")]
    volume: Option<String>,
    #[serde(rename = "Summary")]
    summary: Option<String>,
    #[serde(rename = "Writer")]
    writer: Option<String>,
    #[serde(rename = "Year")]
    year: Option<String>,
    #[serde(rename = "Manga")]
    manga: Option<String>,
}

/// Try to extract ComicInfo.xml from a ZIP-based archive.
fn parse_comicinfo(path: &Path) -> Option<ComicInfo> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    // Find entry index first (case-insensitive)
    let mut ci_idx = None;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index_raw(i) {
            if entry.name().eq_ignore_ascii_case("comicinfo.xml") {
                ci_idx = Some(i);
                break;
            }
        }
    }

    let idx = ci_idx?;
    let entry = archive.by_index(idx).ok()?;
    quick_xml::de::from_reader(std::io::BufReader::new(entry)).ok()
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ScanStatus {
    pub running: bool,
    pub scanned: usize,
    pub total: usize,
    pub errors: usize,
    pub message: String,
    pub current_file: String,
    pub phase: String,
}

/// Scan all library roots and populate the database.
/// Library paths are read from the `libraries` table in the database.
pub async fn scan_libraries(
    pool: &SqlitePool,
    status: &RwLock<ScanStatus>,
    data_dir: &Path,
    http_client: reqwest::Client,
    notify_tx: Option<&tokio::sync::broadcast::Sender<crate::state::NotificationEvent>>,
) {
    // Use provided data_dir for thumbnail cleanup
    let data_dir = data_dir.to_path_buf();
    {
        let mut s = status.write().await;
        s.running = true;
        s.scanned = 0;
        s.total = 0;
        s.errors = 0;
        s.message = "Starting scan...".to_string();
        s.current_file = String::new();
        s.phase = "starting".to_string();
    }

    // Log scan start
    crate::api::admin::log_admin_event(
        pool,
        "info",
        "scan",
        "Library scan started",
        None,
    )
    .await;

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

        // Find all supported book files
        let cbz_files: Vec<PathBuf> = WalkDir::new(&root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file() && is_supported_book(e.path()))
            .map(|e| e.into_path())
            .collect();

        {
            let mut s = status.write().await;
            s.total += cbz_files.len();
            s.message = format!("Found {} files in {}", cbz_files.len(), root.display());
            s.phase = "indexing".to_string();
        }

        // Collect all relative paths we found on disk for this library
        let mut found_rel_paths: Vec<String> = Vec::with_capacity(cbz_files.len());

        // Process CBZ files concurrently with bounded parallelism
        let sem = Arc::new(tokio::sync::Semaphore::new(4));
        let mut join_set = tokio::task::JoinSet::new();

        for cbz_path in cbz_files {
            let rel_path = cbz_path
                .strip_prefix(&root)
                .unwrap_or(&cbz_path)
                .to_string_lossy()
                .to_string();
            found_rel_paths.push(rel_path.clone());

            let pool = pool.clone();
            let lib_id = lib_id.clone();
            let root_clone = root.clone();
            let sem = sem.clone();

            join_set.spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                let result = process_cbz(&pool, &lib_id, &root_clone, &cbz_path).await;
                (rel_path, cbz_path, result)
            });
        }

        while let Some(join_result) = join_set.join_next().await {
            match join_result {
                Ok((rel_path, _cbz_path, Ok(()))) => {
                    let mut s = status.write().await;
                    s.scanned += 1;
                    s.current_file = rel_path;
                    s.phase = "scanning".to_string();
                }
                Ok((rel_path, cbz_path, Err(e))) => {
                    tracing::error!("Error scanning {}: {}", cbz_path.display(), e);
                    let mut s = status.write().await;
                    s.errors += 1;
                    s.scanned += 1;
                    s.current_file = rel_path;
                    s.phase = "scanning".to_string();
                }
                Err(e) => {
                    tracing::error!("Join error during scan: {}", e);
                    let mut s = status.write().await;
                    s.errors += 1;
                    s.scanned += 1;
                }
            }
        }

        // Clean up: remove books from DB that no longer exist on disk
        {
            let mut s = status.write().await;
            s.phase = "cleanup".to_string();
            s.message = "Cleaning up removed files...".to_string();
            s.current_file = String::new();
        }
        cleanup_stale_books(pool, lib_id, &found_rel_paths, &data_dir).await;
    }

    // Clean up empty series (no books left)
    if let Err(e) = cleanup_empty_series(pool).await {
        tracing::error!("Failed to cleanup empty series: {}", e);
    }

    let (scanned, errors) = {
        let mut s = status.write().await;
        s.running = false;
        s.phase = "complete".to_string();
        s.current_file = String::new();
        s.message = format!("Scan complete. {} scanned, {} errors", s.scanned, s.errors);
        (s.scanned, s.errors)
    };

    tracing::info!("Library scan complete");

    // Log scan completion to admin_logs
    let details = format!(
        "Files scanned: {}\nErrors: {}\nLibraries: {}",
        scanned,
        errors,
        db_libraries.len()
    );
    crate::api::admin::log_admin_event(
        pool,
        if errors > 0 { "warn" } else { "info" },
        "scan",
        &format!("Library scan complete — {} scanned, {} errors", scanned, errors),
        Some(&details),
    )
    .await;

    // Broadcast scan complete notification
    if let Some(tx) = notify_tx {
        let _ = tx.send(crate::state::NotificationEvent::ScanComplete {
            scanned,
            errors,
        });
    }

    // Fetch AniList metadata for series that don't have it yet (background)
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        match crate::anilist::fetch_missing_metadata(&http_client, &pool_clone).await {
            Ok(count) => {
                if count > 0 {
                    tracing::info!("[anilist] Fetched metadata for {} new series", count);
                    crate::api::admin::log_admin_event(
                        &pool_clone,
                        "info",
                        "anilist",
                        &format!("Fetched AniList metadata for {} series", count),
                        None,
                    )
                    .await;
                }
            }
            Err(e) => {
                tracing::error!("[anilist] Error fetching missing metadata: {}", e);
                crate::api::admin::log_admin_event(
                    &pool_clone,
                    "error",
                    "anilist",
                    &format!("Error fetching AniList metadata: {}", e),
                    None,
                )
                .await;
            }
        }
    });
}

/// Rescan all books in a specific series (force re-index).
pub async fn rescan_series(
    pool: &SqlitePool,
    series_id: &str,
    anilist_id: Option<i64>,
    data_dir: &Path,
    http_client: &reqwest::Client,
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

    // Re-scan all supported book files in the series directory
    let cbz_files: Vec<PathBuf> = WalkDir::new(&series_abs_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_supported_book(e.path()))
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
        match crate::anilist::fetch_by_id(http_client, al_id).await {
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
        let name: Option<(String,)> = sqlx::query_as("SELECT name FROM series WHERE id = ?")
            .bind(series_id)
            .fetch_optional(pool)
            .await?;
        if let Some((name,)) = name {
            // force=true for single-series rescan so auto sources get refreshed
            if let Err(e) =
                crate::anilist::fetch_and_save_for_series(http_client, pool, series_id, &name, false).await
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
            // Book unchanged — but check if chapters were detected previously
            let has_chapters: Option<(i32,)> = sqlx::query_as(
                "SELECT COUNT(*) FROM book_chapters WHERE book_id = ?",
            )
            .bind(&existing_id)
            .fetch_optional(pool)
            .await?;

            let chapter_count = has_chapters.map(|(c,)| c).unwrap_or(0);
            if chapter_count == 0 {
                // No chapters detected yet — try detecting them now
                let zip_index = tokio::task::spawn_blocking({
                    let path = cbz_path.to_path_buf();
                    move || ZipIndex::from_file(&path)
                })
                .await??;

                let chapters = detect_chapters(&zip_index);
                if !chapters.is_empty() {
                    let ch_count = chapters.len() as i32;
                    sqlx::query("UPDATE books SET chapter_count = ? WHERE id = ?")
                        .bind(ch_count)
                        .bind(&existing_id)
                        .execute(pool)
                        .await?;

                    let mut tx = pool.begin().await?;
                    for ch in &chapters {
                        sqlx::query(
                            "INSERT OR REPLACE INTO book_chapters (book_id, chapter_number, title, start_page, end_page)
                             VALUES (?, ?, ?, ?, ?)",
                        )
                        .bind(&existing_id)
                        .bind(ch.number)
                        .bind(&ch.title)
                        .bind(ch.start_page)
                        .bind(ch.end_page)
                        .execute(&mut *tx)
                        .await?;
                    }
                    tx.commit().await?;
                    let title = cbz_path.file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    tracing::info!("Detected {} chapters in existing book '{}'", ch_count, title);
                }
            }

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

    let book_format = format_from_path(cbz_path);

    // For non-ZIP formats (pdf, epub), create a stub entry with no pages
    if book_format == "pdf" || book_format == "epub" {
        let filename = cbz_path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let stem = cbz_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| filename.clone());
        let title = classify_book_title(&stem);
        let sort_order = compute_sort_order(&filename);
        let book_id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO books (id, series_id, title, filename, path, file_size, file_mtime, page_count, sort_order, format)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&book_id)
        .bind(&series_id)
        .bind(&title)
        .bind(&filename)
        .bind(&rel_path)
        .bind(file_size)
        .bind(&file_mtime)
        .bind(sort_order)
        .bind(book_format)
        .execute(pool)
        .await?;

        tracing::info!("Indexed {} book '{}' (no page extraction)", book_format, title);
        return Ok(());
    }

    // Parse ZIP central directory (CBZ or CBR-renamed-to-CBZ)
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

    // Try to parse ComicInfo.xml for metadata (fallback; AniList has priority)
    let comic_info = tokio::task::spawn_blocking({
        let path = cbz_path.to_path_buf();
        move || parse_comicinfo(&path)
    })
    .await?;

    let book_id = uuid::Uuid::new_v4().to_string();

    let meta_title = comic_info.as_ref().and_then(|ci| ci.title.clone());
    let meta_writer = comic_info.as_ref().and_then(|ci| ci.writer.clone());
    let meta_summary = comic_info.as_ref().and_then(|ci| ci.summary.clone());
    let meta_year: Option<i32> = comic_info
        .as_ref()
        .and_then(|ci| ci.year.as_ref())
        .and_then(|y| y.parse().ok());
    let meta_number = comic_info.as_ref().and_then(|ci| ci.number.clone());

    sqlx::query(
        "INSERT INTO books (id, series_id, title, filename, path, file_size, file_mtime, page_count, sort_order, format, meta_title, meta_writer, meta_summary, meta_year, meta_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    .bind(book_format)
    .bind(&meta_title)
    .bind(&meta_writer)
    .bind(&meta_summary)
    .bind(meta_year)
    .bind(&meta_number)
    .execute(pool)
    .await?;

    // Extract page dimensions in a blocking task (reads image headers only)
    let page_dimensions: Vec<Option<(u32, u32)>> = tokio::task::spawn_blocking({
        let path = cbz_path.to_path_buf();
        let pages = zip_index.pages.clone();
        move || {
            pages
                .iter()
                .map(|page| ZipIndex::read_page_dimensions(&path, page))
                .collect()
        }
    })
    .await?;

    // Insert pages in batched transaction for performance
    {
        let mut tx = pool.begin().await?;
        for chunk in zip_index.pages.chunks(50) {
            let mut query = String::from(
                "INSERT INTO pages (book_id, page_number, entry_name, entry_offset, compressed_size, uncompressed_size, compression, width, height) VALUES ",
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
                query.push_str("(?, ?, ?, ?, ?, ?, ?, ?, ?)");
            }
            let mut q = sqlx::query(&query);
            for (j, page) in chunk.iter().enumerate() {
                let i = chunk_start_idx + j;
                let dims = page_dimensions.get(i).and_then(|d| *d);
                q = q
                    .bind(&book_id)
                    .bind(i as i32)
                    .bind(&page.entry_name)
                    .bind(page.local_header_offset as i64)
                    .bind(page.compressed_size as i64)
                    .bind(page.uncompressed_size as i64)
                    .bind(page.compression_method as i32)
                    .bind(dims.map(|(w, _)| w as i32))
                    .bind(dims.map(|(_, h)| h as i32));
            }
            q.execute(&mut *tx).await?;
        }
        tx.commit().await?;
    }

    // Detect chapters from page entry names (directory-based or prefix-based)
    let chapters = detect_chapters(&zip_index);
    if !chapters.is_empty() {
        let chapter_count = chapters.len() as i32;
        sqlx::query("UPDATE books SET chapter_count = ? WHERE id = ?")
            .bind(chapter_count)
            .bind(&book_id)
            .execute(pool)
            .await?;

        // Insert chapter boundaries
        let mut tx = pool.begin().await?;
        for ch in &chapters {
            sqlx::query(
                "INSERT OR REPLACE INTO book_chapters (book_id, chapter_number, title, start_page, end_page)
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&book_id)
            .bind(ch.number)
            .bind(&ch.title)
            .bind(ch.start_page)
            .bind(ch.end_page)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        tracing::info!("Detected {} chapters in '{}'", chapter_count, title);
    }

    tracing::info!("Indexed book '{}' with {} pages", title, page_count);
    Ok(())
}

struct DetectedChapter {
    number: i32,
    title: String,
    start_page: i32,
    end_page: i32,
}

/// Detect chapter boundaries by analyzing page entry names.
///
/// Looks for directory-based structure (e.g. `Chapter 01/page.jpg`)
/// or prefix-based patterns in filenames:
///   - `ch01_001.jpg`, `Chapter 001 - 001.jpg`
///   - `SeriesName - c001 (v01) - p001.jpg` (common manga naming)
///   - `Title c001 p001.jpg`
fn detect_chapters(zip_index: &ZipIndex) -> Vec<DetectedChapter> {
    use regex::Regex;
    use std::collections::BTreeMap;
    use std::sync::OnceLock;

    if zip_index.pages.is_empty() {
        return vec![];
    }

    // Helper: convert collected chapters map into sorted DetectedChapter vec.
    // BTreeMap<String> sorts lexicographically ("10" < "2"), so we sort by
    // parsed numeric value instead.
    fn finalize(map: BTreeMap<String, (String, i32, i32)>) -> Vec<DetectedChapter> {
        let mut entries: Vec<_> = map.into_iter().collect();
        entries.sort_by(|a, b| {
            let na: f64 = a.0.parse().unwrap_or(0.0);
            let nb: f64 = b.0.parse().unwrap_or(0.0);
            na.partial_cmp(&nb).unwrap_or(std::cmp::Ordering::Equal)
        });
        entries
            .into_iter()
            .enumerate()
            .map(|(i, (_key, (title, start, end)))| DetectedChapter {
                number: i as i32 + 1,
                title,
                start_page: start,
                end_page: end,
            })
            .collect()
    }

    // Method 1: Directory-based chapters (most common in well-structured CBZs)
    // e.g. "Chapter 01/page_001.jpg", "Ch.01/001.jpg",
    //      "Chapter 001 - Death & Strawberry/page.jpg",
    //      "VolumeName/Chapter 01/page.jpg" (nested)
    static DIR_CH_RE: OnceLock<Regex> = OnceLock::new();
    let dir_ch_re = DIR_CH_RE.get_or_init(|| {
        // Match chapter directories anywhere in the path (not only at start).
        // Allows a parent directory before the chapter folder.
        Regex::new(r"(?i)(?:^|[/\\])(?:chapter|chap|ch)\.?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:[-–—]\s*(.+?))?\s*[/\\]").unwrap()
    });

    let mut dir_chapters: BTreeMap<String, (String, i32, i32)> = BTreeMap::new();
    for (page_idx, page) in zip_index.pages.iter().enumerate() {
        if let Some(caps) = dir_ch_re.captures(&page.entry_name) {
            let num = caps[1].to_string();
            let entry = dir_chapters.entry(num.clone()).or_insert_with(|| {
                let n: f64 = num.parse().unwrap_or(0.0);
                // Use the directory title if available, otherwise just "Chapter N"
                let title = if let Some(m) = caps.get(2) {
                    let dir_title = m.as_str().trim();
                    if !dir_title.is_empty() {
                        if n.fract() == 0.0 {
                            format!("Chapter {} — {}", n as i64, dir_title)
                        } else {
                            format!("Chapter {} — {}", num, dir_title)
                        }
                    } else if n.fract() == 0.0 {
                        format!("Chapter {}", n as i64)
                    } else {
                        format!("Chapter {}", num)
                    }
                } else if n.fract() == 0.0 {
                    format!("Chapter {}", n as i64)
                } else {
                    format!("Chapter {}", num)
                };
                (title, page_idx as i32, page_idx as i32)
            });
            entry.2 = page_idx as i32; // update end_page
        }
    }

    if dir_chapters.len() >= 2 {
        return finalize(dir_chapters);
    }

    // Method 2: Prefix-based chapters in filenames
    // Handles multiple patterns:
    //   - "ch01_001.jpg", "Chapter 01 - 001.jpg", "chap3_page1.jpg"
    //   - "SeriesName - c001 (v01) - p001.jpg" (common digital manga naming)
    //   - "Title c001 p001.jpg"
    //   - "c001.jpg", "c001-002.jpg"
    static PREFIX_CH_RE: OnceLock<Regex> = OnceLock::new();
    let prefix_ch_re = PREFIX_CH_RE.get_or_init(|| {
        Regex::new(r"(?i)(?:^|[\s\-_\.])(?:chapter|chap|ch|c)[\.\s\-_]*([0-9]+(?:\.[0-9]+)?)(?:\s|[\-_\.]|$|\s*\()").unwrap()
    });

    let mut prefix_chapters: BTreeMap<String, (String, i32, i32)> = BTreeMap::new();
    for (page_idx, page) in zip_index.pages.iter().enumerate() {
        // Use just the filename (after last / or \)
        let fname = page
            .entry_name
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(&page.entry_name);
        if let Some(caps) = prefix_ch_re.captures(fname) {
            let num = caps[1].to_string();
            let entry = prefix_chapters.entry(num.clone()).or_insert_with(|| {
                let n: f64 = num.parse().unwrap_or(0.0);
                let title = if n.fract() == 0.0 {
                    format!("Chapter {}", n as i64)
                } else {
                    format!("Chapter {}", num)
                };
                (title, page_idx as i32, page_idx as i32)
            });
            entry.2 = page_idx as i32;
        }
    }

    if prefix_chapters.len() >= 2 {
        return finalize(prefix_chapters);
    }

    vec![]
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
        // Format: "Volume 1" (no zero-padding — sort_order handles ordering)
        if let Ok(n) = num.parse::<f64>() {
            if n.fract() == 0.0 {
                return format!("Volume {}", n as i64);
            }
            return format!("Volume {}", num);
        }
        return format!("Volume {}", num);
    }

    if let Some(caps) = ch_re.captures(trimmed) {
        let num = &caps[1];
        if let Ok(n) = num.parse::<f64>() {
            if n.fract() == 0.0 {
                return format!("Chapter {}", n as i64);
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

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zip::ZipIndex;
    use crate::zip::PageEntry;
    use std::path::PathBuf;

    // ── is_supported_book ──

    #[test]
    fn supported_book_extensions() {
        assert!(is_supported_book(Path::new("foo/bar.cbz")));
        assert!(is_supported_book(Path::new("some.CBZ")));
        assert!(is_supported_book(Path::new("vol.cbr")));
        assert!(is_supported_book(Path::new("book.pdf")));
        assert!(is_supported_book(Path::new("novel.epub")));
    }

    #[test]
    fn unsupported_book_extensions() {
        assert!(!is_supported_book(Path::new("readme.txt")));
        assert!(!is_supported_book(Path::new("image.jpg")));
        assert!(!is_supported_book(Path::new("no_extension")));
        assert!(!is_supported_book(Path::new("")));
    }

    // ── format_from_path ──

    #[test]
    fn format_detection() {
        assert_eq!(format_from_path(Path::new("vol1.cbz")), "cbz");
        assert_eq!(format_from_path(Path::new("vol1.CBR")), "cbr");
        assert_eq!(format_from_path(Path::new("vol1.pdf")), "pdf");
        assert_eq!(format_from_path(Path::new("vol1.epub")), "epub");
        assert_eq!(format_from_path(Path::new("vol1.unknown")), "cbz"); // default
    }

    // ── compute_sort_order ──

    #[test]
    fn sort_order_extracts_first_number() {
        assert_eq!(compute_sort_order("vol_03_ch_12.cbz"), 3);
        assert_eq!(compute_sort_order("Chapter 042.cbz"), 42);
        assert_eq!(compute_sort_order("001.cbz"), 1);
        assert_eq!(compute_sort_order("v10c5.cbz"), 10);
    }

    #[test]
    fn sort_order_no_digits() {
        assert_eq!(compute_sort_order("nodigits.cbz"), 0);
        assert_eq!(compute_sort_order(""), 0);
    }

    // ── classify_book_title ──

    #[test]
    fn classify_volume_patterns() {
        assert_eq!(classify_book_title("v01"), "Volume 1");
        assert_eq!(classify_book_title("Vol 3"), "Volume 3");
        assert_eq!(classify_book_title("Volume 42"), "Volume 42");
        assert_eq!(classify_book_title("vol.5"), "Volume 5");
        assert_eq!(classify_book_title("V10"), "Volume 10");
    }

    #[test]
    fn classify_volume_decimal() {
        assert_eq!(classify_book_title("v3.5"), "Volume 3.5");
        assert_eq!(classify_book_title("Vol 10.5"), "Volume 10.5");
    }

    #[test]
    fn classify_chapter_patterns() {
        assert_eq!(classify_book_title("ch01"), "Chapter 1");
        assert_eq!(classify_book_title("Chapter 5"), "Chapter 5");
        assert_eq!(classify_book_title("Chap 100"), "Chapter 100");
        assert_eq!(classify_book_title("c42"), "Chapter 42");
        assert_eq!(classify_book_title("C5"), "Chapter 5");
    }

    #[test]
    fn classify_chapter_decimal() {
        assert_eq!(classify_book_title("ch3.5"), "Chapter 3.5");
    }

    #[test]
    fn classify_passthrough() {
        assert_eq!(classify_book_title("SomeRandomName"), "SomeRandomName");
        assert_eq!(classify_book_title("001"), "001");
    }

    // ── clean_folder_name ──

    #[test]
    fn clean_folder_strips_year_parens() {
        assert_eq!(clean_folder_name("Naruto (1999)"), "Naruto");
        assert_eq!(clean_folder_name("One Punch Man (2012)"), "One Punch Man");
    }

    #[test]
    fn clean_folder_strips_year_brackets() {
        assert_eq!(clean_folder_name("Naruto [1999]"), "Naruto");
    }

    #[test]
    fn clean_folder_strips_year_dash() {
        assert_eq!(clean_folder_name("Naruto - 1999"), "Naruto");
    }

    #[test]
    fn clean_folder_no_year() {
        assert_eq!(clean_folder_name("Just A Name"), "Just A Name");
    }

    #[test]
    fn clean_folder_only_year_returns_original() {
        // If stripping would leave empty, return original
        assert_eq!(clean_folder_name("(1999)"), "(1999)");
    }

    // ── detect_chapters ──

    fn make_zip_index(entries: &[&str]) -> ZipIndex {
        ZipIndex {
            book_path: PathBuf::from("test.cbz"),
            pages: entries
                .iter()
                .map(|name| PageEntry {
                    entry_name: name.to_string(),
                    local_header_offset: 0,
                    compressed_size: 0,
                    uncompressed_size: 0,
                    compression_method: 0,
                    crc32: 0,
                })
                .collect(),
        }
    }

    #[test]
    fn detect_directory_based_chapters() {
        let idx = make_zip_index(&[
            "Chapter 01/page_001.jpg",
            "Chapter 01/page_002.jpg",
            "Chapter 02/page_001.jpg",
            "Chapter 02/page_002.jpg",
            "Chapter 02/page_003.jpg",
        ]);
        let chapters = detect_chapters(&idx);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "Chapter 1");
        assert_eq!(chapters[0].start_page, 0);
        assert_eq!(chapters[0].end_page, 1);
        assert_eq!(chapters[1].title, "Chapter 2");
        assert_eq!(chapters[1].start_page, 2);
        assert_eq!(chapters[1].end_page, 4);
    }

    #[test]
    fn detect_directory_chapters_with_titles() {
        let idx = make_zip_index(&[
            "Chapter 001 - Death & Strawberry/page_1.jpg",
            "Chapter 001 - Death & Strawberry/page_2.jpg",
            "Chapter 002 - The Beginning/page_1.jpg",
        ]);
        let chapters = detect_chapters(&idx);
        assert_eq!(chapters.len(), 2);
        assert!(chapters[0].title.contains("Death & Strawberry"));
        assert!(chapters[1].title.contains("The Beginning"));
    }

    #[test]
    fn detect_prefix_based_chapters() {
        let idx = make_zip_index(&[
            "ch01_001.jpg",
            "ch01_002.jpg",
            "ch02_001.jpg",
            "ch02_002.jpg",
        ]);
        let chapters = detect_chapters(&idx);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "Chapter 1");
        assert_eq!(chapters[1].title, "Chapter 2");
    }

    #[test]
    fn detect_no_chapters_single_group() {
        // All pages in one chapter → returns empty (no split needed)
        let idx = make_zip_index(&[
            "ch01_001.jpg",
            "ch01_002.jpg",
            "ch01_003.jpg",
        ]);
        let chapters = detect_chapters(&idx);
        assert!(chapters.is_empty());
    }

    #[test]
    fn detect_no_chapters_plain_names() {
        let idx = make_zip_index(&["001.jpg", "002.jpg", "003.jpg"]);
        let chapters = detect_chapters(&idx);
        assert!(chapters.is_empty());
    }

    #[test]
    fn detect_empty_zip() {
        let idx = make_zip_index(&[]);
        let chapters = detect_chapters(&idx);
        assert!(chapters.is_empty());
    }
}
