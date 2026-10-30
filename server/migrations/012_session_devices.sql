-- The device behind each session and when it was last used, so people can see where they're
-- signed in and sign a device out. last_seen_at is SQLite time (UTC), written at most every few
-- minutes; older sessions fill these in on their next request.
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id);
