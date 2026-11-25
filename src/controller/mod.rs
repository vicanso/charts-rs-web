use axum::body::{Body, Bytes};
use axum::extract::Query;
use axum::http::{HeaderValue, Request, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use http_body_util::BodyExt;
use image::codecs::{avif::AvifEncoder, jpeg::JpegEncoder};
use image::{ExtendedColorType, ImageEncoder, ImageFormat, load};
use serde::Deserialize;
use serde::Serialize;
use snafu::{ResultExt, Snafu};
use std::io::Cursor;

use crate::config::must_new_render_limits;
use crate::dist::{StaticFile, get_static_file};
use crate::error::{HttpError, HttpResult};
use crate::examples::{self, ExamplesCatalog};
use crate::llms;
use crate::maps;
use charts_rs::{
    RenderLimits, svg_to_png, svg_to_png_with_size, svg_to_webp, svg_to_webp_with_size,
};

#[derive(Debug, Snafu)]
pub enum ImageError {
    #[snafu(display("Handle image {category}: {source}"))]
    Image {
        category: String,
        source: image::ImageError,
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

// json响应的result
pub type JsonResult<T> = HttpResult<Json<T>>;

pub fn new_router() -> Router {
    Router::new()
        .route("/ping", get(ping))
        .route("/llms.txt", get(get_llms_txt))
        .route("/llms-full.txt", get(get_llms_full_txt))
        .route("/api/charts", get(preview))
        .route("/api/basic-info", get(get_basic_info))
        .route("/api/examples", get(get_examples))
        .route("/api/fonts/default", get(get_default_font))
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
    scale: Option<f32>,
}

#[derive(Deserialize, Default)]
struct ScaleQuery {
    scale: Option<f32>,
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
    render(params.opts.as_bytes().to_vec(), format, params.scale).await
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
    pub themes: Vec<String>,
    pub maps: Vec<String>,
    pub chart_types: Vec<&'static str>,
    pub version: String,
}

async fn get_basic_info() -> JsonResult<BasicInfoResult> {
    maps::init_builtin_maps();
    // charts-rs按名称排序返回，将默认字体调整至最前
    let mut families = charts_rs::get_font_families()?;
    if let Some(index) = families
        .iter()
        .position(|item| item == charts_rs::DEFAULT_FONT_FAMILY)
    {
        let family = families.remove(index);
        families.insert(0, family);
    }
    // 主题的顺序不固定，按名称排序
    let mut themes = charts_rs::list_theme_name();
    themes.sort_unstable();
    let maps = charts_rs::list_geo_json();
    let chart_types = charts_rs::list_chart_types().to_vec();
    Ok(Json(BasicInfoResult {
        families,
        themes,
        maps,
        chart_types,
        version: charts_rs::version().to_string(),
    }))
}

async fn get_examples() -> JsonResult<&'static ExamplesCatalog> {
    maps::init_builtin_maps();
    Ok(Json(examples::catalog()))
}

fn markdown_response(body: String) -> Response {
    (
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/markdown; charset=utf-8"),
            ),
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=300"),
            ),
        ],
        body,
    )
        .into_response()
}

async fn get_llms_txt() -> HttpResult<Response> {
    let body = tokio::task::spawn_blocking(llms::render_llms_txt)
        .await
        .map_err(|err| HttpError::new_with_category(&err.to_string(), "llms_task"))?;
    Ok(markdown_response(body))
}

async fn get_llms_full_txt() -> HttpResult<Response> {
    let body = tokio::task::spawn_blocking(llms::render_llms_full_txt)
        .await
        .map_err(|err| HttpError::new_with_category(&err.to_string(), "llms_task"))?;
    Ok(markdown_response(body))
}

/// 返回图表默认使用的字体(Roboto)，
/// 浏览器若未安装该字体，svg中的文本会以其它字体展示，与服务端计算文本宽度所使用的字体不一致，
/// 因此提供给页面加载
async fn get_default_font() -> Response {
    (
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("font/ttf")),
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=604800"),
            ),
        ],
        charts_rs::DEFAULT_FONT_DATA,
    )
        .into_response()
}

#[derive(Debug, Clone, Copy)]
pub enum FormatType {
    Svg,
    Png,
    Webp,
    Avif,
    Jpeg,
}

impl FormatType {
    /// 输出格式对应的mime类型
    pub fn mime(&self) -> &'static str {
        match self {
            FormatType::Svg => mime::IMAGE_SVG.as_ref(),
            FormatType::Png => mime::IMAGE_PNG.as_ref(),
            FormatType::Webp => "image/webp",
            FormatType::Avif => "image/avif",
            FormatType::Jpeg => mime::IMAGE_JPEG.as_ref(),
        }
    }
}

pub const MIN_SCALE: f32 = 1.0;
pub const MAX_SCALE: f32 = 4.0;
pub const DEFAULT_HTTP_SCALE: f32 = 1.0;
pub const DEFAULT_MCP_SCALE: f32 = 2.0;

pub fn validate_scale(scale: f32) -> HttpResult<f32> {
    if !scale.is_finite() || !(MIN_SCALE..=MAX_SCALE).contains(&scale) {
        return Err(HttpError {
            message: format!("scale must be between {MIN_SCALE} and {MAX_SCALE} (got {scale})"),
            category: "charts".to_string(),
            code: "invalid_scale".to_string(),
            ..Default::default()
        });
    }
    Ok(scale)
}

pub fn extract_and_strip_scale(value: &mut serde_json::Value) -> HttpResult<Option<f32>> {
    let Some(obj) = value.as_object_mut() else {
        return Ok(None);
    };
    let Some(raw) = obj.remove("scale") else {
        return Ok(None);
    };
    if raw.is_null() {
        return Ok(None);
    }
    let Some(num) = raw.as_f64() else {
        return Err(HttpError {
            message: "scale must be a number between 1 and 4".to_string(),
            category: "charts".to_string(),
            code: "invalid_scale".to_string(),
            ..Default::default()
        });
    };
    validate_scale(num as f32).map(Some)
}

fn parse_svg_attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let bytes = tag.as_bytes();
    let mut offset = 0;
    while let Some(pos) = tag[offset..].find(name) {
        let start = offset + pos;
        let after = start + name.len();
        let preceded_by_ws = start > 0 && bytes[start - 1].is_ascii_whitespace();
        if preceded_by_ws {
            let rest = tag[after..].trim_start();
            if let Some(after_eq) = rest.strip_prefix('=') {
                let after_eq = after_eq.trim_start();
                if let Some(quote) = after_eq.chars().next().filter(|&c| c == '"' || c == '\'') {
                    let inner = &after_eq[1..];
                    if let Some(end) = inner.find(quote) {
                        return Some(&inner[..end]);
                    }
                }
            }
        }
        offset = after;
    }
    None
}

fn parse_svg_length(raw: &str) -> Option<f32> {
    let trimmed = raw.trim().strip_suffix("px").unwrap_or(raw.trim()).trim();
    let val = trimmed.parse::<f32>().ok()?;
    (val.is_finite() && val > 0.0).then_some(val)
}

pub fn parse_svg_dimensions(svg: &str) -> Option<(f32, f32)> {
    let start = svg.find("<svg")?;
    let tag_end = svg[start..].find('>')? + start;
    let tag = &svg[start..=tag_end];
    if let (Some(w_raw), Some(h_raw)) =
        (parse_svg_attr(tag, "width"), parse_svg_attr(tag, "height"))
        && let (Some(w), Some(h)) = (parse_svg_length(w_raw), parse_svg_length(h_raw))
    {
        return Some((w, h));
    }
    if let Some(vb) = parse_svg_attr(tag, "viewBox") {
        let nums: Vec<f32> = vb
            .split(|c: char| c.is_ascii_whitespace() || c == ',')
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<f32>().ok())
            .collect();
        if nums.len() >= 4
            && nums[2].is_finite()
            && nums[2] > 0.0
            && nums[3].is_finite()
            && nums[3] > 0.0
        {
            return Some((nums[2], nums[3]));
        }
    }
    None
}

async fn render_from_bdoy(
    format: FormatType,
    query: ScaleQuery,
    req: Request<Body>,
) -> HttpResult<Response> {
    // TODO 是否校验content-type
    let buf = read_http_body(req).await?;
    render(buf.to_vec(), format, query.scale).await
}

/// `quality` 1–100 → (NeuQuant samplefac, 调色板颜色数, deflate level)。
/// 100 为 sample 1、256 色、deflate 9；80 为 sample 6、217 色、deflate 7；1 为 sample 30、64 色、deflate 1。
fn png_encode_settings(quality: u8) -> (i32, usize, u8) {
    let q = quality.clamp(1, 100);
    let sample_fac = 1 + (100 - i32::from(q)) * 29 / 99;
    let colors = 64 + (256 - 64) * (usize::from(q) - 1) / 99;
    let level = 1 + (u16::from(q) - 1) * 8 / 99;
    (sample_fac, colors, level as u8)
}

fn quantize_png(png: &[u8], quality: u8) -> Result<Vec<u8>, ImageError> {
    let (sample_fac, colors, level) = png_encode_settings(quality);
    let dynamic_image = load(Cursor::new(png), ImageFormat::Png).context(ImageSnafu {
        category: "load_image",
    })?;
    let rgba = dynamic_image.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    if width == 0 || height == 0 {
        return Ok(png.to_vec());
    }
    let pixels = rgba.as_raw();
    let nq = color_quant::NeuQuant::new(sample_fac, colors, pixels);
    let indexed: Vec<u8> = pixels
        .as_chunks::<4>()
        .0
        .iter()
        .map(|pix| nq.index_of(pix).min(colors - 1) as u8)
        .collect();
    let map = nq.color_map_rgba();
    let palette: Vec<lodepng::RGBA> = map
        .as_chunks::<4>()
        .0
        .iter()
        .take(colors)
        .map(|c| lodepng::RGBA::new(c[0], c[1], c[2], c[3]))
        .collect();
    let mut enc = lodepng::Encoder::new();
    enc.set_auto_convert(false);
    enc.settings_mut().set_level(level);
    enc.set_palette(&palette).context(LodePNGSnafu {
        category: "png_encoder",
    })?;
    enc.encode(&indexed, width, height).context(LodePNGSnafu {
        category: "png_encode",
    })
}

/// 将历史/缺省的图表类型别名规范化为 charts-rs 的规范类型名
pub fn normalize_chart_type(raw: &str) -> &str {
    let trimmed = raw.trim();
    match trimmed {
        "" => "bar",
        "multi_chart" => "multi",
        // guage为历史拼写，保留兼容
        "guage" => "gauge",
        other => other,
    }
}

pub const DEFAULT_JPEG_QUALITY: u8 = 92;
pub const DEFAULT_AVIF_QUALITY: u8 = 90;

fn rasterize_svg_png(
    svg: &str,
    target_w: Option<u32>,
    target_h: Option<u32>,
) -> HttpResult<Vec<u8>> {
    Ok(match (target_w, target_h) {
        (None, None) => svg_to_png(svg)?,
        (w, h) => svg_to_png_with_size(svg, w, h)?,
    })
}

fn encode_jpeg_from_png(png: &[u8], quality: u8) -> Result<Vec<u8>, ImageError> {
    let dynamic_image = load(Cursor::new(png), ImageFormat::Png).context(ImageSnafu {
        category: "load_image",
    })?;
    let rgb = dynamic_image.to_rgb8();
    let q = if quality == 0 {
        DEFAULT_JPEG_QUALITY
    } else {
        quality.clamp(1, 100)
    };
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, q)
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            ExtendedColorType::Rgb8,
        )
        .context(ImageSnafu {
            category: "jpeg_encode",
        })?;
    Ok(buf)
}

fn encode_avif_from_png(png: &[u8], quality: u8) -> Result<Vec<u8>, ImageError> {
    let dynamic_image = load(Cursor::new(png), ImageFormat::Png).context(ImageSnafu {
        category: "load_image",
    })?;
    let rgba = dynamic_image.to_rgba8();
    let q = if quality == 0 {
        DEFAULT_AVIF_QUALITY
    } else {
        quality.clamp(1, 100)
    };
    let mut buf = Vec::new();
    AvifEncoder::new_with_speed_quality(&mut buf, 4, q)
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            ExtendedColorType::Rgba8,
        )
        .context(ImageSnafu {
            category: "avif_encode",
        })?;
    Ok(buf)
}

pub fn encode_svg(
    svg: &str,
    format: FormatType,
    quality: u8,
    scale: f32,
    limits: &RenderLimits,
) -> HttpResult<Bytes> {
    if matches!(format, FormatType::Svg) {
        return Ok(Bytes::from(svg.to_owned()));
    }
    validate_scale(scale)?;
    let (target_w, target_h) = if (scale - 1.0).abs() > f32::EPSILON {
        let (w, h) = parse_svg_dimensions(svg).ok_or_else(|| {
            HttpError::new_with_category(
                "unable to determine SVG dimensions for scaled rasterization",
                "charts_encoder",
            )
        })?;
        let scaled_w = (w * scale).round();
        let scaled_h = (h * scale).round();
        if !scaled_w.is_finite() || !scaled_h.is_finite() || scaled_w <= 0.0 || scaled_h <= 0.0 {
            return Err(HttpError::new_with_category(
                "scaled raster dimensions must be positive",
                "charts_encoder",
            ));
        }
        if scaled_w > limits.max_canvas_side || scaled_h > limits.max_canvas_side {
            return Err(HttpError {
                message: format!(
                    "scaled dimensions ({}x{}) exceed max_canvas_side ({})",
                    scaled_w as u32, scaled_h as u32, limits.max_canvas_side
                ),
                category: "charts".to_string(),
                code: "limit_exceeded".to_string(),
                ..Default::default()
            });
        }
        (Some(scaled_w as u32), Some(scaled_h as u32))
    } else {
        (None, None)
    };

    let data = match format {
        FormatType::Svg => unreachable!(),
        FormatType::Webp => match (target_w, target_h) {
            (None, None) => Bytes::from(svg_to_webp(svg)?),
            (w, h) => Bytes::from(svg_to_webp_with_size(svg, w, h)?),
        },
        FormatType::Avif => {
            let png = rasterize_svg_png(svg, target_w, target_h)?;
            Bytes::from(encode_avif_from_png(&png, quality)?)
        }
        FormatType::Jpeg => {
            let png = rasterize_svg_png(svg, target_w, target_h)?;
            Bytes::from(encode_jpeg_from_png(&png, quality)?)
        }
        FormatType::Png => {
            let data = rasterize_svg_png(svg, target_w, target_h)?;
            if quality == 0 {
                Bytes::from(data)
            } else {
                Bytes::from(quantize_png(&data, quality)?)
            }
        }
    };
    Ok(data)
}

pub fn render_chart_value(
    chart_type: &str,
    value: &serde_json::Value,
    format: FormatType,
    quality: u8,
    scale: f32,
    limits: &RenderLimits,
) -> HttpResult<Bytes> {
    maps::init_builtin_maps();
    let canonical = normalize_chart_type(chart_type);
    let svg = charts_rs::render_chart_from_value_with_limits(canonical, value, limits)?;
    encode_svg(&svg, format, quality, scale, limits)
}

async fn render(
    params: Vec<u8>,
    format: FormatType,
    query_scale: Option<f32>,
) -> HttpResult<Response> {
    let data =
        tokio::task::spawn_blocking(move || render_chart_with_scale(&params, format, query_scale))
            .await
            .map_err(|err| HttpError::new_with_category(&err.to_string(), "render_task"))??;
    let content_type = HeaderValue::from_static(format.mime());
    Ok(([(header::CONTENT_TYPE, content_type)], data).into_response())
}

/// 根据json参数生成图表，返回对应格式的数据
#[cfg(test)]
pub fn render_chart(params: &[u8], format: FormatType) -> HttpResult<Bytes> {
    render_chart_with_scale(params, format, None)
}

pub fn render_chart_with_scale(
    params: &[u8],
    format: FormatType,
    query_scale: Option<f32>,
) -> HttpResult<Bytes> {
    let limits = must_new_render_limits();
    if params.len() > limits.max_json_bytes {
        return Err(HttpError {
            message: format!(
                "JSON payload ({} bytes) exceeds max_json_bytes ({})",
                params.len(),
                limits.max_json_bytes
            ),
            category: "charts".to_string(),
            code: "limit_exceeded".to_string(),
            ..Default::default()
        });
    }
    let json = std::string::String::from_utf8_lossy(params);
    let mut value: serde_json::Value = serde_json::from_str(&json)?;
    let body_scale = extract_and_strip_scale(&mut value)?;
    let scale = match query_scale {
        Some(q) => validate_scale(q)?,
        None => body_scale.unwrap_or(DEFAULT_HTTP_SCALE),
    };
    let chart_type = value
        .get("type")
        .and_then(|item| item.as_str())
        .unwrap_or_default()
        .to_string();
    let mut quality: u8 = 0;
    if let Some(q) = value.get("quality").and_then(|item| item.as_u64()) {
        quality = q.min(100) as u8;
    }
    render_chart_value(&chart_type, &value, format, quality, scale, &limits)
}

async fn chart_svg(Query(query): Query<ScaleQuery>, req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(FormatType::Svg, query, req).await
}

async fn chart_png(Query(query): Query<ScaleQuery>, req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(FormatType::Png, query, req).await
}

async fn chart_webp(Query(query): Query<ScaleQuery>, req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(FormatType::Webp, query, req).await
}

async fn chart_avif(Query(query): Query<ScaleQuery>, req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(FormatType::Avif, query, req).await
}

async fn chart_jpeg(Query(query): Query<ScaleQuery>, req: Request<Body>) -> HttpResult<Response> {
    render_from_bdoy(FormatType::Jpeg, query, req).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::RgbaImage;

    fn gradient_png() -> Vec<u8> {
        let image = RgbaImage::from_fn(48, 32, |x, y| {
            image::Rgba([(x * 5) as u8, (y * 7) as u8, 90, 255])
        });
        let mut buf = Cursor::new(Vec::new());
        image
            .write_to(&mut buf, ImageFormat::Png)
            .expect("encode gradient");
        buf.into_inner()
    }

    fn assert_png(data: &[u8], width: u32, height: u32) {
        assert_eq!(&data[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
        let image = load(Cursor::new(data), ImageFormat::Png).expect("decode png");
        assert_eq!((image.width(), image.height()), (width, height));
    }

    fn unique_colors(data: &[u8]) -> usize {
        let image = load(Cursor::new(data), ImageFormat::Png)
            .expect("decode png")
            .into_rgba8();
        let mut colors = std::collections::HashSet::new();
        for pixel in image.pixels() {
            colors.insert([pixel[0], pixel[1], pixel[2], pixel[3]]);
        }
        colors.len()
    }

    #[test]
    fn png_encode_settings_follows_quality() {
        assert_eq!(png_encode_settings(1), (30, 64, 1));
        assert_eq!(png_encode_settings(80), (6, 217, 7));
        assert_eq!(png_encode_settings(100), (1, 256, 9));
        assert_eq!(png_encode_settings(0), png_encode_settings(1));
        assert_eq!(png_encode_settings(255), png_encode_settings(100));
    }

    #[test]
    fn quantize_png_is_valid_and_smaller() {
        let raw = gradient_png();
        let low = quantize_png(&raw, 40).expect("q40");
        let mid = quantize_png(&raw, 80).expect("q80");
        let high = quantize_png(&raw, 100).expect("q100");
        for data in [&low, &mid, &high] {
            assert_png(data, 48, 32);
        }
        let (low_n, mid_n, high_n) = (
            unique_colors(&low),
            unique_colors(&mid),
            unique_colors(&high),
        );
        let (_, low_cap, _) = png_encode_settings(40);
        let (_, mid_cap, _) = png_encode_settings(80);
        let (_, high_cap, _) = png_encode_settings(100);
        assert!(low_n <= low_cap && mid_n <= mid_cap && high_n <= high_cap);
        assert!(low_n < high_n);
        assert_ne!(low, mid);
        assert_ne!(mid, high);
    }

    #[test]
    fn render_chart_png_quality_changes_output() {
        let chart = |quality: Option<&str>| {
            let q = quality
                .map(|value| format!(r#","quality":{value}"#))
                .unwrap_or_default();
            format!(
                r#"{{"type":"bar","width":80,"height":48{q},"x_axis_data":["a","b"],"series_list":[{{"name":"A","data":[1,3]}}]}}"#
            )
        };
        let omitted = render_chart(chart(None).as_bytes(), FormatType::Png).expect("default");
        let raw = render_chart(chart(Some("0")).as_bytes(), FormatType::Png).expect("q0");
        let mid = render_chart(chart(Some("80")).as_bytes(), FormatType::Png).expect("q80");
        let high = render_chart(chart(Some("150")).as_bytes(), FormatType::Png).expect("q150");
        let best = render_chart(chart(Some("100")).as_bytes(), FormatType::Png).expect("q100");
        let defaulted = render_chart(
            br#"{"type":"bar","width":80,"height":48,"quality":80.5,"x_axis_data":["a","b"],"series_list":[{"name":"A","data":[1,3]}]}"#,
            FormatType::Png,
        )
        .expect("float");
        assert_eq!(omitted, raw);
        assert_eq!(defaulted, raw);
        assert_png(&raw, 80, 48);
        assert_png(&mid, 80, 48);
        assert!(raw.len() > mid.len());
        assert_eq!(high, best);
    }

    #[test]
    fn render_chart_jpeg_quality_changes_output() {
        let chart = |quality: Option<&str>| {
            let q = quality
                .map(|value| format!(r#","quality":{value}"#))
                .unwrap_or_default();
            format!(
                r#"{{"type":"bar","width":80,"height":48{q},"x_axis_data":["a","b"],"series_list":[{{"name":"A","data":[1,3]}}]}}"#
            )
        };
        let default_jpg =
            render_chart(chart(None).as_bytes(), FormatType::Jpeg).expect("default jpg");
        let q92 = render_chart(chart(Some("92")).as_bytes(), FormatType::Jpeg).expect("q92");
        let low = render_chart(chart(Some("40")).as_bytes(), FormatType::Jpeg).expect("q40");
        assert_eq!(&default_jpg[..2], &[0xFF, 0xD8]);
        assert_eq!(default_jpg, q92);
        assert!(q92.len() > low.len());

        let jpg_2x = render_chart_with_scale(chart(None).as_bytes(), FormatType::Jpeg, Some(2.0))
            .expect("jpg 2x");
        let decoded = load(Cursor::new(&jpg_2x), ImageFormat::Jpeg).expect("decode jpg 2x");
        assert_eq!((decoded.width(), decoded.height()), (160, 96));
    }

    #[test]
    fn render_chart_scale_produces_hidpi_raster_and_enforces_limits() {
        let with_body_scale = br#"{"type":"bar","width":80,"height":48,"scale":2,"x_axis_data":["a","b"],"series_list":[{"name":"A","data":[1,3]}]}"#;
        let scaled_2x = render_chart(with_body_scale, FormatType::Png).expect("body scale 2");
        assert_png(&scaled_2x, 160, 96);

        let query_override =
            render_chart_with_scale(with_body_scale, FormatType::Png, Some(3.0)).expect("query 3");
        assert_png(&query_override, 240, 144);

        let fractional =
            render_chart_with_scale(with_body_scale, FormatType::Png, Some(1.5)).expect("1.5x");
        assert_png(&fractional, 120, 72);

        // SVG ignores valid scale factors cleanly.
        let svg_ignored =
            render_chart_with_scale(with_body_scale, FormatType::Svg, Some(3.0)).expect("svg");
        assert!(svg_ignored.starts_with(b"<svg"));

        // Auto-sized Mermaid diagrams scale from intrinsic SVG dimensions.
        let mermaid = br#"{"type":"mermaid","source":"flowchart LR\n  A[Start] --> B[Done]"}"#;
        let mermaid_1x = render_chart_with_scale(mermaid, FormatType::Png, None).expect("m 1x");
        let mermaid_2x =
            render_chart_with_scale(mermaid, FormatType::Png, Some(2.0)).expect("m 2x");
        let img1 = load(Cursor::new(&mermaid_1x), ImageFormat::Png).expect("decode 1x");
        let img2 = load(Cursor::new(&mermaid_2x), ImageFormat::Png).expect("decode 2x");
        assert_eq!(
            (img2.width(), img2.height()),
            (img1.width() * 2, img1.height() * 2)
        );

        // Out-of-range and non-numeric scales are rejected.
        for bad in [
            render_chart_with_scale(with_body_scale, FormatType::Png, Some(0.5)),
            render_chart_with_scale(with_body_scale, FormatType::Png, Some(5.0)),
            render_chart(
                br#"{"type":"bar","scale":"2","x_axis_data":["a"],"series_list":[{"name":"A","data":[1]}]}"#,
                FormatType::Png,
            ),
        ] {
            assert_eq!(bad.unwrap_err().code, "invalid_scale");
        }

        // Scaling beyond max_canvas_side is rejected.
        let near_limit = br#"{"type":"bar","width":5000,"height":400,"x_axis_data":["a"],"series_list":[{"name":"A","data":[1]}]}"#;
        let err = render_chart_with_scale(near_limit, FormatType::Png, Some(2.0)).unwrap_err();
        assert_eq!(err.code, "limit_exceeded");
    }

    #[test]
    fn render_chart_accepts_charts_rs_2_2_options() {
        let samples: &[&[u8]] = &[
            br#"{"type":"radar","width":80,"height":80,"shape":"circle","indicators":[{"name":"A","min":1,"max":10},{"name":"B","max":10},{"name":"C","max":10}],"series_list":[{"name":"S","data":[5,6,7]}]}"#,
            br#"{"type":"scatter","width":120,"height":80,"contour":{},"marginal":{},"series_list":[{"name":"A","data":[1,2,3,4,5,6]}]}"#,
            br#"{"type":"line","width":80,"height":48,"x_axis_data":["a","b","c"],"series_list":[{"name":"A","data":[1,3,2],"mark_points":[{"category":"index","index":1}]}]}"#,
        ];
        for json in samples {
            let svg = render_chart(json, FormatType::Svg).expect("svg");
            assert!(
                svg.windows(4).any(|w| w == b"<svg"),
                "{}",
                String::from_utf8_lossy(svg.as_ref())
            );
        }
    }

    #[test]
    fn render_chart_supports_mermaid_aliases_and_demo_map() {
        let samples: &[&[u8]] = &[
            br#"{"type":"mermaid","source":"flowchart LR\n  A[Client] --> B[(DB)]"}"#,
            br#"{"type":"multi_chart","child_charts":[{"type":"bar","x_axis_data":["A"],"series_list":[{"name":"S","data":[1]}]}]}"#,
            br#"{"type":"multi","child_charts":[{"type":"pie","series_list":[{"name":"A","data":[10]}]}]}"#,
            br#"{"type":"guage","series_list":[{"name":"CPU","data":[72]}]}"#,
            br#"{"type":"map","geo_json":"demo","data":[["Alder",10],["Birch",20]]}"#,
        ];
        for json in samples {
            let svg = render_chart(json, FormatType::Svg).expect("svg");
            assert!(svg.starts_with(b"<svg"));
        }
    }

    #[test]
    fn render_chart_enforces_render_limits() {
        let oversized = serde_json::json!({
            "type": "bar",
            "width": 20000,
            "x_axis_data": ["a"],
            "series_list": [{"name": "A", "data": [1]}]
        });
        let err = render_chart(oversized.to_string().as_bytes(), FormatType::Svg).unwrap_err();
        assert!(err.message.contains("max_canvas_side"));
    }
}
