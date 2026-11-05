//! RAR and 7z books. A ZIP is read in place, a page at a time, from offsets found at scan time.
//! RAR and 7z can't do that: a solid archive decodes from its start to reach any page. So a scan
//! only lists their pages, and the first time a book is read it is unpacked once into a plain
//! ZIP in the cache, which is then read like any other.

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::index::{is_image_file, PageEntry, ZipIndex, MAX_PAGE_BYTES};

/// What a book file really is, from its first bytes; the extension often says otherwise.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Zip,
    Rar,
    SevenZ,
    Other,
}

impl Kind {
    /// The `books.format` of a book of this kind that has to be unpacked to be read.
    pub fn format(self) -> Option<&'static str> {
        match self {
            Kind::Rar => Some("rar"),
            Kind::SevenZ => Some("7z"),
            Kind::Zip | Kind::Other => None,
        }
    }

    pub fn from_format(format: &str) -> Option<Kind> {
        match format {
            "rar" => Some(Kind::Rar),
            "7z" => Some(Kind::SevenZ),
            _ => None,
        }
    }
}

pub fn sniff(path: &Path) -> std::io::Result<Kind> {
    let mut magic = [0u8; 8];
    let n = std::fs::File::open(path)?.read(&mut magic)?;
    let magic = &magic[..n];
    Ok(if magic.starts_with(b"PK") {
        Kind::Zip
    } else if magic.starts_with(b"Rar!\x1a\x07") {
        Kind::Rar
    } else if magic.starts_with(b"7z\xbc\xaf\x27\x1c") {
        Kind::SevenZ
    } else {
        Kind::Other
    })
}

/// The pages of a RAR or 7z book, in reading order, as a ZipIndex whose entries carry only
/// names and sizes: there are no offsets to read them by.
pub fn list_pages(path: &Path, kind: Kind) -> anyhow::Result<ZipIndex> {
    list_entries(path, kind).map_err(|e| {
        let what = if kind == Kind::Rar { "RAR" } else { "7z" };
        anyhow::anyhow!("This {what} archive couldn't be read ({e}); it may be damaged")
    })
}

fn list_entries(path: &Path, kind: Kind) -> anyhow::Result<ZipIndex> {
    let mut seen = HashSet::new();
    let mut pages: Vec<PageEntry> = Vec::new();
    let mut add = |name: String, size: u64| {
        if is_image_file(&name) && seen.insert(name.clone()) {
            pages.push(PageEntry {
                entry_name: name,
                local_header_offset: 0,
                compressed_size: size,
                uncompressed_size: size,
                compression_method: UNPACK_FIRST,
                crc32: 0,
            });
        }
    };
    match kind {
        Kind::Rar => {
            let archive = unrar::Archive::new(path).open_for_listing()?;
            for header in archive {
                let header = header?;
                if header.is_file() {
                    add(entry_name(&header.filename), header.unpacked_size);
                }
            }
        }
        Kind::SevenZ => {
            let archive = sevenz_rust2::Archive::open(path)?;
            for entry in &archive.files {
                if !entry.is_directory {
                    add(entry.name.replace('\\', "/"), entry.size);
                }
            }
        }
        Kind::Zip | Kind::Other => anyhow::bail!("Not a RAR or 7z archive"),
    }
    pages.sort_by(|a, b| natord::compare(&a.entry_name, &b.entry_name));
    Ok(ZipIndex {
        book_path: path.to_path_buf(),
        pages,
    })
}

/// The compression of a page that can only be read once its book is unpacked.
pub const UNPACK_FIRST: u16 = 0xFFFF;

/// One page, decoded from the archive: for a cover, without unpacking the whole book.
pub fn extract_page(path: &Path, kind: Kind, name: &str) -> anyhow::Result<Vec<u8>> {
    let mut found = None;
    each_page(
        path,
        kind,
        |entry, data| {
            if entry == name {
                found = Some(data);
                return Ok(false);
            }
            Ok(true)
        },
        |entry| entry == name,
    )?;
    found.ok_or_else(|| anyhow::anyhow!("Page {} isn't in the archive", name))
}

/// Unpacks every page of the archive at `path` into a ZIP at `dest` (stored, since images don't
/// compress), written beside it first and then moved into place.
pub fn unpack_to_zip(path: &Path, kind: Kind, dest: &Path) -> anyhow::Result<()> {
    let partial = dest.with_extension("partial");
    let result = (|| {
        let mut zip =
            zip::ZipWriter::new(std::io::BufWriter::new(std::fs::File::create(&partial)?));
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        let mut written = HashSet::new();
        let mut total: u64 = 0;
        each_page(
            path,
            kind,
            |name, data| {
                total += data.len() as u64;
                if total > MAX_BOOK_BYTES {
                    anyhow::bail!("The book unpacks to more than {} GB", MAX_BOOK_BYTES >> 30);
                }
                if written.insert(name.to_string()) {
                    zip.start_file(name, stored)?;
                    zip.write_all(&data)?;
                }
                Ok(true)
            },
            is_image_file,
        )?;
        zip.finish()?.flush()?;
        std::fs::rename(&partial, dest)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    result
}

/// At most this much, unpacked, per book.
const MAX_BOOK_BYTES: u64 = 8 << 30;

/// Decodes the archive's entries in their stored order, handing each one `wanted` accepts to
/// `each` until it returns false. Each entry is at most MAX_PAGE_BYTES.
fn each_page(
    path: &Path,
    kind: Kind,
    mut each: impl FnMut(&str, Vec<u8>) -> anyhow::Result<bool>,
    wanted: impl Fn(&str) -> bool,
) -> anyhow::Result<()> {
    match kind {
        Kind::Rar => {
            let mut archive = unrar::Archive::new(path).open_for_processing()?;
            while let Some(header) = archive.read_header()? {
                let entry = header.entry();
                let name = entry_name(&entry.filename);
                if !entry.is_file() || !wanted(&name) {
                    archive = header.skip()?;
                    continue;
                }
                if entry.unpacked_size > MAX_PAGE_BYTES {
                    anyhow::bail!("Page {} is larger than {} MB", name, MAX_PAGE_BYTES >> 20);
                }
                let (data, next) = header.read()?;
                if !each(&name, data)? {
                    return Ok(());
                }
                archive = next;
            }
            Ok(())
        }
        Kind::SevenZ => {
            let mut reader =
                sevenz_rust2::ArchiveReader::open(path, sevenz_rust2::Password::empty())?;
            let mut failed = None;
            reader.for_each_entries(|entry, data| {
                let name = entry.name.replace('\\', "/");
                if entry.is_directory || !wanted(&name) {
                    // Left unread, the reader decodes past it on its own
                    return Ok(true);
                }
                let mut bytes = Vec::new();
                data.take(MAX_PAGE_BYTES + 1).read_to_end(&mut bytes)?;
                let result = if bytes.len() as u64 > MAX_PAGE_BYTES {
                    Err(anyhow::anyhow!(
                        "Page {} is larger than {} MB",
                        name,
                        MAX_PAGE_BYTES >> 20
                    ))
                } else {
                    each(&name, bytes)
                };
                match result {
                    Ok(more) => Ok(more),
                    Err(e) => {
                        failed = Some(e);
                        Ok(false)
                    }
                }
            })?;
            failed.map_or(Ok(()), Err)
        }
        Kind::Zip | Kind::Other => anyhow::bail!("Not a RAR or 7z archive"),
    }
}

/// An entry's name as a ZIP would have it: forward slashes, so chapters in folders read alike.
fn entry_name(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// The unpacked books, kept in `<data>/unpacked`, at most `limit` bytes of them; the books read
/// least recently go first.
pub struct UnpackCache {
    dir: PathBuf,
    limit: u64,
    /// Indexes of the books read lately, by file name.
    open: Mutex<lru::LruCache<String, Arc<ZipIndex>>>,
    /// One unpack per book at a time, and one at a time overall: each is a burst of disk work.
    unpacking: tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    gate: tokio::sync::Semaphore,
}

/// A book unpacked for reading: the ZIP and its pages, in reading order.
pub struct Unpacked {
    pub path: PathBuf,
    pub index: Arc<ZipIndex>,
    /// Whether this call unpacked it.
    pub fresh: bool,
}

impl UnpackCache {
    pub fn new(data_dir: &Path, limit: u64) -> Self {
        Self {
            dir: data_dir.join("unpacked"),
            limit,
            open: Mutex::new(lru::LruCache::new(std::num::NonZeroUsize::new(64).unwrap())),
            unpacking: tokio::sync::Mutex::new(HashMap::new()),
            gate: tokio::sync::Semaphore::new(1),
        }
    }

    /// The book `book_id` at `version`, unpacked from `source` the first time it's asked for.
    pub async fn get(
        &self,
        book_id: &str,
        version: &str,
        source: &Path,
        kind: Kind,
    ) -> anyhow::Result<Unpacked> {
        let name = format!("{}-{}.cbz", book_id, version);
        let path = self.dir.join(&name);
        if let Some(index) = self.cached(&name, &path) {
            return Ok(Unpacked {
                path,
                index,
                fresh: false,
            });
        }

        let lock = self
            .unpacking
            .lock()
            .await
            .entry(book_id.to_string())
            .or_default()
            .clone();
        let _unpacking = lock.lock().await;

        let mut fresh = false;
        if !path.exists() {
            let _gate = self.gate.acquire().await?;
            tokio::fs::create_dir_all(&self.dir).await?;
            let (from, to) = (source.to_path_buf(), path.clone());
            let started = std::time::Instant::now();
            tokio::task::spawn_blocking(move || unpack_to_zip(&from, kind, &to)).await??;
            tracing::info!(
                "Unpacked {} for reading in {:.1}s",
                source.display(),
                started.elapsed().as_secs_f32()
            );
            fresh = true;
            let (dir, limit, keep, book) = (
                self.dir.clone(),
                self.limit,
                path.clone(),
                book_id.to_string(),
            );
            let _ = tokio::task::spawn_blocking(move || evict(&dir, limit, &keep, &book)).await;
        }

        let index = {
            let path = path.clone();
            Arc::new(tokio::task::spawn_blocking(move || ZipIndex::from_file(&path)).await??)
        };
        // Its file's time marks when it was last read, for eviction
        let _ = std::fs::File::options()
            .write(true)
            .open(&path)
            .and_then(|f| f.set_modified(std::time::SystemTime::now()));
        self.lock_open().put(name, index.clone());
        Ok(Unpacked { path, index, fresh })
    }

    fn cached(&self, name: &str, path: &Path) -> Option<Arc<ZipIndex>> {
        let index = self.lock_open().get(name).cloned()?;
        // Evicted from disk since: unpack again
        if path.exists() {
            Some(index)
        } else {
            self.lock_open().pop(name);
            None
        }
    }

    fn lock_open(&self) -> std::sync::MutexGuard<'_, lru::LruCache<String, Arc<ZipIndex>>> {
        self.open.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Removes the other versions of `book`, then the books read least recently until the folder
/// holds at most `limit` bytes. `keep`, just unpacked, stays even when it alone is larger.
fn evict(dir: &Path, limit: u64, keep: &Path, book: &str) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(std::time::SystemTime, u64, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path == keep {
            continue;
        }
        // Another version of this book, or what an unpack cut short left behind
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let stale = (name.starts_with(&format!("{book}-")) && name.ends_with(".cbz"))
            || name.ends_with(".partial");
        if stale {
            let _ = std::fs::remove_file(&path);
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            files.push((
                meta.modified().unwrap_or(std::time::UNIX_EPOCH),
                meta.len(),
                path,
            ));
        }
    }
    let kept = std::fs::metadata(keep).map(|m| m.len()).unwrap_or(0);
    let mut total: u64 = kept + files.iter().map(|(_, len, _)| len).sum::<u64>();
    files.sort();
    for (_, len, path) in files {
        if total <= limit {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total -= len;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 7z book with three pages, out of order and one in a folder, and a text file.
    fn seven_zip_book(dir: &Path) -> PathBuf {
        let src = dir.join("src");
        std::fs::create_dir_all(src.join("ch 2")).unwrap();
        std::fs::write(src.join("002.jpg"), b"second").unwrap();
        std::fs::write(src.join("001.jpg"), b"first").unwrap();
        std::fs::write(src.join("ch 2").join("003.png"), b"third").unwrap();
        std::fs::write(src.join("notes.txt"), b"not a page").unwrap();
        let book = dir.join("book.cb7");
        sevenz_rust2::compress_to_path(&src, &book).unwrap();
        book
    }

    #[test]
    fn a_7z_book_is_listed_and_unpacked_into_a_zip() {
        let dir = tempfile::tempdir().unwrap();
        let book = seven_zip_book(dir.path());
        assert_eq!(sniff(&book).unwrap(), Kind::SevenZ);

        let names: Vec<String> = list_pages(&book, Kind::SevenZ)
            .unwrap()
            .pages
            .into_iter()
            .map(|p| p.entry_name)
            .collect();
        assert_eq!(names, ["001.jpg", "002.jpg", "ch 2/003.png"]);
        assert_eq!(
            extract_page(&book, Kind::SevenZ, "002.jpg").unwrap(),
            b"second"
        );

        let zip = dir.path().join("book.cbz");
        unpack_to_zip(&book, Kind::SevenZ, &zip).unwrap();
        let index = ZipIndex::from_file(&zip).unwrap();
        let pages: Vec<Vec<u8>> = index
            .pages
            .iter()
            .map(|p| ZipIndex::read_page_data(&zip, p).unwrap())
            .collect();
        assert_eq!(
            pages,
            [b"first".to_vec(), b"second".to_vec(), b"third".to_vec()]
        );
    }

    #[test]
    fn a_damaged_archive_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let book = dir.path().join("bad.cbr");
        let mut bytes = b"Rar!\x1a\x07\x01\x00".to_vec();
        bytes.extend((0..4096u32).map(|i| (i * 31 % 251) as u8));
        std::fs::write(&book, bytes).unwrap();
        assert_eq!(sniff(&book).unwrap(), Kind::Rar);
        let error = list_pages(&book, Kind::Rar).unwrap_err().to_string();
        assert!(
            error.starts_with("This RAR archive couldn't be read"),
            "{error}"
        );
    }

    #[test]
    fn the_cache_drops_old_versions_then_the_least_recently_read() {
        let dir = tempfile::tempdir().unwrap();
        let file = |name: &str, len: usize, age_secs: u64| {
            let path = dir.path().join(name);
            std::fs::write(&path, vec![0u8; len]).unwrap();
            let when = std::time::SystemTime::now() - std::time::Duration::from_secs(age_secs);
            std::fs::File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(when)
                .unwrap();
            path
        };
        let keep = file("a-new.cbz", 400, 0);
        file("a-old.cbz", 400, 10);
        file("b-1.cbz", 300, 300);
        file("c-1.cbz", 300, 200);
        file("d-1.cbz", 300, 100);
        file("e-1.partial", 50, 5);

        // 1,300 bytes once a-old and the .partial are gone: b and then c go
        evict(dir.path(), 800, &keep, "a");

        let mut left: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        left.sort();
        assert_eq!(left, ["a-new.cbz", "d-1.cbz"]);
    }
}
