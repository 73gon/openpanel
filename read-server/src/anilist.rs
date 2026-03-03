use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::OnceLock;

const ANILIST_URL: &str = "https://graphql.anilist.co";

// ── GraphQL queries ──

const SEARCH_QUERY: &str = r#"
query SearchManga($search: String!) {
  Page(perPage: 10) {
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH]) {
      id
      title { romaji english native }
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
    title { romaji english native }
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

pub fn extract_year(name: &str) -> Option<i32> {
    static YEAR_RE: OnceLock<Regex> = OnceLock::new();
    let re = YEAR_RE.get_or_init(|| {
        Regex::new(r"[\(\[]\s*(\d{4})\s*[\)\]]|[-\x{2013}\x{2014}]\s*(\d{4})\s*$").unwrap()
    });

    re.captures(name).and_then(|caps| {
        let y_str = caps.get(1).or_else(|| caps.get(2))?.as_str();
        let y = y_str.parse::<i32>().ok()?;
        if (1900..=2100).contains(&y) {
            Some(y)
        } else {
            None
        }
    })
}

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
pub async fn fetch_by_search(
    search: &str,
    year: Option<i32>,
) -> anyhow::Result<Option<AnilistMedia>> {
    let client = reqwest::Client::new();

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
    let candidates = json
        .data
        .and_then(|d| d.page)
        .map(|p| p.media)
        .unwrap_or_default();

    if candidates.is_empty() {
        return Ok(None);
    }

    let mut media = candidates[0].clone();

    if let Some(y) = year {
        // Try to find a year match
        let year_match = candidates
            .iter()
            .find(|c| c.start_date.as_ref().and_then(|d| d.year) == Some(y as i64));

        if let Some(ym) = year_match {
            media = ym.clone();
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

                        let retry_year_match = retry_candidates
                            .iter()
                            .find(|c| c.start_date.as_ref().and_then(|d| d.year) == Some(y as i64));

                        if let Some(rym) = retry_year_match {
                            media = rym.clone();
                        } else if !retry_candidates.is_empty() {
                            media = retry_candidates[0].clone();
                        }
                    }
                }
            }
        }
    }

    Ok(Some(media))
}

/// Fetch AniList metadata by exact AniList ID.
pub async fn fetch_by_id(anilist_id: i64) -> anyhow::Result<Option<AnilistMedia>> {
    let client = reqwest::Client::new();

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
        if let Ok(Some(media)) = fetch_by_id(folder_id).await {
            save_metadata(pool, series_id, &media, "folder").await?;
            return Ok(());
        }
    }

    // Fall back to name search
    let year = extract_year(series_name);
    if let Ok(Some(media)) = fetch_by_search(series_name, year).await {
        save_metadata(pool, series_id, &media, "auto").await?;
    }

    Ok(())
}

/// Fetch metadata for all series that don't have it yet (batch operation).
/// Includes rate-limiting delays between requests.
pub async fn fetch_missing_metadata(pool: &SqlitePool) -> anyhow::Result<usize> {
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
        match fetch_and_save_for_series(pool, id, name, false).await {
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
