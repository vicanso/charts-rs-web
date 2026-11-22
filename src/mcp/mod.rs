use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use charts_rs::{RenderLimits, SchemaLevel, ValidationIssue};
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CallToolResult, ContentBlock, Implementation, ListResourceTemplatesResult, ListResourcesResult,
    PaginatedRequestParams, ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult,
    Resource, ResourceContents, ResourceTemplate, ServerCapabilities, ServerConfig,
};
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::session::never::NeverSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{ErrorData, RoleServer, ServerHandler, tool, tool_handler, tool_router};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::BTreeSet;
use std::sync::Arc;

use crate::config::{must_new_mcp_config, must_new_render_limits};
use crate::controller::{FormatType, encode_svg, normalize_chart_type};
use crate::examples::{self, ExampleItem};
use crate::llms;
use crate::maps;

const SERVER_INSTRUCTIONS: &str = "Pure-Rust charting & Mermaid SVG/raster renderer (`charts-rs` 2.4.0). \
Workflow: (1) Call `list_chart_types` (or read `charts://` resources) to inspect the 30 chart types, variant mappings, live themes, loaded fonts, registered GeoJSON maps, and Mermaid capabilities. \
(2) Call `get_chart_schema` (default `essential`) for the chosen `chart_type` to get its JSON Schema with live `theme`/`font_family`/`geo_json` enums and real examples; pass `chart_type: \"mermaid\"` for Mermaid capabilities, limitations, and all 13 diagram examples. \
(3) Call `render_chart` (or `render_mermaid` directly for Mermaid). Both pre-validate and return up to 50 structured `ValidationIssue` entries (`code`, `path`, `expected`, `suggestion`, `line`) on error so you can fix all issues in one pass. \
Important: If the chart contains Chinese/Japanese/Korean (CJK) text, set `font_family` to a loaded CJK font (e.g. `Noto Sans SC`); otherwise `charts-rs` silently falls back to `Roboto` for text measurement and rasterized PNGs may miss CJK glyphs. \
For whole-service/HTTP API documentation rather than single-chart rendering, read MCP resources `charts://llms.txt` (concise guide) or `charts://llms-full.txt` (complete reference); prefer `list_chart_types` and `get_chart_schema` for normal rendering to keep context compact.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
enum ChartType {
    Bar,
    BoxPlot,
    Bullet,
    Calendar,
    Candlestick,
    Chord,
    Funnel,
    Gantt,
    #[serde(alias = "guage")]
    Gauge,
    Graph,
    Heatmap,
    Histogram,
    HorizontalBar,
    Line,
    Lines,
    Map,
    Mermaid,
    #[serde(alias = "multi_chart")]
    Multi,
    Parallel,
    Pie,
    PolarBar,
    Radar,
    Sankey,
    Scatter,
    Sunburst,
    Table,
    ThemeRiver,
    Tree,
    Treemap,
    Waterfall,
}

impl ChartType {
    fn as_str(self) -> &'static str {
        match self {
            ChartType::Bar => "bar",
            ChartType::BoxPlot => "box_plot",
            ChartType::Bullet => "bullet",
            ChartType::Calendar => "calendar",
            ChartType::Candlestick => "candlestick",
            ChartType::Chord => "chord",
            ChartType::Funnel => "funnel",
            ChartType::Gantt => "gantt",
            ChartType::Gauge => "gauge",
            ChartType::Graph => "graph",
            ChartType::Heatmap => "heatmap",
            ChartType::Histogram => "histogram",
            ChartType::HorizontalBar => "horizontal_bar",
            ChartType::Line => "line",
            ChartType::Lines => "lines",
            ChartType::Map => "map",
            ChartType::Mermaid => "mermaid",
            ChartType::Multi => "multi",
            ChartType::Parallel => "parallel",
            ChartType::Pie => "pie",
            ChartType::PolarBar => "polar_bar",
            ChartType::Radar => "radar",
            ChartType::Sankey => "sankey",
            ChartType::Scatter => "scatter",
            ChartType::Sunburst => "sunburst",
            ChartType::Table => "table",
            ChartType::ThemeRiver => "theme_river",
            ChartType::Tree => "tree",
            ChartType::Treemap => "treemap",
            ChartType::Waterfall => "waterfall",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(inline)]
enum SchemaLevelParam {
    #[default]
    Essential,
    Full,
}

impl From<SchemaLevelParam> for SchemaLevel {
    fn from(value: SchemaLevelParam) -> Self {
        match value {
            SchemaLevelParam::Essential => SchemaLevel::Essential,
            SchemaLevelParam::Full => SchemaLevel::Full,
        }
    }
}

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
struct GetChartSchemaParams {
    /// Chart type name (e.g. "bar", "line", "pie", "scatter", "map", "multi", "mermaid").
    chart_type: ChartType,
    /// Schema detail level: "essential" (compact, default) or "full" (all styling keys).
    #[serde(default)]
    level: SchemaLevelParam,
    /// Optional Mermaid diagram keyword (e.g. "sequenceDiagram", "erDiagram") to filter returned Mermaid examples when chart_type is "mermaid".
    #[serde(default)]
    diagram_type: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ValidateChartParams {
    /// Chart type to validate against.
    chart_type: ChartType,
    /// Chart JSON options object to validate.
    options: Map<String, Value>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct RenderChartParams {
    /// Chart type to render.
    chart_type: ChartType,
    /// Chart JSON options object. Call `get_chart_schema` first to see accepted keys and examples.
    options: Map<String, Value>,
    /// Output format: "png" (default), "jpeg", "webp", or "svg" (returned as text).
    #[serde(default)]
    format: ImageFormat,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ValidateMermaidParams {
    /// Mermaid diagram source text (e.g. "flowchart LR\n  A --> B").
    source: String,
    /// Optional font family intended for rendering; checked against loaded server fonts.
    #[serde(default)]
    font_family: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct RenderMermaidParams {
    /// Mermaid diagram source text.
    source: String,
    /// Optional theme name (e.g. "light", "dark", "grafana", "shadcn").
    #[serde(default)]
    theme: Option<String>,
    /// Optional font family from loaded server fonts (set a CJK font like "Noto Sans SC" when text contains CJK characters).
    #[serde(default)]
    font_family: Option<String>,
    /// Optional target width in pixels (omit for auto-sizing on graph/diagram engines).
    #[serde(default)]
    width: Option<f32>,
    /// Optional target height in pixels (omit for auto-sizing on graph/diagram engines).
    #[serde(default)]
    height: Option<f32>,
    /// Optional title text (overrides diagram/frontmatter title).
    #[serde(default)]
    title_text: Option<String>,
    /// Whether `click`/`link` directives emit SVG `<a href>` links. Defaults to `false` for untrusted input safety.
    #[serde(default)]
    allow_links: Option<bool>,
    /// Output format: "png" (default), "jpeg", "webp", or "svg".
    #[serde(default)]
    format: ImageFormat,
}

#[derive(Serialize)]
pub(crate) struct SelectionGuideEntry {
    pub(crate) intent_or_variant: &'static str,
    pub(crate) chart_type: &'static str,
    pub(crate) key_options: &'static [&'static str],
    pub(crate) note: &'static str,
}

pub(crate) const CHART_SELECTION_GUIDE: &[SelectionGuideEntry] = &[
    SelectionGuideEntry {
        intent_or_variant: "Grouped, stacked, 100% stacked, bar+line mixin, error bars",
        chart_type: "bar",
        key_options: &[
            "x_axis_data",
            "series_list",
            "stack",
            "stack_percent",
            "category",
            "error_bar",
        ],
        note: "Set `category: \"line\"` on a series for bar+line; set `stack` for stacked bars.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Horizontal ranking bars",
        chart_type: "horizontal_bar",
        key_options: &["x_axis_data", "series_list", "series_label_position"],
        note: "Categories sit along the left axis.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Trend, area fill, step line, confidence band, bump (ranking), time axis",
        chart_type: "line",
        key_options: &[
            "x_axis_data",
            "x_axis_values",
            "series_list",
            "series_fill",
            "step",
            "band",
            "axis_inverse",
        ],
        note: "Use `x_axis_values` for continuous numeric/date x axes; `mark_points` with `category: \"index\"` highlights any point.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Pie, doughnut, half-doughnut, nested rings, Nightingale rose",
        chart_type: "pie",
        key_options: &[
            "series_list",
            "rose_type",
            "inner_radius",
            "end_angle",
            "ring",
        ],
        note: "Note `rose_type` defaults to `true`; set `rose_type: false` for proportional-angle pie/donut.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Scatter, bubble, regression fit, density contours, marginal histograms",
        chart_type: "scatter",
        key_options: &["series_list", "bubble", "regression", "contour", "marginal"],
        note: "`series_list[].data` is a flat list of `[x, y, ...]` pairs (or `[x, y, size, ...]` triples when `bubble: true`).",
    },
    SelectionGuideEntry {
        intent_or_variant: "Financial candlestick & OHLC bars",
        chart_type: "candlestick",
        key_options: &["x_axis_data", "series_list", "candlestick_style"],
        note: "`data` packs 4 numbers per category: open, close, lowest, highest.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Matrix heatmap, stepped color classes, punch card",
        chart_type: "heatmap",
        key_options: &[
            "x_axis_data",
            "y_axis_data",
            "series",
            "thresholds",
            "symbol",
        ],
        note: "Data lives in `series.data` (not `series_list`); `symbol: \"circle\"` renders a punch card.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Dial gauge, segmented threshold gauge, multi-ring progress",
        chart_type: "gauge",
        key_options: &["series_list", "thresholds", "multi_ring", "min", "max"],
        note: "`multi_ring: true` renders concentric progress rings for multiple series.",
    },
    SelectionGuideEntry {
        intent_or_variant: "KPI measure vs target & qualitative ranges",
        chart_type: "bullet",
        key_options: &["bullets", "label_show", "range_colors"],
        note: "Each entry in `bullets` has `name`, `value`, `target`, and `ranges`.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Polygon or circular multi-axis radar",
        chart_type: "radar",
        key_options: &["indicators", "series_list", "shape"],
        note: "Set `shape: \"circle\"` for concentric circular web.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Data table & inline cell sparklines",
        chart_type: "table",
        key_options: &["data", "sparkline_type", "text_aligns", "cell_styles"],
        note: "First row of `data` is the header; any cell set to a `number[]` array renders an inline sparkline.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Choropleth map & origin-destination flows (plane or geo)",
        chart_type: "map / lines",
        key_options: &["geo_json", "data", "lines", "projection"],
        note: "Pass a pre-registered map name from `charts://maps` as `geo_json` instead of raw GeoJSON polygons.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Hierarchy (treemap, sunburst, orthogonal/radial tree) & flows (sankey, chord, graph)",
        chart_type: "treemap / sunburst / tree / sankey / chord / graph",
        key_options: &["series_data", "nodes", "links", "layout", "orient"],
        note: "`tree` supports `layout: \"radial\"`; `sankey` supports `orient: \"vertical\"`.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Aligned multi-chart composite (e.g. candlestick + volume)",
        chart_type: "multi",
        key_options: &["child_charts", "align_plots", "gap"],
        note: "Each item in `child_charts` has a `type` plus options of that child chart type.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Annotations, source line, watermark, or point index markers on any chart",
        chart_type: "(any chart)",
        key_options: &["texts", "mark_points"],
        note: "`texts` with `reserve: true` allocates margin space; `mark_points` with `category: \"index\"` marks any data index.",
    },
    SelectionGuideEntry {
        intent_or_variant: "Flowchart, sequence, state, class, ER, mindmap, quadrant, gantt, etc.",
        chart_type: "mermaid",
        key_options: &["source", "allow_links", "theme", "font_family"],
        note: "Supports 13 canonical diagram types (plus 7 aliases). Prefer `render_mermaid` or `render_chart` with `chart_type: \"mermaid\"`.",
    },
];

pub(crate) fn sorted_themes() -> Vec<String> {
    let mut themes = charts_rs::list_theme_name();
    themes.sort_unstable();
    themes
}

pub(crate) fn loaded_fonts() -> Vec<String> {
    let mut families = charts_rs::get_font_families().unwrap_or_default();
    if let Some(idx) = families
        .iter()
        .position(|f| f == charts_rs::DEFAULT_FONT_FAMILY)
    {
        let default_font = families.remove(idx);
        families.insert(0, default_font);
    }
    families
}

fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch,
        '\u{4E00}'..='\u{9FFF}'
            | '\u{3400}'..='\u{4DBF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{3040}'..='\u{309F}'
            | '\u{30A0}'..='\u{30FF}'
            | '\u{AC00}'..='\u{D7AF}'
    )
}

fn contains_cjk(value: &Value) -> bool {
    match value {
        Value::String(s) => s.chars().any(is_cjk_char),
        Value::Array(arr) => arr.iter().any(contains_cjk),
        Value::Object(map) => map.values().any(contains_cjk),
        _ => false,
    }
}

fn collect_explicit_fonts(value: &Value, path: &str, out: &mut Vec<(String, String)>) {
    if let Some(obj) = value.as_object() {
        if let Some(font) = obj
            .get("font_family")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let p = if path.is_empty() {
                "font_family".to_string()
            } else {
                format!("{path}.font_family")
            };
            out.push((p, font.to_string()));
        }
        if let Some(children) = obj.get("child_charts").and_then(|v| v.as_array()) {
            for (idx, child) in children.iter().enumerate() {
                let child_path = if path.is_empty() {
                    format!("child_charts[{idx}]")
                } else {
                    format!("{path}.child_charts[{idx}]")
                };
                collect_explicit_fonts(child, &child_path, out);
            }
        }
    }
}

fn has_non_default_cjk_risk(value: &Value, loaded: &[String]) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    if let Some(children) = obj.get("child_charts").and_then(|v| v.as_array()) {
        return children
            .iter()
            .any(|child| has_non_default_cjk_risk(child, loaded));
    }
    if !contains_cjk(value) {
        return false;
    }
    let font = obj
        .get("font_family")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    match font {
        None => true,
        Some(name) => {
            name.eq_ignore_ascii_case(charts_rs::DEFAULT_FONT_FAMILY)
                && loaded
                    .iter()
                    .any(|f| !f.eq_ignore_ascii_case(charts_rs::DEFAULT_FONT_FAMILY))
        }
    }
}

pub(crate) fn collect_font_warnings(value: &Value) -> Vec<String> {
    let loaded = loaded_fonts();
    let mut warnings = Vec::new();
    let mut explicit = Vec::new();
    collect_explicit_fonts(value, "", &mut explicit);
    let mut seen_unknown = BTreeSet::new();

    for (path, font) in explicit {
        let is_loaded = loaded.iter().any(|f| f.eq_ignore_ascii_case(&font));
        if !is_loaded && seen_unknown.insert(format!("{path}:{font}")) {
            warnings.push(format!(
                "`{path}` is set to \"{font}\", which is not loaded on this server; \
                 charts-rs silently falls back to \"{}\" for text measurement. Loaded fonts: [{}].",
                charts_rs::DEFAULT_FONT_FAMILY,
                loaded.join(", ")
            ));
        }
    }

    if has_non_default_cjk_risk(value, &loaded) {
        let non_default: Vec<&str> = loaded
            .iter()
            .map(String::as_str)
            .filter(|f| !f.eq_ignore_ascii_case(charts_rs::DEFAULT_FONT_FAMILY))
            .collect();
        if non_default.is_empty() {
            warnings.push(format!(
                "CJK characters detected while only \"{}\" is loaded; text width measurement \
                 and raster output may miss CJK glyphs unless a CJK font is loaded via CHARTS_FONT_PATH.",
                charts_rs::DEFAULT_FONT_FAMILY
            ));
        } else {
            warnings.push(format!(
                "CJK characters detected without a non-default `font_family` (falling back to \"{}\"). \
                 Set `font_family` to a loaded CJK font such as \"{}\" (for `multi`, set it on each child chart).",
                charts_rs::DEFAULT_FONT_FAMILY,
                non_default.join("\", \"")
            ));
        }
    }

    warnings
}

pub(crate) fn cjk_font_hint(fonts: &[String]) -> String {
    let non_default: Vec<&str> = fonts
        .iter()
        .map(String::as_str)
        .filter(|f| !f.eq_ignore_ascii_case(charts_rs::DEFAULT_FONT_FAMILY))
        .collect();
    if non_default.is_empty() {
        format!(
            "Loaded fonts on this server: [{}]. Unregistered font names silently fall back to `{}`.",
            fonts.join(", "),
            charts_rs::DEFAULT_FONT_FAMILY
        )
    } else {
        format!(
            "Loaded fonts on this server: [{}]. For Chinese/CJK text, explicitly set `font_family` (e.g. `{}`); unregistered font names silently fall back to `{}`.",
            fonts.join(", "),
            non_default[0],
            charts_rs::DEFAULT_FONT_FAMILY
        )
    }
}

fn patch_schema_with_runtime(
    schema: &mut Value,
    chart_type: &str,
    themes: &[String],
    fonts: &[String],
    registered_maps: &[maps::MapInfo],
) {
    let Some(props) = schema.get_mut("properties").and_then(|v| v.as_object_mut()) else {
        return;
    };

    if let Some(theme_prop) = props.get_mut("theme").and_then(|v| v.as_object_mut()) {
        theme_prop.insert("enum".to_string(), json!(themes));
    }

    if let Some(font_prop) = props.get_mut("font_family").and_then(|v| v.as_object_mut()) {
        font_prop.insert("enum".to_string(), json!(fonts));
        let existing_desc = font_prop
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let hint = cjk_font_hint(fonts);
        let new_desc = if existing_desc.is_empty() {
            hint
        } else {
            format!("{existing_desc} {hint}")
        };
        font_prop.insert("description".to_string(), Value::String(new_desc));
    } else if chart_type != "multi" && !chart_type.is_empty() {
        // Essential schemas omit `font_family`, so inject it with loaded server fonts
        // so models always discover CJK font options without fetching `Full`.
        props.insert(
            "font_family".to_string(),
            json!({
                "type": "string",
                "default": charts_rs::DEFAULT_FONT_FAMILY,
                "enum": fonts,
                "description": cjk_font_hint(fonts),
            }),
        );
    }

    if matches!(chart_type, "map" | "lines")
        && let Some(geo_prop) = props.get_mut("geo_json").and_then(|v| v.as_object_mut())
    {
        let map_names: Vec<&str> = registered_maps.iter().map(|m| m.name.as_str()).collect();
        let existing_desc = geo_prop
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let note = if map_names.is_empty() {
            "No named maps are currently registered on this server; pass a GeoJSON object."
                .to_string()
        } else {
            format!(
                "Registered named maps on this server (pass as string): [{}]. See `registered_maps` for region names.",
                map_names.join(", ")
            )
        };
        let new_desc = if existing_desc.is_empty() {
            note
        } else {
            format!("{existing_desc} {note}")
        };
        geo_prop.insert("description".to_string(), Value::String(new_desc));
    }

    if chart_type == "multi"
        && let Some(children_prop) = props
            .get_mut("child_charts")
            .and_then(|v| v.as_object_mut())
        && let Some(items) = children_prop
            .get_mut("items")
            .and_then(|v| v.as_object_mut())
        && let Some(one_of) = items.get_mut("oneOf").and_then(|v| v.as_array_mut())
    {
        for branch in one_of {
            patch_schema_with_runtime(branch, "", themes, fonts, registered_maps);
        }
    }
}

fn summarize_example(item: &ExampleItem) -> Value {
    json!({
        "id": item.id,
        "chart_type": item.chart_type,
        "diagram_type": item.diagram_type,
        "title_en": item.label_en,
        "title_zh": item.label_zh,
        "hint_en": item.hint_en,
        "hint_zh": item.hint_zh,
        "options": item.options,
    })
}

fn build_list_chart_types_payload() -> Value {
    maps::init_builtin_maps();
    let themes = sorted_themes();
    let fonts = loaded_fonts();
    let registered_maps = maps::list_maps();
    let caps = charts_rs::mermaid_capabilities();
    let limits = must_new_render_limits();

    json!({
        "chart_types": charts_rs::chart_catalog(),
        "selection_and_variant_guide": CHART_SELECTION_GUIDE,
        "runtime": {
            "themes": themes,
            "fonts": fonts,
            "font_hint": cjk_font_hint(&fonts),
            "maps": registered_maps,
            "mermaid": {
                "supported_diagrams": caps.supported_diagrams,
                "diagram_aliases": caps.diagram_aliases,
                "unsupported_diagrams": caps.unsupported_diagrams,
                "allow_links_default": false,
                "limitations": caps.limitations,
            },
            "limits": {
                "max_json_bytes": limits.max_json_bytes,
                "max_canvas_side": limits.max_canvas_side,
                "max_data_points": limits.max_data_points,
                "max_mermaid_source": limits.max_mermaid_source,
            }
        }
    })
}

fn build_enriched_schema(
    chart_type: ChartType,
    level: SchemaLevel,
    diagram_type: Option<&str>,
) -> Result<Value, String> {
    maps::init_builtin_maps();
    let name = chart_type.as_str();
    let mut schema = charts_rs::chart_json_schema_with(name, level).map_err(|e| e.to_string())?;
    let themes = sorted_themes();
    let fonts = loaded_fonts();
    let registered_maps = maps::list_maps();

    patch_schema_with_runtime(&mut schema, name, &themes, &fonts, &registered_maps);

    let examples_list: Vec<Value> = if name == "mermaid" {
        if let Some(diag) = diagram_type.map(str::trim).filter(|s| !s.is_empty()) {
            match examples::example_for_mermaid_diagram(diag) {
                Some(item) => vec![summarize_example(item)],
                None => Vec::new(),
            }
        } else {
            examples::all_mermaid_examples()
                .into_iter()
                .map(summarize_example)
                .collect()
        }
    } else {
        examples::examples_for_chart_type(name)
            .into_iter()
            .map(summarize_example)
            .collect()
    };

    let mut payload = json!({
        "chart_type": name,
        "schema_level": match level {
            SchemaLevel::Essential => "essential",
            SchemaLevel::Full => "full",
            _ => "other",
        },
        "schema": schema,
        "runtime": {
            "themes": themes,
            "fonts": fonts,
            "font_hint": cjk_font_hint(&fonts),
        },
        "examples": examples_list,
    });

    if let Some(obj) = payload.as_object_mut() {
        if matches!(name, "map" | "lines") {
            obj.insert("registered_maps".to_string(), json!(registered_maps));
        }
        if name == "mermaid" {
            let caps = charts_rs::mermaid_capabilities();
            obj.insert(
                "mermaid_capabilities".to_string(),
                json!({
                    "supported_diagrams": caps.supported_diagrams,
                    "diagram_aliases": caps.diagram_aliases,
                    "unsupported_diagrams": caps.unsupported_diagrams,
                    "v11_shapes": caps.v11_shapes,
                    "init_config_keys": caps.init_config_keys,
                    "features": caps.features,
                    "limitations": caps.limitations,
                    "allow_links_default": false,
                }),
            );
            if let Some(diag) = diagram_type.map(str::trim).filter(|s| !s.is_empty()) {
                let canonical = examples::canonical_mermaid_diagram(diag);
                obj.insert("requested_diagram_type".to_string(), json!(canonical));
            }
        }
    }

    Ok(payload)
}

fn validate_with_warnings(
    chart_type: &str,
    options: &Value,
    limits: &RenderLimits,
) -> Result<(Vec<ValidationIssue>, Vec<String>), String> {
    maps::init_builtin_maps();
    let issues = charts_rs::validate_chart_json_with_limits(chart_type, options, limits)
        .map_err(|e| e.to_string())?;
    let warnings = collect_font_warnings(options);
    Ok((issues, warnings))
}

fn format_validation_error_payload(
    chart_type: &str,
    issues: &[ValidationIssue],
    warnings: &[String],
) -> String {
    serde_json::to_string_pretty(&json!({
        "valid": false,
        "chart_type": chart_type,
        "issue_count": issues.len(),
        "issues": issues,
        "warnings": warnings,
    }))
    .unwrap_or_else(|_| "validation failed".to_string())
}

fn format_render_success_blocks(
    chart_type: &str,
    format: FormatType,
    data: &[u8],
    warnings: &[String],
) -> Vec<ContentBlock> {
    match format {
        FormatType::Svg => {
            let mut blocks = vec![ContentBlock::text(
                String::from_utf8_lossy(data).to_string(),
            )];
            if !warnings.is_empty() {
                blocks.push(ContentBlock::text(
                    serde_json::to_string_pretty(&json!({
                        "chart_type": chart_type,
                        "warnings": warnings,
                    }))
                    .unwrap_or_default(),
                ));
            }
            blocks
        }
        _ => {
            let mut summary = format!(
                "Rendered the {chart_type} chart as {} ({} bytes).",
                format.mime(),
                data.len()
            );
            if !warnings.is_empty() {
                summary.push_str("\nWarnings:\n- ");
                summary.push_str(&warnings.join("\n- "));
            }
            vec![
                ContentBlock::image(STANDARD.encode(data), format.mime()),
                ContentBlock::text(summary),
            ]
        }
    }
}

async fn render_validated_options(
    chart_type: &'static str,
    options: Value,
    format: FormatType,
    limits: RenderLimits,
) -> Result<CallToolResult, ErrorData> {
    let (issues, warnings) = match validate_with_warnings(chart_type, &options, &limits) {
        Ok(res) => res,
        Err(msg) => return Ok(CallToolResult::error(vec![ContentBlock::text(msg)])),
    };
    if !issues.is_empty() {
        return Ok(CallToolResult::error(vec![ContentBlock::text(
            format_validation_error_payload(chart_type, &issues, &warnings),
        )]));
    }

    let quality: u8 = options
        .get("quality")
        .and_then(|v| v.as_u64())
        .map(|v| v.min(100) as u8)
        .unwrap_or(80);

    let rendered = tokio::task::spawn_blocking(move || {
        let svg = charts_rs::render_chart_from_value_with_limits(chart_type, &options, &limits)
            .map_err(|e| e.to_string())?;
        encode_svg(&svg, format, quality).map_err(|e| e.message)
    })
    .await;

    let data = match rendered {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(msg)) => return Ok(CallToolResult::error(vec![ContentBlock::text(msg)])),
        Err(join_err) => {
            return Ok(CallToolResult::error(vec![ContentBlock::text(format!(
                "render task failed: {join_err}"
            ))]));
        }
    };

    Ok(CallToolResult::success(format_render_success_blocks(
        chart_type, format, &data, &warnings,
    )))
}

fn static_resources() -> Vec<Resource> {
    vec![
        Resource::new("charts://themes", "themes")
            .with_title("Chart Themes")
            .with_description("Sorted list of built-in and custom registered theme names.")
            .with_mime_type("application/json"),
        Resource::new("charts://fonts", "fonts")
            .with_title("Loaded Font Families")
            .with_description("Font families loaded on this server (plus CJK fallback hint).")
            .with_mime_type("application/json"),
        Resource::new("charts://maps", "maps")
            .with_title("Registered GeoJSON Maps")
            .with_description(
                "Pre-registered named maps and their region names for `map` and `lines` charts.",
            )
            .with_mime_type("application/json"),
        Resource::new("charts://mermaid/capabilities", "mermaid_capabilities")
            .with_title("Mermaid Capabilities")
            .with_description(
                "Supported diagrams, aliases, unsupported diagrams, v11 shapes, init config keys, and limitations.",
            )
            .with_mime_type("application/json"),
        Resource::new("charts://llms.txt", "llms_txt")
            .with_title("Service LLM Guide (llms.txt)")
            .with_description(
                "Concise HTTP API, MCP usage, live capabilities, selection guide, minimal examples, and Mermaid specification (mirrors GET /llms.txt).",
            )
            .with_mime_type("text/markdown"),
        Resource::new("charts://llms-full.txt", "llms_full_txt")
            .with_title("Full Service & Chart Reference (llms-full.txt)")
            .with_description(
                "Complete Markdown manual with full JSON option tables for all 30 chart types and all 73 curated examples (mirrors GET /llms-full.txt).",
            )
            .with_mime_type("text/markdown"),
    ]
}

fn static_resource_templates() -> Vec<ResourceTemplate> {
    vec![
        ResourceTemplate::new("charts://examples/{type}", "chart_examples")
            .with_title("Chart Examples by Type")
            .with_description(
                "Verified JSON examples (including variants) for a chart type from `list_chart_types`.",
            )
            .with_mime_type("application/json"),
        ResourceTemplate::new("charts://examples/mermaid/{diagram}", "mermaid_example")
            .with_title("Mermaid Example by Diagram Type")
            .with_description(
                "Verified JSON example for a Mermaid diagram type (e.g. flowchart, sequenceDiagram, erDiagram).",
            )
            .with_mime_type("application/json"),
    ]
}

fn read_resource_content(uri: &str) -> Result<(String, &'static str), ErrorData> {
    match uri {
        "charts://llms.txt" => Ok((llms::render_llms_txt(), "text/markdown; charset=utf-8")),
        "charts://llms-full.txt" => {
            Ok((llms::render_llms_full_txt(), "text/markdown; charset=utf-8"))
        }
        _ => {
            let value = read_resource_value(uri)?;
            let text = serde_json::to_string_pretty(&value).unwrap_or_default();
            Ok((text, "application/json"))
        }
    }
}

fn read_resource_value(uri: &str) -> Result<Value, ErrorData> {
    match uri {
        "charts://themes" => Ok(json!({ "themes": sorted_themes() })),
        "charts://fonts" => {
            let fonts = loaded_fonts();
            Ok(json!({
                "fonts": fonts,
                "default": charts_rs::DEFAULT_FONT_FAMILY,
                "hint": cjk_font_hint(&fonts),
            }))
        }
        "charts://maps" => {
            maps::init_builtin_maps();
            Ok(json!({ "maps": maps::list_maps() }))
        }
        "charts://mermaid/capabilities" => {
            let caps = charts_rs::mermaid_capabilities();
            Ok(json!({
                "supported_diagrams": caps.supported_diagrams,
                "diagram_aliases": caps.diagram_aliases,
                "unsupported_diagrams": caps.unsupported_diagrams,
                "v11_shapes": caps.v11_shapes,
                "init_config_keys": caps.init_config_keys,
                "features": caps.features,
                "limitations": caps.limitations,
                "allow_links_default": false,
            }))
        }
        _ if uri.starts_with("charts://examples/mermaid/") => {
            let diagram = &uri["charts://examples/mermaid/".len()..];
            let Some(item) = examples::example_for_mermaid_diagram(diagram) else {
                return Err(ErrorData::resource_not_found(
                    format!("unknown mermaid diagram type: {diagram}"),
                    None,
                ));
            };
            Ok(summarize_example(item))
        }
        _ if uri.starts_with("charts://examples/") => {
            let raw_type = &uri["charts://examples/".len()..];
            if raw_type.trim().is_empty() {
                return Err(ErrorData::resource_not_found(
                    "chart type must not be empty",
                    None,
                ));
            }
            let canonical = normalize_chart_type(raw_type);
            let items: Vec<Value> = examples::examples_for_chart_type(canonical)
                .into_iter()
                .map(summarize_example)
                .collect();
            if items.is_empty() {
                let catalog_example = charts_rs::chart_example(canonical).ok().flatten();
                let Some(example) = catalog_example else {
                    return Err(ErrorData::resource_not_found(
                        format!("unknown chart type: {raw_type}"),
                        None,
                    ));
                };
                return Ok(json!({ "chart_type": canonical, "examples": [example] }));
            }
            Ok(json!({ "chart_type": canonical, "examples": items }))
        }
        _ => Err(ErrorData::resource_not_found(
            format!("unknown resource URI: {uri}"),
            None,
        )),
    }
}

#[derive(Debug, Clone, Default)]
pub struct ChartServer;

#[tool_router]
impl ChartServer {
    #[tool(
        description = "List all 30 supported chart types (28 charts + `multi` + `mermaid`) with selection/variant guides, live themes, loaded fonts (with CJK guidance), registered GeoJSON maps, Mermaid capabilities, and RenderLimits.",
        annotations(
            title = "List chart types",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_chart_types(&self) -> Result<CallToolResult, ErrorData> {
        let payload = build_list_chart_types_payload();
        let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
        Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
    }

    #[tool(
        description = "Get the Draft 2020-12 JSON Schema (`essential` or `full`), runtime theme/font/map enums, and verified examples for a chart type. For `chart_type: \"mermaid\"`, also returns Mermaid capabilities, unsupported diagram list, syntax limitations, and all 13 canonical diagram examples.",
        annotations(
            title = "Get chart schema",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_chart_schema(
        &self,
        Parameters(params): Parameters<GetChartSchemaParams>,
    ) -> Result<CallToolResult, ErrorData> {
        match build_enriched_schema(
            params.chart_type,
            params.level.into(),
            params.diagram_type.as_deref(),
        ) {
            Ok(payload) => {
                let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
                Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
            }
            Err(msg) => Ok(CallToolResult::error(vec![ContentBlock::text(msg)])),
        }
    }

    #[tool(
        description = "Validate chart JSON options against schema, RenderLimits, and Mermaid syntax without rendering. Returns up to 50 structured ValidationIssue objects (`code`, `path`, `expected`, `suggestion`, `line`) plus non-blocking CJK/font warnings.",
        annotations(
            title = "Validate chart options",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn validate_chart(
        &self,
        Parameters(params): Parameters<ValidateChartParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let chart_type = params.chart_type.as_str();
        let limits = must_new_render_limits();
        let value = Value::Object(params.options);
        match validate_with_warnings(chart_type, &value, &limits) {
            Ok((issues, warnings)) => {
                let payload = json!({
                    "valid": issues.is_empty(),
                    "chart_type": chart_type,
                    "issue_count": issues.len(),
                    "issues": issues,
                    "warnings": warnings,
                });
                let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
                Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
            }
            Err(msg) => Ok(CallToolResult::error(vec![ContentBlock::text(msg)])),
        }
    }

    #[tool(
        description = "Pre-validate and render a chart from JSON options to an image (png, jpeg, webp) or SVG text. Defaults `allow_links` to `false` when `chart_type` is `mermaid`. Returns structured ValidationIssue errors if invalid, plus non-blocking CJK/font warnings when relevant.",
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
        let chart_type = params.chart_type.as_str();
        let format: FormatType = params.format.into();
        let limits = must_new_render_limits();
        let mut options = params.options;
        if chart_type == "mermaid" && !options.contains_key("allow_links") {
            options.insert("allow_links".to_string(), Value::Bool(false));
        }
        render_validated_options(chart_type, Value::Object(options), format, limits).await
    }

    #[tool(
        description = "Validate Mermaid diagram source text (syntax + semantic checks with 1-based line numbers and typo hints) and check source length against RenderLimits.",
        annotations(
            title = "Validate Mermaid diagram",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn validate_mermaid(
        &self,
        Parameters(params): Parameters<ValidateMermaidParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let limits = must_new_render_limits();
        let mut obj = Map::new();
        obj.insert("source".to_string(), Value::String(params.source));
        if let Some(font) = params.font_family {
            obj.insert("font_family".to_string(), Value::String(font));
        }
        let value = Value::Object(obj);
        match validate_with_warnings("mermaid", &value, &limits) {
            Ok((issues, warnings)) => {
                let payload = json!({
                    "valid": issues.is_empty(),
                    "chart_type": "mermaid",
                    "issue_count": issues.len(),
                    "issues": issues,
                    "warnings": warnings,
                });
                let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
                Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
            }
            Err(msg) => Ok(CallToolResult::error(vec![ContentBlock::text(msg)])),
        }
    }

    #[tool(
        description = "Render a Mermaid diagram directly from source text to an image (png, jpeg, webp) or SVG text. Supports 13 canonical diagram types (flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, mindmap, quadrantChart, pie, gantt, sankey-beta, xychart-beta, radar-beta, treemap-beta). `allow_links` defaults to `false` for safety.",
        annotations(
            title = "Render Mermaid diagram",
            read_only_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn render_mermaid(
        &self,
        Parameters(params): Parameters<RenderMermaidParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let format: FormatType = params.format.into();
        let limits = must_new_render_limits();
        let mut options = Map::new();
        options.insert("source".to_string(), Value::String(params.source));
        options.insert(
            "allow_links".to_string(),
            Value::Bool(params.allow_links.unwrap_or(false)),
        );
        if let Some(theme) = params.theme {
            options.insert("theme".to_string(), Value::String(theme));
        }
        if let Some(font) = params.font_family {
            options.insert("font_family".to_string(), Value::String(font));
        }
        if let Some(width) = params.width {
            options.insert("width".to_string(), json!(width));
        }
        if let Some(height) = params.height {
            options.insert("height".to_string(), json!(height));
        }
        if let Some(title) = params.title_text {
            options.insert("title_text".to_string(), Value::String(title));
        }
        render_validated_options("mermaid", Value::Object(options), format, limits).await
    }
}

#[tool_handler(name = "charts-rs-web")]
impl ServerHandler for ChartServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_server_info(Implementation::new(
            "charts-rs-web",
            env!("CARGO_PKG_VERSION"),
        ))
        .with_instructions(SERVER_INSTRUCTIONS.to_string())
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        Ok(ListResourcesResult::with_all_items(static_resources()))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, ErrorData> {
        Ok(ListResourceTemplatesResult::with_all_items(
            static_resource_templates(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        let uri = request.uri;
        let uri_for_blocking = uri.clone();
        let (text, mime) =
            tokio::task::spawn_blocking(move || read_resource_content(uri_for_blocking.as_str()))
                .await
                .map_err(|err| {
                    ErrorData::internal_error(format!("read resource failed: {err}"), None)
                })??;
        Ok(
            ReadResourceResult::new(vec![ResourceContents::text(text, uri).with_mime_type(mime)])
                .into(),
        )
    }
}

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

    #[test]
    fn chart_type_enum_matches_charts_rs_catalog() {
        let mut expected: Vec<&'static str> = charts_rs::list_chart_types().to_vec();
        expected.sort_unstable();

        let all_variants = [
            ChartType::Bar,
            ChartType::BoxPlot,
            ChartType::Bullet,
            ChartType::Calendar,
            ChartType::Candlestick,
            ChartType::Chord,
            ChartType::Funnel,
            ChartType::Gantt,
            ChartType::Gauge,
            ChartType::Graph,
            ChartType::Heatmap,
            ChartType::Histogram,
            ChartType::HorizontalBar,
            ChartType::Line,
            ChartType::Lines,
            ChartType::Map,
            ChartType::Mermaid,
            ChartType::Multi,
            ChartType::Parallel,
            ChartType::Pie,
            ChartType::PolarBar,
            ChartType::Radar,
            ChartType::Sankey,
            ChartType::Scatter,
            ChartType::Sunburst,
            ChartType::Table,
            ChartType::ThemeRiver,
            ChartType::Tree,
            ChartType::Treemap,
            ChartType::Waterfall,
        ];
        let mut actual: Vec<&'static str> = all_variants.iter().map(|t| t.as_str()).collect();
        actual.sort_unstable();
        assert_eq!(actual, expected);

        for t in all_variants {
            let parsed: ChartType =
                serde_json::from_value(Value::String(t.as_str().to_string())).unwrap();
            assert_eq!(parsed, t);
        }
        assert_eq!(
            serde_json::from_value::<ChartType>(Value::String("multi_chart".into())).unwrap(),
            ChartType::Multi
        );
        assert_eq!(
            serde_json::from_value::<ChartType>(Value::String("guage".into())).unwrap(),
            ChartType::Gauge
        );
    }

    #[test]
    fn list_chart_types_and_schemas_provide_complete_context() {
        let catalog_payload = build_list_chart_types_payload();
        assert_eq!(
            catalog_payload["chart_types"].as_array().unwrap().len(),
            charts_rs::list_chart_types().len()
        );
        assert!(
            !catalog_payload["selection_and_variant_guide"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert!(
            catalog_payload["runtime"]["themes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v == "grafana")
        );
        assert!(
            catalog_payload["runtime"]["maps"]
                .as_array()
                .unwrap()
                .iter()
                .any(|m| m["name"] == "demo")
        );

        let bar_essential =
            build_enriched_schema(ChartType::Bar, SchemaLevel::Essential, None).unwrap();
        let bar_full = build_enriched_schema(ChartType::Bar, SchemaLevel::Full, None).unwrap();
        assert!(bar_essential["schema"].to_string().len() < bar_full["schema"].to_string().len());
        assert!(bar_essential["schema"]["properties"]["theme"]["enum"].is_array());
        assert!(bar_essential["schema"]["properties"]["font_family"]["enum"].is_array());
        assert!(bar_full["schema"]["properties"]["font_family"]["enum"].is_array());
        assert!(!bar_essential["examples"].as_array().unwrap().is_empty());

        let map_schema =
            build_enriched_schema(ChartType::Map, SchemaLevel::Essential, None).unwrap();
        let maps_arr = map_schema["registered_maps"].as_array().unwrap();
        let demo = maps_arr.iter().find(|m| m["name"] == "demo").unwrap();
        assert!(!demo["regions"].as_array().unwrap().is_empty());

        let mermaid_all =
            build_enriched_schema(ChartType::Mermaid, SchemaLevel::Essential, None).unwrap();
        assert_eq!(mermaid_all["examples"].as_array().unwrap().len(), 13);
        assert!(mermaid_all["mermaid_capabilities"]["supported_diagrams"].is_array());
        assert!(mermaid_all["mermaid_capabilities"]["unsupported_diagrams"].is_array());
        assert_eq!(
            mermaid_all["mermaid_capabilities"]["allow_links_default"],
            false
        );

        let mermaid_seq = build_enriched_schema(
            ChartType::Mermaid,
            SchemaLevel::Essential,
            Some("sequenceDiagram"),
        )
        .unwrap();
        assert_eq!(mermaid_seq["examples"].as_array().unwrap().len(), 1);
        assert_eq!(
            mermaid_seq["examples"][0]["diagram_type"],
            "sequenceDiagram"
        );
    }

    #[test]
    fn cjk_and_unknown_font_warnings_behave_as_expected() {
        let missing_font = json!({
            "font_family": "DoesNotExistFont",
            "x_axis_data": ["Mon"],
            "series_list": [{"name": "A", "data": [1]}]
        });
        let warnings = collect_font_warnings(&missing_font);
        assert!(warnings.iter().any(|w| w.contains("DoesNotExistFont")));

        let cjk_default = json!({
            "title_text": "月度访问量",
            "x_axis_data": ["周一", "周二"],
            "series_list": [{"name": "访问", "data": [10, 20]}]
        });
        let cjk_warnings = collect_font_warnings(&cjk_default);
        assert!(cjk_warnings.iter().any(|w| w.contains("CJK")));
    }

    #[tokio::test]
    async fn mcp_tools_validate_render_and_mermaid_allow_links() {
        let server = ChartServer;
        let info = server.get_info();
        assert!(info.capabilities.tools.is_some());
        assert!(info.capabilities.resources.is_some());

        // Multi-issue validation returns all errors in one pass
        let bad_opts = serde_json::from_str::<Map<String, Value>>(
            r#"{"theme":"bad_theme","x_axis_data":["A"],"series_list":[{"name":"S","lable_show":true,"data":[1]}]}"#,
        )
        .unwrap();
        let val_res = server
            .validate_chart(Parameters(ValidateChartParams {
                chart_type: ChartType::Bar,
                options: bad_opts.clone(),
            }))
            .await
            .unwrap();
        let val_text = val_res.content[0].as_text().unwrap().text.as_str();
        let val_json: Value = serde_json::from_str(val_text).unwrap();
        assert_eq!(val_json["valid"], false);
        assert!(val_json["issue_count"].as_u64().unwrap() >= 2);

        // render_chart returns structured issues on invalid input
        let err_res = server
            .render_chart(Parameters(RenderChartParams {
                chart_type: ChartType::Bar,
                options: bad_opts,
                format: ImageFormat::Svg,
            }))
            .await
            .unwrap();
        assert_eq!(err_res.is_error, Some(true));
        let err_json: Value =
            serde_json::from_str(err_res.content[0].as_text().unwrap().text.as_str()).unwrap();
        assert!(err_json["issues"].as_array().unwrap().len() >= 2);

        // Mermaid defaults allow_links to false in render_mermaid and render_chart
        let linked_src =
            "flowchart LR\n  A[Docs] --> B[End]\n  click A href \"https://example.com\"";
        let default_res = server
            .render_mermaid(Parameters(RenderMermaidParams {
                source: linked_src.to_string(),
                theme: None,
                font_family: None,
                width: None,
                height: None,
                title_text: None,
                allow_links: None,
                format: ImageFormat::Svg,
            }))
            .await
            .unwrap();
        assert_ne!(default_res.is_error, Some(true));
        let default_svg = default_res.content[0].as_text().unwrap().text.as_str();
        assert!(!default_svg.contains("<a "));

        let mut raw_map = Map::new();
        raw_map.insert("source".to_string(), Value::String(linked_src.to_string()));
        let via_render_chart = server
            .render_chart(Parameters(RenderChartParams {
                chart_type: ChartType::Mermaid,
                options: raw_map,
                format: ImageFormat::Svg,
            }))
            .await
            .unwrap();
        assert!(
            !via_render_chart.content[0]
                .as_text()
                .unwrap()
                .text
                .contains("<a ")
        );

        let allowed_res = server
            .render_mermaid(Parameters(RenderMermaidParams {
                source: linked_src.to_string(),
                theme: None,
                font_family: None,
                width: None,
                height: None,
                title_text: None,
                allow_links: Some(true),
                format: ImageFormat::Svg,
            }))
            .await
            .unwrap();
        let allowed_svg = allowed_res.content[0].as_text().unwrap().text.as_str();
        assert!(allowed_svg.contains("<a "));

        // validate_mermaid reports line-numbered syntax errors
        let bad_mermaid = server
            .validate_mermaid(Parameters(ValidateMermaidParams {
                source: "gitGraph\n  commit".to_string(),
                font_family: None,
            }))
            .await
            .unwrap();
        let bad_mermaid_json: Value =
            serde_json::from_str(bad_mermaid.content[0].as_text().unwrap().text.as_str()).unwrap();
        assert_eq!(bad_mermaid_json["valid"], false);
        assert_eq!(bad_mermaid_json["issues"][0]["code"], "mermaid_syntax");
    }

    #[test]
    fn mcp_resources_cover_all_uris_and_return_not_found() {
        assert_eq!(static_resources().len(), 6);
        assert_eq!(static_resource_templates().len(), 2);

        for uri in ["charts://llms.txt", "charts://llms-full.txt"] {
            let (body, mime) =
                read_resource_content(uri).unwrap_or_else(|e| panic!("{uri}: {e:?}"));
            assert_eq!(mime, "text/markdown; charset=utf-8");
            assert!(body.contains("# charts-rs-web"));
        }

        for uri in [
            "charts://themes",
            "charts://fonts",
            "charts://maps",
            "charts://mermaid/capabilities",
            "charts://examples/bar",
            "charts://examples/multi_chart",
            "charts://examples/mermaid/flowchart",
            "charts://examples/mermaid/graph",
        ] {
            let (body, mime) =
                read_resource_content(uri).unwrap_or_else(|e| panic!("{uri}: {e:?}"));
            assert_eq!(mime, "application/json");
            let val: Value = serde_json::from_str(&body).unwrap();
            assert!(val.is_object());
        }

        let empty_type = read_resource_content("charts://examples/");
        assert!(empty_type.is_err());
        let missing = read_resource_content("charts://examples/nonexistent");
        assert!(missing.is_err());
        let missing_diag = read_resource_content("charts://examples/mermaid/gitGraph");
        assert!(missing_diag.is_err());
        let unknown = read_resource_content("charts://unknown");
        assert!(unknown.is_err());
    }
}
