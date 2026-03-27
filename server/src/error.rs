use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Too many requests")]
    TooManyRequests,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, "Too many requests. Please try again later.".to_string()),
            AppError::Database(e) => {
                tracing::error!("Database error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            AppError::Io(e) => {
                tracing::error!("IO error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            AppError::Zip(e) => {
                tracing::error!("ZIP error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to read archive".to_string(),
                )
            }
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = json!({ "error": message });
        (status, axum::Json(body)).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;

    fn status_of(err: AppError) -> StatusCode {
        err.into_response().status()
    }

    #[test]
    fn not_found_returns_404() {
        assert_eq!(status_of(AppError::NotFound("x".into())), StatusCode::NOT_FOUND);
    }

    #[test]
    fn bad_request_returns_400() {
        assert_eq!(status_of(AppError::BadRequest("x".into())), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn unauthorized_returns_401() {
        assert_eq!(status_of(AppError::Unauthorized), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn too_many_requests_returns_429() {
        assert_eq!(status_of(AppError::TooManyRequests), StatusCode::TOO_MANY_REQUESTS);
    }

    #[test]
    fn internal_returns_500() {
        assert_eq!(status_of(AppError::Internal("fail".into())), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn from_anyhow_converts_to_internal() {
        let err: AppError = anyhow::anyhow!("something broke").into();
        assert_eq!(status_of(err), StatusCode::INTERNAL_SERVER_ERROR);
    }
}
