mod anilist;
mod api;
mod cache;
mod config;
mod db;
mod error;
mod scanner;
mod state;
mod zip;

use std::sync::Arc;

use axum::http::{HeaderValue, Method};
use axum::response::{Html, IntoResponse};
use axum::routing::{delete, get, post, put};
use axum::Router;
use tokio::sync::RwLock;
use tower_http::compression::predicate::{DefaultPredicate, NotForContentType, Predicate};
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use cache::ZipIndexCache;
use config::Config;
use scanner::ScanStatus;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Capture process startup time for restart detection
    let startup_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    api::admin::STARTUP_TIME.set(startup_ts).ok();

    // Load .env if present
    dotenvy::dotenv().ok();

    let config = Config::from_env();

    // Setup tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&config.log_level)),
        )
        .init();

    tracing::info!("Starting OpenPanel server v{}", env!("CARGO_PKG_VERSION"));
    tracing::info!("UI dir: {}", config.ui_dir.display());
    tracing::info!("Data dir: {}", config.data_dir.display());
    tracing::info!(
        "Library roots: {:?}",
        config
            .library_roots
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
    );

    // Ensure directories exist
    tokio::fs::create_dir_all(&config.data_dir).await?;

    // Initialize database
    let pool = db::init_pool(&config.db_url, &config.data_dir).await?;
    db::run_migrations(&pool).await?;

    let scan_status = Arc::new(RwLock::new(ScanStatus::default()));

    let state = AppState {
        db: pool.clone(),
        config: Arc::new(config.clone()),
        zip_cache: Arc::new(ZipIndexCache::new(config.zip_cache_size)),
        scan_status: scan_status.clone(),
        auth_rate_limiter: Arc::new(state::RateLimiter::new(10, 60)),
    };

    // Log server startup
    api::admin::log_admin_event(
        &pool,
        "info",
        "server",
        &format!(
            "Server started (v{}, commit {}, channel {})",
            env!("BUILD_VERSION"),
            env!("GIT_COMMIT_SHA"),
            env!("BUILD_CHANNEL"),
        ),
        None,
    )
    .await;

    // Run initial scan if configured
    if config.scan_on_startup {
        let pool_clone = pool.clone();
        let roots = config.library_roots.clone();
        let scan_status_clone = scan_status.clone();

        tokio::spawn(async move {
            scanner::scan_libraries(&pool_clone, &roots, &scan_status_clone).await;
        });
    }

    // Build CORS layer
    let cors = if config.dev_mode {
        CorsLayer::new()
            .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
            .allow_headers(tower_http::cors::Any)
    } else {
        CorsLayer::new()
            .allow_origin(
                config
                    .public_url
                    .parse::<HeaderValue>()
                    .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:3001")),
            )
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
            .allow_headers(tower_http::cors::Any)
    };

    // Build router
    let app = Router::new()
        //  Health
        .route("/api/health", get(health))
        //  Auth
        .route("/api/auth/register", post(api::auth::register))
        .route("/api/auth/login", post(api::auth::login))
        .route("/api/auth/logout", post(api::auth::logout))
        .route("/api/auth/me", get(api::auth::me))
        .route("/api/auth/status", get(api::auth::status))
        //  Library browsing
        .route("/api/libraries", get(api::library::list_libraries))
        .route(
            "/api/libraries/{library_id}/series",
            get(api::library::list_series),
        )
        .route("/api/series", get(api::library::all_series))
        .route("/api/genres", get(api::library::available_genres))
        .route(
            "/api/series/recently-added",
            get(api::library::recently_added),
        )
        .route(
            "/api/series/recently-updated",
            get(api::library::recently_updated),
        )
        .route(
            "/api/series/{series_id}/books",
            get(api::library::list_books),
        )
        .route(
            "/api/series/{series_id}/chapters",
            get(api::library::series_chapters),
        )
        .route(
            "/api/series/{series_id}/rescan",
            post(api::library::rescan_series),
        )
        .route(
            "/api/series/{series_id}/metadata",
            get(api::library::get_series_metadata)
                .put(api::library::set_series_metadata)
                .delete(api::library::clear_series_metadata),
        )
        .route(
            "/api/series/{series_id}/metadata/refresh",
            post(api::library::refresh_series_metadata),
        )
        .route("/api/books/{book_id}", get(api::library::book_detail))
        .route(
            "/api/books/{book_id}/chapters",
            get(api::library::book_chapters),
        )
        //  Page streaming
        .route(
            "/api/books/{book_id}/pages/{page_num}",
            get(api::reader::page),
        )
        //  Book download
        .route(
            "/api/books/{book_id}/download",
            get(api::reader::download_book),
        )
        //  Page manifest
        .route(
            "/api/books/{book_id}/manifest",
            get(api::reader::page_manifest),
        )
        //  Thumbnails
        .route(
            "/api/books/{book_id}/thumbnail",
            get(api::reader::thumbnail),
        )
        .route(
            "/api/series/{series_id}/thumbnail",
            get(api::reader::series_thumbnail),
        )
        //  Progress
        .route(
            "/api/progress",
            get(api::progress::get_progress).put(api::progress::update_progress),
        )
        .route("/api/progress/batch", get(api::progress::batch_progress))
        .route(
            "/api/continue-reading",
            get(api::progress::continue_reading),
        )
        //  Bookmarks
        .route(
            "/api/bookmarks",
            get(api::progress::list_bookmarks).post(api::progress::create_bookmark),
        )
        .route(
            "/api/bookmarks/{bookmark_id}",
            delete(api::progress::delete_bookmark),
        )
        //  Collections
        .route(
            "/api/collections",
            get(api::progress::list_collections).post(api::progress::create_collection),
        )
        .route(
            "/api/collections/{collection_id}",
            get(api::progress::get_collection).delete(api::progress::delete_collection),
        )
        .route(
            "/api/collections/{collection_id}/items",
            post(api::progress::add_collection_item),
        )
        .route(
            "/api/collections/{collection_id}/items/{series_id}",
            delete(api::progress::remove_collection_item),
        )
        //  Preferences
        .route(
            "/api/preferences",
            get(api::progress::get_preferences).put(api::progress::update_preferences),
        )
        //  Version (public)
        .route("/api/version", get(api::admin::get_version))
        //  Admin
        .route(
            "/api/admin/settings",
            get(api::admin::get_settings).put(api::admin::update_settings),
        )
        .route("/api/admin/scan", post(api::admin::trigger_scan))
        .route("/api/admin/scan/status", get(api::admin::scan_status))
        .route("/api/admin/libraries", post(api::admin::add_library))
        .route(
            "/api/admin/libraries/browse",
            get(api::admin::browse_directories),
        )
        .route(
            "/api/admin/libraries/{library_id}",
            delete(api::admin::remove_library).put(api::admin::update_library),
        )
        .route(
            "/api/admin/profiles",
            get(api::admin::list_profiles).post(api::admin::create_profile),
        )
        .route(
            "/api/admin/profiles/{profile_id}",
            delete(api::admin::delete_profile),
        )
        .route(
            "/api/admin/profiles/{profile_id}/reset-password",
            put(api::admin::reset_user_password),
        )
        .route("/api/admin/password", put(api::admin::change_password))
        .route("/api/admin/update", post(api::admin::trigger_update))
        .route("/api/admin/check-update", get(api::admin::check_update))
        .route("/api/admin/logs", get(api::admin::get_logs))
        .route("/api/admin/log", post(api::admin::add_client_log))
        .route("/api/admin/backup", post(api::admin::trigger_backup))
        .route("/api/admin/backups", get(api::admin::list_backups))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(
            CompressionLayer::new().gzip(true).br(true).compress_when(
                DefaultPredicate::new()
                    .and(NotForContentType::new("image/jpeg"))
                    .and(NotForContentType::new("image/png"))
                    .and(NotForContentType::new("image/webp"))
                    .and(NotForContentType::new("image/gif"))
                    .and(NotForContentType::new("image/avif"))
                    .and(NotForContentType::new("application/zip"))
                    .and(NotForContentType::new("application/octet-stream")),
            ),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // SPA fallback: serve index.html with 200 for any non-API, non-static route
    let index_html = std::fs::read_to_string(config.ui_dir.join("index.html"))
        .unwrap_or_else(|e| {
            tracing::warn!("Could not read index.html from {}: {}", config.ui_dir.display(), e);
            "<h1>Frontend not found</h1>".to_string()
        });

    let spa_fallback = tower::service_fn(move |_req: axum::extract::Request| {
        let html = index_html.clone();
        async move {
            Ok::<_, std::convert::Infallible>(
                Html(html).into_response(),
            )
        }
    });

    let app = app.fallback_service(
        ServeDir::new(&config.ui_dir)
            .not_found_service(spa_fallback),
    );

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> &'static str {
    "OK"
}
