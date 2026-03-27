-- Phase 5 & 6 schema changes

-- Book format tracking (cbz, cbr, pdf, epub)
ALTER TABLE books ADD COLUMN format TEXT NOT NULL DEFAULT 'cbz';

-- Auto-scan interval (0 = disabled)
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_scan_interval_min', '0');

-- Scheduled backup interval (0 = disabled)
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_backup_interval_hours', '0');

-- Reading statistics (daily aggregates per profile)
CREATE TABLE IF NOT EXISTS reading_stats (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL,
    date        TEXT NOT NULL, -- YYYY-MM-DD
    pages_read  INTEGER NOT NULL DEFAULT 0,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    books_completed INTEGER NOT NULL DEFAULT 0,
    UNIQUE(profile_id, date),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reading_stats_profile ON reading_stats(profile_id);
CREATE INDEX IF NOT EXISTS idx_reading_stats_date ON reading_stats(date);
