-- Where in an EPUB the reader is: the app's own position in the text, finer than a page
ALTER TABLE reading_progress ADD COLUMN locator TEXT;

-- EPUBs were listed without their details, cover or length; the next scan reads them again
UPDATE books SET file_mtime = '' WHERE format = 'epub';
