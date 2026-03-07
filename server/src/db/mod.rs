pub mod models;

use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;

pub async fn init_pool(db_url: &str, data_dir: &Path) -> anyhow::Result<SqlitePool> {
    // Ensure data directory exists
    tokio::fs::create_dir_all(data_dir).await?;

    let pool = SqlitePoolOptions::new()
        .max_connections(20)
        .connect(db_url)
        .await?;

    // Enable WAL, foreign keys, and performance PRAGMAs
    sqlx::query("PRAGMA journal_mode = WAL;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA synchronous = NORMAL;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA cache_size = -20000;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA mmap_size = 268435456;")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA temp_store = MEMORY;")
        .execute(&pool)
        .await?;

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
