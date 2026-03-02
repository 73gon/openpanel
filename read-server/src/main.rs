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
use axum::routing::{delete, get, post, put};
use axum::Router;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use cache::ZipIndexCache;
use config::Config;
use scanner::ScanStatus;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env if present
    dotenvy::dotenv().ok();

    let config = Config::from_env();

    // Setup tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&config.log_level)),
        )
        .init();

    tracing::info!("Starting Panel server v{}", env!("CARGO_PKG_VERSION"));
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
    };

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
        // Health check
        .route("/api/health", get(health))
        // Library browsing
        .route("/api/libraries", get(api::library::list_libraries))
        .route(
            "/api/libraries/{library_id}/series",
            get(api::library::list_series),
        )
        .route("/api/series", get(api::library::all_series))
        .route(
            "/api/series/{series_id}/books",
            get(api::library::list_books),
        )
        .route(
            "/api/series/{series_id}/rescan",
            post(api::library::rescan_series),
        )
        .route("/api/books/{book_id}", get(api::library::book_detail))
        // Page streaming
        .route(
            "/api/books/{book_id}/pages/{page_num}",
            get(api::reader::page),
        )
        // Profiles
        .route("/api/profiles", get(api::profile::list_profiles))
        .route(
            "/api/profiles/{profile_id}/select",
            post(api::profile::select_profile),
        )
        .route("/api/profiles/logout", post(api::profile::logout))
        // Progress
        .route(
            "/api/progress",
            get(api::progress::get_progress).put(api::progress::update_progress),
        )
        .route(
            "/api/progress/migrate",
            post(api::progress::migrate_progress),
        )
        // Admin
        .route("/api/admin/status", get(api::admin::admin_status))
        .route("/api/admin/setup", post(api::admin::setup))
        .route("/api/admin/unlock", post(api::admin::unlock))
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
            delete(api::admin::remove_library),
        )
        .route("/api/admin/profiles", post(api::admin::create_profile))
        .route(
            "/api/admin/profiles/{profile_id}",
            delete(api::admin::delete_profile),
        )
        .route("/api/admin/password", put(api::admin::change_password))
        .route("/api/admin/update", post(api::admin::trigger_update))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
        // Serve static frontend files in production
        .fallback_service(
            ServeDir::new("read-ui/dist")
                .not_found_service(ServeFile::new("read-ui/dist/index.html")),
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
