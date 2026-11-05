pub mod models;

use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};
use std::path::{Path, PathBuf};
use std::str::FromStr;

/// Extract the filesystem path from a SQLite URL like
/// `sqlite:///data/openpanel.db?mode=rwc` or `sqlite:data/openpanel.db?mode=rwc`.
fn extract_db_path(db_url: &str) -> Option<PathBuf> {
    let stripped = db_url.strip_prefix("sqlite:")?;
    // Strip query parameters (?mode=rwc etc.)
    let path_str = match stripped.find('?') {
        Some(idx) => &stripped[..idx],
        None => stripped,
    };
    if path_str.is_empty() {
        return None;
    }
    Some(PathBuf::from(path_str))
}

pub async fn init_pool(db_url: &str, data_dir: &Path) -> anyhow::Result<SqlitePool> {
    tracing::info!("Database URL: {}", db_url);

    // Ensure data directory exists
    tokio::fs::create_dir_all(data_dir).await?;

    // Also ensure the DB file's parent directory exists and touch the file
    if let Some(db_path) = extract_db_path(db_url) {
        if let Some(parent) = db_path.parent() {
            if !parent.as_os_str().is_empty() {
                tokio::fs::create_dir_all(parent).await?;
            }
        }
        // Create the DB file if it doesn't exist (does NOT truncate existing files)
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&db_path)
            .await
            .map_err(|e| {
                anyhow::anyhow!(
                    "Failed to create database file at {}: {}\n  \
                     Parent dir exists: {}\n  \
                     File exists: {}\n  \
                     File writable: {}",
                    db_path.display(),
                    e,
                    db_path.parent().map(|p| p.exists()).unwrap_or(false),
                    db_path.exists(),
                    db_path
                        .metadata()
                        .map(|m| !m.permissions().readonly())
                        .unwrap_or(false),
                )
            })?;
        tracing::info!("Database file ensured at: {}", db_path.display());
    }

    // PRAGMAs are per connection, so they go on the options every connection opens with; run on
    // the pool once, they reached a single connection and the rest flushed every commit to disk.
    // SQLite writes one at a time, so a handful of connections is plenty.
    let options = SqliteConnectOptions::from_str(db_url)?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(10))
        .pragma("cache_size", "-20000")
        .pragma("mmap_size", "268435456")
        .pragma("temp_store", "MEMORY");
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await
        .map_err(|e| {
            let db_path = extract_db_path(db_url);
            let (parent_exists, file_exists, writable) = match &db_path {
                Some(p) => (
                    p.parent().map(|d| d.exists()).unwrap_or(false),
                    p.exists(),
                    p.metadata()
                        .map(|m| !m.permissions().readonly())
                        .unwrap_or(false),
                ),
                None => (false, false, false),
            };
            anyhow::anyhow!(
                "Failed to open database: {}\n  \
                 URL: {}\n  \
                 Resolved path: {}\n  \
                 Parent dir exists: {}\n  \
                 File exists: {}\n  \
                 File writable: {}",
                e,
                db_url,
                db_path
                    .as_ref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|| "<unparseable>".into()),
                parent_exists,
                file_exists,
                writable,
            )
        })?;

    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;
    tracing::info!("Database migrations complete");
    Ok(())
}
