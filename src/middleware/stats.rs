use axum::{body::Body, http::Request, middleware::Next, response::Response};
use axum_client_ip::InsecureClientIp;
use chrono::Utc;
use tracing::info;
use urlencoding::decode;

use crate::util::get_header_value;

pub async fn access_log(
    InsecureClientIp(ip): InsecureClientIp,
    req: Request<Body>,
    next: Next<Body>,
) -> Response {
    let start_at = Utc::now().timestamp_millis();

    let mut uri = req.uri().to_string();
    // decode成功则替换
    if let Ok(result) = decode(&uri) {
        uri = result.to_string()
    }
    let method = req.method().to_string();
    let x_forwarded_for = get_header_value(req.headers(), "X-Forwarded-For");
    let referrer = get_header_value(req.headers(), "Referer");

    let resp = next.run(req).await;

    let status = resp.status().as_u16();

    let cost = Utc::now().timestamp_millis() - start_at;

    info!(
        category = "access",
        ip = ip.to_string(),
        x_forwarded_for,
        referrer,
        method,
        uri,
        status,
        cost,
    );

    resp
}
