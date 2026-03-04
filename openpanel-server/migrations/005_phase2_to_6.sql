-- Migration 005: Phases 2-6 schema changes
-- Phase 2: Profile-based authentication
-- Phase 3: Bookmarks
-- Phase 4: Collections
-- Phase 6: Admin logs, backups

-- ── Phase 2: Profile-based auth ──
-- Add password_hash to profiles (replaces admin_config password)
ALTER TABLE profiles ADD COLUMN password_hash TEXT;

-- ── Phase 3: Bookmarks ──
CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    page INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, book_id, page),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_profile ON bookmarks(profile_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);

-- ── Phase 4: Collections ──
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, name),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_items (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    series_id TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, series_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collections_profile ON collections(profile_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id);

-- ── Phase 6: Admin logs ──
CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL DEFAULT 'info',
    category TEXT NOT NULL DEFAULT 'system',
    message TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_level ON admin_logs(level);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_category ON admin_logs(category);

-- Continue reading index (for server-side continue reading queries)
CREATE INDEX IF NOT EXISTS idx_reading_progress_updated ON reading_progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_progress_profile_updated ON reading_progress(profile_id, updated_at DESC);
