-- Enhanced logging: add structured fields to admin_logs

ALTER TABLE admin_logs ADD COLUMN profile_id TEXT;
ALTER TABLE admin_logs ADD COLUMN profile_name TEXT;
ALTER TABLE admin_logs ADD COLUMN ip_address TEXT;
ALTER TABLE admin_logs ADD COLUMN user_agent TEXT;
ALTER TABLE admin_logs ADD COLUMN request_duration_ms INTEGER;
ALTER TABLE admin_logs ADD COLUMN request_id TEXT;

-- Index for filtering by profile and IP
CREATE INDEX IF NOT EXISTS idx_admin_logs_profile ON admin_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_ip ON admin_logs(ip_address);
