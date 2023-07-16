use crate::config::get_env;

mod http;

/// 是否开发环境
/// 用于针对本地开发时的判断
pub fn is_development() -> bool {
    get_env() == "dev"
}
pub use http::*;
