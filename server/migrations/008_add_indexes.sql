-- Performance indexes for common query patterns

-- series sorted/filtered by sort_name (default listing order)
CREATE INDEX IF NOT EXISTS idx_series_sort_name ON series(sort_name);

-- series sorted by created_at (date added)
CREATE INDEX IF NOT EXISTS idx_series_created_at ON series(created_at);

-- series sorted/filtered by anilist year
CREATE INDEX IF NOT EXISTS idx_series_anilist_start_year ON series(anilist_start_year);

-- series sorted by anilist score
CREATE INDEX IF NOT EXISTS idx_series_anilist_score ON series(anilist_score);

-- books ordered within a series
CREATE INDEX IF NOT EXISTS idx_books_sort_order ON books(series_id, sort_order);

-- pages ordered within a book
CREATE INDEX IF NOT EXISTS idx_pages_book_number ON pages(book_id, page_number);
