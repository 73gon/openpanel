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

fn is_image_file(name: &str) -> bool {
    if let Some(ext) = name.rsplit('.').next() {
        IMAGE_EXTS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

impl ZipIndex {
    /// Parse the ZIP central directory, filter to image entries, sort naturally.
    pub fn from_file(path: &Path) -> Result<Self, anyhow::Error> {
        let file = std::fs::File::open(path)?;
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

    /// Read a single page's image data from the ZIP using pre-computed offset.
    pub fn read_page_data(path: &Path, entry: &PageEntry) -> Result<Vec<u8>, anyhow::Error> {
        use std::io::{Read, Seek, SeekFrom};

        let mut file = std::fs::File::open(path)?;

        // Seek to the local file header
        file.seek(SeekFrom::Start(entry.local_header_offset))?;

        // Read local file header (30 bytes fixed)
        let mut header_buf = [0u8; 30];
        file.read_exact(&mut header_buf)?;

        let fname_len = u16::from_le_bytes([header_buf[26], header_buf[27]]) as u64;
        let extra_len = u16::from_le_bytes([header_buf[28], header_buf[29]]) as u64;
        let data_offset = entry.local_header_offset + 30 + fname_len + extra_len;

        file.seek(SeekFrom::Start(data_offset))?;

        // Read the compressed data
        let mut data = vec![0u8; entry.compressed_size as usize];
        file.read_exact(&mut data)?;

        // Decompress if needed
        if entry.compression_method == 0 {
            // STORE — raw bytes
            Ok(data)
        } else if entry.compression_method == 8 {
            // DEFLATE
            use flate2::read::DeflateDecoder;
            let mut decoder = DeflateDecoder::new(&data[..]);
            let mut decompressed = Vec::with_capacity(entry.uncompressed_size as usize);
            decoder.read_to_end(&mut decompressed)?;
            Ok(decompressed)
        } else {
            Err(anyhow::anyhow!(
                "Unsupported compression method: {}",
                entry.compression_method
            ))
        }
    }

    /// Extract image dimensions (width, height) for a page without decoding the full image.
    /// Returns `None` if the format cannot be determined or the header is unreadable.
    pub fn read_page_dimensions(path: &Path, entry: &PageEntry) -> Option<(u32, u32)> {
        let data = Self::read_page_data(path, entry).ok()?;
        let cursor = std::io::Cursor::new(&data);
        let reader = image::ImageReader::new(cursor).with_guessed_format().ok()?;
        reader.into_dimensions().ok()
    }
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
        assert_eq!(content_type_for_entry("data.bin"), "application/octet-stream");
        assert_eq!(content_type_for_entry("noext"), "application/octet-stream");
    }

    #[test]
    fn content_type_nested_path() {
        assert_eq!(content_type_for_entry("Chapter 01/page.jpg"), "image/jpeg");
    }
}
