-- Migration: Chapter detection inside CBZ volumes

-- Track detected chapter count on books
ALTER TABLE books ADD COLUMN chapter_count INTEGER NOT NULL DEFAULT 0;

-- Chapter boundaries inside books
CREATE TABLE IF NOT EXISTS book_chapters (
    book_id        TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title          TEXT NOT NULL,
    start_page     INTEGER NOT NULL,
    end_page       INTEGER NOT NULL,
    PRIMARY KEY (book_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_book_chapters_book ON book_chapters(book_id);
