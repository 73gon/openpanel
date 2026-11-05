-- RAR and 7z books are read now: try the files that failed for being one again
DELETE FROM scan_failures WHERE error LIKE 'This is a RAR archive%' OR error LIKE 'This is a 7z archive%';
