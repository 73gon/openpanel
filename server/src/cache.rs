use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::Mutex;

use crate::zip::ZipIndex;

#[allow(dead_code)]
pub struct ZipIndexCache {
    inner: Mutex<LruCache<String, ZipIndex>>,
}

#[allow(dead_code)]
impl ZipIndexCache {
    pub fn new(cap: usize) -> Self {
        Self {
            inner: Mutex::new(LruCache::new(
                NonZeroUsize::new(cap).unwrap_or(NonZeroUsize::new(1).unwrap()),
            )),
        }
    }

    pub fn get(&self, book_id: &str) -> Option<ZipIndex> {
        self.inner.lock().unwrap().get(book_id).cloned()
    }

    pub fn insert(&self, book_id: String, index: ZipIndex) {
        self.inner.lock().unwrap().put(book_id, index);
    }

    #[allow(dead_code)]
    pub fn invalidate(&self, book_id: &str) {
        self.inner.lock().unwrap().pop(book_id);
    }
}
