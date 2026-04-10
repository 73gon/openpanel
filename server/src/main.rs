mod anilist;
mod api;
mod cache;
mod config;
mod db;
mod error;
mod scanner;
mod state;
mod updater;
pub mod utils;
mod zip;

use std::sync::Arc;

use axum::extract::Request;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{Html, IntoResponse, Response};
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

/// Data attached to every request via middleware; handlers can pull it from
/// extensions if they need request-scoped tracing fields.
#[derive(Clone, Debug)]
pub struct RequestContext {
    pub request_id: String,
    pub ip_address: String,
    pub user_agent: String,
}

/// Middleware that assigns a unique request ID, records start time, extracts
/// client IP + User-Agent, and logs completed requests.
async fn request_tracing(
    axum::extract::State(state): axum::extract::State<AppState>,
    mut req: Request,
    next: Next,
) -> Response {
    let request_id = uuid::Uuid::new_v4().to_string();
    let ip = api::auth::client_ip(req.headers()).to_string();
    let ua = req
        .headers()
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let method = req.method().clone();
    let uri = req.uri().path().to_string();

    req.extensions_mut().insert(RequestContext {
        request_id: request_id.clone(),
        ip_address: ip.clone(),
        user_agent: ua.clone(),
    });

    let start = std::time::Instant::now();
    let response = next.run(req).await;
    let duration_ms = start.elapsed().as_millis() as i64;
    let status = response.status().as_u16();

    tracing::info!(
        request_id = %request_id,
        method = %method,
        uri = %uri,
        status = status,
        duration_ms = duration_ms,
        ip = %ip,
        "request completed"
    );

    // Log slow requests (>2s) or server errors to admin_logs
    if duration_ms > 2000 || status >= 500 {
        let level = if status >= 500 { "error" } else { "warn" };
        let message = format!("{method} {uri} → {status} ({duration_ms}ms)");
        let ctx = api::admin::LogContext {
            ip_address: Some(&ip),
            user_agent: Some(&ua),
            request_duration_ms: Some(duration_ms),
            request_id: Some(&request_id),
            ..Default::default()
        };
        api::admin::log_admin_event_ext(&state.db, level, "request", &message, None, &ctx).await;
    }

    response
}

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
    tracing::info!("Target: {}", updater::current_target());
    tracing::info!("UI dir: {}", config.ui_dir.display());

    // Clean up leftover .old files from a previous self-update
    updater::cleanup_old_files();
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

    let (notify_tx, _) = tokio::sync::broadcast::channel::<state::NotificationEvent>(64);

    let state = AppState {
        db: pool.clone(),
        config: Arc::new(config.clone()),
        zip_cache: Arc::new(ZipIndexCache::new(config.zip_cache_size)),
        scan_status: scan_status.clone(),
        auth_rate_limiter: Arc::new(state::RateLimiter::new(10, 60)),
        thumb_locks: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        http_client: reqwest::Client::builder()
            .user_agent("OpenPanel-Server")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client"),
        notify_tx: notify_tx.clone(),
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
        let data_dir_clone = config.data_dir.clone();
        let scan_status_clone = scan_status.clone();
        let http_client_clone = state.http_client.clone();
        let notify_tx_clone = notify_tx.clone();

        tokio::spawn(async move {
            scanner::scan_libraries(
                &pool_clone,
                &scan_status_clone,
                &data_dir_clone,
                http_client_clone,
                Some(&notify_tx_clone),
            )
            .await;
        });
    }

    // Periodic rate-limiter cleanup (every 5 minutes)
    {
        let limiter = state.auth_rate_limiter.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
            interval.tick().await; // first tick is immediate
            loop {
                interval.tick().await;
                limiter.cleanup_stale().await;
            }
        });
    }

    // Task 37: Periodic session purge (every hour)
    {
        let pool_clone = pool.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
            interval.tick().await;
            loop {
                interval.tick().await;
                api::admin::purge_expired_sessions(&pool_clone).await;
            }
        });
    }

    // Task 32: Configurable auto-scan interval
    {
        let pool_clone = pool.clone();
        let scan_status_clone = scan_status.clone();
        let data_dir_clone = config.data_dir.clone();
        let http_client_clone = state.http_client.clone();
        let notify_tx_clone2 = notify_tx.clone();
        tokio::spawn(async move {
            loop {
                let interval_min = api::admin::get_setting(&pool_clone, "auto_scan_interval_min")
                    .await
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(0);

                if interval_min == 0 {
                    // Disabled — check again in 60s
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    continue;
                }

                tokio::time::sleep(std::time::Duration::from_secs(interval_min * 60)).await;

                // Only scan if not already running
                let running = scan_status_clone.read().await.running;
                if !running {
                    tracing::info!("Auto-scan triggered (interval={}min)", interval_min);
                    scanner::scan_libraries(
                        &pool_clone,
                        &scan_status_clone,
                        &data_dir_clone,
                        http_client_clone.clone(),
                        Some(&notify_tx_clone2),
                    )
                    .await;
                }
            }
        });
    }

    // Task 39: Scheduled automatic backups
    {
        let pool_clone = pool.clone();
        let data_dir_clone = config.data_dir.clone();
        tokio::spawn(async move {
            loop {
                let interval_hours =
                    api::admin::get_setting(&pool_clone, "auto_backup_interval_hours")
                        .await
                        .and_then(|v| v.parse::<u64>().ok())
                        .unwrap_or(0);

                if interval_hours == 0 {
                    tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                    continue;
                }

                tokio::time::sleep(std::time::Duration::from_secs(interval_hours * 3600)).await;
                api::admin::run_scheduled_backup(&pool_clone, &data_dir_clone).await;
            }
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
        .route("/api/openapi.yaml", get(openapi_spec))
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
        .route("/api/progress/bulk-mark", post(api::progress::bulk_mark_progress))
        .route("/api/progress/stats", get(api::progress::reading_stats))
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
            "/api/admin/libraries/drives",
            get(api::admin::list_drives),
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
        .route("/api/admin/self-update", post(api::admin::self_update))
        .route("/api/admin/check-update", get(api::admin::check_update))
        .route("/api/admin/logs", get(api::admin::get_logs))
        .route("/api/admin/log", post(api::admin::add_client_log))
        .route("/api/admin/backup", post(api::admin::trigger_backup))
        .route("/api/admin/backups", get(api::admin::list_backups))
        //  Search
        .route("/api/search", get(api::library::search))
        //  SSE scan progress
        .route("/api/admin/scan/stream", get(api::admin::scan_stream))
        //  Device tracking
        .route("/api/admin/devices", get(api::admin::list_devices))
        .route("/api/admin/devices/{device_id}", delete(api::admin::delete_device))
        //  Health detail
        .route("/api/health/detail", get(api::admin::health_detail))
        //  DB size
        .route("/api/admin/db-size", get(api::admin::db_size))
        //  User data export/import
        .route("/api/user-data/export", get(api::admin::export_user_data))
        .route("/api/user-data/import", post(api::admin::import_user_data))
        //  Reading stats
        .route("/api/reading-stats", get(api::admin::get_reading_stats).post(api::admin::record_reading))
        //  SSE notifications
        .route("/api/notifications/stream", get(api::admin::notifications_stream))
        //  Series continue (Phase 6)
        .route("/api/series-continue", get(api::progress::series_continue))
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
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "default-src 'self'; img-src 'self' https://s4.anilist.co data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'"
            ),
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
        .layer(axum::middleware::from_fn_with_state(state.clone(), request_tracing))
        .with_state(state);

    // SPA fallback: serve static files from ui/dist, but for any path that
    // doesn't match a real file, serve index.html with 200 (not 404).
    let index_html: &'static str = Box::leak(
        std::fs::read_to_string(config.ui_dir.join("index.html"))
            .unwrap_or_else(|e| {
                tracing::warn!(
                    "Could not read index.html from {}: {}",
                    config.ui_dir.display(),
                    e
                );
                "<h1>Frontend not found</h1>".to_string()
            })
            .into_boxed_str(),
    );

    let serve_dir = ServeDir::new(&config.ui_dir);

    let app = app.fallback_service(tower::service_fn(move |req: axum::extract::Request| {
        let mut serve_dir = serve_dir.clone();
        async move {
            use tower::Service;
            let response = serve_dir.call(req).await;
            match response {
                Ok(resp) => {
                    if resp.status() == StatusCode::NOT_FOUND {
                        // File not found → serve SPA shell with 200
                        Ok(Html(index_html).into_response())
                    } else {
                        // Real file → convert body to axum::body::Body
                        let (parts, body) = resp.into_parts();
                        Ok(axum::http::Response::from_parts(
                            parts,
                            axum::body::Body::new(body),
                        ))
                    }
                }
                Err(e) => {
                    // Infallible, but just in case
                    tracing::error!("ServeDir error: {}", e);
                    Ok(Html(index_html).into_response())
                }
            }
        }
    }));

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;

    // Task 36: Graceful shutdown on SIGINT / SIGTERM
    let shutdown = async {
        let ctrl_c = tokio::signal::ctrl_c();
        #[cfg(unix)]
        {
            let mut sigterm =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("failed to register SIGTERM handler");
            tokio::select! {
                _ = ctrl_c => {},
                _ = sigterm.recv() => {},
            }
        }
        #[cfg(not(unix))]
        ctrl_c.await.ok();
        tracing::info!("Shutdown signal received, stopping server...");
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await?;

    tracing::info!("Server stopped gracefully");
    Ok(())
}

async fn health() -> &'static str {
    "OK"
}

async fn openapi_spec() -> (
    axum::http::StatusCode,
    [(axum::http::header::HeaderName, &'static str); 1],
    &'static str,
) {
    (
        axum::http::StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/yaml; charset=utf-8")],
        include_str!("../../docs/openapi.yaml"),
    )
}
