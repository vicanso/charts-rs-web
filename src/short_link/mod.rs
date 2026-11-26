use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::config::{ShortLinkConfig, must_new_short_link_config};
use crate::error::{HttpError, HttpResult};

pub const NANOID_LENGTH: usize = 10;
const NANOID_ALPHABET: &[u8; 64] =
    b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

pub type StoreFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Pluggable asynchronous KV storage abstraction for short links (`set` with TTL + `get`).
/// Future implementations (e.g. Redis, SQLite, S3) can swap in behind `Arc<dyn ShortLinkStore>`.
pub trait ShortLinkStore: Send + Sync {
    fn set<'a>(
        &'a self,
        id: &'a str,
        value: Vec<u8>,
        ttl: Duration,
    ) -> StoreFuture<'a, Result<(), String>>;

    fn get<'a>(&'a self, id: &'a str) -> StoreFuture<'a, Result<Option<Vec<u8>>, String>>;
}

struct MemoryEntry {
    value: Vec<u8>,
    expires_at: Instant,
}

/// Bounded in-memory [`ShortLinkStore`] with lazy expiration and oldest-expiry eviction.
pub struct MemoryStore {
    max_entries: usize,
    entries: RwLock<HashMap<String, MemoryEntry>>,
}

impl MemoryStore {
    pub fn new(max_entries: usize) -> Self {
        Self {
            max_entries: max_entries.max(1),
            entries: RwLock::new(HashMap::new()),
        }
    }
}

impl ShortLinkStore for MemoryStore {
    fn set<'a>(
        &'a self,
        id: &'a str,
        value: Vec<u8>,
        ttl: Duration,
    ) -> StoreFuture<'a, Result<(), String>> {
        Box::pin(async move {
            let mut map = self
                .entries
                .write()
                .map_err(|_| "memory store lock poisoned".to_string())?;
            if ttl.is_zero() {
                map.remove(id);
                return Ok(());
            }

            let now = Instant::now();
            if !map.contains_key(id) && map.len() >= self.max_entries {
                map.retain(|_, entry| entry.expires_at > now);
                if map.len() >= self.max_entries
                    && let Some(evict_key) = map
                        .iter()
                        .min_by_key(|(_, entry)| entry.expires_at)
                        .map(|(k, _)| k.clone())
                {
                    map.remove(&evict_key);
                }
            }

            let expires_at = now.checked_add(ttl).unwrap_or(now);
            map.insert(id.to_string(), MemoryEntry { value, expires_at });
            Ok(())
        })
    }

    fn get<'a>(&'a self, id: &'a str) -> StoreFuture<'a, Result<Option<Vec<u8>>, String>> {
        Box::pin(async move {
            let now = Instant::now();
            let expired = {
                let map = self
                    .entries
                    .read()
                    .map_err(|_| "memory store lock poisoned".to_string())?;
                match map.get(id) {
                    Some(entry) if entry.expires_at > now => return Ok(Some(entry.value.clone())),
                    Some(_) => true,
                    None => false,
                }
            };
            if expired {
                let mut map = self
                    .entries
                    .write()
                    .map_err(|_| "memory store lock poisoned".to_string())?;
                if map.get(id).is_some_and(|entry| entry.expires_at <= now) {
                    map.remove(id);
                }
            }
            Ok(None)
        })
    }
}

pub fn generate_nanoid(len: usize) -> Result<String, String> {
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).map_err(|e| format!("failed to generate short-link id: {e}"))?;
    let mut out = String::with_capacity(len);
    for b in bytes {
        out.push(NANOID_ALPHABET[(b & 0x3f) as usize] as char);
    }
    Ok(out)
}

pub fn is_valid_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.as_bytes().iter().all(|b| NANOID_ALPHABET.contains(b))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortLinkRecord {
    pub format: String,
    pub scale: f32,
    pub options: Value,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreatedShortLink {
    pub id: String,
    pub path: String,
    pub format: String,
    pub scale: f32,
    pub ttl: u64,
    pub expires_at: i64,
}

pub struct ShortLinkService {
    store: Arc<dyn ShortLinkStore>,
    config: ShortLinkConfig,
}

impl ShortLinkService {
    pub fn new(store: Arc<dyn ShortLinkStore>, config: ShortLinkConfig) -> Self {
        Self { store, config }
    }

    pub fn new_default_memory() -> Self {
        let config = must_new_short_link_config();
        let store = Arc::new(MemoryStore::new(config.max_entries));
        Self::new(store, config)
    }

    pub fn base_url(&self) -> &str {
        &self.config.base_url
    }

    pub fn resolve_ttl(&self, ttl_secs: Option<u64>) -> HttpResult<u64> {
        match ttl_secs {
            Some(0) => Err(HttpError {
                message: "ttl must be greater than 0 seconds".to_string(),
                category: "short_link".to_string(),
                code: "invalid_ttl".to_string(),
                ..Default::default()
            }),
            Some(v) if v > self.config.max_ttl => Err(HttpError {
                message: format!(
                    "ttl must not exceed {} seconds (got {v})",
                    self.config.max_ttl
                ),
                category: "short_link".to_string(),
                code: "invalid_ttl".to_string(),
                ..Default::default()
            }),
            Some(v) => Ok(v),
            None => Ok(self.config.default_ttl),
        }
    }

    pub async fn create(
        &self,
        format: &str,
        scale: f32,
        options: Value,
        ttl_secs: Option<u64>,
    ) -> HttpResult<CreatedShortLink> {
        let ttl = self.resolve_ttl(ttl_secs)?;

        let mut id = String::new();
        for _ in 0..3 {
            let candidate = generate_nanoid(NANOID_LENGTH)
                .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?;
            let existing = self
                .store
                .get(&candidate)
                .await
                .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?;
            if existing.is_none() {
                id = candidate;
                break;
            }
        }
        if id.is_empty() {
            return Err(HttpError::new_with_category_status(
                "failed to allocate unique short-link id",
                "short_link",
                500,
            ));
        }

        let created_at = Utc::now().timestamp();
        let expires_at = created_at + ttl as i64;
        let record = ShortLinkRecord {
            format: format.to_string(),
            scale,
            options,
            created_at,
            expires_at,
        };
        let bytes = serde_json::to_vec(&record)?;
        self.store
            .set(&id, bytes, Duration::from_secs(ttl))
            .await
            .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?;

        Ok(CreatedShortLink {
            path: format!("/s/{id}"),
            id,
            format: format.to_string(),
            scale,
            ttl,
            expires_at,
        })
    }

    pub async fn get(&self, id: &str) -> HttpResult<Option<ShortLinkRecord>> {
        if !is_valid_id(id) {
            return Ok(None);
        }
        let Some(bytes) = self
            .store
            .get(id)
            .await
            .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?
        else {
            return Ok(None);
        };
        let record: ShortLinkRecord = serde_json::from_slice(&bytes)?;
        if Utc::now().timestamp() >= record.expires_at {
            return Ok(None);
        }
        Ok(Some(record))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn nanoid_is_url_safe_and_expected_length() {
        let id = generate_nanoid(NANOID_LENGTH).expect("nanoid");
        assert_eq!(id.len(), NANOID_LENGTH);
        assert!(is_valid_id(&id));
        assert!(!is_valid_id("bad/id"));
        assert!(!is_valid_id(""));
    }

    #[tokio::test]
    async fn memory_store_handles_ttl_and_max_entries_eviction() {
        let store = MemoryStore::new(2);
        store
            .set("k1", b"v1".to_vec(), Duration::from_millis(40))
            .await
            .expect("set k1");
        store
            .set("k2", b"v2".to_vec(), Duration::from_secs(60))
            .await
            .expect("set k2");
        assert_eq!(
            store.get("k1").await.unwrap().as_deref(),
            Some(b"v1".as_slice())
        );

        // Third distinct key forces eviction of k1 (earliest expiration).
        store
            .set("k3", b"v3".to_vec(), Duration::from_secs(60))
            .await
            .expect("set k3");
        assert!(store.get("k1").await.unwrap().is_none());
        assert_eq!(
            store.get("k2").await.unwrap().as_deref(),
            Some(b"v2".as_slice())
        );
        assert_eq!(
            store.get("k3").await.unwrap().as_deref(),
            Some(b"v3".as_slice())
        );

        // Short TTL entry expires lazily.
        let expiring = MemoryStore::new(4);
        expiring
            .set("short", b"ok".to_vec(), Duration::from_millis(20))
            .await
            .expect("set short");
        tokio::time::sleep(Duration::from_millis(35)).await;
        assert!(expiring.get("short").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn short_link_service_validates_ttl_and_roundtrips_with_custom_store() {
        let store: Arc<dyn ShortLinkStore> = Arc::new(MemoryStore::new(16));
        let cfg = ShortLinkConfig {
            default_ttl: 120,
            max_ttl: 300,
            max_entries: 16,
            base_url: "https://charts.example.com".to_string(),
        };
        let svc = ShortLinkService::new(store, cfg);

        let zero_err = svc
            .create("png", 2.0, json!({"type": "bar"}), Some(0))
            .await
            .unwrap_err();
        assert_eq!(zero_err.code, "invalid_ttl");

        let max_err = svc
            .create("png", 2.0, json!({"type": "bar"}), Some(301))
            .await
            .unwrap_err();
        assert_eq!(max_err.code, "invalid_ttl");

        let created = svc
            .create("png", 2.0, json!({"type": "bar", "theme": "ant"}), None)
            .await
            .expect("create default ttl");
        assert_eq!(created.ttl, 120);
        assert_eq!(created.path, format!("/s/{}", created.id));

        let loaded = svc.get(&created.id).await.expect("get").expect("present");
        assert_eq!(loaded.format, "png");
        assert_eq!(loaded.scale, 2.0);
        assert_eq!(loaded.options["theme"], "ant");
        assert!(svc.get("../etc/passwd").await.unwrap().is_none());
    }
}
