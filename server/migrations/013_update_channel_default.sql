-- Migration 003 wrote "stable" as the update channel into every database, so a nightly build
-- never followed its own channel: offered nothing newer than the last stable release, it stayed
-- where it was. Without that row the channel defaults to the one the build came from. A
-- "nightly" chosen in Administration is kept.
DELETE FROM settings WHERE key = 'update_channel' AND value = 'stable';
