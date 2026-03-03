-- Migration: Add AniList metadata columns to series table

ALTER TABLE series ADD COLUMN anilist_id INTEGER;
ALTER TABLE series ADD COLUMN anilist_id_source TEXT;  -- 'manual', 'folder', 'auto'
ALTER TABLE series ADD COLUMN anilist_title_english TEXT;
ALTER TABLE series ADD COLUMN anilist_title_romaji TEXT;
ALTER TABLE series ADD COLUMN anilist_description TEXT;
ALTER TABLE series ADD COLUMN anilist_cover_url TEXT;
ALTER TABLE series ADD COLUMN anilist_banner_url TEXT;
ALTER TABLE series ADD COLUMN anilist_genres TEXT;      -- JSON array as string
ALTER TABLE series ADD COLUMN anilist_status TEXT;
ALTER TABLE series ADD COLUMN anilist_chapters INTEGER;
ALTER TABLE series ADD COLUMN anilist_volumes INTEGER;
ALTER TABLE series ADD COLUMN anilist_score INTEGER;
ALTER TABLE series ADD COLUMN anilist_author TEXT;
ALTER TABLE series ADD COLUMN anilist_start_year INTEGER;
ALTER TABLE series ADD COLUMN anilist_end_year INTEGER;
ALTER TABLE series ADD COLUMN anilist_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_series_anilist_id ON series(anilist_id);
