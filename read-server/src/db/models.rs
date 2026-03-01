use serde::{Deserialize, Serialize};

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
