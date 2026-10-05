use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::transport::streamable_http_server::session::never::NeverSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{ErrorData, ServerHandler, tool, tool_handler, tool_router};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::Arc;

use crate::config::must_new_mcp_config;
use crate::controller::{FormatType, render_chart};

// charts-rs的JSON参数文档（docs/json.md），升级charts-rs后执行`make sync-chart-docs`同步
static CHART_OPTIONS_DOC: &str = include_str!("chart_options.md");

// 气泡图、半环饼图等变体是基础类型加参数实现的，在`chart_type`的枚举中看不到，
// 因此在工具描述中给出变体与基础类型的对应关系，其中的参数名需与文档保持一致（有测试校验）
const CHART_OPTIONS_DESCRIPTION: &str = "Describe the JSON options of a chart type: every accepted key with its type and default, plus an example. Call it before render_chart. \
Many charts are options of a base type rather than a type of their own: \
bubble chart and regression line: scatter (bubble, regression); \
doughnut, half doughnut and nested pies: pie (inner_radius, end_angle, ring); \
area, step line, confidence band and bump (ranking) chart: line (series_fill, step, band, axis_inverse); \
stacked and 100% stacked bars, bars with a line, error bars: bar (stack, stack_percent, category, error_bar); \
OHLC: candlestick (candlestick_style); \
color classes and punch card: heatmap (thresholds, symbol); \
segmented dial and ring progress: gauge (thresholds, multi_ring); \
radial tree: tree (layout); \
vertical sankey: sankey (orient); \
choropleth map: map, which takes the regions as GeoJSON in geo_json.";

// 标题与图例默认均为顶部居中，同时使用时会重叠，因此提示模型调整
const LAYOUT_TIPS: &str = "\n## Tips\n\n- The title and the legend are both centered at the top by default, so they overlap when a chart has a `title_text` and a legend. Set `legend_align` to `\"right\"` or `\"left\"`, or `legend_position` to `\"bottom\"`.\n";

// 图表类型，与HTTP接口的`type`一致
// 注意：JsonSchema类型的文档注释会成为工具参数的描述返回给模型，因此此处不使用文档注释
#[derive(Debug, Clone, Copy, PartialEq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
enum ChartType {
    Bar,
    HorizontalBar,
    Line,
    Pie,
    Radar,
    Scatter,
    Candlestick,
    Table,
    Heatmap,
    Funnel,
    Waterfall,
    Calendar,
    Gauge,
    Treemap,
    BoxPlot,
    Sunburst,
    Sankey,
    Tree,
    Graph,
    Parallel,
    ThemeRiver,
    Histogram,
    PolarBar,
    Chord,
    Gantt,
    Map,
    MultiChart,
}

impl ChartType {
    /// 返回`type`的值以及文档中对应的章节标题
    fn info(&self) -> (&'static str, &'static str) {
        match self {
            ChartType::Bar => ("bar", "Bar"),
            ChartType::HorizontalBar => ("horizontal_bar", "Horizontal bar"),
            ChartType::Line => ("line", "Line"),
            ChartType::Pie => ("pie", "Pie"),
            ChartType::Radar => ("radar", "Radar"),
            ChartType::Scatter => ("scatter", "Scatter"),
            ChartType::Candlestick => ("candlestick", "Candlestick"),
            ChartType::Table => ("table", "Table"),
            ChartType::Heatmap => ("heatmap", "Heatmap"),
            ChartType::Funnel => ("funnel", "Funnel"),
            ChartType::Waterfall => ("waterfall", "Waterfall"),
            ChartType::Calendar => ("calendar", "Calendar"),
            ChartType::Gauge => ("gauge", "Gauge"),
            ChartType::Treemap => ("treemap", "Treemap"),
            ChartType::BoxPlot => ("box_plot", "Box plot"),
            ChartType::Sunburst => ("sunburst", "Sunburst"),
            ChartType::Sankey => ("sankey", "Sankey"),
            ChartType::Tree => ("tree", "Tree"),
            ChartType::Graph => ("graph", "Graph"),
            ChartType::Parallel => ("parallel", "Parallel"),
            ChartType::ThemeRiver => ("theme_river", "Theme river"),
            ChartType::Histogram => ("histogram", "Histogram"),
            ChartType::PolarBar => ("polar_bar", "Polar bar"),
            ChartType::Chord => ("chord", "Chord"),
            ChartType::Gantt => ("gantt", "Gantt"),
            ChartType::Map => ("map", "Map"),
            ChartType::MultiChart => ("multi_chart", "Multi chart"),
        }
    }
    /// 表格与多图表不使用公共参数
    fn use_common_options(&self) -> bool {
        !matches!(self, ChartType::Table | ChartType::MultiChart)
    }
}

// 输出的图片格式
#[derive(Debug, Clone, Copy, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
enum ImageFormat {
    Svg,
    #[default]
    Png,
    Jpeg,
    Webp,
}

impl From<ImageFormat> for FormatType {
    fn from(value: ImageFormat) -> Self {
        match value {
            ImageFormat::Svg => FormatType::Svg,
            ImageFormat::Png => FormatType::Png,
            ImageFormat::Jpeg => FormatType::Jpeg,
            ImageFormat::Webp => FormatType::Webp,
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ChartOptionsParams {
    /// The chart type to describe.
    chart_type: ChartType,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct RenderChartParams {
    /// The chart type to render.
    chart_type: ChartType,
    /// The chart options as a JSON object, for example
    /// {"title_text": "Visits", "x_axis_data": ["Mon", "Tue"], "series_list": [{"name": "Email", "data": [120, 132]}]}.
    /// get_chart_options lists the keys a chart type accepts.
    options: Map<String, Value>,
    /// Output format, png by default. svg is returned as text (the SVG markup, which can be
    /// saved to a file or embedded in a page); png, jpeg and webp are returned as an image.
    #[serde(default)]
    format: ImageFormat,
}

/// 获取文档中指定二级标题的章节内容（包含标题）
fn doc_section(title: &str) -> Option<String> {
    let heading = format!("## {title}\n");
    let start = if CHART_OPTIONS_DOC.starts_with(&heading) {
        0
    } else {
        CHART_OPTIONS_DOC.find(&format!("\n{heading}"))? + 1
    };
    let section = &CHART_OPTIONS_DOC[start..];
    let end = section.find("\n## ").unwrap_or(section.len());
    // `<!-- keys: xxx -->`为charts-rs校验文档使用的标记，对模型无意义
    let lines: Vec<&str> = section[..end]
        .trim_end()
        .lines()
        .filter(|line| !line.starts_with("<!--"))
        .collect();
    Some(lines.join("\n"))
}

/// 生成图表类型对应的参数说明
fn chart_options_doc(chart_type: ChartType) -> String {
    let (name, title) = chart_type.info();
    let mut titles = vec!["Value types"];
    if chart_type.use_common_options() {
        titles.push("Common options");
    }
    titles.push(title);

    let mut doc = format!(
        "# Options of the `{name}` chart\n\nPass them as `options` of render_chart with `chart_type` set to `{name}`.\n"
    );
    for item in titles {
        if let Some(section) = doc_section(item) {
            doc.push('\n');
            doc.push_str(&section);
            doc.push('\n');
        }
    }

    let mut themes = charts_rs::list_theme_name();
    themes.sort();
    doc.push_str("\n## Themes and fonts of this server\n\n");
    doc.push_str(&format!("- `theme`: {}\n", themes.join(", ")));
    if let Ok(families) = charts_rs::get_font_families() {
        doc.push_str(&format!("- `font_family`: {}\n", families.join(", ")));
    }
    if chart_type.use_common_options() {
        doc.push_str(LAYOUT_TIPS);
    }
    doc
}

#[derive(Debug, Clone, Default)]
pub struct ChartServer;

#[tool_router]
impl ChartServer {
    #[tool(
        description = CHART_OPTIONS_DESCRIPTION,
        annotations(
            title = "Get chart options",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_chart_options(
        &self,
        Parameters(params): Parameters<ChartOptionsParams>,
    ) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::success(vec![ContentBlock::text(
            chart_options_doc(params.chart_type),
        )]))
    }

    #[tool(
        description = "Render a chart from JSON options and return it as an image (png, jpeg, webp) or as SVG text. Invalid options are reported as an error that names the offending key.",
        annotations(
            title = "Render chart",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn render_chart(
        &self,
        Parameters(params): Parameters<RenderChartParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let (name, _) = params.chart_type.info();
        let format: FormatType = params.format.into();
        let mut options = params.options;
        options.insert("type".to_string(), Value::String(name.to_string()));
        let json = Value::Object(options).to_string();

        // 参数有误等以工具执行出错的形式返回，便于模型根据出错信息调整后重试
        let data = match render_chart(json.as_bytes(), format) {
            Ok(data) => data,
            Err(err) => {
                return Ok(CallToolResult::error(vec![ContentBlock::text(err.message)]));
            }
        };
        let content = match format {
            FormatType::Svg => vec![ContentBlock::text(
                String::from_utf8_lossy(&data).to_string(),
            )],
            _ => vec![
                ContentBlock::image(STANDARD.encode(&data), format.mime()),
                ContentBlock::text(format!(
                    "Rendered the {name} chart as {} ({} bytes).",
                    format.mime(),
                    data.len()
                )),
            ],
        };
        Ok(CallToolResult::success(content))
    }
}

#[tool_handler(
    name = "charts-rs-web",
    instructions = "Renders charts (bar, line, pie, scatter, heatmap, sankey, gantt, map and more) from JSON options. Call get_chart_options for the chart type first to learn the accepted keys and see an example, then call render_chart. Options are validated: an unknown key or a wrongly typed value is reported as an error naming the key, so fix the options and call again."
)]
impl ServerHandler for ChartServer {}

/// 创建MCP服务(Streamable HTTP)，无状态且以json响应
pub fn new_service() -> StreamableHttpService<ChartServer, NeverSessionManager> {
    let mcp_config = must_new_mcp_config();
    let config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_allowed_hosts(mcp_config.allowed_hosts);
    StreamableHttpService::new(
        || Ok(ChartServer),
        Arc::new(NeverSessionManager::default()),
        config,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHART_TYPES: [ChartType; 27] = [
        ChartType::Bar,
        ChartType::HorizontalBar,
        ChartType::Line,
        ChartType::Pie,
        ChartType::Radar,
        ChartType::Scatter,
        ChartType::Candlestick,
        ChartType::Table,
        ChartType::Heatmap,
        ChartType::Funnel,
        ChartType::Waterfall,
        ChartType::Calendar,
        ChartType::Gauge,
        ChartType::Treemap,
        ChartType::BoxPlot,
        ChartType::Sunburst,
        ChartType::Sankey,
        ChartType::Tree,
        ChartType::Graph,
        ChartType::Parallel,
        ChartType::ThemeRiver,
        ChartType::Histogram,
        ChartType::PolarBar,
        ChartType::Chord,
        ChartType::Gantt,
        ChartType::Map,
        ChartType::MultiChart,
    ];

    /// 返回文档中某图表章节的示例json
    fn doc_example(title: &str) -> Value {
        let section = doc_section(title).unwrap();
        let start = section.find("```json\n").unwrap() + "```json\n".len();
        let end = start + section[start..].find("```").unwrap();
        serde_json::from_str(&section[start..end]).unwrap()
    }

    #[test]
    fn chart_type_name_matches_serde() {
        for chart_type in CHART_TYPES {
            let (name, _) = chart_type.info();
            let value: ChartType = serde_json::from_value(Value::String(name.to_string())).unwrap();
            assert_eq!(chart_type, value);
        }
    }

    #[test]
    fn every_chart_type_has_options_doc() {
        assert!(doc_section("Value types").is_some());
        assert!(doc_section("Common options").is_some());
        for chart_type in CHART_TYPES {
            let (name, title) = chart_type.info();
            let section = doc_section(title).unwrap_or_else(|| panic!("no doc of {name}"));
            assert!(section.starts_with(&format!("## {title}\n")));
            assert!(!section.contains("<!--"));

            let doc = chart_options_doc(chart_type);
            assert!(doc.contains(&section));
            assert_eq!(
                chart_type.use_common_options(),
                doc.contains("## Common options")
            );
        }
    }

    #[test]
    fn doc_examples_render() {
        for chart_type in CHART_TYPES {
            let (name, title) = chart_type.info();
            let Value::Object(mut options) = doc_example(title) else {
                panic!("example of {name} is not an object");
            };
            options.insert("type".to_string(), Value::String(name.to_string()));
            let json = Value::Object(options).to_string();
            let svg = render_chart(json.as_bytes(), FormatType::Svg)
                .unwrap_or_else(|err| panic!("render {name} fail: {}", err.message));
            assert!(svg.starts_with(b"<svg"));
        }
    }

    #[test]
    fn render_image_formats() {
        let json =
            r#"{"type":"bar","x_axis_data":["a","b"],"series_list":[{"name":"A","data":[1,2]}]}"#;
        let png = render_chart(json.as_bytes(), FormatType::Png).unwrap();
        assert!(png.starts_with(b"\x89PNG"));
        let jpeg = render_chart(json.as_bytes(), FormatType::Jpeg).unwrap();
        assert!(jpeg.starts_with(b"\xff\xd8\xff"));
        let webp = render_chart(json.as_bytes(), FormatType::Webp).unwrap();
        assert!(webp.starts_with(b"RIFF"));
    }

    /// 工具描述中提到的参数名均需在文档中存在，避免升级后描述与实际不符
    #[test]
    fn variant_hint_keys_are_documented() {
        let keys = [
            "bubble",
            "regression",
            "inner_radius",
            "end_angle",
            "ring",
            "series_fill",
            "step",
            "band",
            "axis_inverse",
            "stack",
            "stack_percent",
            "category",
            "error_bar",
            "candlestick_style",
            "thresholds",
            "symbol",
            "multi_ring",
            "layout",
            "orient",
            "geo_json",
        ];
        for key in keys {
            assert!(
                CHART_OPTIONS_DESCRIPTION.contains(key),
                "{key} is not in the description"
            );
            assert!(
                CHART_OPTIONS_DOC.contains(&format!("| `{key}` |")),
                "{key} is not in the options doc"
            );
        }
    }

    /// 文档需与当前依赖的charts-rs版本一致，不一致时执行`make sync-chart-docs`
    #[test]
    fn options_doc_in_sync_with_charts_rs() {
        let output = std::process::Command::new(env!("CARGO"))
            .args(["metadata", "--format-version", "1"])
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .unwrap();
        let metadata: Value = serde_json::from_slice(&output.stdout).unwrap();
        let manifest_path = metadata["packages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["name"] == "charts-rs")
            .and_then(|item| item["manifest_path"].as_str())
            .unwrap();
        let doc = std::path::Path::new(manifest_path)
            .parent()
            .unwrap()
            .join("docs/json.md");
        assert_eq!(
            std::fs::read_to_string(doc).unwrap(),
            CHART_OPTIONS_DOC,
            "chart_options.md is out of date, run `make sync-chart-docs`"
        );
    }
}
