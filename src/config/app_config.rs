use config::{Config, File, FileFormat, FileSourceString};
use once_cell::sync::OnceCell;
use rust_embed::RustEmbed;
use std::{collections::HashMap, env};
use validator::Validate;

#[derive(RustEmbed)]
#[folder = "configs/"]
struct Configs;

fn convert_string_to_i32(value: String) -> i32 {
    if let Ok(result) = value.parse::<i32>() {
        return result;
    }
    0
}

#[derive(Debug, Clone, Default)]
pub struct APPConfig {
    // env变量的前缀
    env_prefix: String,
    // 应用配置的前缀
    prefix: String,
    // 应用配置信息
    settings: HashMap<String, HashMap<String, String>>,
}

impl APPConfig {
    /// 设置配置key的前缀
    fn set_prefix(&self, prefix: &str) -> APPConfig {
        let mut config = self.clone();
        config.prefix = prefix.to_string();
        config
    }
    /// 获取配置的key，若有设置前缀则添加前缀
    fn get_key(&self, key: &str) -> String {
        if self.prefix.is_empty() {
            return key.to_string();
        }
        format!("{}.{key}", self.prefix)
    }
    /// 从配置中获取对应的值(字符串)
    fn get_value(&self, key: &str) -> String {
        let k = self.get_key(key);
        let arr: Vec<&str> = k.split('.').collect();
        if arr.len() != 2 {
            return "".to_string();
        }
        if let Some(value) = self.settings.get(arr[0])
            && let Some(v) = value.get(arr[1])
        {
            return v.clone();
        }
        "".to_string()
    }
    /// 从配置中获取对应的值(i32)
    fn get_int_value(&self, key: &str) -> i32 {
        convert_string_to_i32(self.get_value(key))
    }
    /// 从配置中获取对应的值(i32)，
    /// 如果为0则使用默认值返回
    fn get_int_value_default(&self, key: &str, default_value: i32) -> i32 {
        let value = self.get_int_value(key);
        if value != 0 {
            return value;
        }
        default_value
    }
    /// 从配置中获取对应的值(usize)，优先从env获取，解析失败或为0时使用默认值
    fn get_usize_value_default(&self, key: &str, default_value: usize) -> usize {
        if let Ok(value) = self.get_value_from_env_first(key).parse::<usize>()
            && value > 0
        {
            return value;
        }
        default_value
    }
    /// 从配置中获取对应的值(u64)，优先从env获取，解析失败或为0时使用默认值
    fn get_u64_value_default(&self, key: &str, default_value: u64) -> u64 {
        if let Ok(value) = self.get_value_from_env_first(key).parse::<u64>()
            && value > 0
        {
            return value;
        }
        default_value
    }
    /// 从配置中获取对应的值(u32)，优先从env获取，允许为0，解析失败时使用默认值
    fn get_u32_value_allow_zero(&self, key: &str, default_value: u32) -> u32 {
        if let Ok(value) = self.get_value_from_env_first(key).trim().parse::<u32>() {
            return value;
        }
        default_value
    }
    /// 从配置中获取布尔值，优先从env获取
    fn get_bool_value_default(&self, key: &str, default_value: bool) -> bool {
        match self
            .get_value_from_env_first(key)
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "true" | "1" | "yes" | "on" => true,
            "false" | "0" | "no" | "off" => false,
            _ => default_value,
        }
    }
    /// 优先从env中获取配置的值，如果env中未配置则调用get_value获取
    fn get_value_from_env_first(&self, key: &str) -> String {
        let k = self.get_key(key);
        let mut env_key = k.replace('.', "_").to_uppercase();
        if !self.env_prefix.is_empty() {
            env_key = format!("{}_{env_key}", self.env_prefix);
        }
        if let Ok(value) = env::var(env_key) {
            return value;
        }
        self.get_value(key)
    }
}

pub fn get_env() -> String {
    env::var("RUST_ENV").unwrap_or_else(|_| "dev".to_string())
}

fn must_new_source(name: &str) -> config::File<FileSourceString, FileFormat> {
    let str = std::string::String::from_utf8_lossy(&Configs::get(name).unwrap().data).to_string();
    File::from_str(str.as_str(), FileFormat::Yaml)
}

fn must_new_config() -> &'static APPConfig {
    static APP_CONFIG: OnceCell<APPConfig> = OnceCell::new();
    APP_CONFIG.get_or_init(|| {
        let mode = get_env();

        let settings = Config::builder()
            .add_source(must_new_source("default.yml"))
            .add_source(must_new_source(&format!("{mode}.yml")))
            .build()
            .unwrap()
            .try_deserialize::<HashMap<String, HashMap<String, String>>>()
            .unwrap();
        APPConfig {
            settings,
            ..Default::default()
        }
    })
}

// 基本配置
#[derive(Debug, Clone, Default, Validate)]
pub struct BasicConfig {
    // 监听地址
    #[validate(length(min = 1))]
    pub listen: String,
    // 请求连接限制
    #[validate(range(min = 0, max = 100000))]
    pub request_limit: i32,
}

pub fn must_new_basic_config() -> BasicConfig {
    let config = must_new_config().set_prefix("basic");
    let basic_config = BasicConfig {
        listen: config.get_value_from_env_first("listen"),
        request_limit: config.get_int_value_default("requestLimit", 5000),
    };
    basic_config.validate().unwrap();
    basic_config
}

// MCP配置
#[derive(Debug, Clone, Default)]
pub struct McpConfig {
    // 允许访问的Host列表，为空表示不校验
    pub allowed_hosts: Vec<String>,
}

pub fn must_new_mcp_config() -> McpConfig {
    let config = must_new_config().set_prefix("mcp");
    let allowed_hosts = config
        .get_value_from_env_first("allowedHosts")
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    McpConfig { allowed_hosts }
}

pub fn must_new_render_limits() -> charts_rs::RenderLimits {
    let config = must_new_config().set_prefix("limits");
    let mut limits = charts_rs::RenderLimits::default();
    limits.max_json_bytes = config.get_usize_value_default("maxJsonBytes", limits.max_json_bytes);
    if let Ok(side) = config
        .get_value_from_env_first("maxCanvasSide")
        .parse::<f32>()
        && side > 0.0
    {
        limits.max_canvas_side = side;
    }
    limits.max_data_points =
        config.get_usize_value_default("maxDataPoints", limits.max_data_points);
    limits.max_mermaid_source =
        config.get_usize_value_default("maxMermaidSource", limits.max_mermaid_source);
    limits
}

#[derive(Debug, Clone, Default)]
pub struct ShortLinkConfig {
    pub store: String,
    pub default_ttl: u64,
    pub max_ttl: u64,
    pub max_entries: usize,
    pub base_url: String,
}

pub fn must_new_short_link_config() -> ShortLinkConfig {
    let config = must_new_config().set_prefix("shortLink");
    let store = config
        .get_value_from_env_first("store")
        .trim()
        .to_ascii_lowercase();
    let max_ttl = config.get_u64_value_default("maxTtl", 604_800);
    let default_ttl = config
        .get_u64_value_default("defaultTtl", 86_400)
        .min(max_ttl);
    let max_entries = config.get_usize_value_default("maxEntries", 10_000);
    let base_url = config
        .get_value_from_env_first("baseUrl")
        .trim()
        .trim_end_matches('/')
        .to_string();
    ShortLinkConfig {
        store,
        default_ttl,
        max_ttl,
        max_entries,
        base_url,
    }
}

#[derive(Debug, Clone, Default)]
#[cfg_attr(not(feature = "redis-store"), allow(dead_code))]
pub struct RedisConfig {
    pub url: String,
    pub cluster: bool,
    pub key_prefix: String,
}

pub fn must_new_redis_config() -> RedisConfig {
    let config = must_new_config().set_prefix("redis");
    let url = config.get_value_from_env_first("url").trim().to_string();
    let cluster = config.get_bool_value_default("cluster", false);
    let key_prefix = config.get_value_from_env_first("keyPrefix");
    let key_prefix = if key_prefix.is_empty() {
        "charts:short_link:".to_string()
    } else {
        key_prefix
    };
    RedisConfig {
        url,
        cluster,
        key_prefix,
    }
}

#[derive(Debug, Clone, Default)]
#[cfg_attr(
    not(any(feature = "postgres-store", feature = "mysql-store")),
    allow(dead_code)
)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: u64,
    pub table_name: String,
    pub auto_migrate: bool,
}

pub fn must_new_database_config() -> DatabaseConfig {
    let config = must_new_config().set_prefix("database");
    let url = config.get_value_from_env_first("url").trim().to_string();
    let max_connections = config.get_u32_value_allow_zero("maxConnections", 10).max(1);
    let min_connections = config
        .get_u32_value_allow_zero("minConnections", 0)
        .min(max_connections);
    let acquire_timeout = config.get_u64_value_default("acquireTimeout", 5);
    let table_name = config
        .get_value_from_env_first("tableName")
        .trim()
        .to_string();
    let table_name = if table_name.is_empty() {
        "chart_short_links".to_string()
    } else {
        table_name
    };
    let auto_migrate = config.get_bool_value_default("autoMigrate", true);
    DatabaseConfig {
        url,
        max_connections,
        min_connections,
        acquire_timeout,
        table_name,
        auto_migrate,
    }
}
