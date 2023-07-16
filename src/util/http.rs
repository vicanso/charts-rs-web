use axum::http::{HeaderMap, HeaderValue};

/// 获取http头的值
pub fn get_header_value(headers: &HeaderMap<HeaderValue>, key: &str) -> String {
    if let Some(value) = headers.get(key) {
        value.to_str().unwrap_or("").to_string()
    } else {
        "".to_string()
    }
}
