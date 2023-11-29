use axum::http::{header, header::HeaderName, HeaderMap, HeaderValue};
use axum::{body::Body, http::Request, middleware::Next, response::Response};
use std::collections::HashMap;
use std::str::FromStr;

mod stats;

pub use stats::access_log;

/// 插入HTTP头
fn insert_header(headers: &mut HeaderMap<HeaderValue>, values: HashMap<String, String>) {
    // 如果失败则不设置
    for (name, value) in values {
        // 为空则不处理（删除使用另外的方式）
        if name.is_empty() || value.is_empty() {
            continue;
        }
        if let Ok(header_name) = HeaderName::from_str(&name) {
            if let Ok(header_value) = HeaderValue::from_str(&value) {
                headers.insert(header_name, header_value);
            }
        }
    }
}

/// HTTP头不存在时才设置
fn set_header_if_not_exist(headers: &mut HeaderMap<HeaderValue>, name: &str, value: &str) {
    let current = headers.get(name);
    if current.is_some() {
        return;
    }
    let values = [(name.to_string(), value.to_string())].into();
    insert_header(headers, values)
}
/// 如果未设置cache-control，则设置为no-cache
fn set_no_cache_if_not_exist(headers: &mut HeaderMap<HeaderValue>) {
    // 因为只会字符导致设置错误
    // 因此此处理不会出错
    set_header_if_not_exist(headers, header::CACHE_CONTROL.as_str(), "no-cache");
}

pub async fn entry(req: Request<Body>, next: Next) -> Response {
    let mut resp = next.run(req).await;
    let headers = resp.headers_mut();
    set_no_cache_if_not_exist(headers);
    resp
}
