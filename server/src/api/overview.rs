//! The administration overview: in one request, how the server is doing, what needs looking
//! at, and who is reading what.

use axum::extract::State;
use axum::http::header::HeaderMap;
use axum::Json;
use serde::Serialize;

use super::admin::{get_setting, newest_backup_time, read_backups, scan_on_startup, STARTUP_TIME};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct Overview {
    pub version: &'static str,
    pub commit: &'static str,
    pub channel: &'static str,
    pub uptime_seconds: u64,
    /// The database file and its write-ahead log.
    pub database_bytes: u64,
    pub library: LibraryTotals,
    pub scan: crate::scanner::ScanStatus,
    pub scan_on_startup: bool,
    /// Minutes between automatic scans; 0 is off.
    pub auto_scan_interval_min: u32,
    pub backups: BackupSummary,
    /// Logged in the last 24 hours.
    pub problems: ProblemCounts,
    pub readers: Vec<ReaderActivity>,
}

#[derive(Serialize)]
pub struct LibraryTotals {
    pub libraries: i64,
    pub series: i64,
    pub books: i64,
    pub pages: i64,
    /// The books' files, together.
    pub bytes: i64,
    /// Series without AniList metadata.
    pub unmatched: i64,
}

#[derive(Serialize)]
pub struct BackupSummary {
    pub count: usize,
    /// When the newest backup was written (RFC 3339).
    pub latest_at: Option<String>,
    /// Hours between automatic backups; 0 is off.
    pub auto_interval_hours: u32,
}

#[derive(Serialize)]
pub struct ProblemCounts {
    pub errors: i64,
    pub warnings: i64,
    pub failed_sign_ins: i64,
}

#[derive(Serialize)]
pub struct ReaderActivity {
    pub id: String,
    pub name: String,
    pub is_admin: bool,
    /// The later of their last request and their last page (SQLite time, UTC).
    pub last_active_at: Option<String>,
    /// Devices signed in.
    pub devices: i64,
    pub books_completed: i64,
    pub last_read: Option<LastRead>,
}

/// The book someone opened last, and where they are in it.
#[derive(Serialize, sqlx::FromRow)]
pub struct LastRead {
    pub series_id: String,
    pub series_name: String,
    pub book_id: String,
    pub book_title: String,
    /// 1-based, like the reader.
    pub page: i64,
    pub page_count: i64,
    pub is_completed: bool,
    /// SQLite time (UTC).
    pub updated_at: String,
}

type ReaderRow = (
    String,
    String,
    bool,
    Option<String>,
    Option<String>,
    i64,
    i64,
);

pub async fn overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Overview>, AppError> {
    super::auth::require_admin(&state, &headers).await?;
    let db = &state.db;

    let startup = *STARTUP_TIME.get().unwrap_or(&0);
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let db_path = state.config.data_dir.join("openpanel.db");
    let database_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0)
        + std::fs::metadata(db_path.with_extension("db-wal"))
            .map(|m| m.len())
            .unwrap_or(0);

    let (libraries, series, books, pages, bytes, unmatched): (i64, i64, i64, i64, i64, i64) =
        sqlx::query_as(
            "SELECT (SELECT COUNT(*) FROM libraries),
                    (SELECT COUNT(*) FROM series),
                    (SELECT COUNT(*) FROM books),
                    (SELECT COALESCE(SUM(page_count), 0) FROM books),
                    (SELECT COALESCE(SUM(file_size), 0) FROM books),
                    (SELECT COUNT(*) FROM series WHERE anilist_id IS NULL)",
        )
        .fetch_one(db)
        .await?;

    let (errors, warnings, failed_sign_ins): (i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM admin_logs
              WHERE level = 'error' AND created_at >= datetime('now', '-1 day')),
            (SELECT COUNT(*) FROM admin_logs
              WHERE level = 'warn' AND created_at >= datetime('now', '-1 day')),
            (SELECT COUNT(*) FROM admin_logs
              WHERE category = 'auth' AND message LIKE 'Failed login%'
                AND created_at >= datetime('now', '-1 day'))",
    )
    .fetch_one(db)
    .await?;

    let backup_dir = state.config.data_dir.join("backups");
    let backups = read_backups(&backup_dir).await;
    let latest_at = newest_backup_time(&backup_dir).await.map(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        dt.to_rfc3339()
    });

    // Progress times are RFC 3339 and session times SQLite's: datetime() makes them one kind.
    let reader_rows: Vec<ReaderRow> = sqlx::query_as(
        "SELECT p.id, p.name, p.is_admin,
                (SELECT MAX(datetime(COALESCE(s.last_seen_at, s.created_at)))
                   FROM sessions s WHERE s.profile_id = p.id),
                (SELECT MAX(datetime(rp.updated_at))
                   FROM reading_progress rp WHERE rp.profile_id = p.id),
                (SELECT COUNT(*) FROM sessions s WHERE s.profile_id = p.id),
                (SELECT COUNT(*) FROM reading_progress rp
                   WHERE rp.profile_id = p.id AND rp.is_completed = 1)
         FROM profiles p
         ORDER BY p.name COLLATE NOCASE",
    )
    .fetch_all(db)
    .await?;

    let mut readers = Vec::with_capacity(reader_rows.len());
    for (id, name, is_admin, last_seen, last_page, devices, books_completed) in reader_rows {
        let last_read: Option<LastRead> = sqlx::query_as(
            "SELECT b.series_id, s.name AS series_name, b.id AS book_id, b.title AS book_title,
                    rp.page_number + 1 AS page, b.page_count, rp.is_completed,
                    COALESCE(datetime(rp.updated_at), rp.updated_at) AS updated_at
             FROM reading_progress rp
             JOIN books b ON b.id = rp.book_id
             JOIN series s ON s.id = b.series_id
             WHERE rp.profile_id = ?
             ORDER BY datetime(rp.updated_at) DESC
             LIMIT 1",
        )
        .bind(&id)
        .fetch_optional(db)
        .await?;

        readers.push(ReaderActivity {
            id,
            name,
            is_admin,
            last_active_at: last_seen.max(last_page),
            devices,
            books_completed,
            last_read,
        });
    }

    let setting = |key: &'static str| async move {
        get_setting(db, key)
            .await
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(0)
    };

    Ok(Json(Overview {
        version: env!("BUILD_VERSION"),
        commit: env!("GIT_COMMIT_SHA"),
        channel: env!("BUILD_CHANNEL"),
        uptime_seconds: now_ms.saturating_sub(startup) / 1000,
        database_bytes,
        library: LibraryTotals {
            libraries,
            series,
            books,
            pages,
            bytes,
            unmatched,
        },
        scan: state.scan_status.read().await.clone(),
        scan_on_startup: state.config.scan_on_startup && scan_on_startup(db).await,
        auto_scan_interval_min: setting("auto_scan_interval_min").await,
        backups: BackupSummary {
            count: backups.len(),
            latest_at,
            auto_interval_hours: setting("auto_backup_interval_hours").await,
        },
        problems: ProblemCounts {
            errors,
            warnings,
            failed_sign_ins,
        },
        readers,
    }))
}
