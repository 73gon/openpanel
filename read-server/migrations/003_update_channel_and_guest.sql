-- Migration: update channel setting + guest access toggle

-- Update channel preference (stable / nightly)
INSERT OR IGNORE INTO settings (key, value) VALUES ('update_channel', 'stable');

-- Guest access toggle (1 = enabled, default on for backwards compat)
ALTER TABLE admin_config ADD COLUMN guest_enabled INTEGER NOT NULL DEFAULT 1;
