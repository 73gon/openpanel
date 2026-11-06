-- Story groups: a folder holding two or more series folders, one per part of a story, such as
-- JoJo's Bizarre Adventure/Part 1 …/ and Part 2 …/. Worked out from the series' paths after
-- every scan, so the folders on disk are all there is to it.
CREATE TABLE IF NOT EXISTS series_groups (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_name TEXT NOT NULL,
    UNIQUE (library_id, path)
);

ALTER TABLE series ADD COLUMN group_id TEXT REFERENCES series_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_series_group ON series(group_id);
