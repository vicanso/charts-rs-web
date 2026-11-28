#[cfg(feature = "mysql-store")]
use chrono::NaiveDateTime;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::time::Duration;

use crate::config::DatabaseConfig;
use crate::short_link::{ShortLinkRecord, ShortLinkStore, SqlDialect, StoreFuture};

use sqlx::AssertSqlSafe;
#[cfg(feature = "mysql-store")]
use sqlx::MySqlPool;
#[cfg(feature = "postgres-store")]
use sqlx::PgPool;
#[cfg(feature = "mysql-store")]
use sqlx::mysql::MySqlPoolOptions;
#[cfg(feature = "postgres-store")]
use sqlx::postgres::PgPoolOptions;
use sqlx::types::Json;

pub(crate) fn validate_sql_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err(format!(
            "invalid database tableName `{name}`: length must be 1..=64"
        ));
    }
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return Err("database tableName cannot be empty".to_string());
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err(format!(
            "invalid database tableName `{name}`: must start with an ASCII letter or '_'"
        ));
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(format!(
            "invalid database tableName `{name}`: only ASCII letters, digits, and '_' are allowed"
        ));
    }
    Ok(())
}

#[allow(dead_code)]
pub(crate) fn postgres_create_table_sql(table: &str) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS {table} (
            id BIGSERIAL PRIMARY KEY,
            short_id VARCHAR(64) NOT NULL UNIQUE,
            format VARCHAR(16) NOT NULL,
            scale REAL NOT NULL,
            options JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"
    )
}

#[allow(dead_code)]
pub(crate) fn mysql_create_table_sql(table: &str) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS `{table}` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `short_id` VARCHAR(64) NOT NULL,
            `format` VARCHAR(16) NOT NULL,
            `scale` FLOAT NOT NULL,
            `options` JSON NOT NULL,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uk_short_id` (`short_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    )
}

enum SqlPool {
    #[cfg(feature = "postgres-store")]
    Postgres(PgPool),
    #[cfg(feature = "mysql-store")]
    MySql(MySqlPool),
}

pub struct SqlxStore {
    pool: SqlPool,
    table_name: String,
    dialect: SqlDialect,
}

impl SqlxStore {
    pub async fn connect(dialect: SqlDialect, cfg: &DatabaseConfig) -> Result<Self, String> {
        validate_sql_identifier(&cfg.table_name)?;
        let acquire_timeout = Duration::from_secs(cfg.acquire_timeout.max(1));

        match dialect {
            SqlDialect::Postgres => {
                #[cfg(feature = "postgres-store")]
                {
                    let pool = PgPoolOptions::new()
                        .max_connections(cfg.max_connections)
                        .min_connections(cfg.min_connections)
                        .acquire_timeout(acquire_timeout)
                        .connect(&cfg.url)
                        .await
                        .map_err(|e| format!("failed to connect to PostgreSQL: {e}"))?;

                    if cfg.auto_migrate {
                        let ddl = postgres_create_table_sql(&cfg.table_name);
                        sqlx::query(AssertSqlSafe(ddl))
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("failed to initialize PostgreSQL table: {e}"))?;
                    } else {
                        sqlx::query("SELECT 1")
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("PostgreSQL connectivity check failed: {e}"))?;
                    }

                    Ok(Self {
                        pool: SqlPool::Postgres(pool),
                        table_name: cfg.table_name.clone(),
                        dialect,
                    })
                }
                #[cfg(not(feature = "postgres-store"))]
                {
                    let _ = acquire_timeout;
                    Err("PostgreSQL store requested, but binary was compiled without the `postgres-store` feature".to_string())
                }
            }
            SqlDialect::MySql => {
                #[cfg(feature = "mysql-store")]
                {
                    let pool = MySqlPoolOptions::new()
                        .max_connections(cfg.max_connections)
                        .min_connections(cfg.min_connections)
                        .acquire_timeout(acquire_timeout)
                        .connect(&cfg.url)
                        .await
                        .map_err(|e| format!("failed to connect to MySQL: {e}"))?;

                    if cfg.auto_migrate {
                        let ddl = mysql_create_table_sql(&cfg.table_name);
                        sqlx::query(AssertSqlSafe(ddl))
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("failed to initialize MySQL table: {e}"))?;
                    } else {
                        sqlx::query("SELECT 1")
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("MySQL connectivity check failed: {e}"))?;
                    }

                    Ok(Self {
                        pool: SqlPool::MySql(pool),
                        table_name: cfg.table_name.clone(),
                        dialect,
                    })
                }
                #[cfg(not(feature = "mysql-store"))]
                {
                    let _ = acquire_timeout;
                    Err("MySQL store requested, but binary was compiled without the `mysql-store` feature".to_string())
                }
            }
        }
    }
}

impl ShortLinkStore for SqlxStore {
    fn backend_name(&self) -> &'static str {
        match self.dialect {
            SqlDialect::Postgres => "postgres",
            SqlDialect::MySql => "mysql",
        }
    }

    fn supports_ttl(&self) -> bool {
        false
    }

    fn insert<'a>(
        &'a self,
        id: &'a str,
        record: &'a ShortLinkRecord,
        _ttl: Option<Duration>,
    ) -> StoreFuture<'a, Result<bool, String>> {
        Box::pin(async move {
            let created_dt: DateTime<Utc> =
                DateTime::from_timestamp(record.created_at, 0).unwrap_or_else(Utc::now);

            match &self.pool {
                #[cfg(feature = "postgres-store")]
                SqlPool::Postgres(pool) => {
                    let sql = format!(
                        "INSERT INTO {} (short_id, format, scale, options, created_at)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (short_id) DO NOTHING",
                        self.table_name
                    );
                    let res = sqlx::query(AssertSqlSafe(sql))
                        .bind(id)
                        .bind(&record.format)
                        .bind(record.scale)
                        .bind(Json(&record.options))
                        .bind(created_dt)
                        .execute(pool)
                        .await
                        .map_err(|e| format!("PostgreSQL short-link insert failed: {e}"))?;
                    Ok(res.rows_affected() == 1)
                }
                #[cfg(feature = "mysql-store")]
                SqlPool::MySql(pool) => {
                    let sql = format!(
                        "INSERT INTO `{}` (`short_id`, `format`, `scale`, `options`, `created_at`)
                         VALUES (?, ?, ?, ?, ?)",
                        self.table_name
                    );
                    let created_naive: NaiveDateTime = created_dt.naive_utc();
                    match sqlx::query(AssertSqlSafe(sql))
                        .bind(id)
                        .bind(&record.format)
                        .bind(record.scale)
                        .bind(Json(&record.options))
                        .bind(created_naive)
                        .execute(pool)
                        .await
                    {
                        Ok(_) => Ok(true),
                        Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
                            Ok(false)
                        }
                        Err(e) => Err(format!("MySQL short-link insert failed: {e}")),
                    }
                }
            }
        })
    }

    fn get<'a>(&'a self, id: &'a str) -> StoreFuture<'a, Result<Option<ShortLinkRecord>, String>> {
        Box::pin(async move {
            match &self.pool {
                #[cfg(feature = "postgres-store")]
                SqlPool::Postgres(pool) => {
                    let sql = format!(
                        "SELECT format, scale, options, created_at
                         FROM {}
                         WHERE short_id = $1
                         LIMIT 1",
                        self.table_name
                    );
                    let row: Option<(String, f32, Json<Value>, DateTime<Utc>)> =
                        sqlx::query_as(AssertSqlSafe(sql))
                            .bind(id)
                            .fetch_optional(pool)
                            .await
                            .map_err(|e| format!("PostgreSQL short-link query failed: {e}"))?;
                    Ok(
                        row.map(|(format, scale, options, created_at)| ShortLinkRecord {
                            format,
                            scale,
                            options: options.0,
                            created_at: created_at.timestamp(),
                            expires_at: None,
                        }),
                    )
                }
                #[cfg(feature = "mysql-store")]
                SqlPool::MySql(pool) => {
                    let sql = format!(
                        "SELECT `format`, `scale`, `options`, `created_at`
                         FROM `{}`
                         WHERE `short_id` = ?
                         LIMIT 1",
                        self.table_name
                    );
                    let row: Option<(String, f32, Json<Value>, NaiveDateTime)> =
                        sqlx::query_as(AssertSqlSafe(sql))
                            .bind(id)
                            .fetch_optional(pool)
                            .await
                            .map_err(|e| format!("MySQL short-link query failed: {e}"))?;
                    Ok(
                        row.map(|(format, scale, options, created_at)| ShortLinkRecord {
                            format,
                            scale,
                            options: options.0,
                            created_at: created_at.and_utc().timestamp(),
                            expires_at: None,
                        }),
                    )
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_sql_identifier_accepts_valid_and_rejects_unsafe() {
        assert!(validate_sql_identifier("chart_short_links").is_ok());
        assert!(validate_sql_identifier("_links_v2").is_ok());
        assert!(validate_sql_identifier("").is_err());
        assert!(validate_sql_identifier("123bad").is_err());
        assert!(validate_sql_identifier("bad-name").is_err());
        assert!(validate_sql_identifier("bad; DROP TABLE users").is_err());
        let too_long = "a".repeat(65);
        assert!(validate_sql_identifier(&too_long).is_err());
    }

    #[test]
    fn ddl_builders_emit_expected_surrogate_pk_and_unique_short_id() {
        let pg = postgres_create_table_sql("chart_short_links");
        assert!(pg.contains("CREATE TABLE IF NOT EXISTS chart_short_links"));
        assert!(pg.contains("id BIGSERIAL PRIMARY KEY"));
        assert!(pg.contains("short_id VARCHAR(64) NOT NULL UNIQUE"));
        assert!(pg.contains("options JSONB NOT NULL"));
        assert!(pg.contains("created_at TIMESTAMPTZ NOT NULL"));
        assert!(!pg.contains("expires_at"));

        let my = mysql_create_table_sql("chart_short_links");
        assert!(my.contains("CREATE TABLE IF NOT EXISTS `chart_short_links`"));
        assert!(my.contains("`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY"));
        assert!(my.contains("`short_id` VARCHAR(64) NOT NULL"));
        assert!(my.contains("UNIQUE KEY `uk_short_id` (`short_id`)"));
        assert!(my.contains("`options` JSON NOT NULL"));
        assert!(my.contains("`created_at` DATETIME NOT NULL"));
        assert!(!my.contains("expires_at"));
    }
}
