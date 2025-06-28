use axum::{body::Body, http::Request, middleware::Next, response::Response};
use chrono::Utc;
use tracing::info;
use urlencoding::decode;

use crate::util::get_header_value;

pub async fn access_log(req: Request<Body>, next: Next) -> Response {
    let start_at = Utc::now().timestamp_millis();

    let mut uri = req.uri().to_string();
    // decode成功则替换
    if let Ok(result) = decode(&uri) {
        uri = result.to_string()
    }
    let method = req.method().to_string();
    let x_forwarded_for = get_header_value(req.headers(), "X-Forwarded-For");
    let referrer = get_header_value(req.headers(), "Referer");

    // Extract IP address from headers or use a default
    let ip = x_forwarded_for
        .split(',')
        .next()
        .unwrap_or("unknown")
        .trim()
        .to_string();

    let resp = next.run(req).await;

    let status = resp.status().as_u16();

    let cost = Utc::now().timestamp_millis() - start_at;

    info!(
        category = "access",
        ip, x_forwarded_for, referrer, method, uri, status, cost,
    );

    resp
}
