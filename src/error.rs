use axum::http::HeaderValue;
use axum::http::{header, Method, StatusCode, Uri};
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

impl From<charts_rs::CanvasError> for HttpError {
    fn from(value: charts_rs::CanvasError) -> Self {
        HttpError {
            message: value.to_string(),
            category: "charts".to_string(),
            ..Default::default()
        }
    }
}
impl From<charts_rs::EncoderError> for HttpError {
    fn from(value: charts_rs::EncoderError) -> Self {
        HttpError {
            message: value.to_string(),
            category: "charts_encoder".to_string(),
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
