use std::path::{Path, PathBuf};

/// Parsed and sorted index of image pages in a CBZ file.
#[derive(Clone, Debug)]
pub struct ZipIndex {
    #[allow(dead_code)]
    pub book_path: PathBuf,
    pub pages: Vec<PageEntry>,
}

#[derive(Clone, Debug)]
pub struct PageEntry {
    pub entry_name: String,
    pub local_header_offset: u64,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub compression_method: u16,
    #[allow(dead_code)]
    pub crc32: u32,
}

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif"];

pub(crate) fn is_image_file(name: &str) -> bool {
    if let Some(ext) = name.rsplit('.').next() {
        IMAGE_EXTS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

/// Refuses a file that isn't a whole ZIP archive, saying what it is instead, from its first
/// bytes and its last 64 KB. Without this, the zip crate looks for the archive's directory
/// through the whole file, which takes many seconds for a large RAR on a hard drive.
fn check_is_zip(file: &mut std::fs::File) -> Result<(), anyhow::Error> {
    use std::io::{Read, Seek, SeekFrom};

    let mut magic = [0u8; 8];
    let n = file.read(&mut magic)?;
    let magic = &magic[..n];
    if magic.starts_with(b"Rar!\x1a\x07") {
        anyhow::bail!("This is a RAR archive, and OpenPanel reads only ZIP archives (CBZ)");
    }
    if magic.starts_with(b"7z\xbc\xaf\x27\x1c") {
        anyhow::bail!("This is a 7z archive, and OpenPanel reads only ZIP archives (CBZ)");
    }
    if !magic.starts_with(b"PK") {
        anyhow::bail!("This isn't a ZIP, RAR or 7z archive");
    }

    // The end of central directory record sits in the last 22 bytes, or before a comment of
    // at most 64 KB
    let len = file.seek(SeekFrom::End(0))?;
    let tail_len = len.min(22 + 65_535);
    file.seek(SeekFrom::Start(len - tail_len))?;
    let mut tail = Vec::with_capacity(tail_len as usize);
    file.take(tail_len).read_to_end(&mut tail)?;
    if !tail.windows(4).any(|w| w == b"PK\x05\x06") {
        anyhow::bail!("The archive is cut short (it has no ending), so it may still be copying");
    }
    file.seek(SeekFrom::Start(0))?;
    Ok(())
}

impl ZipIndex {
    /// Parse the ZIP central directory, filter to image entries, sort naturally.
    pub fn from_file(path: &Path) -> Result<Self, anyhow::Error> {
        let mut file = std::fs::File::open(path)?;
        check_is_zip(&mut file)?;
        let mut archive = zip::ZipArchive::new(file)?;

        let mut pages: Vec<PageEntry> = Vec::new();

        for i in 0..archive.len() {
            let entry = archive.by_index_raw(i)?;
            let name = entry.name().to_string();

            if entry.is_dir() {
                continue;
            }
            if !is_image_file(&name) {
                continue;
            }

            pages.push(PageEntry {
                entry_name: name,
                local_header_offset: entry.header_start(),
                compressed_size: entry.compressed_size(),
                uncompressed_size: entry.size(),
                compression_method: compression_to_u16(entry.compression()),
                crc32: entry.crc32(),
            });
        }

        // Natural sort by filename
        pages.sort_by(|a, b| natord::compare(&a.entry_name, &b.entry_name));

        Ok(ZipIndex {
            book_path: path.to_path_buf(),
            pages,
        })
    }

    /// Read a single page's image data from the ZIP using pre-computed offset. A page is at most
    /// `MAX_PAGE_BYTES`, whatever its header claims: a zip bomb is refused, not inflated.
    pub fn read_page_data(path: &Path, entry: &PageEntry) -> Result<Vec<u8>, anyhow::Error> {
        let mut file = std::fs::File::open(path)?;
        read_entry(&mut file, entry, MAX_PAGE_BYTES, true)
    }

    /// Every page's width and height, from the start of each image: the header is in its first
    /// few kilobytes, so a book is read once, a little of each page, and nothing is decoded.
    /// A page whose size isn't near the start (a JPEG with a large profile) is read whole.
    pub fn read_dimensions(path: &Path, pages: &[PageEntry]) -> Vec<Option<(u32, u32)>> {
        let Ok(mut file) = std::fs::File::open(path) else {
            return vec![None; pages.len()];
        };
        pages
            .iter()
            .map(|page| {
                let size = |data: &[u8]| {
                    image::ImageReader::new(std::io::Cursor::new(data))
                        .with_guessed_format()
                        .ok()?
                        .into_dimensions()
                        .ok()
                };
                let head = read_entry(&mut file, page, HEADER_BYTES, false).ok()?;
                size(&head).or_else(|| {
                    let whole = read_entry(&mut file, page, MAX_PAGE_BYTES, true).ok()?;
                    size(&whole)
                })
            })
            .collect()
    }
}

/// The largest page served or read. Real pages are a few megabytes; even a 600 dpi scan is far
/// below this.
pub const MAX_PAGE_BYTES: u64 = 256 * 1024 * 1024;
/// How much of a page is read to find its dimensions.
const HEADER_BYTES: u64 = 256 * 1024;

/// An entry's data, at most `limit` bytes. With `whole`, an entry larger than the limit is an
/// error; without, it is cut at the limit.
fn read_entry(
    file: &mut std::fs::File,
    entry: &PageEntry,
    limit: u64,
    whole: bool,
) -> Result<Vec<u8>, anyhow::Error> {
    use std::io::{BufReader, Read, Seek, SeekFrom};

    let too_large = || {
        anyhow::anyhow!(
            "Page {} is larger than {} MB",
            entry.entry_name,
            MAX_PAGE_BYTES >> 20
        )
    };
    if whole
        && (entry.uncompressed_size > limit
            || (entry.compression_method == 0 && entry.compressed_size > limit))
    {
        return Err(too_large());
    }

    // Seek to the local file header (30 bytes fixed), past its name and extra field
    file.seek(SeekFrom::Start(entry.local_header_offset))?;
    let mut header_buf = [0u8; 30];
    file.read_exact(&mut header_buf)?;
    let fname_len = u16::from_le_bytes([header_buf[26], header_buf[27]]) as u64;
    let extra_len = u16::from_le_bytes([header_buf[28], header_buf[29]]) as u64;
    file.seek(SeekFrom::Start(
        entry.local_header_offset + 30 + fname_len + extra_len,
    ))?;
    let compressed = (&mut *file).take(entry.compressed_size);

    // One byte past the limit tells an entry that is too large from one that just fits
    let mut data = Vec::with_capacity(entry.uncompressed_size.min(limit) as usize);
    match entry.compression_method {
        0 => compressed.take(limit + 1).read_to_end(&mut data)?,
        8 => flate2::read::DeflateDecoder::new(BufReader::new(compressed))
            .take(limit + 1)
            .read_to_end(&mut data)?,
        method => {
            return Err(anyhow::anyhow!(
                "Unsupported compression method: {}",
                method
            ))
        }
    };
    if data.len() as u64 > limit {
        if whole {
            return Err(too_large());
        }
        data.truncate(limit as usize);
    }
    if whole && entry.compression_method == 0 && (data.len() as u64) < entry.compressed_size {
        return Err(anyhow::anyhow!("Page {} is cut short", entry.entry_name));
    }
    Ok(data)
}

fn compression_to_u16(c: zip::CompressionMethod) -> u16 {
    match c {
        zip::CompressionMethod::Stored => 0,
        zip::CompressionMethod::Deflated => 8,
        _ => 99,
    }
}

/// Detect content type from filename extension
pub fn content_type_for_entry(entry_name: &str) -> &'static str {
    match entry_name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── read_entry / read_dimensions ──

    /// A CBZ with one stored and one deflated page: a 3 × 2 PNG, then 5,000 zeros.
    fn sample_book(dir: &Path) -> (PathBuf, Vec<PageEntry>) {
        use std::io::Write;
        let mut png = Vec::new();
        image::RgbImage::new(3, 2)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let path = dir.join("book.cbz");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        let deflated = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("001.png", stored).unwrap();
        zip.write_all(&png).unwrap();
        zip.start_file("002.jpg", deflated).unwrap();
        zip.write_all(&[0u8; 5000]).unwrap();
        zip.finish().unwrap();
        let pages = ZipIndex::from_file(&path).unwrap().pages;
        (path, pages)
    }

    #[test]
    fn a_page_larger_than_the_limit_is_refused_not_inflated() {
        let dir = tempfile::tempdir().unwrap();
        let (path, pages) = sample_book(dir.path());
        let mut file = std::fs::File::open(&path).unwrap();
        assert_eq!(
            read_entry(&mut file, &pages[1], 10_000, true)
                .unwrap()
                .len(),
            5000
        );
        assert!(read_entry(&mut file, &pages[1], 1000, true).is_err());
        // Its start can still be read, as the dimensions are
        assert_eq!(
            read_entry(&mut file, &pages[1], 1000, false).unwrap().len(),
            1000
        );
        // A header that lies about the size is caught by the reading, not trusted
        let mut liar = pages[1].clone();
        liar.uncompressed_size = 10;
        assert!(read_entry(&mut file, &liar, 1000, true).is_err());
    }

    #[test]
    fn dimensions_come_from_the_start_of_each_page() {
        let dir = tempfile::tempdir().unwrap();
        let (path, pages) = sample_book(dir.path());
        let dims = ZipIndex::read_dimensions(&path, &pages);
        assert_eq!(dims, vec![Some((3, 2)), None]);
    }

    #[test]
    fn archives_that_arent_whole_zips_are_named() {
        let dir = tempfile::tempdir().unwrap();
        let (book, _) = sample_book(dir.path());
        let whole = std::fs::read(&book).unwrap();
        let error_for = |name: &str, bytes: &[u8]| {
            let path = dir.path().join(name);
            std::fs::write(&path, bytes).unwrap();
            ZipIndex::from_file(&path).unwrap_err().to_string()
        };

        assert!(error_for("a.cbr", b"Rar!\x1a\x07\x01\x00rest").contains("RAR"));
        assert!(error_for("b.cbz", b"7z\xbc\xaf\x27\x1c\x00\x04").contains("7z"));
        assert!(error_for("c.cbz", b"<html>").contains("isn't a ZIP"));
        assert!(error_for("d.cbz", &whole[..whole.len() / 2]).contains("cut short"));
    }

    // ── is_image_file ──

    #[test]
    fn recognises_standard_image_extensions() {
        assert!(is_image_file("page.jpg"));
        assert!(is_image_file("page.jpeg"));
        assert!(is_image_file("page.png"));
        assert!(is_image_file("page.webp"));
        assert!(is_image_file("page.gif"));
        assert!(is_image_file("page.avif"));
    }

    #[test]
    fn case_insensitive_image_check() {
        assert!(is_image_file("page.JPG"));
        assert!(is_image_file("page.Png"));
        assert!(is_image_file("page.WEBP"));
    }

    #[test]
    fn rejects_non_image_files() {
        assert!(!is_image_file("metadata.xml"));
        assert!(!is_image_file("readme.txt"));
        assert!(!is_image_file("ComicInfo.xml"));
        assert!(!is_image_file("Thumbs.db"));
    }

    #[test]
    fn no_extension_returns_false() {
        assert!(!is_image_file("noext"));
        assert!(!is_image_file(""));
    }

    // ── content_type_for_entry ──

    #[test]
    fn content_type_standard_images() {
        assert_eq!(content_type_for_entry("page.jpg"), "image/jpeg");
        assert_eq!(content_type_for_entry("page.jpeg"), "image/jpeg");
        assert_eq!(content_type_for_entry("page.png"), "image/png");
        assert_eq!(content_type_for_entry("page.webp"), "image/webp");
        assert_eq!(content_type_for_entry("page.gif"), "image/gif");
        assert_eq!(content_type_for_entry("page.avif"), "image/avif");
    }

    #[test]
    fn content_type_case_insensitive() {
        assert_eq!(content_type_for_entry("page.JPG"), "image/jpeg");
        assert_eq!(content_type_for_entry("page.PNG"), "image/png");
    }

    #[test]
    fn content_type_unknown_fallback() {
        assert_eq!(
            content_type_for_entry("data.bin"),
            "application/octet-stream"
        );
        assert_eq!(content_type_for_entry("noext"), "application/octet-stream");
    }

    #[test]
    fn content_type_nested_path() {
        assert_eq!(content_type_for_entry("Chapter 01/page.jpg"), "image/jpeg");
    }
}
