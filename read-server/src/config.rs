use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub data_dir: PathBuf,
    pub library_roots: Vec<PathBuf>,
    pub dev_mode: bool,
    pub log_level: String,
    pub zip_cache_size: usize,
    #[allow(dead_code)]
    pub admin_session_timeout_min: i64,
    pub scan_on_startup: bool,
    pub public_url: String,
    pub db_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        let data_dir =
            PathBuf::from(std::env::var("PANEL_DATA_DIR").unwrap_or_else(|_| "./data".to_string()));

        let library_roots: Vec<PathBuf> = std::env::var("PANEL_LIBRARY_ROOTS")
            .unwrap_or_else(|_| "./libraries".to_string())
            .split(',')
            .map(|s| PathBuf::from(s.trim()))
            .collect();

        let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            // Use forward slashes for SQLite URL compatibility on Windows
            let db_path = data_dir.join("panel.db");
            let db_path_str = db_path.to_string_lossy().replace('\\', "/");
            format!("sqlite:{}?mode=rwc", db_path_str)
        });

        Config {
            port: std::env::var("PANEL_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3001),
            data_dir,
            library_roots,
            dev_mode: std::env::var("PANEL_DEV_MODE").unwrap_or_else(|_| "false".to_string())
                == "true",
            log_level: std::env::var("PANEL_LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            zip_cache_size: std::env::var("PANEL_ZIP_CACHE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(200),
            admin_session_timeout_min: std::env::var("PANEL_ADMIN_SESSION_TIMEOUT_MIN")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15),
            scan_on_startup: std::env::var("PANEL_SCAN_ON_STARTUP")
                .unwrap_or_else(|_| "true".to_string())
                == "true",
            public_url: std::env::var("PANEL_PUBLIC_URL")
                .unwrap_or_else(|_| "http://localhost:3001".to_string()),
            db_url,
        }
    }
}
