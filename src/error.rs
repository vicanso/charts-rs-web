use axum::http::HeaderValue;
use axum::http::{Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::{BoxError, Json};
use serde::{Deserialize, Serialize};
use tracing::error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpError {
    // 出错信息
    pub message: String,
    // 出错类型
    pub category: String,
    // 出错码
    pub code: String,
    // HTTP状态码
    pub status: u16,
    // 其它额外信息
    pub extra: Option<Vec<String>>,
}

// charts-rs 0.7.0 将 canvas/encoder/font 等模块的错误合并为单一 charts_rs::Error，
// 旧的 CanvasError/EncoderError/FontError 现在都是它的别名，因此只能有一个 From 实现；
// 这里按变体还原出原有的 category，保持错误响应语义不变。
// charts-rs 1.0.0 移除了 Io 变体，并将 Error 标记为 #[non_exhaustive]，因此必须保留通配分支。
impl From<charts_rs::Error> for HttpError {
    fn from(value: charts_rs::Error) -> Self {
        let category = match &value {
            charts_rs::Error::FontNotFound { .. } | charts_rs::Error::ParseFont { .. } => "font",
            charts_rs::Error::Size { .. }
            | charts_rs::Error::Raw { .. }
            | charts_rs::Error::Parse { .. }
            | charts_rs::Error::Image { .. } => "charts_encoder",
            _ => "charts",
        };
        HttpError {
            message: value.to_string(),
            category: category.to_string(),
            ..Default::default()
        }
    }
}

impl From<serde_json::Error> for HttpError {
    fn from(value: serde_json::Error) -> Self {
        HttpError {
            message: value.to_string(),
            category: "json".to_string(),
            ..Default::default()
        }
    }
}

pub type HttpResult<T> = Result<T, HttpError>;

impl Default for HttpError {
    fn default() -> Self {
        // 因为默认status为400，因此需要单独实现default
        HttpError {
            message: "".to_string(),
            category: "".to_string(),
            // 默认使用400为状态码
            status: 400,
            code: "".to_string(),
            extra: None,
        }
    }
}

impl HttpError {
    pub fn new(message: &str) -> Self {
        Self {
            message: message.to_string(),
            ..Default::default()
        }
    }
    pub fn new_with_category(message: &str, category: &str) -> Self {
        Self {
            message: message.to_string(),
            category: category.to_string(),
            ..Default::default()
        }
    }

    pub fn new_with_category_status(message: &str, category: &str, status: u16) -> Self {
        Self {
            message: message.to_string(),
            category: category.to_string(),
            status,
            ..Default::default()
        }
    }
}

impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        let status = match StatusCode::from_u16(self.status) {
            Ok(status) => status,
            Err(_) => StatusCode::BAD_REQUEST,
        };
        // 对于出错设置为no-cache
        let mut res = Json(self).into_response();
        res.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
        (status, res).into_response()
    }
}

pub async fn handle_error(
    // `Method` and `Uri` are extractors so they can be used here
    method: Method,
    uri: Uri,
    // the last argument must be the error itself
    err: BoxError,
) -> HttpError {
    error!("method:{}, uri:{}, error:{}", method, uri, err.to_string());
    if err.is::<tower::timeout::error::Elapsed>() {
        return HttpError::new_with_category_status("Request took too long", "timeout", 408);
    }
    HttpError::new(&err.to_string())
}
