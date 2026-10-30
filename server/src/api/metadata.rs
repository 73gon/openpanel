//! Reviewing the AniList matches: which series may be matched to the wrong work, and matching
//! them again.

use std::sync::Mutex;

use axum::extract::State;
use axum::http::{header::HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};

use super::admin::log_admin_event;
use crate::anilist::{clean_series_name, title_similarity};
use crate::error::AppError;
use crate::state::AppState;

/// Below this likeness between a folder name and the matched titles, an automatic match is
/// worth a second look.
pub const DOUBTFUL_MATCH: f64 = 0.8;

#[derive(Serialize, sqlx::FromRow)]
pub struct MetadataRow {
    pub id: String,
    pub name: String,
    pub library_name: String,
    pub book_count: i64,
    pub anilist_id: Option<i64>,
    /// "auto", "manual" or "folder" (an id in the folder name).
    pub anilist_id_source: Option<String>,
    pub title_english: Option<String>,
    pub title_romaji: Option<String>,
    pub cover_url: Option<String>,
    pub start_year: Option<i64>,
}

#[derive(Serialize)]
pub struct SeriesMatch {
    #[serde(flatten)]
    pub row: MetadataRow,
    /// How alike the folder name and the matched titles are, 0 to 1. None without a match.
    pub match_score: Option<f64>,
}

#[derive(Serialize, Clone)]
pub struct RematchStatus {
    pub running: bool,
    pub done: usize,
    pub total: usize,
    /// Series whose match changed.
    pub changed: usize,
    /// RFC 3339.
    pub finished_at: Option<String>,
}

static REMATCH: Mutex<RematchStatus> = Mutex::new(RematchStatus {
    running: false,
    done: 0,
    total: 0,
    changed: 0,
    finished_at: None,
});

fn rematch_status() -> std::sync::MutexGuard<'static, RematchStatus> {
    REMATCH.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize)]
pub struct MetadataResponse {
    pub series: Vec<SeriesMatch>,
    pub rematch: RematchStatus,
}

fn match_score(row: &MetadataRow) -> Option<f64> {
    row.anilist_id?;
    let name = clean_series_name(&row.name);
    Some(
        [row.title_english.as_deref(), row.title_romaji.as_deref()]
            .into_iter()
            .flatten()
            .map(|title| title_similarity(&name, title))
            .fold(0.0, f64::max),
    )
}

/// Whether an automatic match may be the wrong work, or there is none.
fn needs_review(series: &SeriesMatch) -> bool {
    let automatic = matches!(series.row.anilist_id_source.as_deref(), None | Some("auto"));
    match series.match_score {
        None => true,
        Some(score) => automatic && score < DOUBTFUL_MATCH,
    }
}

async fn all_matches(db: &sqlx::SqlitePool) -> Result<Vec<SeriesMatch>, AppError> {
    let rows: Vec<MetadataRow> = sqlx::query_as(
        "SELECT s.id, s.name, l.name AS library_name,
                (SELECT COUNT(*) FROM books b WHERE b.series_id = s.id) AS book_count,
                s.anilist_id, s.anilist_id_source,
                s.anilist_title_english AS title_english,
                s.anilist_title_romaji AS title_romaji,
                s.anilist_cover_url AS cover_url,
                s.anilist_start_year AS start_year
         FROM series s
         JOIN libraries l ON l.id = s.library_id
         ORDER BY s.sort_name",
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SeriesMatch {
            match_score: match_score(&row),
            row,
        })
        .collect())
}

/// Every series with its AniList match and how sure that match is.
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<MetadataResponse>, AppError> {
    super::auth::require_admin(&state, &headers).await?;
    Ok(Json(MetadataResponse {
        series: all_matches(&state.db).await?,
        rematch: rematch_status().clone(),
    }))
}

#[derive(Deserialize)]
pub struct RematchRequest {
    /// "review" (doubtful and missing matches, the default) or "all" (every automatic one).
    #[serde(default)]
    pub scope: Option<String>,
}

/// Matches series on AniList again, in the background, a request every 1.5 s. Matches someone
/// chose (by hand or with an id in the folder name) are kept.
pub async fn rematch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RematchRequest>,
) -> Result<(StatusCode, Json<RematchStatus>), AppError> {
    let admin = super::auth::require_admin(&state, &headers).await?;
    let everything = body.scope.as_deref() == Some("all");

    let targets: Vec<(String, String, Option<i64>)> = all_matches(&state.db)
        .await?
        .into_iter()
        .filter(|s| {
            let automatic = matches!(s.row.anilist_id_source.as_deref(), None | Some("auto"));
            if everything {
                automatic
            } else {
                needs_review(s)
            }
        })
        .map(|s| (s.row.id, s.row.name, s.row.anilist_id))
        .collect();

    {
        let mut status = rematch_status();
        if status.running {
            return Ok((StatusCode::ACCEPTED, Json(status.clone())));
        }
        *status = RematchStatus {
            running: !targets.is_empty(),
            done: 0,
            total: targets.len(),
            changed: 0,
            finished_at: targets.is_empty().then(|| chrono::Utc::now().to_rfc3339()),
        };
    }
    let started = rematch_status().clone();
    if targets.is_empty() {
        return Ok((StatusCode::ACCEPTED, Json(started)));
    }

    log_admin_event(
        &state.db,
        "info",
        "anilist",
        &format!(
            "{} started matching {} series again",
            admin.name,
            targets.len()
        ),
        None,
    )
    .await;

    let db = state.db.clone();
    let client = state.http_client.clone();
    tokio::spawn(async move {
        let total = targets.len();
        for (i, (id, name, before)) in targets.into_iter().enumerate() {
            if let Err(e) =
                crate::anilist::fetch_and_save_for_series(&client, &db, &id, &name, false).await
            {
                tracing::warn!("[anilist] Matching {} again failed: {}", name, e);
            }
            let after: Option<i64> =
                sqlx::query_as::<_, (Option<i64>,)>("SELECT anilist_id FROM series WHERE id = ?")
                    .bind(&id)
                    .fetch_optional(&db)
                    .await
                    .ok()
                    .flatten()
                    .and_then(|(a,)| a);

            {
                let mut status = rematch_status();
                status.done = i + 1;
                if after != before {
                    status.changed += 1;
                }
            }
            if i + 1 < total {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            }
        }

        let changed = {
            let mut status = rematch_status();
            status.running = false;
            status.finished_at = Some(chrono::Utc::now().to_rfc3339());
            status.changed
        };
        log_admin_event(
            &db,
            "info",
            "anilist",
            &format!("Matched {} series again: {} changed", total, changed),
            None,
        )
        .await;
    });

    Ok((StatusCode::ACCEPTED, Json(started)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn series(name: &str, source: Option<&str>, english: Option<&str>) -> SeriesMatch {
        let row = MetadataRow {
            id: "s".to_string(),
            name: name.to_string(),
            library_name: "Manga".to_string(),
            book_count: 1,
            anilist_id: english.map(|_| 1),
            anilist_id_source: source.map(str::to_string),
            title_english: english.map(str::to_string),
            title_romaji: None,
            cover_url: None,
            start_year: None,
        };
        SeriesMatch {
            match_score: match_score(&row),
            row,
        }
    }

    #[test]
    fn doubtful_automatic_matches_need_review() {
        assert!(needs_review(&series(
            "Berserk",
            Some("auto"),
            Some("Berserk of Gluttony")
        )));
        assert!(!needs_review(&series(
            "Berserk",
            Some("auto"),
            Some("Berserk")
        )));
        // Someone chose it: their call.
        assert!(!needs_review(&series(
            "Berserk",
            Some("manual"),
            Some("Berserk of Gluttony")
        )));
        // No match at all.
        assert!(needs_review(&series("Berserk", None, None)));
    }

    #[test]
    fn folder_decorations_dont_lower_the_score() {
        let s = series("Berserk (1989) [Digital]", Some("auto"), Some("Berserk"));
        assert_eq!(s.match_score, Some(1.0));
    }
}
