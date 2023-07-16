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
        if let Some(value) = self.settings.get(arr[0]) {
            if let Some(v) = value.get(arr[1]) {
                return v.clone();
            }
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
