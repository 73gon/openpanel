-- Files the scanner couldn't read, with the size and time they had then, so an unchanged
-- broken file isn't reopened by every scan
CREATE TABLE IF NOT EXISTS scan_failures (
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_mtime TEXT NOT NULL,
    error TEXT NOT NULL,
    failed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (library_id, path)
);

-- When AniList was last asked about a series it had no match for
ALTER TABLE series ADD COLUMN anilist_checked_at TEXT;
