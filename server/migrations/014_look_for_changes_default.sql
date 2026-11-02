-- Migration 010 wrote "0" (off) as the automatic scan interval into every database, so a server
-- only noticed new files once someone turned scanning on. Looking for changes is cheap now (a
-- walk of the library folders, and a scan only when something changed), so without that row a
-- server looks every five minutes. An "off" that an administrator chose, as the log still shows,
-- is kept.
DELETE FROM settings
WHERE key = 'auto_scan_interval_min'
  AND value = '0'
  AND NOT EXISTS (
    SELECT 1 FROM admin_logs
    WHERE category = 'settings' AND message LIKE '%automatic scans off%'
  );
