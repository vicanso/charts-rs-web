use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::config::{
    DatabaseConfig, RedisConfig, ShortLinkConfig, must_new_database_config, must_new_redis_config,
    must_new_short_link_config,
};
use crate::error::{HttpError, HttpResult};

#[cfg(feature = "redis-store")]
pub mod redis_store;
#[cfg(any(feature = "postgres-store", feature = "mysql-store"))]
pub mod sqlx_store;

pub const NANOID_LENGTH: usize = 10;
pub const MAX_ID_ALLOCATION_ATTEMPTS: usize = 5;
const NANOID_ALPHABET: &[u8; 64] =
    b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

pub type StoreFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Pluggable asynchronous storage abstraction for chart short links.
pub trait ShortLinkStore: Send + Sync {
    fn backend_name(&self) -> &'static str {
        "custom"
    }

    /// True for expiring stores (Memory/Redis), false for permanent SQL stores.
    fn supports_ttl(&self) -> bool {
        true
    }

    /// Atomically insert `record` if `id` does not currently exist (or in MemoryStore if expired).
    /// Returns `Ok(true)` if inserted, `Ok(false)` if `id` already exists (collision).
    fn insert<'a>(
        &'a self,
        id: &'a str,
        record: &'a ShortLinkRecord,
        ttl: Option<Duration>,
    ) -> StoreFuture<'a, Result<bool, String>>;

    fn get<'a>(&'a self, id: &'a str) -> StoreFuture<'a, Result<Option<ShortLinkRecord>, String>>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlDialect {
    Postgres,
    MySql,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShortLinkBackendKind {
    Memory,
    Redis,
    Postgres,
    MySql,
}

impl From<SqlDialect> for ShortLinkBackendKind {
    fn from(dialect: SqlDialect) -> Self {
        match dialect {
            SqlDialect::Postgres => ShortLinkBackendKind::Postgres,
            SqlDialect::MySql => ShortLinkBackendKind::MySql,
        }
    }
}

pub fn detect_db_dialect(url: &str) -> Result<SqlDialect, String> {
    let normalized = url.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("DATABASE_URL is empty".to_string());
    }
    if normalized.starts_with("postgres://") || normalized.starts_with("postgresql://") {
        return Ok(SqlDialect::Postgres);
    }
    if normalized.starts_with("mysql://") || normalized.starts_with("mariadb://") {
        return Ok(SqlDialect::MySql);
    }
    Err("unsupported DATABASE_URL scheme; expected postgres://, postgresql://, mysql://, or mariadb://".to_string())
}

pub fn resolve_backend_kind(
    short_cfg: &ShortLinkConfig,
    redis_cfg: &RedisConfig,
    db_cfg: &DatabaseConfig,
) -> Result<ShortLinkBackendKind, String> {
    let store = short_cfg.store.trim().to_ascii_lowercase();
    let has_redis = !redis_cfg.url.trim().is_empty();
    let has_db = !db_cfg.url.trim().is_empty();

    match store.as_str() {
        "" => match (has_redis, has_db) {
            (false, false) => Ok(ShortLinkBackendKind::Memory),
            (true, false) => Ok(ShortLinkBackendKind::Redis),
            (false, true) => detect_db_dialect(&db_cfg.url).map(ShortLinkBackendKind::from),
            (true, true) => Err(
                "both REDIS_URL and DATABASE_URL are configured; set SHORTLINK_STORE to 'redis', 'database', or 'memory' to select one"
                    .to_string(),
            ),
        },
        "memory" => Ok(ShortLinkBackendKind::Memory),
        "redis" => {
            if !has_redis {
                return Err("SHORTLINK_STORE=redis requires REDIS_URL to be set".to_string());
            }
            Ok(ShortLinkBackendKind::Redis)
        }
        "database" | "sql" | "sqlx" => {
            if !has_db {
                return Err(format!("SHORTLINK_STORE={store} requires DATABASE_URL to be set"));
            }
            detect_db_dialect(&db_cfg.url).map(ShortLinkBackendKind::from)
        }
        "postgres" | "postgresql" => {
            if !has_db {
                return Err(format!("SHORTLINK_STORE={store} requires DATABASE_URL to be set"));
            }
            match detect_db_dialect(&db_cfg.url)? {
                SqlDialect::Postgres => Ok(ShortLinkBackendKind::Postgres),
                SqlDialect::MySql => Err(
                    "SHORTLINK_STORE is set to postgres, but DATABASE_URL is a MySQL URL"
                        .to_string(),
                ),
            }
        }
        "mysql" | "mariadb" => {
            if !has_db {
                return Err(format!("SHORTLINK_STORE={store} requires DATABASE_URL to be set"));
            }
            match detect_db_dialect(&db_cfg.url)? {
                SqlDialect::MySql => Ok(ShortLinkBackendKind::MySql),
                SqlDialect::Postgres => Err(
                    "SHORTLINK_STORE is set to mysql, but DATABASE_URL is a PostgreSQL URL"
                        .to_string(),
                ),
            }
        }
        other => Err(format!(
            "unsupported SHORTLINK_STORE `{other}`; expected one of: memory, redis, database, postgres, mysql"
        )),
    }
}

struct MemoryEntry {
    record: ShortLinkRecord,
    expires_at: Option<Instant>,
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
    fn backend_name(&self) -> &'static str {
        "memory"
    }

    fn supports_ttl(&self) -> bool {
        true
    }

    fn insert<'a>(
        &'a self,
        id: &'a str,
        record: &'a ShortLinkRecord,
        ttl: Option<Duration>,
    ) -> StoreFuture<'a, Result<bool, String>> {
        Box::pin(async move {
            let mut map = self
                .entries
                .write()
                .map_err(|_| "memory store lock poisoned".to_string())?;
            let now = Instant::now();

            if let Some(existing) = map.get(id) {
                if existing.expires_at.is_none_or(|exp| exp > now) {
                    return Ok(false);
                }
                map.remove(id);
            }

            if ttl.is_some_and(|d| d.is_zero()) {
                return Ok(true);
            }

            if map.len() >= self.max_entries {
                map.retain(|_, entry| entry.expires_at.is_none_or(|exp| exp > now));
                if map.len() >= self.max_entries
                    && let Some(evict_key) = map
                        .iter()
                        .min_by_key(|(_, entry)| (entry.expires_at.is_none(), entry.expires_at))
                        .map(|(k, _)| k.clone())
                {
                    map.remove(&evict_key);
                }
            }

            let expires_at = ttl.map(|d| now.checked_add(d).unwrap_or(now));
            map.insert(
                id.to_string(),
                MemoryEntry {
                    record: record.clone(),
                    expires_at,
                },
            );
            Ok(true)
        })
    }

    fn get<'a>(&'a self, id: &'a str) -> StoreFuture<'a, Result<Option<ShortLinkRecord>, String>> {
        Box::pin(async move {
            let now = Instant::now();
            let expired = {
                let map = self
                    .entries
                    .read()
                    .map_err(|_| "memory store lock poisoned".to_string())?;
                match map.get(id) {
                    Some(entry) if entry.expires_at.is_none_or(|exp| exp > now) => {
                        return Ok(Some(entry.record.clone()));
                    }
                    Some(_) => true,
                    None => false,
                }
            };
            if expired {
                let mut map = self
                    .entries
                    .write()
                    .map_err(|_| "memory store lock poisoned".to_string())?;
                if map
                    .get(id)
                    .is_some_and(|entry| entry.expires_at.is_some_and(|exp| exp <= now))
                {
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShortLinkRecord {
    pub format: String,
    pub scale: f32,
    pub options: Value,
    pub created_at: i64,
    #[serde(default)]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreatedShortLink {
    pub id: String,
    pub path: String,
    pub format: String,
    pub scale: f32,
    pub ttl: Option<u64>,
    pub expires_at: Option<i64>,
}

pub struct ShortLinkService {
    store: Arc<dyn ShortLinkStore>,
    config: ShortLinkConfig,
}

impl ShortLinkService {
    pub fn new(store: Arc<dyn ShortLinkStore>, config: ShortLinkConfig) -> Self {
        Self { store, config }
    }

    pub async fn from_env_config() -> Result<Self, String> {
        let short_cfg = must_new_short_link_config();
        let redis_cfg = must_new_redis_config();
        let db_cfg = must_new_database_config();

        let kind = resolve_backend_kind(&short_cfg, &redis_cfg, &db_cfg)?;
        let store: Arc<dyn ShortLinkStore> = match kind {
            ShortLinkBackendKind::Memory => Arc::new(MemoryStore::new(short_cfg.max_entries)),
            ShortLinkBackendKind::Redis => {
                #[cfg(feature = "redis-store")]
                {
                    Arc::new(redis_store::RedisStore::connect(&redis_cfg).await?)
                }
                #[cfg(not(feature = "redis-store"))]
                {
                    return Err(
                        "Redis store requested, but binary was compiled without the `redis-store` feature"
                            .to_string(),
                    );
                }
            }
            ShortLinkBackendKind::Postgres => {
                #[cfg(feature = "postgres-store")]
                {
                    Arc::new(sqlx_store::SqlxStore::connect(SqlDialect::Postgres, &db_cfg).await?)
                }
                #[cfg(not(feature = "postgres-store"))]
                {
                    return Err(
                        "PostgreSQL store requested, but binary was compiled without the `postgres-store` feature"
                            .to_string(),
                    );
                }
            }
            ShortLinkBackendKind::MySql => {
                #[cfg(feature = "mysql-store")]
                {
                    Arc::new(sqlx_store::SqlxStore::connect(SqlDialect::MySql, &db_cfg).await?)
                }
                #[cfg(not(feature = "mysql-store"))]
                {
                    return Err(
                        "MySQL store requested, but binary was compiled without the `mysql-store` feature"
                            .to_string(),
                    );
                }
            }
        };

        Ok(Self::new(store, short_cfg))
    }

    pub fn backend_name(&self) -> &'static str {
        self.store.backend_name()
    }

    pub fn base_url(&self) -> &str {
        &self.config.base_url
    }

    pub fn resolve_ttl(&self, ttl_secs: Option<u64>) -> HttpResult<Option<u64>> {
        if !self.store.supports_ttl() {
            return Ok(None);
        }
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
            Some(v) => Ok(Some(v)),
            None => Ok(Some(self.config.default_ttl)),
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
        let created_at = Utc::now().timestamp();
        let expires_at = ttl.map(|t| created_at + t as i64);
        let record = ShortLinkRecord {
            format: format.to_string(),
            scale,
            options,
            created_at,
            expires_at,
        };
        let ttl_duration = ttl.map(Duration::from_secs);

        let mut id = String::new();
        for _ in 0..MAX_ID_ALLOCATION_ATTEMPTS {
            let candidate = generate_nanoid(NANOID_LENGTH)
                .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?;
            let inserted = self
                .store
                .insert(&candidate, &record, ttl_duration)
                .await
                .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?;
            if inserted {
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
        let Some(record) = self
            .store
            .get(id)
            .await
            .map_err(|msg| HttpError::new_with_category(&msg, "short_link"))?
        else {
            return Ok(None);
        };
        if let Some(expires_at) = record.expires_at
            && Utc::now().timestamp() >= expires_at
        {
            return Ok(None);
        }
        Ok(Some(record))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn sample_record(format: &str, expires_at: Option<i64>) -> ShortLinkRecord {
        ShortLinkRecord {
            format: format.to_string(),
            scale: 1.0,
            options: json!({"type": "bar"}),
            created_at: Utc::now().timestamp(),
            expires_at,
        }
    }

    #[test]
    fn nanoid_is_url_safe_and_expected_length() {
        let id = generate_nanoid(NANOID_LENGTH).expect("nanoid");
        assert_eq!(id.len(), NANOID_LENGTH);
        assert!(is_valid_id(&id));
        assert!(!is_valid_id("bad/id"));
        assert!(!is_valid_id(""));
    }

    #[test]
    fn resolve_backend_kind_handles_explicit_auto_and_errors() {
        let base_short = ShortLinkConfig::default();
        let empty_redis = RedisConfig::default();
        let empty_db = DatabaseConfig::default();
        let some_redis = RedisConfig {
            url: "redis://127.0.0.1:6379/0".to_string(),
            ..Default::default()
        };
        let pg_db = DatabaseConfig {
            url: "postgres://user:pass@localhost:5432/charts".to_string(),
            ..Default::default()
        };
        let mysql_db = DatabaseConfig {
            url: "mysql://user:pass@localhost:3306/charts".to_string(),
            ..Default::default()
        };

        assert_eq!(
            resolve_backend_kind(&base_short, &empty_redis, &empty_db).unwrap(),
            ShortLinkBackendKind::Memory
        );
        assert_eq!(
            resolve_backend_kind(&base_short, &some_redis, &empty_db).unwrap(),
            ShortLinkBackendKind::Redis
        );
        assert_eq!(
            resolve_backend_kind(&base_short, &empty_redis, &pg_db).unwrap(),
            ShortLinkBackendKind::Postgres
        );
        assert_eq!(
            resolve_backend_kind(&base_short, &empty_redis, &mysql_db).unwrap(),
            ShortLinkBackendKind::MySql
        );

        // Dual URL ambiguity when store is empty fails clearly.
        let dual_err = resolve_backend_kind(&base_short, &some_redis, &pg_db).unwrap_err();
        assert!(dual_err.contains("SHORTLINK_STORE"));

        // Explicit selection resolves dual URL configuration.
        let explicit_redis = ShortLinkConfig {
            store: "redis".to_string(),
            ..Default::default()
        };
        assert_eq!(
            resolve_backend_kind(&explicit_redis, &some_redis, &pg_db).unwrap(),
            ShortLinkBackendKind::Redis
        );

        let explicit_db = ShortLinkConfig {
            store: "database".to_string(),
            ..Default::default()
        };
        assert_eq!(
            resolve_backend_kind(&explicit_db, &some_redis, &mysql_db).unwrap(),
            ShortLinkBackendKind::MySql
        );

        let explicit_pg = ShortLinkConfig {
            store: "postgres".to_string(),
            ..Default::default()
        };
        assert_eq!(
            resolve_backend_kind(&explicit_pg, &empty_redis, &pg_db).unwrap(),
            ShortLinkBackendKind::Postgres
        );
        assert!(
            resolve_backend_kind(&explicit_pg, &empty_redis, &mysql_db)
                .unwrap_err()
                .contains("MySQL")
        );

        let explicit_mysql = ShortLinkConfig {
            store: "mysql".to_string(),
            ..Default::default()
        };
        assert!(
            resolve_backend_kind(&explicit_mysql, &empty_redis, &pg_db)
                .unwrap_err()
                .contains("PostgreSQL")
        );

        let missing_redis = ShortLinkConfig {
            store: "redis".to_string(),
            ..Default::default()
        };
        assert!(
            resolve_backend_kind(&missing_redis, &empty_redis, &empty_db)
                .unwrap_err()
                .contains("REDIS_URL")
        );

        let missing_db = ShortLinkConfig {
            store: "database".to_string(),
            ..Default::default()
        };
        assert!(
            resolve_backend_kind(&missing_db, &empty_redis, &empty_db)
                .unwrap_err()
                .contains("DATABASE_URL")
        );

        let bad_store = ShortLinkConfig {
            store: "sqlite".to_string(),
            ..Default::default()
        };
        assert!(
            resolve_backend_kind(&bad_store, &empty_redis, &empty_db)
                .unwrap_err()
                .contains("unsupported SHORTLINK_STORE")
        );
    }

    #[tokio::test]
    async fn memory_store_handles_ttl_collision_and_max_entries_eviction() {
        let store = MemoryStore::new(2);
        let r1 = sample_record("svg", None);
        let r2 = sample_record("png", None);
        let r3 = sample_record("webp", None);

        assert!(
            store
                .insert("k1", &r1, Some(Duration::from_millis(40)))
                .await
                .expect("insert k1")
        );
        // Active key cannot be overwritten via insert.
        assert!(
            !store
                .insert("k1", &r2, Some(Duration::from_secs(60)))
                .await
                .expect("collision k1")
        );
        assert_eq!(store.get("k1").await.unwrap().unwrap().format, "svg");

        assert!(
            store
                .insert("k2", &r2, Some(Duration::from_secs(60)))
                .await
                .expect("insert k2")
        );

        // Third distinct key forces eviction of k1 (earliest expiration).
        assert!(
            store
                .insert("k3", &r3, Some(Duration::from_secs(60)))
                .await
                .expect("insert k3")
        );
        assert!(store.get("k1").await.unwrap().is_none());
        assert_eq!(store.get("k2").await.unwrap().unwrap().format, "png");
        assert_eq!(store.get("k3").await.unwrap().unwrap().format, "webp");

        // Short TTL entry expires lazily and allows re-insertion under the same key.
        let expiring = MemoryStore::new(4);
        assert!(
            expiring
                .insert("short", &r1, Some(Duration::from_millis(20)))
                .await
                .expect("insert short")
        );
        tokio::time::sleep(Duration::from_millis(35)).await;
        assert!(expiring.get("short").await.unwrap().is_none());
        assert!(
            expiring
                .insert("short", &r2, Some(Duration::from_secs(60)))
                .await
                .expect("re-insert expired key")
        );
    }

    #[tokio::test]
    async fn short_link_service_validates_ttl_and_roundtrips_with_custom_store() {
        let store: Arc<dyn ShortLinkStore> = Arc::new(MemoryStore::new(16));
        let cfg = ShortLinkConfig {
            store: String::new(),
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
        assert_eq!(created.ttl, Some(120));
        assert!(created.expires_at.is_some());
        assert_eq!(created.path, format!("/s/{}", created.id));

        let loaded = svc.get(&created.id).await.expect("get").expect("present");
        assert_eq!(loaded.format, "png");
        assert_eq!(loaded.scale, 2.0);
        assert_eq!(loaded.options["theme"], "ant");
        assert!(svc.get("../etc/passwd").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn short_link_service_retries_collisions_up_to_five_attempts() {
        struct CollidingStore {
            reject_first: usize,
            attempts: AtomicUsize,
            inner: MemoryStore,
        }

        impl ShortLinkStore for CollidingStore {
            fn insert<'a>(
                &'a self,
                id: &'a str,
                record: &'a ShortLinkRecord,
                ttl: Option<Duration>,
            ) -> StoreFuture<'a, Result<bool, String>> {
                Box::pin(async move {
                    let idx = self.attempts.fetch_add(1, Ordering::SeqCst);
                    if idx < self.reject_first {
                        return Ok(false);
                    }
                    self.inner.insert(id, record, ttl).await
                })
            }

            fn get<'a>(
                &'a self,
                id: &'a str,
            ) -> StoreFuture<'a, Result<Option<ShortLinkRecord>, String>> {
                self.inner.get(id)
            }
        }

        let cfg = ShortLinkConfig {
            store: String::new(),
            default_ttl: 120,
            max_ttl: 300,
            max_entries: 16,
            base_url: String::new(),
        };

        let store_succeeds = Arc::new(CollidingStore {
            reject_first: 2,
            attempts: AtomicUsize::new(0),
            inner: MemoryStore::new(16),
        });
        let svc_ok = ShortLinkService::new(store_succeeds.clone(), cfg.clone());
        let created = svc_ok
            .create("svg", 1.0, json!({"type": "bar"}), None)
            .await
            .expect("succeeds on 3rd attempt");
        assert_eq!(store_succeeds.attempts.load(Ordering::SeqCst), 3);
        assert!(svc_ok.get(&created.id).await.unwrap().is_some());

        let store_exhausted = Arc::new(CollidingStore {
            reject_first: MAX_ID_ALLOCATION_ATTEMPTS,
            attempts: AtomicUsize::new(0),
            inner: MemoryStore::new(16),
        });
        let svc_fail = ShortLinkService::new(store_exhausted.clone(), cfg);
        let err = svc_fail
            .create("svg", 1.0, json!({"type": "bar"}), None)
            .await
            .unwrap_err();
        assert_eq!(err.status, 500);
        assert!(
            err.message
                .contains("failed to allocate unique short-link id")
        );
        assert_eq!(
            store_exhausted.attempts.load(Ordering::SeqCst),
            MAX_ID_ALLOCATION_ATTEMPTS
        );
    }
}
