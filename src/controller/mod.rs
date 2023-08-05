use axum::body::{Body, Bytes};
use axum::http::{header, HeaderValue, Request, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use image::{load, ImageFormat};
use rgb::RGBA8;
use serde::Serialize;
use snafu::{ResultExt, Snafu};
use std::io::Cursor;

use crate::error::{HttpError, HttpResult};
use charts_rs::{
    svg_to_png, BarChart, HorizontalBarChart, LineChart, PieChart, RadarChart, TableChart, ScatterChart,
};
use crate::dist::{get_static_file, StaticFile};

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
        .route("/api/font-families", get(font_families))
        .route("/api/charts/svg", post(chart_svg))
        .route("/api/charts/png", post(chart_png))
        .fallback(get(serve))
}

/// 读取http body
async fn read_http_body<B>(body: B) -> HttpResult<Bytes>
where
    B: axum::body::HttpBody<Data = Bytes>,
    B::Error: std::fmt::Display,
{
    let bytes = match hyper::body::to_bytes(body).await {
        Ok(bytes) => bytes,
        Err(err) => {
            let msg = format!("failed to read body, {err}");
            return Err(HttpError::new_with_category(&msg, "body_to_bytes"));
        }
    };
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
struct FontFamilyResult {
    pub families: Vec<String>,
}

async fn font_families() -> JsonResult<FontFamilyResult> {
    // TODO 调整error
    let families = charts_rs::get_font_families()?;
    Ok(Json(FontFamilyResult { families }))
}

enum FormatType {
    Svg,
    Png,
}

async fn render(req: Request<Body>, format: FormatType) -> HttpResult<Bytes> {
    // TODO 是否校验content-type
    let buf = read_http_body(req).await?;
    let json = std::string::String::from_utf8_lossy(buf.as_ref());
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
            let chart = TableChart::from_json(&json)?;
            chart.svg()?
        }
        "scatter" => {
            let chart = ScatterChart::from_json(&json)?;
            chart.svg()?
        },
        _ => {
            let chart = BarChart::from_json(&json)?;
            chart.svg()?
        }
    };

    let data = match format {
        FormatType::Svg => Bytes::from(svg),
        _ => {
            let data = svg_to_png(&svg)?;
            if quality == 0 {
                return Ok(Bytes::from(data));
            }

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

            let mut img = liq
                .new_image(buffer, width, height, 0.0)
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
    };
    Ok(data)
}

async fn chart_svg(req: Request<Body>) -> HttpResult<Response> {
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

async fn chart_png(req: Request<Body>) -> HttpResult<Response> {
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
