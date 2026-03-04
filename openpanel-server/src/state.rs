use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Instant;

use sqlx::SqlitePool;
use tokio::sync::{Mutex, RwLock};

use crate::cache::ZipIndexCache;
use crate::config::Config;
use crate::scanner::ScanStatus;

/// Simple in-memory rate limiter for auth endpoints.
/// Tracks request timestamps per IP and enforces max requests per window.
pub struct RateLimiter {
    requests: Mutex<HashMap<IpAddr, Vec<Instant>>>,
    max_requests: usize,
    window_secs: u64,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            requests: Mutex::new(HashMap::new()),
            max_requests,
            window_secs,
        }
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    pub async fn check(&self, ip: IpAddr) -> bool {
        let mut map = self.requests.lock().await;
        let now = Instant::now();
        let window = std::time::Duration::from_secs(self.window_secs);

        let timestamps = map.entry(ip).or_default();
        // Remove expired entries
        timestamps.retain(|t| now.duration_since(*t) < window);

        if timestamps.len() >= self.max_requests {
            return false;
        }

        timestamps.push(now);
        true
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<Config>,
    #[allow(dead_code)]
    pub zip_cache: Arc<ZipIndexCache>,
    pub scan_status: Arc<RwLock<ScanStatus>>,
    pub auth_rate_limiter: Arc<RateLimiter>,
}
