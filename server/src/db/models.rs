use serde::{Deserialize, Serialize};

// ══════════════════════════════════════════════
//  Full table models
// ══════════════════════════════════════════════

// ── Library ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Library {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── Series ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Series {
    pub id: String,
    pub library_id: String,
    pub name: String,
    pub path: String,
    pub sort_name: String,
    pub thumb_book_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // AniList metadata
    pub anilist_id: Option<i64>,
    pub anilist_id_source: Option<String>,
    pub anilist_title_english: Option<String>,
    pub anilist_title_romaji: Option<String>,
    pub anilist_description: Option<String>,
    pub anilist_cover_url: Option<String>,
    pub anilist_banner_url: Option<String>,
    pub anilist_genres: Option<String>,
    pub anilist_status: Option<String>,
    pub anilist_chapters: Option<i64>,
    pub anilist_volumes: Option<i64>,
    pub anilist_score: Option<i64>,
    pub anilist_author: Option<String>,
    pub anilist_start_year: Option<i64>,
    pub anilist_end_year: Option<i64>,
    pub anilist_updated_at: Option<String>,
}

// ── Book ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Book {
    pub id: String,
    pub series_id: String,
    pub title: String,
    pub filename: String,
    pub path: String,
    pub file_size: i64,
    pub file_mtime: String,
    pub page_count: i32,
    pub sort_order: i32,
    pub meta_title: Option<String>,
    pub meta_writer: Option<String>,
    pub meta_summary: Option<String>,
    pub meta_year: Option<i32>,
    pub meta_number: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Page ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Page {
    pub book_id: String,
    pub page_number: i32,
    pub entry_name: String,
    pub entry_offset: i64,
    pub compressed_size: i64,
    pub uncompressed_size: i64,
    pub compression: i32,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

// ── Profile ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub pin_hash: Option<String>,
    pub is_admin: i32,
    pub created_at: String,
}

// ── Device ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Device {
    pub id: String,
    pub device_fingerprint: String,
    pub display_name: Option<String>,
    pub last_seen_at: String,
}

// ── Reading Progress ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct ReadingProgress {
    pub id: String,
    pub profile_id: Option<String>,
    pub device_id: Option<String>,
    pub book_id: String,
    pub page_number: i32,
    pub is_completed: i32,
    pub updated_at: String,
}

// ── Session ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Session {
    pub id: String,
    pub profile_id: Option<String>,
    pub device_id: Option<String>,
    pub token: String,
    pub created_at: String,
    pub expires_at: String,
}

// ── Admin Session ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct AdminSession {
    pub id: String,
    pub token: String,
    pub created_at: String,
    pub expires_at: String,
}

// ── Admin Config ──

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct AdminConfig {
    pub id: i32,
    pub password_hash: Option<String>,
    pub pin_hash: Option<String>,
    pub remote_enabled: i32,
    pub session_timeout_min: i32,
}

// ══════════════════════════════════════════════
//  Query view structs (subset-of-columns projections)
// ══════════════════════════════════════════════

/// Row returned by the series listing queries (library.rs).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SeriesRow {
    pub id: String,
    pub name: String,
    pub book_count: i64,
    pub book_type: Option<String>,
    pub anilist_cover_url: Option<String>,
    pub anilist_score: Option<i64>,
    pub anilist_id: Option<i64>,
}

/// Row returned by page + book + library join for reading/thumbnails.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PageDataRow {
    pub book_path: String,
    pub lib_path: String,
    pub file_mtime: String,
    pub entry_name: String,
    pub entry_offset: i64,
    pub compressed_size: i64,
    pub uncompressed_size: i64,
    pub compression: i32,
}

/// Row returned by the page manifest query.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PageManifestRow {
    pub page_number: i32,
    pub entry_name: String,
    pub compressed_size: i64,
    pub uncompressed_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

/// Row returned by book download query.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct BookDownloadRow {
    pub book_path: String,
    pub lib_path: String,
    pub filename: String,
    pub file_size: i64,
}

/// Row returned by book detail join.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct BookDetailRow {
    pub id: String,
    pub title: String,
    pub series_id: String,
    pub series_name: String,
    pub page_count: i32,
    pub file_size: i64,
    pub meta_writer: Option<String>,
    pub meta_year: Option<i32>,
    pub meta_summary: Option<String>,
}

/// Row returned by series metadata query.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SeriesMetadataRow {
    pub anilist_id: Option<i64>,
    pub anilist_id_source: Option<String>,
    pub anilist_title_english: Option<String>,
    pub anilist_title_romaji: Option<String>,
    pub anilist_description: Option<String>,
    pub anilist_cover_url: Option<String>,
    pub anilist_banner_url: Option<String>,
    pub anilist_genres: Option<String>,
    pub anilist_status: Option<String>,
    pub anilist_chapters: Option<i64>,
    pub anilist_volumes: Option<i64>,
    pub anilist_score: Option<i64>,
    pub anilist_author: Option<String>,
    pub anilist_start_year: Option<i64>,
    pub anilist_end_year: Option<i64>,
}

/// Row returned by admin log queries.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LogRow {
    pub id: i64,
    pub level: String,
    pub category: String,
    pub message: String,
    pub details: Option<String>,
    pub created_at: String,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub request_duration_ms: Option<i64>,
    pub request_id: Option<String>,
}

/// Row returned by auth session join.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SessionAuthRow {
    pub id: String,
    pub name: String,
    pub is_admin: bool,
    pub expires_at: String,
}

/// Row returned by login profile lookup.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LoginRow {
    pub id: String,
    pub name: String,
    pub password_hash: Option<String>,
    pub is_admin: bool,
}
