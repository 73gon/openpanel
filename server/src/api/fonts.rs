use axum::extract::{Path, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};

use crate::error::AppError;
use crate::state::AppState;

/// Where the zon/ui typefaces (Licht, Licht Sans, Licht Mono) are published.
const LICHT_ORIGIN: &str = "https://www.zon.sh";

/// Whether `file` is a plain font file name such as `LichtSans-Regular.woff2`: no paths, no
/// queries, nothing that could point the proxy anywhere else.
fn is_font_file(file: &str) -> bool {
    let Some(stem) = file.strip_suffix(".woff2") else {
        return false;
    };
    file.len() <= 64
        && !stem.is_empty()
        && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// GET /licht/fonts/{file} — the UI's typefaces, proxied from zon.sh, so a visitor's browser only
/// ever talks to this server and no IP reaches a third party. The faces are unversioned, so they
/// are not bundled; browsers keep each for a day.
pub async fn licht_font(
    State(state): State<AppState>,
    Path(file): Path<String>,
) -> Result<Response, AppError> {
    if !is_font_file(&file) {
        return Err(AppError::NotFound("Font not found".into()));
    }

    let upstream = state
        .http_client
        .get(format!("{LICHT_ORIGIN}/licht/fonts/{file}"))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Font request failed: {e}")))?;
    if !upstream.status().is_success() {
        return Err(AppError::NotFound("Font not found".into()));
    }
    let body = upstream
        .bytes()
        .await
        .map_err(|e| AppError::Internal(format!("Font download failed: {e}")))?;

    Ok((
        [
            (header::CONTENT_TYPE, "font/woff2"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        body,
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::is_font_file;

    #[test]
    fn accepts_font_file_names() {
        assert!(is_font_file("LichtSerif-Light.woff2"));
        assert!(is_font_file("LichtMono-Regular.woff2"));
    }

    #[test]
    fn rejects_anything_else() {
        assert!(!is_font_file(".woff2"));
        assert!(!is_font_file("LichtSans-Regular.ttf"));
        assert!(!is_font_file("../secret.woff2"));
        assert!(!is_font_file("a/b.woff2"));
        assert!(!is_font_file("Licht.woff2?x=1"));
        assert!(!is_font_file(&format!("{}.woff2", "a".repeat(60))));
    }
}
