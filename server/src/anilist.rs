use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashSet;
use std::sync::OnceLock;

const ANILIST_URL: &str = "https://graphql.anilist.co";

// ── GraphQL queries ──

const SEARCH_QUERY: &str = r#"
query SearchManga($search: String!) {
  Page(perPage: 10) {
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH]) {
      id
      format
      title { romaji english native }
      synonyms
      coverImage { extraLarge large medium color }
      bannerImage
      description(asHtml: false)
      genres
      status
      chapters
      volumes
      averageScore
      popularity
      startDate { year month day }
      endDate { year month day }
      staff(sort: RELEVANCE, perPage: 5) {
        edges {
          role
          node { name { full } }
        }
      }
    }
  }
}
"#;

const ID_QUERY: &str = r#"
query GetManga($id: Int!) {
  Media(id: $id, type: MANGA) {
    id
    format
    title { romaji english native }
    synonyms
    coverImage { extraLarge large medium color }
    bannerImage
    description(asHtml: false)
    genres
    status
    chapters
    volumes
    averageScore
    popularity
    startDate { year month day }
    endDate { year month day }
    staff(sort: RELEVANCE, perPage: 5) {
      edges {
        role
        node { name { full } }
      }
    }
  }
}
"#;

// ── Response types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistMedia {
    pub id: i64,
    pub format: Option<String>,
    pub title: Option<AnilistTitle>,
    #[serde(rename = "coverImage")]
    pub cover_image: Option<AnilistCoverImage>,
    #[serde(rename = "bannerImage")]
    pub banner_image: Option<String>,
    pub description: Option<String>,
    pub genres: Option<Vec<String>>,
    pub status: Option<String>,
    pub chapters: Option<i64>,
    pub volumes: Option<i64>,
    #[serde(rename = "averageScore")]
    pub average_score: Option<i64>,
    pub popularity: Option<i64>,
    #[serde(rename = "startDate")]
    pub start_date: Option<AnilistDate>,
    #[serde(rename = "endDate")]
    pub end_date: Option<AnilistDate>,
    pub staff: Option<AnilistStaff>,
    /// Other names the work goes by.
    #[serde(default)]
    pub synonyms: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistTitle {
    pub romaji: Option<String>,
    pub english: Option<String>,
    pub native: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistCoverImage {
    #[serde(rename = "extraLarge")]
    pub extra_large: Option<String>,
    pub large: Option<String>,
    pub medium: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistDate {
    pub year: Option<i64>,
    pub month: Option<i64>,
    pub day: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistStaff {
    pub edges: Vec<AnilistStaffEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistStaffEdge {
    pub role: String,
    pub node: AnilistStaffNode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistStaffNode {
    pub name: AnilistStaffName,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnilistStaffName {
    pub full: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    data: Option<SearchData>,
}

#[derive(Debug, Deserialize)]
struct SearchData {
    #[serde(alias = "Page")]
    page: Option<SearchPage>,
    #[serde(alias = "Media")]
    media: Option<AnilistMedia>,
}

#[derive(Debug, Deserialize)]
struct SearchPage {
    media: Vec<AnilistMedia>,
}

// ── Name cleaning (ported from frontend) ──

pub fn clean_series_name(name: &str) -> String {
    static RE_BRACKETS: OnceLock<Regex> = OnceLock::new();
    static RE_PARENS: OnceLock<Regex> = OnceLock::new();
    static RE_YEAR_SUFFIX: OnceLock<Regex> = OnceLock::new();
    static RE_DIGITAL: OnceLock<Regex> = OnceLock::new();
    static RE_COLORED: OnceLock<Regex> = OnceLock::new();
    static RE_MULTI_SPACE: OnceLock<Regex> = OnceLock::new();

    let re_brackets = RE_BRACKETS.get_or_init(|| Regex::new(r"\[.*?\]").unwrap());
    let re_parens = RE_PARENS.get_or_init(|| Regex::new(r"\(.*?\)").unwrap());
    let re_year_suffix =
        RE_YEAR_SUFFIX.get_or_init(|| Regex::new(r"\s*[-\x{2013}\x{2014}]\s*\d{4}\s*$").unwrap());
    let re_digital = RE_DIGITAL.get_or_init(|| Regex::new(r"(?i)digital").unwrap());
    let re_colored =
        RE_COLORED.get_or_init(|| Regex::new(r"(?i)colore?d?\s*(?:comics?)?").unwrap());
    let re_multi_space = RE_MULTI_SPACE.get_or_init(|| Regex::new(r"\s+").unwrap());

    let s = re_brackets.replace_all(name, "");
    let s = re_parens.replace_all(&s, "");
    let s = re_year_suffix.replace_all(&s, "");
    let s = re_digital.replace_all(&s, "");
    let s = re_colored.replace_all(&s, "");
    let s = re_multi_space.replace_all(&s, " ");
    s.trim().to_string()
}

/// Re-export shared extract_year utility
pub use crate::utils::extract_year;

/// Extract AniList ID from folder name.
/// Looks for 5-6 digit numbers that are NOT years (1900-2100).
/// e.g. "Berserk [97701]" → Some(97701), "Naruto (1999)" → None
pub fn extract_anilist_id_from_folder(name: &str) -> Option<i64> {
    static ID_RE: OnceLock<Regex> = OnceLock::new();
    let re = ID_RE.get_or_init(|| Regex::new(r"\b(\d{5,6})\b").unwrap());

    for caps in re.captures_iter(name) {
        if let Some(m) = caps.get(1) {
            if let Ok(id) = m.as_str().parse::<i64>() {
                // Skip if it looks like a year (1900-2100)
                if (1900..=2100).contains(&id) {
                    continue;
                }
                return Some(id);
            }
        }
    }
    None
}

fn get_author(media: &AnilistMedia) -> Option<String> {
    let staff = media.staff.as_ref()?;
    let story = staff.edges.iter().find(|e| {
        let role = e.role.to_lowercase();
        role.contains("story") || role.contains("original")
    });
    let edge = story.or_else(|| staff.edges.first())?;
    edge.node.name.full.clone()
}

fn get_cover_url(media: &AnilistMedia) -> Option<String> {
    let img = media.cover_image.as_ref()?;
    img.extra_large
        .clone()
        .or_else(|| img.large.clone())
        .or_else(|| img.medium.clone())
}

// ── Public API ──

/// Fetch AniList metadata by search string (with optional year matching).
/// Uses improved matching: name+year → volume/chapter proximity → format preference.
pub async fn fetch_by_search(
    client: &reqwest::Client,
    search: &str,
    year: Option<i32>,
    local_volumes: Option<i64>,
    local_chapters: Option<i64>,
) -> anyhow::Result<Option<AnilistMedia>> {
    let cleaned = clean_series_name(search);
    if cleaned.is_empty() {
        return Ok(None);
    }

    let body = serde_json::json!({
        "query": SEARCH_QUERY,
        "variables": { "search": cleaned }
    });

    let res = client
        .post(ANILIST_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if res.status() == 429 {
        tracing::warn!("[anilist] Rate limited, skipping: {}", search);
        return Ok(None);
    }

    if !res.status().is_success() {
        tracing::warn!("[anilist] HTTP {}: {}", res.status(), search);
        return Ok(None);
    }

    let json: SearchResponse = res.json().await?;
    let mut candidates = json
        .data
        .and_then(|d| d.page)
        .map(|p| p.media)
        .unwrap_or_default();

    if candidates.is_empty() {
        return Ok(None);
    }

    // If year provided, try year-matched search
    if let Some(y) = year {
        let year_matches: Vec<_> = candidates
            .iter()
            .filter(|c| c.start_date.as_ref().and_then(|d| d.year) == Some(y as i64))
            .cloned()
            .collect();

        if !year_matches.is_empty() {
            candidates = year_matches;
        } else {
            // Retry with year appended to search
            let retry_body = serde_json::json!({
                "query": SEARCH_QUERY,
                "variables": { "search": format!("{} {}", cleaned, y) }
            });

            if let Ok(retry_res) = client
                .post(ANILIST_URL)
                .header("Content-Type", "application/json")
                .json(&retry_body)
                .send()
                .await
            {
                if retry_res.status().is_success() {
                    if let Ok(retry_json) = retry_res.json::<SearchResponse>().await {
                        let retry_candidates = retry_json
                            .data
                            .and_then(|d| d.page)
                            .map(|p| p.media)
                            .unwrap_or_default();

                        let retry_year_matches: Vec<_> = retry_candidates
                            .iter()
                            .filter(|c| {
                                c.start_date.as_ref().and_then(|d| d.year) == Some(y as i64)
                            })
                            .cloned()
                            .collect();

                        if !retry_year_matches.is_empty() {
                            candidates = retry_year_matches;
                        } else if !retry_candidates.is_empty() {
                            candidates = retry_candidates;
                        }
                    }
                }
            }
        }
    }

    // If only one candidate, return it
    if candidates.len() == 1 {
        return Ok(Some(candidates.into_iter().next().unwrap()));
    }

    let best = rank_candidates(&cleaned, &candidates, local_volumes, local_chapters);
    Ok(Some(best))
}

/// A title reduced to lowercase words: apostrophes dropped, other punctuation a space.
/// "Frieren: Beyond Journey’s End" → "frieren beyond journeys end".
pub fn normalize_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    for c in title.chars() {
        if c == '\'' || c == '’' || c == '`' {
            continue;
        }
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
        } else {
            out.push(' ');
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// How alike two titles are, from 0 to 1: 1 when they're the same words, less when one only
/// contains the other ("Berserk" in "Berserk of Gluttony"), less again for shared words.
pub fn title_similarity(a: &str, b: &str) -> f64 {
    let (a, b) = (normalize_title(a), normalize_title(b));
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    let (short, long) = if a.len() <= b.len() {
        (&a, &b)
    } else {
        (&b, &a)
    };
    let padded = format!(" {} ", long);
    if padded.contains(&format!(" {} ", short)) {
        return 0.5 + 0.4 * (short.len() as f64 / long.len() as f64);
    }
    let words_a: HashSet<&str> = a.split(' ').collect();
    let words_b: HashSet<&str> = b.split(' ').collect();
    let shared = words_a.intersection(&words_b).count() as f64;
    let all = words_a.union(&words_b).count() as f64;
    0.8 * shared / all
}

/// The best likeness between a name and any of a work's titles and synonyms.
pub fn best_title_similarity(name: &str, media: &AnilistMedia) -> f64 {
    let title = media.title.as_ref();
    title
        .and_then(|t| t.romaji.as_deref())
        .into_iter()
        .chain(title.and_then(|t| t.english.as_deref()))
        .chain(title.and_then(|t| t.native.as_deref()))
        .chain(media.synonyms.iter().flatten().map(String::as_str))
        .map(|t| title_similarity(name, t))
        .fold(0.0, f64::max)
}

/// Format preference (higher is better). This is a comic reader: novels are another work with
/// the same name, and a one-shot only fits a single book.
fn format_score(format: &Option<String>, local_books: Option<i64>) -> f64 {
    match format.as_deref() {
        Some("MANGA") => 4.0,
        Some("ONE_SHOT") if local_books == Some(1) => 3.0,
        Some("ONE_SHOT") => -4.0,
        Some("NOVEL") => -10.0,
        _ => 0.0,
    }
}

/// Picks the candidate that is most likely the series, mostly by title. AniList's own order
/// (search match), popularity and format break ties. Local volume counts barely matter: a
/// library often holds only part of a series, but never more volumes than were published.
fn rank_candidates(
    name: &str,
    candidates: &[AnilistMedia],
    local_volumes: Option<i64>,
    local_chapters: Option<i64>,
) -> AnilistMedia {
    let mut best = (f64::MIN, 0);
    for (i, c) in candidates.iter().enumerate() {
        let mut score = 60.0 * best_title_similarity(name, c);

        // AniList's search order: up to 5 points for the first result.
        score += (10.0 - i as f64).max(0.0) * 0.5;

        // Popularity, logarithmic: a household name over its spin-offs (about 0 to 8).
        let pop = c.popularity.unwrap_or(0).max(0) as f64;
        score += (pop + 1.0).log10() * 1.5;

        score += format_score(&c.format, local_volumes);

        // More books here than the work has is a sign it's another work.
        if let (Some(local), Some(theirs)) = (local_volumes, c.volumes) {
            if local == theirs {
                score += 2.0;
            } else if theirs > 0 && local > theirs + 1 {
                score -= 5.0;
            }
        }
        if let (Some(local), Some(theirs)) = (local_chapters, c.chapters) {
            if theirs > 0 && local > theirs + 5 {
                score -= 3.0;
            }
        }

        if score > best.0 {
            best = (score, i);
        }
    }
    candidates[best.1].clone()
}

/// Fetch AniList metadata by exact AniList ID.
pub async fn fetch_by_id(
    client: &reqwest::Client,
    anilist_id: i64,
) -> anyhow::Result<Option<AnilistMedia>> {
    let body = serde_json::json!({
        "query": ID_QUERY,
        "variables": { "id": anilist_id }
    });

    let res = client
        .post(ANILIST_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if res.status() == 429 {
        tracing::warn!("[anilist] Rate limited for ID {}", anilist_id);
        return Ok(None);
    }

    if !res.status().is_success() {
        return Ok(None);
    }

    let json: SearchResponse = res.json().await?;
    Ok(json.data.and_then(|d| d.media))
}

/// Save AniList metadata to the series table.
pub async fn save_metadata(
    pool: &SqlitePool,
    series_id: &str,
    media: &AnilistMedia,
    source: &str,
) -> anyhow::Result<()> {
    let title_english = media.title.as_ref().and_then(|t| t.english.clone());
    let title_romaji = media.title.as_ref().and_then(|t| t.romaji.clone());
    let description = media.description.clone();
    let cover_url = get_cover_url(media);
    let banner_url = media.banner_image.clone();
    let genres = media
        .genres
        .as_ref()
        .map(|g| serde_json::to_string(g).unwrap_or_default());
    let status = media.status.clone();
    let chapters = media.chapters;
    let volumes = media.volumes;
    let score = media.average_score;
    let author = get_author(media);
    let start_year = media.start_date.as_ref().and_then(|d| d.year);
    let end_year = media.end_date.as_ref().and_then(|d| d.year);

    sqlx::query(
        "UPDATE series SET
            anilist_id = ?,
            anilist_id_source = ?,
            anilist_title_english = ?,
            anilist_title_romaji = ?,
            anilist_description = ?,
            anilist_cover_url = ?,
            anilist_banner_url = ?,
            anilist_genres = ?,
            anilist_status = ?,
            anilist_chapters = ?,
            anilist_volumes = ?,
            anilist_score = ?,
            anilist_author = ?,
            anilist_start_year = ?,
            anilist_end_year = ?,
            anilist_updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(media.id)
    .bind(source)
    .bind(&title_english)
    .bind(&title_romaji)
    .bind(&description)
    .bind(&cover_url)
    .bind(&banner_url)
    .bind(&genres)
    .bind(&status)
    .bind(chapters)
    .bind(volumes)
    .bind(score)
    .bind(&author)
    .bind(start_year)
    .bind(end_year)
    .bind(series_id)
    .execute(pool)
    .await?;

    tracing::info!(
        "[anilist] Saved metadata for series {} (anilist_id={}, source={})",
        series_id,
        media.id,
        source
    );
    Ok(())
}

/// Clear AniList metadata from a series.
pub async fn clear_metadata(pool: &SqlitePool, series_id: &str) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE series SET
            anilist_id = NULL,
            anilist_id_source = NULL,
            anilist_title_english = NULL,
            anilist_title_romaji = NULL,
            anilist_description = NULL,
            anilist_cover_url = NULL,
            anilist_banner_url = NULL,
            anilist_genres = NULL,
            anilist_status = NULL,
            anilist_chapters = NULL,
            anilist_volumes = NULL,
            anilist_score = NULL,
            anilist_author = NULL,
            anilist_start_year = NULL,
            anilist_end_year = NULL,
            anilist_updated_at = NULL
         WHERE id = ?",
    )
    .bind(series_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Fetch and save metadata for a series by name (auto-search).
/// Respects existing manual/folder-set IDs unless `force` is true.
pub async fn fetch_and_save_for_series(
    client: &reqwest::Client,
    pool: &SqlitePool,
    series_id: &str,
    series_name: &str,
    force: bool,
) -> anyhow::Result<()> {
    // Check current source
    if !force {
        let row: Option<(Option<String>,)> =
            sqlx::query_as("SELECT anilist_id_source FROM series WHERE id = ?")
                .bind(series_id)
                .fetch_optional(pool)
                .await?;

        if let Some((Some(source),)) = row {
            if source == "manual" || source == "folder" {
                tracing::debug!(
                    "[anilist] Skipping series {} — source is '{}' (protected)",
                    series_id,
                    source
                );
                return Ok(());
            }
        }
    }

    // Check if we can extract an AniList ID from the folder name
    if let Some(folder_id) = extract_anilist_id_from_folder(series_name) {
        if let Ok(Some(media)) = fetch_by_id(client, folder_id).await {
            save_metadata(pool, series_id, &media, "folder").await?;
            return Ok(());
        }
    }

    // Query local volume/chapter counts for better matching
    let local_counts: Option<(i64,)> =
        sqlx::query_as("SELECT COUNT(*) FROM books WHERE series_id = ?")
            .bind(series_id)
            .fetch_optional(pool)
            .await?;
    let local_volumes = local_counts.map(|(c,)| c);

    let local_chapter_counts: Option<(i64,)> = sqlx::query_as(
        "SELECT COALESCE(SUM(chapter_count), 0) FROM books WHERE series_id = ? AND chapter_count > 0",
    )
    .bind(series_id)
    .fetch_optional(pool)
    .await?;
    let local_chapters = local_chapter_counts.and_then(|(c,)| if c > 0 { Some(c) } else { None });

    // Fall back to name search with improved matching
    let year = extract_year(series_name);
    if let Ok(Some(media)) =
        fetch_by_search(client, series_name, year, local_volumes, local_chapters).await
    {
        save_metadata(pool, series_id, &media, "auto").await?;
    }

    Ok(())
}

/// Fetch metadata for all series that don't have it yet (batch operation).
/// Includes rate-limiting delays between requests.
pub async fn fetch_missing_metadata(
    client: &reqwest::Client,
    pool: &SqlitePool,
) -> anyhow::Result<usize> {
    let series: Vec<(String, String)> =
        sqlx::query_as("SELECT id, name FROM series WHERE anilist_id IS NULL")
            .fetch_all(pool)
            .await?;

    if series.is_empty() {
        return Ok(0);
    }

    tracing::info!(
        "[anilist] Fetching metadata for {} series without AniList data",
        series.len()
    );

    let mut fetched = 0;
    for (i, (id, name)) in series.iter().enumerate() {
        match fetch_and_save_for_series(client, pool, id, name, false).await {
            Ok(()) => fetched += 1,
            Err(e) => tracing::error!("[anilist] Error fetching metadata for {}: {}", name, e),
        }

        // Rate limit: 1.5s between requests (AniList allows ~90 req/min)
        if i < series.len() - 1 {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        }
    }

    tracing::info!("[anilist] Fetched metadata for {} series", fetched);
    Ok(fetched)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn media(
        id: i64,
        format: &str,
        romaji: &str,
        english: Option<&str>,
        volumes: Option<i64>,
        popularity: i64,
    ) -> AnilistMedia {
        AnilistMedia {
            id,
            format: Some(format.to_string()),
            title: Some(AnilistTitle {
                romaji: Some(romaji.to_string()),
                english: english.map(str::to_string),
                native: None,
            }),
            cover_image: None,
            banner_image: None,
            description: None,
            genres: None,
            status: None,
            chapters: None,
            volumes,
            average_score: None,
            popularity: Some(popularity),
            start_date: None,
            end_date: None,
            staff: None,
            synonyms: None,
        }
    }

    #[test]
    fn titles_normalize_to_words() {
        assert_eq!(
            normalize_title("Frieren: Beyond Journey’s End"),
            "frieren beyond journeys end"
        );
        assert_eq!(
            normalize_title("Frieren - Beyond Journey's End"),
            "frieren beyond journeys end"
        );
        assert_eq!(normalize_title("  MONSTER  "), "monster");
    }

    #[test]
    fn same_title_beats_a_title_that_contains_it() {
        assert_eq!(title_similarity("Berserk", "BERSERK"), 1.0);
        let contained = title_similarity("Berserk", "Berserk of Gluttony");
        assert!(contained > 0.5 && contained < 0.8, "{contained}");
        assert!(title_similarity("Pluto", "Anywhere But Here") < 0.1);
        assert_eq!(title_similarity("", "Berserk"), 0.0);
    }

    #[test]
    fn a_partial_library_still_gets_the_famous_series() {
        // Eight volumes here: the spin-off has about that many, Berserk has more.
        let candidates = vec![
            media(
                100687,
                "MANGA",
                "Boushoku no Berserk",
                Some("Berserk of Gluttony"),
                Some(9),
                30_000,
            ),
            media(30002, "MANGA", "Berserk", Some("Berserk"), None, 200_000),
        ];
        assert_eq!(
            rank_candidates("Berserk", &candidates, Some(8), None).id,
            30002
        );
    }

    #[test]
    fn spin_offs_with_matching_counts_lose_to_the_title() {
        let candidates = vec![
            media(
                96617,
                "MANGA",
                "Monster Musume no Iru Nichijou Anthology",
                None,
                Some(5),
                5_000,
            ),
            media(
                30001,
                "MANGA",
                "MONSTER",
                Some("Monster"),
                Some(18),
                120_000,
            ),
        ];
        assert_eq!(
            rank_candidates("Monster", &candidates, Some(5), None).id,
            30001
        );
    }

    #[test]
    fn novels_and_one_shots_need_a_reason() {
        let candidates = vec![
            media(1, "NOVEL", "Vinland Saga", None, Some(3), 50_000),
            media(2, "MANGA", "Vinland Saga", None, Some(14), 150_000),
        ];
        assert_eq!(
            rank_candidates("Vinland Saga", &candidates, Some(6), None).id,
            2
        );

        let one_shot = vec![
            media(3, "MANGA", "Look Back Anthology", None, Some(1), 1_000),
            media(
                126521,
                "ONE_SHOT",
                "Look Back",
                Some("Look Back"),
                None,
                40_000,
            ),
        ];
        assert_eq!(
            rank_candidates("Look Back", &one_shot, Some(1), None).id,
            126521
        );
    }
}
