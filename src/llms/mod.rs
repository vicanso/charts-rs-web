use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fmt::Write as _;

use crate::config::must_new_render_limits;
use crate::examples;
use crate::maps;
use crate::mcp::{CHART_SELECTION_GUIDE, cjk_font_hint, loaded_fonts, sorted_themes};

fn md_cell(raw: &str) -> String {
    raw.replace('|', "\\|")
        .replace('\r', "")
        .replace('\n', " ")
        .trim()
        .to_string()
}

fn schema_type_summary(prop: &Value) -> String {
    if let Some(vals) = prop.get("enum").and_then(|v| v.as_array()) {
        let joined: Vec<String> = vals
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| format!("`\"{s}\"`"))
            .collect();
        if !joined.is_empty() {
            return joined.join(" \\| ");
        }
    }
    if let Some(variants) = prop
        .get("anyOf")
        .or_else(|| prop.get("oneOf"))
        .and_then(|v| v.as_array())
    {
        let parts: Vec<String> = variants
            .iter()
            .map(schema_type_summary)
            .filter(|s| !s.is_empty())
            .collect();
        if !parts.is_empty() {
            return parts.join(" \\| ");
        }
    }
    if let Some(ty) = prop.get("type").and_then(|v| v.as_str()) {
        if ty == "array" {
            if let Some(prefix) = prop.get("prefixItems").and_then(|v| v.as_array()) {
                let tuple: Vec<String> = prefix.iter().map(schema_type_summary).collect();
                return format!("[{}]", tuple.join(", "));
            }
            if let Some(items) = prop.get("items") {
                if items.is_object() {
                    return format!("{}[]", schema_type_summary(items));
                }
                if let Some(arr) = items.as_array() {
                    let tuple: Vec<String> = arr.iter().map(schema_type_summary).collect();
                    return format!("[{}]", tuple.join(", "));
                }
            }
        }
        return ty.to_string();
    }
    if let Some(c) = prop.get("const").and_then(|v| v.as_str()) {
        return format!("`\"{c}\"`");
    }
    "any".to_string()
}

fn render_object_tables(
    heading_prefix: &str,
    props: &Map<String, Value>,
    skip_keys: Option<&HashSet<String>>,
    depth: usize,
    out: &mut String,
) -> usize {
    let mut keys: Vec<&String> = props
        .keys()
        .filter(|k| skip_keys.is_none_or(|skip| !skip.contains(*k)))
        .collect();
    keys.sort();
    if keys.is_empty() {
        return 0;
    }

    let mut nested: Vec<(String, &Map<String, Value>)> = Vec::new();
    out.push_str("| Key | Type | Default | Description |\n|---|---|---|---|\n");
    for key in &keys {
        let prop = &props[*key];
        let ty = schema_type_summary(prop);
        let default = match prop.get("default") {
            Some(v) if !v.is_null() => format!("`{v}`"),
            _ => String::new(),
        };
        let desc = prop
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let _ = writeln!(
            out,
            "| `{}` | {} | {} | {} |",
            md_cell(key),
            md_cell(&ty),
            md_cell(&default),
            md_cell(desc)
        );

        if depth < 2 {
            if let Some(sub_props) = prop.get("properties").and_then(|v| v.as_object()) {
                nested.push((format!("{heading_prefix}.{key}"), sub_props));
            } else if let Some(item_props) = prop
                .get("items")
                .and_then(|v| v.get("properties"))
                .and_then(|v| v.as_object())
            {
                nested.push((format!("{heading_prefix}.{key}[]"), item_props));
            }
        }
    }
    out.push('\n');

    for (sub_title, sub_props) in nested {
        let _ = writeln!(out, "#### `{sub_title}`\n");
        render_object_tables(&sub_title, sub_props, None, depth + 1, out);
    }

    keys.len()
}

pub fn render_llms_txt() -> String {
    maps::init_builtin_maps();
    let version = charts_rs::version();
    let themes = sorted_themes();
    let fonts = loaded_fonts();
    let registered_maps = maps::list_maps();
    let limits = must_new_render_limits();
    let caps = charts_rs::mermaid_capabilities();
    let catalog = charts_rs::chart_catalog();
    let total_examples = examples::all_examples().count();

    let mut out = String::with_capacity(16 * 1024);

    let _ = writeln!(
        out,
        "# charts-rs-web\n\n\
        > Pure-Rust HTTP and stateless MCP server powered by `charts-rs` v{version}: \
        render {} chart types (28 core charts + `multi` composition + `mermaid`) and {} Mermaid diagram types \
        to SVG, PNG, JPEG, WebP, or AVIF with zero headless browser or Node.js dependencies.\n",
        catalog.len(),
        caps.supported_diagrams.len()
    );

    out.push_str(
        "## HTTP API\n\n\
        - `POST /api/charts/svg`: Render chart JSON options to SVG (`image/svg+xml`).\n\
        - `POST /api/charts/png`: Render chart JSON options to PNG (`image/png`). Accepts optional `"
    );
    let _ = write!(
        out,
        "`quality` (`0`–`100`, default `80`; `0` keeps unquantized PNG, `1`–`100` applies NeuQuant palette quantization).\n\
        - `POST /api/charts/jpeg`, `POST /api/charts/webp`, `POST /api/charts/avif`: Render chart JSON options to raster images.\n\
        - `GET /api/charts?format=<svg|png|jpeg|webp|avif>&opts=<url-encoded-json>`: GET preview endpoint (default `format=svg`).\n\
        - `GET /api/basic-info`: Returns `{{\"families\", \"themes\", \"maps\", \"chart_types\", \"version\"}}`.\n\
        - `GET /api/examples`: Returns the unified gallery catalog ({total_examples} verified chart & Mermaid examples).\n\
        - `GET /llms.txt`: This concise AI/LLM service guide (`text/markdown`).\n\
        - `GET /llms-full.txt`: Complete single-file reference with full JSON option tables and all {total_examples} examples.\n\n\
        Notes:\n\
        - Set `\"type\"` in the JSON payload (empty/omitted defaults to `\"bar\"`; aliases `\"multi_chart\"` -> `\"multi\"` and `\"guage\"` -> `\"gauge\"` are accepted; unknown `\"type\"` returns HTTP 400 JSON `{{\"message\", \"category\", \"code\", \"status\"}}`).\n\
        - Set `\"compact\": true` to emit 20–30% smaller SVGs.\n\n\
        ```bash\n\
        curl -sX POST http://127.0.0.1:5000/api/charts/png \\\n\
          -H 'Content-Type: application/json' \\\n\
          -d '{{\"type\":\"bar\",\"theme\":\"grafana\",\"x_axis_data\":[\"Mon\",\"Tue\"],\"series_list\":[{{\"name\":\"Visits\",\"data\":[120,185]}}]}}' -o chart.png\n\n\
        curl -sX POST http://127.0.0.1:5000/api/charts/svg \\\n\
          -H 'Content-Type: application/json' \\\n\
          -d '{{\"type\":\"mermaid\",\"source\":\"flowchart LR\\n  A[Client] --> B{{Gateway}}\\n  B -->|OK| C[(DB)]\"}}' -o flow.svg\n\
        ```\n\n"
    );

    out.push_str(
        "## MCP Server (`/mcp`)\n\n\
        Stateless Streamable HTTP MCP endpoint (`/mcp`) exposing 6 tools and 8 resources/templates:\n\n\
        ### Tools\n\
        - `list_chart_types`: Returns `chart_catalog()` + selection/variant guide + live themes, loaded fonts (with CJK hint), registered maps, Mermaid capabilities, and `RenderLimits`.\n\
        - `get_chart_schema(chart_type, level?, diagram_type?)`: Returns Draft 2020-12 JSON Schema (`essential` default, or `full`) with live `theme`/`font_family`/`geo_json` enums and curated examples; when `chart_type=\"mermaid\"`, includes Mermaid capabilities, limitations, and all 13 canonical diagram examples.\n\
        - `validate_chart(chart_type, options)`: Validates against schema, `RenderLimits`, and Mermaid syntax without rendering; returns up to 50 structured `ValidationIssue` entries + font/CJK warnings.\n\
        - `render_chart(chart_type, options, format?)`: Pre-validates and renders (`png` default, `jpeg`, `webp`, `svg`). Defaults `allow_links: false` for `mermaid`.\n\
        - `validate_mermaid(source, font_family?)`: Validates Mermaid DSL directly with 1-based line numbers and typo suggestions.\n\
        - `render_mermaid(source, theme?, font_family?, width?, height?, title_text?, allow_links?, format?)`: Renders Mermaid source directly (`allow_links` defaults to `false`).\n\n\
        ### MCP Resources\n\
        - `charts://themes`, `charts://fonts`, `charts://maps`, `charts://mermaid/capabilities`\n\
        - `charts://llms.txt`, `charts://llms-full.txt`\n\
        - Templates: `charts://examples/{type}`, `charts://examples/mermaid/{diagram}`\n\n\
        Workflow tip: When calling MCP to render a chart, prefer `list_chart_types` -> `get_chart_schema(essential)` -> `render_chart` to keep context small; read `charts://llms.txt` or `charts://llms-full.txt` only when full HTTP/service documentation is needed.\n\n"
    );

    out.push_str("## Live Server Capabilities\n\n");
    let _ = writeln!(out, "- **Themes** (`theme`): {}", themes.join(", "));
    let _ = writeln!(
        out,
        "- **Loaded Fonts** (`font_family`): {}",
        fonts.join(", ")
    );
    let _ = writeln!(out, "- **CJK Font Note**: {}", cjk_font_hint(&fonts));
    if registered_maps.is_empty() {
        out.push_str("- **Registered Maps** (`geo_json`): none\n");
    } else {
        out.push_str("- **Registered Maps** (`geo_json` string name):\n");
        for m in &registered_maps {
            let preview: Vec<&str> = m.regions.iter().take(50).map(String::as_str).collect();
            let suffix = if m.regions.len() > 50 {
                format!(", ... ({} total)", m.regions.len())
            } else {
                String::new()
            };
            let _ = writeln!(
                out,
                "  - `{}` ({} features, {} named regions): {}{}",
                m.name,
                m.feature_count,
                m.regions.len(),
                preview.join(", "),
                suffix
            );
        }
    }
    let _ = writeln!(
        out,
        "- **Active `RenderLimits`**: `max_json_bytes={}`, `max_canvas_side={}`, `max_data_points={}`, `max_mermaid_source={}`\n",
        limits.max_json_bytes,
        limits.max_canvas_side,
        limits.max_data_points,
        limits.max_mermaid_source
    );

    out.push_str("## Chart Selection & Variant Guide\n\n");
    out.push_str("| Intent / Variant | `type` | Key Option(s) | Note |\n|---|---|---|---|\n");
    for entry in CHART_SELECTION_GUIDE {
        let keys = entry
            .key_options
            .iter()
            .map(|k| format!("`{k}`"))
            .collect::<Vec<_>>()
            .join(", ");
        let _ = writeln!(
            out,
            "| {} | `{}` | {} | {} |",
            md_cell(entry.intent_or_variant),
            md_cell(entry.chart_type),
            md_cell(&keys),
            md_cell(entry.note)
        );
    }
    out.push('\n');

    out.push_str("## Minimal JSON Examples (All 30 Chart Types)\n\n");
    for info in &catalog {
        if let Some(ex) = &info.example {
            let mut obj = ex.clone();
            if let Some(map) = obj.as_object_mut()
                && !map.contains_key("type")
            {
                map.insert("type".to_string(), Value::String(info.name.to_string()));
            }
            if let Ok(line) = serde_json::to_string(&obj) {
                let _ = writeln!(out, "- `{}`: `{line}`", info.name);
            }
        }
    }
    out.push('\n');

    out.push_str("## Mermaid Specification\n\n");
    let _ = writeln!(
        out,
        "- **13 Canonical Diagrams**: {}",
        caps.supported_diagrams
            .iter()
            .map(|s| format!("`{s}`"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let _ = writeln!(
        out,
        "- **7 Aliases**: {}",
        caps.diagram_aliases
            .iter()
            .map(|(a, c)| format!("`{a}` -> `{c}`"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let _ = writeln!(
        out,
        "- **Unsupported Diagrams (do not generate)**: {}",
        caps.unsupported_diagrams
            .iter()
            .map(|s| format!("`{s}`"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let _ = writeln!(
        out,
        "- **Flowchart v11 `@{{ shape, label }}` Names**: {}",
        caps.v11_shapes.join(", ")
    );
    let _ = writeln!(
        out,
        "- **Frontmatter / `%%{{init}}%%` Config Keys**: {}",
        caps.init_config_keys
            .iter()
            .map(|s| format!("`{s}`"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let _ = writeln!(
        out,
        "- **Supported Features**: {}",
        caps.features.join("; ")
    );
    let _ = writeln!(
        out,
        "- **Known Limitations**: {}",
        caps.limitations.join("; ")
    );
    out.push_str("- **`allow_links` Policy**: `true` by default on HTTP API (allowing `http://`, `https://`, `mailto:`, and relative URLs only); `false` by default in MCP `render_mermaid` and `render_chart(\"mermaid\")`.\n\n");

    out.push_str(
        "## Validation & Error Self-Correction\n\n\
        - Invalid JSON or options are rejected explicitly rather than silently ignored.\n\
        - HTTP errors return `{ \"message\": \"...\", \"category\": \"charts|mermaid|font|json|charts_encoder\", \"code\": \"...\", \"status\": 400 }`.\n\
        - MCP `validate_chart` / `render_chart` return structured `ValidationIssue` entries (`code`, `path`, `message`, `expected`, `suggestion`, `line`) — up to 50 issues per pass — plus non-blocking CJK/font `warnings`.\n\n"
    );

    let _ = writeln!(
        out,
        "## References\n\n\
        - Full service & schema reference: `/llms-full.txt` (or MCP resource `charts://llms-full.txt`)\n\
        - Upstream `charts-rs` JSON reference: https://github.com/vicanso/charts-rs/blob/v{version}/docs/json.md\n\
        - Upstream `charts-rs` Guide: https://github.com/vicanso/charts-rs/blob/v{version}/docs/guide.md"
    );

    out
}

pub fn render_llms_full_txt() -> String {
    let mut out = render_llms_txt();
    out.push_str("\n\n---\n\n");

    out.push_str(
        "## Value Types\n\n\
        | Type | Written as |\n|---|---|\n\
        | number | Any JSON number |\n\
        | integer | Non-negative whole number (ticks/splits 0–1000, indexes 0–1,000,000) |\n\
        | color | `\"#rgb\"`, `\"#rgba\"`, `\"#rrggbb\"`, `\"#rrggbbaa\"`, `\"rgb(...)\"`, `\"rgba(...)\"`, or `\"transparent\"` |\n\
        | margin | Single number for all 4 sides, or `{\"left\", \"top\", \"right\", \"bottom\"}` |\n\
        | scale | `\"linear\"`, `\"log\"`, `\"log2\"`, `\"log10\"`, or `{\"type\": \"log\", \"base\": 5}` |\n\
        | x value | Number or date string (`\"2024-03-01\"`, `\"2024-03-01 08:30\"`, RFC3339) |\n\
        | number[] | Array of numbers (`null` represents a missing data point) |\n\
        | color[] | Array of colors (`null` keeps the default at that index) |\n\n"
    );

    out.push_str("## Complete JSON Options Reference\n\n");

    let mut common_keys = HashSet::new();
    if let Ok(line_schema) = charts_rs::chart_json_schema("line")
        && let Some(props) = line_schema.get("properties").and_then(|v| v.as_object())
    {
        for k in props.keys() {
            common_keys.insert(k.clone());
        }
        out.push_str("### Common Options\n\n");
        out.push_str(
            "Accepted by all chart types except `table`, `multi`, and `mermaid` (charts ignore keys inapplicable to them).\n\n",
        );
        render_object_tables("common", props, None, 0, &mut out);
    }

    for info in charts_rs::chart_catalog() {
        let _ = writeln!(out, "### `{}`\n", info.name);
        if !info.description.is_empty() {
            let _ = writeln!(out, "{}\n", info.description);
        }
        if let Ok(schema) = charts_rs::chart_json_schema(info.name)
            && let Some(props) = schema.get("properties").and_then(|v| v.as_object())
        {
            let skip = if matches!(info.name, "table" | "multi" | "mermaid") {
                None
            } else {
                Some(&common_keys)
            };
            let rendered = render_object_tables(info.name, props, skip, 0, &mut out);
            if rendered == 0 {
                out.push_str("_Uses Common Options only._\n\n");
            }
        }
    }

    let catalog = examples::catalog();
    let total_examples: usize = catalog.categories.iter().map(|c| c.items.len()).sum();
    let _ = writeln!(
        out,
        "## Curated Variant & Mermaid Examples ({total_examples} Verified Examples)\n"
    );
    for cat in &catalog.categories {
        let _ = writeln!(out, "### {} ({})\n", cat.title_en, cat.title_zh);
        for item in &cat.items {
            if let Some(diag) = &item.diagram_type {
                let _ = writeln!(
                    out,
                    "#### `{}` — {} / {} (`type: \"{}\"`, diagram: `{}`)\n",
                    item.id, item.label_en, item.label_zh, item.chart_type, diag
                );
            } else {
                let _ = writeln!(
                    out,
                    "#### `{}` — {} / {} (`type: \"{}\"`)\n",
                    item.id, item.label_en, item.label_zh, item.chart_type
                );
            }
            if !item.hint_en.is_empty() {
                let _ = writeln!(out, "{}\n", item.hint_en);
            }
            if let Ok(pretty) = serde_json::to_string_pretty(&item.options) {
                let _ = writeln!(out, "```json\n{pretty}\n```\n");
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llms_txt_includes_runtime_catalog_and_mermaid_spec() {
        let txt = render_llms_txt();
        assert!(txt.contains("# charts-rs-web"));
        assert!(txt.contains(charts_rs::version()));
        assert!(txt.contains("/api/charts/png"));
        assert!(txt.contains("/mcp"));
        assert!(txt.contains("charts://llms.txt"));
        assert!(txt.contains("demo"));
        assert!(txt.contains("Alder"));

        for chart_type in charts_rs::list_chart_types() {
            assert!(
                txt.contains(&format!("`{chart_type}`")),
                "llms.txt missing chart type {chart_type}"
            );
        }
        let caps = charts_rs::mermaid_capabilities();
        for diag in caps.supported_diagrams {
            assert!(
                txt.contains(diag),
                "llms.txt missing mermaid diagram {diag}"
            );
        }
        assert!(txt.contains("gitGraph"));
    }

    #[test]
    fn llms_full_txt_includes_schemas_and_all_examples() {
        let short = render_llms_txt();
        let full = render_llms_full_txt();
        assert!(full.starts_with(&short));
        assert!(full.contains("## Complete JSON Options Reference"));
        assert!(full.contains("### Common Options"));
        assert!(full.contains("### `mermaid`"));
        assert!(full.contains("### `table`"));
        assert!(full.contains("### `multi`"));

        for item in examples::all_examples() {
            assert!(
                full.contains(&format!("#### `{}`", item.id)),
                "llms-full.txt missing curated example {}",
                item.id
            );
        }
    }
}
