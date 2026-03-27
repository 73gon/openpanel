use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub data_dir: PathBuf,
    pub library_roots: Vec<PathBuf>,
    pub dev_mode: bool,
    pub log_level: String,
    pub zip_cache_size: usize,
    pub scan_on_startup: bool,
    pub public_url: String,
    pub db_url: String,
    pub ui_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        let data_dir = PathBuf::from(
            std::env::var("OPENPANEL_DATA_DIR").unwrap_or_else(|_| "./data".to_string()),
        );

        let library_roots: Vec<PathBuf> = std::env::var("OPENPANEL_LIBRARY_ROOTS")
            .unwrap_or_else(|_| "./libraries".to_string())
            .split(',')
            .map(|s| PathBuf::from(s.trim()))
            .collect();

        let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            // Use forward slashes for SQLite URL compatibility on Windows
            let db_path = data_dir.join("openpanel.db");
            let db_path_str = db_path.to_string_lossy().replace('\\', "/");
            format!("sqlite:{}?mode=rwc", db_path_str)
        });

        Config {
            port: std::env::var("OPENPANEL_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3001),
            data_dir,
            library_roots,
            dev_mode: std::env::var("OPENPANEL_DEV_MODE").unwrap_or_else(|_| "false".to_string())
                == "true",
            log_level: std::env::var("OPENPANEL_LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            zip_cache_size: std::env::var("OPENPANEL_ZIP_CACHE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(200),
            scan_on_startup: std::env::var("OPENPANEL_SCAN_ON_STARTUP")
                .unwrap_or_else(|_| "true".to_string())
                == "true",
            public_url: std::env::var("OPENPANEL_PUBLIC_URL")
                .unwrap_or_else(|_| "http://localhost:3001".to_string()),
            db_url,
            ui_dir: Self::resolve_ui_dir(),
        }
    }

    /// Find the `ui/dist` directory by checking, in order:
    /// 1. `OPENPANEL_UI_DIR` env var (explicit override)
    /// 2. `./ui/dist` relative to the current working directory
    /// 3. `../ui/dist` relative to the executable's location
    ///    (handles `<repo>/server/target/release/openpanel-server` → `<repo>/ui/dist`)
    /// 4. `../../ui/dist` relative to the executable (another common layout)
    /// 5. `../../../ui/dist` relative to the executable
    ///    (handles `<repo>/server/target/release/` → 3 levels up → `<repo>/ui/dist`)
    ///
    /// Falls back to `./ui/dist` if nothing is found (will produce clear 404s).
    fn resolve_ui_dir() -> PathBuf {
        // 1. Explicit env var
        if let Ok(dir) = std::env::var("OPENPANEL_UI_DIR") {
            let p = PathBuf::from(&dir);
            if p.join("index.html").exists() {
                return p;
            }
        }

        // 2. Relative to CWD (works in Docker where WORKDIR=/app)
        let cwd_candidate = PathBuf::from("ui/dist");
        if cwd_candidate.join("index.html").exists() {
            return cwd_candidate;
        }

        // 3-5. Relative to the binary location
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                for ancestor in &["../ui/dist", "../../ui/dist", "../../../ui/dist"] {
                    let candidate = exe_dir.join(ancestor);
                    if candidate.join("index.html").exists() {
                        return candidate;
                    }
                }
            }
        }

        // Fallback
        PathBuf::from("ui/dist")
    }
}
