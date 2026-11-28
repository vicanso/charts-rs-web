use std::time::Duration;

use crate::config::RedisConfig;
use crate::short_link::{ShortLinkRecord, ShortLinkStore, StoreFuture};

#[derive(Clone)]
enum RedisConn {
    Single(redis::aio::ConnectionManager),
    Cluster(redis::cluster_async::ClusterConnection),
}

pub struct RedisStore {
    conn: RedisConn,
    key_prefix: String,
    is_cluster: bool,
}

fn strip_cluster_scheme(url: &str) -> (String, bool) {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("redis+cluster://") {
        (
            format!("redis://{}", &url["redis+cluster://".len()..]),
            true,
        )
    } else if lower.starts_with("rediss+cluster://") {
        (
            format!("rediss://{}", &url["rediss+cluster://".len()..]),
            true,
        )
    } else {
        (url.to_string(), false)
    }
}

pub(crate) fn parse_redis_endpoints(cfg: &RedisConfig) -> Result<(Vec<String>, bool), String> {
    let mut urls = Vec::new();
    let mut had_cluster_scheme = false;
    for part in cfg.url.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let (normalized, is_cluster_url) = strip_cluster_scheme(trimmed);
        had_cluster_scheme |= is_cluster_url;
        urls.push(normalized);
    }
    if urls.is_empty() {
        return Err("REDIS_URL is empty".to_string());
    }
    let is_cluster = cfg.cluster || urls.len() > 1 || had_cluster_scheme;
    Ok((urls, is_cluster))
}

impl RedisStore {
    pub async fn connect(cfg: &RedisConfig) -> Result<Self, String> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let (urls, is_cluster) = parse_redis_endpoints(cfg)?;

        let conn = if is_cluster {
            let client = redis::cluster::ClusterClient::new(urls)
                .map_err(|e| format!("invalid Redis cluster URL: {e}"))?;
            let mut cluster_conn = client
                .get_async_connection()
                .await
                .map_err(|e| format!("failed to connect to Redis cluster: {e}"))?;
            let _: String = redis::cmd("PING")
                .query_async(&mut cluster_conn)
                .await
                .map_err(|e| format!("Redis cluster PING failed: {e}"))?;
            RedisConn::Cluster(cluster_conn)
        } else {
            let client = redis::Client::open(urls[0].as_str())
                .map_err(|e| format!("invalid Redis URL: {e}"))?;
            let mut manager = redis::aio::ConnectionManager::new(client)
                .await
                .map_err(|e| format!("failed to connect to Redis: {e}"))?;
            let _: String = redis::cmd("PING")
                .query_async(&mut manager)
                .await
                .map_err(|e| format!("Redis PING failed: {e}"))?;
            RedisConn::Single(manager)
        };

        Ok(Self {
            conn,
            key_prefix: cfg.key_prefix.clone(),
            is_cluster,
        })
    }

    fn prefixed_key(&self, id: &str) -> String {
        format!("{}{id}", self.key_prefix)
    }

    async fn query_set_nx(&self, cmd: &redis::Cmd) -> Result<Option<String>, String> {
        match &self.conn {
            RedisConn::Single(conn) => {
                let mut c = conn.clone();
                cmd.query_async(&mut c)
                    .await
                    .map_err(|e| format!("Redis short-link SET failed: {e}"))
            }
            RedisConn::Cluster(conn) => {
                let mut c = conn.clone();
                cmd.query_async(&mut c)
                    .await
                    .map_err(|e| format!("Redis cluster short-link SET failed: {e}"))
            }
        }
    }

    async fn query_get(&self, cmd: &redis::Cmd) -> Result<Option<Vec<u8>>, String> {
        match &self.conn {
            RedisConn::Single(conn) => {
                let mut c = conn.clone();
                cmd.query_async(&mut c)
                    .await
                    .map_err(|e| format!("Redis short-link GET failed: {e}"))
            }
            RedisConn::Cluster(conn) => {
                let mut c = conn.clone();
                cmd.query_async(&mut c)
                    .await
                    .map_err(|e| format!("Redis cluster short-link GET failed: {e}"))
            }
        }
    }
}

impl ShortLinkStore for RedisStore {
    fn backend_name(&self) -> &'static str {
        if self.is_cluster {
            "redis-cluster"
        } else {
            "redis"
        }
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
            let key = self.prefixed_key(id);
            let payload = serde_json::to_vec(record)
                .map_err(|e| format!("failed to serialize short-link record: {e}"))?;
            let mut cmd = redis::cmd("SET");
            cmd.arg(&key).arg(payload).arg("NX");
            if let Some(d) = ttl {
                cmd.arg("EX").arg(d.as_secs().max(1));
            }
            let reply = self.query_set_nx(&cmd).await?;
            Ok(reply.is_some())
        })
    }

    fn get<'a>(&'a self, id: &'a str) -> StoreFuture<'a, Result<Option<ShortLinkRecord>, String>> {
        Box::pin(async move {
            let key = self.prefixed_key(id);
            let mut cmd = redis::cmd("GET");
            cmd.arg(&key);
            let Some(bytes) = self.query_get(&cmd).await? else {
                return Ok(None);
            };
            let record: ShortLinkRecord = serde_json::from_slice(&bytes)
                .map_err(|e| format!("failed to deserialize short-link record: {e}"))?;
            Ok(Some(record))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;
    use std::io::ErrorKind;
    use std::net::TcpListener;
    use std::process::{Child, Command, Stdio};

    struct ChildGuard(Child);

    impl Drop for ChildGuard {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    #[test]
    fn parse_redis_endpoints_detects_standalone_cluster_and_schemes() {
        let single = RedisConfig {
            url: "redis://127.0.0.1:6379/0".to_string(),
            cluster: false,
            key_prefix: "p:".to_string(),
        };
        let (urls, is_cluster) = parse_redis_endpoints(&single).unwrap();
        assert_eq!(urls, vec!["redis://127.0.0.1:6379/0"]);
        assert!(!is_cluster);

        let cluster_flag = RedisConfig {
            url: "rediss://redis.example.com:6379".to_string(),
            cluster: true,
            key_prefix: "p:".to_string(),
        };
        let (urls, is_cluster) = parse_redis_endpoints(&cluster_flag).unwrap();
        assert_eq!(urls, vec!["rediss://redis.example.com:6379"]);
        assert!(is_cluster);

        let multi = RedisConfig {
            url: "redis://10.0.0.1:6379, redis://10.0.0.2:6379".to_string(),
            cluster: false,
            key_prefix: "p:".to_string(),
        };
        let (urls, is_cluster) = parse_redis_endpoints(&multi).unwrap();
        assert_eq!(urls, vec!["redis://10.0.0.1:6379", "redis://10.0.0.2:6379"]);
        assert!(is_cluster);

        let cluster_scheme = RedisConfig {
            url: "rediss+cluster://10.0.0.1:6379".to_string(),
            cluster: false,
            key_prefix: "p:".to_string(),
        };
        let (urls, is_cluster) = parse_redis_endpoints(&cluster_scheme).unwrap();
        assert_eq!(urls, vec!["rediss://10.0.0.1:6379"]);
        assert!(is_cluster);

        let empty = RedisConfig::default();
        assert!(parse_redis_endpoints(&empty).is_err());
    }

    #[tokio::test]
    async fn redis_store_roundtrips_handles_collisions_and_ttl() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let port = listener.local_addr().expect("local addr").port();
        drop(listener);

        let child = match Command::new("redis-server")
            .args([
                "--bind",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--save",
                "",
                "--appendonly",
                "no",
                "--daemonize",
                "no",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(c) => ChildGuard(c),
            Err(e) if e.kind() == ErrorKind::NotFound => {
                // Skip cleanly in environments without redis-server binary.
                return;
            }
            Err(e) => panic!("failed to start local redis-server for test: {e}"),
        };
        let _guard = child;

        let cfg = RedisConfig {
            url: format!("redis://127.0.0.1:{port}/0"),
            cluster: false,
            key_prefix: "charts:test:".to_string(),
        };

        let mut store = None;
        for _ in 0..30 {
            match RedisStore::connect(&cfg).await {
                Ok(s) => {
                    store = Some(s);
                    break;
                }
                Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
            }
        }
        let store = store.expect("connect to ephemeral redis-server");
        assert_eq!(store.backend_name(), "redis");
        assert!(store.supports_ttl());

        let now = Utc::now().timestamp();
        let rec1 = ShortLinkRecord {
            format: "png".to_string(),
            scale: 2.0,
            options: json!({"type": "bar", "theme": "ant"}),
            created_at: now,
            expires_at: Some(now + 60),
        };
        let rec2 = ShortLinkRecord {
            format: "svg".to_string(),
            scale: 1.0,
            options: json!({"type": "line"}),
            created_at: now,
            expires_at: Some(now + 60),
        };

        assert!(
            store
                .insert("abc1234567", &rec1, Some(Duration::from_secs(60)))
                .await
                .unwrap()
        );
        // SET NX prevents overwriting existing active key.
        assert!(
            !store
                .insert("abc1234567", &rec2, Some(Duration::from_secs(60)))
                .await
                .unwrap()
        );
        let loaded = store.get("abc1234567").await.unwrap().expect("present");
        assert_eq!(loaded, rec1);

        // TTL=1s expiration and re-insertion.
        let short_rec = ShortLinkRecord {
            format: "webp".to_string(),
            scale: 1.0,
            options: json!({"type": "pie"}),
            created_at: now,
            expires_at: Some(now + 2),
        };
        assert!(
            store
                .insert("ttl1234567", &short_rec, Some(Duration::from_secs(1)))
                .await
                .unwrap()
        );
        assert!(store.get("ttl1234567").await.unwrap().is_some());
        tokio::time::sleep(Duration::from_millis(1200)).await;
        assert!(store.get("ttl1234567").await.unwrap().is_none());
        assert!(
            store
                .insert("ttl1234567", &rec2, Some(Duration::from_secs(30)))
                .await
                .unwrap()
        );
    }
}
