-- Migration: Remove unused guest_enabled column from admin_config
-- SQLite doesn't support DROP COLUMN before 3.35.0, so we recreate the table

CREATE TABLE admin_config_new (
    id INTEGER PRIMARY KEY,
    password_hash TEXT,
    pin_hash TEXT,
    remote_enabled INTEGER NOT NULL DEFAULT 0,
    session_timeout_min INTEGER NOT NULL DEFAULT 60
);

INSERT INTO admin_config_new (id, password_hash, pin_hash, remote_enabled, session_timeout_min)
SELECT id, password_hash, pin_hash, remote_enabled, session_timeout_min FROM admin_config;

DROP TABLE admin_config;
ALTER TABLE admin_config_new RENAME TO admin_config;
