use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::RwLock;

use crate::cache::ZipIndexCache;
use crate::config::Config;
use crate::scanner::ScanStatus;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<Config>,
    #[allow(dead_code)]
    pub zip_cache: Arc<ZipIndexCache>,
    pub scan_status: Arc<RwLock<ScanStatus>>,
}
