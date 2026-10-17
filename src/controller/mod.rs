use axum::body::{Body, Bytes};
use axum::extract::Query;
use axum::http::{HeaderValue, Request, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use http_body_util::BodyExt;
use image::{ImageFormat, load};
use serde::Deserialize;
use serde::Serialize;
use snafu::{ResultExt, Snafu};
use std::io::Cursor;

use crate::dist::{StaticFile, get_static_file};
use crate::error::{HttpError, HttpResult};
use charts_rs::{
    BarChart, BoxPlotChart, BulletChart, CalendarChart, CandlestickChart, ChordChart, FunnelChart,
    GanttChart, GaugeChart, GraphChart, HeatmapChart, HistogramChart, HorizontalBarChart,
    LineChart, LinesChart, MapChart, MultiChart, ParallelChart, PieChart, PolarBarChart,
    RadarChart, SankeyChart, ScatterChart, SunburstChart, TableChart, ThemeRiverChart, TreeChart,
    TreemapChart, WaterfallChart, svg_to_avif, svg_to_jpeg, svg_to_png, svg_to_webp,
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
        .route("/api/charts", get(preview))
        .route("/api/basic-info", get(get_basic_info))
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
    pub themes: Vec<String>,
    pub version: String,
}

async fn get_basic_info() -> JsonResult<BasicInfoResult> {
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
    Ok(Json(BasicInfoResult {
        families,
        themes,
        version: charts_rs::version().to_string(),
    }))
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

async fn render_from_bdoy(req: Request<Body>, format: FormatType) -> HttpResult<Response> {
    // TODO 是否校验content-type
    let buf = read_http_body(req).await?;
    render(buf.as_ref(), format).await
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
        .chunks_exact(4)
        .map(|pix| nq.index_of(pix).min(colors - 1) as u8)
        .collect();
    let map = nq.color_map_rgba();
    let palette: Vec<lodepng::RGBA> = map
        .chunks_exact(4)
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

async fn render(params: &[u8], format: FormatType) -> HttpResult<Response> {
    let data = render_chart(params, format)?;
    let content_type = HeaderValue::from_static(format.mime());
    Ok(([(header::CONTENT_TYPE, content_type)], data).into_response())
}

/// 根据json参数生成图表，返回对应格式的数据
pub fn render_chart(params: &[u8], format: FormatType) -> HttpResult<Bytes> {
    let json = std::string::String::from_utf8_lossy(params);
    let value: serde_json::Value = serde_json::from_str(&json)?;
    let chart_type = if let Some(value) = value.get("type") {
        value.as_str().unwrap_or_default()
    } else {
        ""
    };
    let mut quality: u8 = 80;
    if let Some(value) = value.get("quality").and_then(|item| item.as_u64()) {
        quality = value.min(100) as u8;
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
            let multi_chart = MultiChart::from_json(&json)?;
            multi_chart.svg()?
        }
        "calendar" => {
            let chart = CalendarChart::from_json(&json)?;
            chart.svg()?
        }
        "funnel" => {
            let chart = FunnelChart::from_json(&json)?;
            chart.svg()?
        }
        "waterfall" => {
            let chart = WaterfallChart::from_json(&json)?;
            chart.svg()?
        }
        // guage为历史拼写，保留兼容
        "gauge" | "guage" => {
            let chart = GaugeChart::from_json(&json)?;
            chart.svg()?
        }
        "treemap" => {
            let chart = TreemapChart::from_json(&json)?;
            chart.svg()?
        }
        "box_plot" => {
            let chart = BoxPlotChart::from_json(&json)?;
            chart.svg()?
        }
        "sunburst" => {
            let chart = SunburstChart::from_json(&json)?;
            chart.svg()?
        }
        "sankey" => {
            let chart = SankeyChart::from_json(&json)?;
            chart.svg()?
        }
        "tree" => {
            let chart = TreeChart::from_json(&json)?;
            chart.svg()?
        }
        "graph" => {
            let chart = GraphChart::from_json(&json)?;
            chart.svg()?
        }
        "parallel" => {
            let chart = ParallelChart::from_json(&json)?;
            chart.svg()?
        }
        "theme_river" => {
            let chart = ThemeRiverChart::from_json(&json)?;
            chart.svg()?
        }
        "histogram" => {
            let chart = HistogramChart::from_json(&json)?;
            chart.svg()?
        }
        "polar_bar" => {
            let chart = PolarBarChart::from_json(&json)?;
            chart.svg()?
        }
        "chord" => {
            let chart = ChordChart::from_json(&json)?;
            chart.svg()?
        }
        "gantt" => {
            let chart = GanttChart::from_json(&json)?;
            chart.svg()?
        }
        "map" => {
            let chart = MapChart::from_json(&json)?;
            chart.svg()?
        }
        "lines" => {
            let chart = LinesChart::from_json(&json)?;
            chart.svg()?
        }
        "bullet" => {
            let chart = BulletChart::from_json(&json)?;
            chart.svg()?
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
        FormatType::Jpeg => {
            let data = svg_to_jpeg(&svg)?;
            Bytes::from(data)
        }
        FormatType::Png => {
            let data = svg_to_png(&svg)?;
            if quality == 0 {
                Bytes::from(data)
            } else {
                Bytes::from(quantize_png(&data, quality)?)
            }
        }
    };
    Ok(data)
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
        let chart = |quality: &str| {
            format!(
                r#"{{"type":"bar","width":80,"height":48,"quality":{quality},"x_axis_data":["a","b"],"series_list":[{{"name":"A","data":[1,3]}}]}}"#
            )
        };
        let raw = render_chart(chart("0").as_bytes(), FormatType::Png).expect("q0");
        let mid = render_chart(chart("80").as_bytes(), FormatType::Png).expect("q80");
        let high = render_chart(chart("150").as_bytes(), FormatType::Png).expect("q150");
        let best = render_chart(chart("100").as_bytes(), FormatType::Png).expect("q100");
        let defaulted = render_chart(
            br#"{"type":"bar","width":80,"height":48,"quality":80.5,"x_axis_data":["a","b"],"series_list":[{"name":"A","data":[1,3]}]}"#,
            FormatType::Png,
        )
        .expect("float");
        assert_png(&raw, 80, 48);
        assert_png(&mid, 80, 48);
        assert!(raw.len() > mid.len());
        assert_eq!(high, best);
        assert_eq!(defaulted, mid);
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
}
