//! EPUB books, as the scan sees them: the title, author, description and year from the
//! package document, the cover image, and the length of the text in pages. The app reads the
//! text itself, from the whole file.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;

use crate::zip::PageEntry;

/// About the characters of text on a printed page. A book's length in pages is its text over
/// this, so progress, stats and "N pages" mean for a novel roughly what they mean in print.
pub const CHARS_PER_PAGE: usize = 1500;

/// The largest document read: real chapters are tens of kilobytes.
const MAX_DOC_BYTES: u64 = 8 << 20;

#[derive(Debug, Default)]
pub struct EpubInfo {
    pub title: Option<String>,
    pub creator: Option<String>,
    pub description: Option<String>,
    pub year: Option<i32>,
    /// The cover image's entry in the archive; the book's thumbnail is made from it.
    pub cover: Option<PageEntry>,
    pub page_count: i32,
}

pub fn read(path: &Path) -> anyhow::Result<EpubInfo> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let container = read_text(&mut zip, "META-INF/container.xml")?;
    let opf_path = rootfile(&container)
        .ok_or_else(|| anyhow::anyhow!("The EPUB doesn't say where its package document is"))?;
    let package = parse_package(&read_text(&mut zip, &opf_path)?);
    if package.spine.is_empty() {
        anyhow::bail!("The EPUB has no chapters");
    }
    let base = opf_path.rsplit_once('/').map_or("", |(dir, _)| dir);

    let chars: usize = package
        .spine
        .iter()
        .filter_map(|href| read_bytes(&mut zip, &resolve(base, href)).ok())
        .map(|doc| text_chars(&doc))
        .sum();
    let cover = package
        .cover
        .as_deref()
        .and_then(|href| raw_entry(&mut zip, &resolve(base, href)));

    Ok(EpubInfo {
        title: package.title,
        creator: package.creator,
        description: package.description.map(|d| strip_tags(&d)),
        year: package.date.as_deref().and_then(year_of),
        cover,
        page_count: chars.div_ceil(CHARS_PER_PAGE).max(1) as i32,
    })
}

fn read_bytes(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> anyhow::Result<Vec<u8>> {
    let entry = zip.by_name(name)?;
    let mut data = Vec::new();
    entry.take(MAX_DOC_BYTES).read_to_end(&mut data)?;
    Ok(data)
}

fn read_text(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> anyhow::Result<String> {
    Ok(String::from_utf8_lossy(&read_bytes(zip, name)?).into_owned())
}

/// Where an entry's data is, for `ZipIndex::read_page_data`.
fn raw_entry(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<PageEntry> {
    let index = zip.index_for_name(name)?;
    let entry = zip.by_index_raw(index).ok()?;
    Some(PageEntry {
        entry_name: name.to_string(),
        local_header_offset: entry.header_start(),
        compressed_size: entry.compressed_size(),
        uncompressed_size: entry.size(),
        compression_method: crate::zip::index::compression_to_u16(entry.compression()),
        crc32: entry.crc32(),
    })
}

/// The package document's path, from META-INF/container.xml.
fn rootfile(container: &str) -> Option<String> {
    let mut reader = quick_xml::Reader::from_str(container);
    loop {
        match reader.read_event() {
            Ok(Event::Start(e) | Event::Empty(e)) if e.local_name().as_ref() == b"rootfile" => {
                return attr(&e, b"full-path");
            }
            Ok(Event::Eof) | Err(_) => return None,
            _ => {}
        }
    }
}

#[derive(Debug, Default)]
struct Package {
    title: Option<String>,
    creator: Option<String>,
    description: Option<String>,
    date: Option<String>,
    /// The chapters' paths, relative to the package document, in reading order.
    spine: Vec<String>,
    cover: Option<String>,
}

struct Item {
    href: String,
    media_type: String,
    properties: String,
}

fn parse_package(opf: &str) -> Package {
    let mut reader = quick_xml::Reader::from_str(opf);
    let mut package = Package::default();
    let mut items: HashMap<String, Item> = HashMap::new();
    let mut spine_ids: Vec<String> = Vec::new();
    let mut cover_id: Option<String> = None;
    // The metadata element whose text comes next
    let mut field: Option<Vec<u8>> = None;
    let mut text = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let name = e.local_name().as_ref().to_vec();
                if matches!(
                    name.as_slice(),
                    b"title" | b"creator" | b"description" | b"date"
                ) {
                    field = Some(name);
                    text.clear();
                } else {
                    take_element(&e, &mut items, &mut spine_ids, &mut cover_id);
                }
            }
            Ok(Event::Empty(e)) => take_element(&e, &mut items, &mut spine_ids, &mut cover_id),
            Ok(Event::Text(t)) if field.is_some() => {
                text.push_str(&t.unescape().unwrap_or_default());
            }
            Ok(Event::CData(t)) if field.is_some() => {
                text.push_str(&String::from_utf8_lossy(&t));
            }
            Ok(Event::End(e)) if field.as_deref() == Some(e.local_name().as_ref()) => {
                let value = text.trim().to_string();
                let slot = match field.take().as_deref() {
                    Some(b"title") => &mut package.title,
                    Some(b"creator") => &mut package.creator,
                    Some(b"description") => &mut package.description,
                    _ => &mut package.date,
                };
                // The first of each: a book's other titles and contributors come after
                if slot.is_none() && !value.is_empty() {
                    *slot = Some(value);
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }

    package.spine = spine_ids
        .iter()
        .filter_map(|id| items.get(id))
        .map(|item| item.href.clone())
        .collect();
    let is_image = |item: &&Item| item.media_type.starts_with("image/");
    package.cover = items
        .values()
        .find(|item| {
            item.properties
                .split_whitespace()
                .any(|p| p == "cover-image")
        })
        .or_else(|| cover_id.and_then(|id| items.get(&id)).filter(is_image))
        .or_else(|| {
            let mut named: Vec<(&String, &Item)> = items
                .iter()
                .filter(|(id, item)| {
                    is_image(item)
                        && (id.to_lowercase().contains("cover")
                            || item.href.to_lowercase().contains("cover"))
                })
                .collect();
            named.sort_by(|a, b| a.1.href.cmp(&b.1.href));
            named.first().map(|(_, item)| *item)
        })
        .map(|item| item.href.clone());
    package
}

/// A manifest item, a spine entry or the EPUB 2 cover meta.
fn take_element(
    e: &quick_xml::events::BytesStart,
    items: &mut HashMap<String, Item>,
    spine_ids: &mut Vec<String>,
    cover_id: &mut Option<String>,
) {
    match e.local_name().as_ref() {
        b"item" => {
            if let (Some(id), Some(href)) = (attr(e, b"id"), attr(e, b"href")) {
                items.insert(
                    id,
                    Item {
                        href,
                        media_type: attr(e, b"media-type").unwrap_or_default(),
                        properties: attr(e, b"properties").unwrap_or_default(),
                    },
                );
            }
        }
        b"itemref" => {
            if attr(e, b"linear").as_deref() != Some("no") {
                if let Some(id) = attr(e, b"idref") {
                    spine_ids.push(id);
                }
            }
        }
        b"meta" if attr(e, b"name").as_deref() == Some("cover") => {
            *cover_id = attr(e, b"content");
        }
        _ => {}
    }
}

fn attr(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| a.key.local_name().as_ref() == name)
        .and_then(|a| a.unescape_value().ok())
        .map(|v| v.into_owned())
}

/// An href from the package document as a path in the archive: relative to the package's
/// folder, without a fragment, percent-decoded.
fn resolve(base: &str, href: &str) -> String {
    let href = href.split('#').next().unwrap_or("");
    let mut parts: Vec<&str> = if base.is_empty() {
        Vec::new()
    } else {
        base.split('/').collect()
    };
    for part in href.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    percent_decode(&parts.join("/"))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The characters of text in an XHTML document: what's outside tags, scripts and styles, with
/// each run of white space and each entity counted once.
fn text_chars(doc: &[u8]) -> usize {
    let doc = String::from_utf8_lossy(doc);
    let body = doc.find("<body").map_or(&doc[..], |at| &doc[at..]);
    let mut count = 0;
    let mut in_tag = false;
    let mut skip_until: Option<&str> = None;
    let mut space = true;
    let mut rest = body;
    while let Some(c) = rest.chars().next() {
        if let Some(end) = skip_until {
            match rest.find(end) {
                Some(at) => {
                    rest = &rest[at + end.len()..];
                    skip_until = None;
                    continue;
                }
                None => break,
            }
        }
        if in_tag {
            if c == '>' {
                in_tag = false;
            }
        } else if c == '<' {
            let lower = rest.get(..7).unwrap_or(rest).to_ascii_lowercase();
            if lower.starts_with("<script") {
                skip_until = Some("</script>");
            } else if lower.starts_with("<style") {
                skip_until = Some("</style>");
            } else {
                in_tag = true;
            }
        } else if c.is_whitespace() {
            if !space {
                count += 1;
                space = true;
            }
        } else {
            count += 1;
            space = false;
            if c == '&' {
                if let Some(at) = rest[1..].find(';').filter(|at| *at < 10) {
                    rest = &rest[at + 2..];
                    continue;
                }
            }
        }
        rest = &rest[c.len_utf8()..];
    }
    count
}

/// Text from a description that may hold HTML.
fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    let text = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn year_of(date: &str) -> Option<i32> {
    date.get(..4)?
        .parse()
        .ok()
        .filter(|y| (1000..3000).contains(y))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// An EPUB 3 with two chapters, a cover image and a nav document.
    fn sample_epub(dir: &Path, chapter_words: usize) -> std::path::PathBuf {
        let path = dir.join("book.epub");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        let deflated = zip::write::SimpleFileOptions::default();
        zip.start_file("mimetype", stored).unwrap();
        zip.write_all(b"application/epub+zip").unwrap();
        zip.start_file("META-INF/container.xml", deflated).unwrap();
        zip.write_all(
            br#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"#,
        )
        .unwrap();
        zip.start_file("OEBPS/content.opf", deflated).unwrap();
        zip.write_all(
            br#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Ascendance of a Bookworm: Part 1 Volume 1</dc:title>
    <dc:creator>Miya Kazuki</dc:creator>
    <dc:creator>You Shiina</dc:creator>
    <dc:description>&lt;p&gt;A girl who loves books &amp;amp; nothing else.&lt;/p&gt;</dc:description>
    <dc:date>2019-01-29T00:00:00Z</dc:date>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-img" href="Images/Cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="c1" href="Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="nav" linear="no"/></spine>
</package>"#,
        )
        .unwrap();
        let words = "word ".repeat(chapter_words);
        for name in ["OEBPS/Text/chapter 1.xhtml", "OEBPS/Text/chapter2.xhtml"] {
            zip.start_file(name, deflated).unwrap();
            write!(
                zip,
                "<html><head><title>Chapter</title><style>p {{ margin: 0 }}</style></head>\
                 <body><p>{words}</p><script>var x = 1;</script></body></html>"
            )
            .unwrap();
        }
        zip.start_file("OEBPS/nav.xhtml", deflated).unwrap();
        zip.write_all(b"<html><body><nav>Contents</nav></body></html>")
            .unwrap();
        zip.start_file("OEBPS/Images/Cover.jpg", stored).unwrap();
        zip.write_all(b"not really a jpeg").unwrap();
        zip.finish().unwrap();
        path
    }

    #[test]
    fn reads_what_the_scan_needs_from_an_epub() {
        let dir = tempfile::tempdir().unwrap();
        // 2 chapters of 1,500 five-character words ("word "): 15,000 characters, 10 pages
        let info = read(&sample_epub(dir.path(), 1500)).unwrap();
        assert_eq!(
            info.title.as_deref(),
            Some("Ascendance of a Bookworm: Part 1 Volume 1")
        );
        assert_eq!(info.creator.as_deref(), Some("Miya Kazuki"));
        assert_eq!(
            info.description.as_deref(),
            Some("A girl who loves books & nothing else.")
        );
        assert_eq!(info.year, Some(2019));
        assert_eq!(info.page_count, 10);

        let cover = info.cover.unwrap();
        assert_eq!(cover.entry_name, "OEBPS/Images/Cover.jpg");
        let data =
            crate::zip::ZipIndex::read_page_data(&dir.path().join("book.epub"), &cover).unwrap();
        assert_eq!(data, b"not really a jpeg");
    }

    #[test]
    fn a_short_epub_is_one_page_and_a_broken_one_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read(&sample_epub(dir.path(), 3)).unwrap().page_count, 1);

        let broken = dir.path().join("broken.epub");
        std::fs::write(&broken, b"PK not a zip").unwrap();
        assert!(read(&broken).is_err());
    }

    #[test]
    fn counts_text_not_markup() {
        assert_eq!(
            text_chars(
                b"<html><head><title>T</title></head><body><p>Hi &amp;   you</p></body></html>"
            ),
            "Hi & you".len()
        );
        assert_eq!(
            text_chars(b"<body><style>p{}</style>ab<script>x</script>c</body>"),
            3
        );
    }

    #[test]
    fn resolves_hrefs_from_the_package_folder() {
        assert_eq!(
            resolve("OEBPS", "Text/a%20b.xhtml#c1"),
            "OEBPS/Text/a b.xhtml"
        );
        assert_eq!(
            resolve("OEBPS/pkg", "../Images/x.jpg"),
            "OEBPS/Images/x.jpg"
        );
        assert_eq!(resolve("", "x.xhtml"), "x.xhtml");
    }

    #[test]
    fn finds_an_epub2_cover_from_its_meta() {
        let package = parse_package(
            r#"<package><metadata><meta name="cover" content="img"/></metadata>
               <manifest><item id="img" href="i/front.png" media-type="image/png"/>
               <item id="c" href="c.html" media-type="application/xhtml+xml"/></manifest>
               <spine><itemref idref="c"/></spine></package>"#,
        );
        assert_eq!(package.cover.as_deref(), Some("i/front.png"));
        assert_eq!(package.spine, vec!["c.html"]);
    }
}
