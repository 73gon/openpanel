-- Migration: performance indexes + user preferences table

------------------------------------------------------------
-- DEDUPLICATE reading_progress before adding unique indexes
-- Keep only the most-recently-updated row per (profile_id, book_id)
------------------------------------------------------------
DELETE FROM reading_progress
WHERE id NOT IN (
    SELECT id FROM reading_progress rp1
    WHERE profile_id IS NOT NULL
      AND updated_at = (
          SELECT MAX(rp2.updated_at)
          FROM reading_progress rp2
          WHERE rp2.profile_id = rp1.profile_id
            AND rp2.book_id = rp1.book_id
      )
    UNION
    SELECT id FROM reading_progress rp1
    WHERE profile_id IS NULL
      AND device_id IS NOT NULL
      AND updated_at = (
          SELECT MAX(rp2.updated_at)
          FROM reading_progress rp2
          WHERE rp2.device_id = rp1.device_id
            AND rp2.book_id = rp1.book_id
            AND rp2.profile_id IS NULL
      )
    UNION
    SELECT id FROM reading_progress
    WHERE profile_id IS NULL AND device_id IS NULL
);

------------------------------------------------------------
-- UNIQUE INDEXES for upsert support on reading_progress
------------------------------------------------------------
DROP INDEX IF EXISTS idx_progress_profile_book;
DROP INDEX IF EXISTS idx_progress_device_book;

CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_profile_book
    ON reading_progress(profile_id, book_id) WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_device_book
    ON reading_progress(device_id, book_id) WHERE profile_id IS NULL AND device_id IS NOT NULL;

------------------------------------------------------------
-- Missing index on books.path for scanner lookups
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_books_path ON books(path);

------------------------------------------------------------
-- USER PREFERENCES (synced across devices)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    device_id       TEXT REFERENCES devices(id) ON DELETE SET NULL,
    preferences     TEXT NOT NULL DEFAULT '{}',
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(profile_id),
    UNIQUE(device_id)
);
