use axum::body::{Body, Bytes};
use axum::extract::Query;
use axum::http::{header, HeaderValue, Request, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use http_body_util::BodyExt;
use image::{load, ImageFormat};
use rgb::RGBA8;
use serde::Deserialize;
use serde::Serialize;
use snafu::{ResultExt, Snafu};
use std::io::Cursor;

use crate::dist::{get_static_file, StaticFile};
use crate::error::{HttpError, HttpResult};
use charts_rs::{
    svg_to_avif, svg_to_png, svg_to_webp, BarChart, CandlestickChart, HeatmapChart,
    HorizontalBarChart, LineChart, MultiChart, PieChart, RadarChart, ScatterChart, TableChart,
};

#[derive(Debug, Snafu)]
pub enum ImageError {
    #[snafu(display("Handle image {category}: {source}"))]
    Image {
        category: String,
        source: image::ImageError,
    },
    #[snafu(display("Handle image {category}: {source}"))]
    ImageQuant {
        category: String,
        source: imagequant::Error,
    },
    #[snafu(display("Handle image {category}: {source}"))]
    LodePNG {
        category: String,
        source: lodepng::Error,
    },
}
impl From<ImageError> for HttpError {
    fn from(value: ImageError) -> Self {
        HttpError {
            message: value.to_string(),
            category: "image".to_string(),
            ..Default::default()
        }
    }
}
impl From<charts_rs::FontError> for HttpError {
    fn from(value: charts_rs::FontError) -> Self {
        HttpError {
            message: value.to_string(),
            category: "font".to_string(),
            ..Default::default()
        }
    }
}

// json响应的result
pub type JsonResult<T> = HttpResult<Json<T>>;

pub fn new_router() -> Router {
    Router::new()
        .route("/ping", get(ping))
        .route("/api/charts", get(preview))
        .route("/api/basic-info", get(get_basic_info))
        .route("/api/charts/svg", post(chart_svg))
        .route("/api/charts/png", post(chart_png))
        .route("/api/charts/webp", post(chart_webp))
        .route("/api/charts/avif", post(chart_avif))
        .route("/api/charts/jpeg", post(chart_jpeg))
        .fallback(get(serve))
}

#[derive(Deserialize)]
struct PrevieParams {
    opts: String,
    format: Option<String>,
}

async fn preview(params: Query<PrevieParams>) -> HttpResult<Response> {
    let format = match params
        .format
        .clone()
        .unwrap_or_default()
        .to_lowercase()
        .as_str()
    {
        "png" => FormatType::Png,
        "webp" => FormatType::Webp,
        "avif" => FormatType::Avif,
        "jpeg" => FormatType::Jpeg,
        _ => FormatType::Svg,
    };
    render(params.opts.as_bytes(), format).await
}

/// 读取http body
async fn read_http_body(request: Request<Body>) -> HttpResult<Bytes> {
    let (_, body) = request.into_parts();
    let bytes = body
        .collect()
        .await
        .map_err(|err| HttpError::new_with_category(&err.to_string(), "body_to_bytes"))?
        .to_bytes();
    Ok(bytes)
}

async fn ping() -> HttpResult<&'static str> {
    Ok("pong")
}

async fn serve(uri: Uri) -> StaticFile {
    let mut filename = &uri.path()[1..];
    // html无版本号，因此不设置缓存
    if filename.is_empty() {
        filename = "index.html";
    }
    get_static_file(filename)
}

#[derive(Debug, Clone, Serialize, Default)]
struct BasicInfoResult {
    pub families: Vec<String>,
    pub version: String,
}

async fn get_basic_info() -> JsonResult<BasicInfoResult> {
    let families = charts_rs::get_font_families()?;
    Ok(Json(BasicInfoResult {
        families,
        version: charts_rs::version(),
    }))
}

enum FormatType {
    Svg,
    Png,
    Webp,
    Avif,
    Jpeg,
}

async fn render_from_bdoy(req: Request<Body>, format: FormatType) -> HttpResult<Response> {
    // TODO 是否校验content-type
    let buf = read_http_body(req).await?;
    render(buf.as_ref(), format).await
}

async fn render(params: &[u8], format: FormatType) -> HttpResult<Response> {
    let json = std::string::String::from_utf8_lossy(params);
    let value: serde_json::Value = serde_json::from_str(&json)?;
    let chart_type = if let Some(value) = value.get("type") {
        value.as_str().unwrap_or_default()
    } else {
        ""
    };
    let mut quality: u8 = 80;
    if let Some(value) = value.get("quality") {
        let v = value.as_u64().unwrap_or_default();
        if v < 100 {
            quality = v as u8;
        }
    }

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
            let mut chart = TableChart::from_json(&json)?;
            chart.svg()?
        }
        "scatter" => {
            let chart = ScatterChart::from_json(&json)?;
            chart.svg()?
        }
        "candlestick" => {
            let chart = CandlestickChart::from_json(&json)?;
            chart.svg()?
        }
        "heatmap" => {
            let chart = HeatmapChart::from_json(&json)?;
            chart.svg()?
        }
        "multi_chart" => {
            let mut multi_chart = MultiChart::from_json(&json)?;
            multi_chart.svg()?
        }
        _ => {
            let chart = BarChart::from_json(&json)?;
            chart.svg()?
        }
    };

    let data = match format {
        FormatType::Svg => Bytes::from(svg),
        FormatType::Webp => {
            let data = svg_to_webp(&svg)?;
            Bytes::from(data)
        }
        FormatType::Avif => {
            let data = svg_to_avif(&svg)?;
            Bytes::from(data)
        }
        _ => {
            let data = svg_to_png(&svg)?;
            if quality == 0 {
                Bytes::from(data)
            } else {
                let mut liq = imagequant::new();
                liq.set_quality(0, quality).context(ImageQuantSnafu {
                    category: "png_set_quality",
                })?;

                let c = Cursor::new(&data);
                let dynamic_image = load(c, ImageFormat::Png).context(ImageSnafu {
                    category: "load_image",
                })?;
                let width = dynamic_image.width() as usize;
                let height = dynamic_image.height() as usize;
                let mut buffer = Vec::with_capacity(width * height);

                for ele in dynamic_image.to_rgba8().chunks(4) {
                    buffer.push(RGBA8 {
                        r: ele[0],
                        g: ele[1],
                        b: ele[2],
                        a: ele[3],
                    })
                }

                let mut img =
                    liq.new_image(buffer, width, height, 0.0)
                        .context(ImageQuantSnafu {
                            category: "png_new_image",
                        })?;

                let mut res = liq.quantize(&mut img).context(ImageQuantSnafu {
                    category: "png_quantize",
                })?;

                res.set_dithering_level(1.0).context(ImageQuantSnafu {
                    category: "png_set_level",
                })?;

                let (palette, pixels) = res.remapped(&mut img).context(ImageQuantSnafu {
                    category: "png_remapped",
                })?;
                let mut enc = lodepng::Encoder::new();
                enc.set_palette(&palette).context(LodePNGSnafu {
                    category: "png_encoder",
                })?;

                let buf = enc.encode(&pixels, width, height).context(LodePNGSnafu {
                    category: "png_encode",
                })?;

                Bytes::from(buf)
            }
        }
    };
    let content_type = match format {
        FormatType::Png => HeaderValue::from_static(mime::IMAGE_PNG.as_ref()),
        FormatType::Avif => HeaderValue::from_static("image/avif"),
        FormatType::Webp => HeaderValue::from_static("image/webp"),
        FormatType::Jpeg => HeaderValue::from_static(mime::JPEG.as_ref()),
        _ => HeaderValue::from_static(mime::IMAGE_SVG.as_ref()),
    };
    Ok(([(header::CONTENT_TYPE, content_type)], data).into_response())
}

async fn chart_svg(req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(req, FormatType::Svg).await
}

async fn chart_png(req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(req, FormatType::Png).await
}

async fn chart_webp(req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(req, FormatType::Webp).await
}

async fn chart_avif(req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(req, FormatType::Avif).await
}

async fn chart_jpeg(req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(req, FormatType::Jpeg).await
}
