-- Migration: initial schema
-- Enable WAL mode for concurrent reads
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

------------------------------------------------------------
-- LIBRARIES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libraries (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

------------------------------------------------------------
-- SERIES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS series (
    id          TEXT PRIMARY KEY,
    library_id  TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    sort_name   TEXT NOT NULL,
    thumb_book_id TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(library_id, path)
);
CREATE INDEX IF NOT EXISTS idx_series_library ON series(library_id);

------------------------------------------------------------
-- BOOKS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
    id              TEXT PRIMARY KEY,
    series_id       TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    filename        TEXT NOT NULL,
    path            TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    file_mtime      TEXT NOT NULL,
    page_count      INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    meta_title      TEXT,
    meta_writer     TEXT,
    meta_summary    TEXT,
    meta_year       INTEGER,
    meta_number     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(series_id, path)
);
CREATE INDEX IF NOT EXISTS idx_books_series ON books(series_id);

------------------------------------------------------------
-- PAGES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
    book_id         TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    entry_name      TEXT NOT NULL,
    entry_offset    INTEGER NOT NULL,
    compressed_size INTEGER NOT NULL,
    uncompressed_size INTEGER NOT NULL,
    compression     INTEGER NOT NULL DEFAULT 0,
    width           INTEGER,
    height          INTEGER,
    PRIMARY KEY (book_id, page_number)
);

------------------------------------------------------------
-- PROFILES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    avatar_url  TEXT,
    pin_hash    TEXT,
    is_admin    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

------------------------------------------------------------
-- DEVICES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id              TEXT PRIMARY KEY,
    device_fingerprint TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    last_seen_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

------------------------------------------------------------
-- READING PROGRESS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reading_progress (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL DEFAULT 0,
    is_completed INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_progress_profile ON reading_progress(profile_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON reading_progress(book_id);
CREATE INDEX IF NOT EXISTS idx_progress_device_book ON reading_progress(device_id, book_id);
CREATE INDEX IF NOT EXISTS idx_progress_profile_book ON reading_progress(profile_id, book_id);

------------------------------------------------------------
-- SESSIONS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
    token       TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

------------------------------------------------------------
-- ADMIN CONFIG & SESSIONS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_config (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash   TEXT,
    pin_hash        TEXT,
    remote_enabled  INTEGER NOT NULL DEFAULT 0,
    session_timeout_min INTEGER NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id          TEXT PRIMARY KEY,
    token       TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);

------------------------------------------------------------
-- SETTINGS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed defaults
INSERT OR IGNORE INTO admin_config (id, session_timeout_min) VALUES (1, 15);
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('scan_on_startup', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('thumbnail_quality', '80');
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('thumbnail_width', '300');
