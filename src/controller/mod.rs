use axum::body::{Body, Bytes};
use axum::http::{header, HeaderValue, Request};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use charts_rs::{
    svg_to_png, BarChart, HorizontalBarChart, LineChart, PieChart, RadarChart, TableChart,
};

use crate::error::{HTTPError, HTTPResult};

pub fn new_router() -> Router {
    Router::new()
        .route("/ping", get(ping))
        .route("/charts/svg", post(chart_svg))
        .route("/charts/png", post(chart_png))
}

/// 读取http body
async fn read_http_body<B>(body: B) -> HTTPResult<Bytes>
where
    B: axum::body::HttpBody<Data = Bytes>,
    B::Error: std::fmt::Display,
{
    let bytes = match hyper::body::to_bytes(body).await {
        Ok(bytes) => bytes,
        Err(err) => {
            let msg = format!("failed to read body, {err}");
            return Err(HTTPError::new_with_category(&msg, "body_to_bytes"));
        }
    };
    Ok(bytes)
}

async fn ping() -> HTTPResult<&'static str> {
    Ok("pong")
}

enum FormatType {
    Svg,
    Png,
}

async fn render(req: Request<Body>, format: FormatType) -> HTTPResult<Bytes> {
    let buf = read_http_body(req).await?;
    let json = std::string::String::from_utf8_lossy(buf.as_ref());
    let value: serde_json::Value = serde_json::from_str(&json)?;
    let chart_type = if let Some(value) = value.get("type") {
        value.as_str().unwrap_or_default()
    } else {
        ""
    };
    let svg = match chart_type {
        "line" => {
            let chart = LineChart::from_json(&json)?;
            chart.svg()?
        }
        "horizontal_bar" => {
            let chart = HorizontalBarChart::from_json(&json)?;
            chart.svg()?
        }
        "pie" => {
            let chart = PieChart::from_json(&json)?;
            chart.svg()?
        }
        "radar" => {
            let chart = RadarChart::from_json(&json)?;
            chart.svg()?
        }
        "table" => {
            let chart = TableChart::from_json(&json)?;
            chart.svg()?
        }
        _ => {
            let chart = BarChart::from_json(&json)?;
            chart.svg()?
        }
    };

    let data = match format {
        FormatType::Svg => Bytes::from(svg),
        _ => {
            let data = svg_to_png(&svg)?;
            Bytes::from(data)
        }
    };
    Ok(data)
}

async fn chart_svg(req: Request<Body>) -> HTTPResult<Response> {
    let buf = render(req, FormatType::Svg).await?;
    Ok((
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static(mime::IMAGE_SVG.as_ref()),
        )],
        buf,
    )
        .into_response())
}

async fn chart_png(req: Request<Body>) -> HTTPResult<Response> {
    let buf = render(req, FormatType::Png).await?;
    Ok((
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static(mime::IMAGE_PNG.as_ref()),
        )],
        buf,
    )
        .into_response())
}
