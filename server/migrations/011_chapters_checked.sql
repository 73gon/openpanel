-- Whether chapter detection has run on a book's current file. Before this, a book without
-- chapters looked the same as one never checked, so every scan reopened it.
ALTER TABLE books ADD COLUMN chapters_checked INTEGER NOT NULL DEFAULT 0;

-- Books with chapters were checked; PDF and EPUB books have nothing to check.
UPDATE books SET chapters_checked = 1 WHERE chapter_count > 0 OR format IN ('pdf', 'epub');
