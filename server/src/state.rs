use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Instant;

use sqlx::SqlitePool;
use tokio::sync::{broadcast, Mutex, RwLock};

use crate::cache::ZipIndexCache;
use crate::config::Config;
use crate::scanner::ScanStatus;

/// Per-book lock for thumbnail generation coalescing.
/// Prevents multiple concurrent requests from generating the same thumbnail.
pub type ThumbLockMap = Arc<Mutex<HashMap<String, Arc<tokio::sync::Semaphore>>>>;

/// Events broadcast to SSE notification listeners.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum NotificationEvent {
    ScanComplete { scanned: usize, errors: usize },
    NewBooks { count: usize, series_name: String },
    BackupComplete { filename: String },
}

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

    /// Remove IPs with no recent requests from the map.
    pub async fn cleanup_stale(&self) {
        let mut map = self.requests.lock().await;
        let now = Instant::now();
        let window = std::time::Duration::from_secs(self.window_secs);
        map.retain(|_ip, timestamps| {
            timestamps.retain(|t| now.duration_since(*t) < window);
            !timestamps.is_empty()
        });
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
    /// Per-book semaphore map to prevent duplicate thumbnail generation.
    pub thumb_locks: ThumbLockMap,
    /// Shared HTTP client for outbound requests (AniList, GitHub, etc.).
    pub http_client: reqwest::Client,
    /// Broadcast channel for real-time SSE notifications.
    pub notify_tx: broadcast::Sender<NotificationEvent>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    #[tokio::test]
    async fn rate_limiter_allows_within_limit() {
        let rl = RateLimiter::new(3, 60);
        let ip: IpAddr = Ipv4Addr::new(1, 2, 3, 4).into();
        assert!(rl.check(ip).await);
        assert!(rl.check(ip).await);
        assert!(rl.check(ip).await);
    }

    #[tokio::test]
    async fn rate_limiter_blocks_over_limit() {
        let rl = RateLimiter::new(2, 60);
        let ip: IpAddr = Ipv4Addr::new(1, 2, 3, 4).into();
        assert!(rl.check(ip).await);
        assert!(rl.check(ip).await);
        assert!(!rl.check(ip).await); // 3rd should be blocked
    }

    #[tokio::test]
    async fn rate_limiter_separate_ips() {
        let rl = RateLimiter::new(1, 60);
        let ip1: IpAddr = Ipv4Addr::new(1, 1, 1, 1).into();
        let ip2: IpAddr = Ipv4Addr::new(2, 2, 2, 2).into();
        assert!(rl.check(ip1).await);
        assert!(!rl.check(ip1).await); // ip1 exhausted
        assert!(rl.check(ip2).await); // ip2 still fresh
    }

    #[tokio::test]
    async fn rate_limiter_cleanup_removes_stale() {
        let rl = RateLimiter::new(100, 0); // 0-second window = immediate expiry
        let ip: IpAddr = Ipv4Addr::new(1, 1, 1, 1).into();
        rl.check(ip).await;
        rl.cleanup_stale().await;
        let map = rl.requests.lock().await;
        assert!(map.is_empty());
    }
}
