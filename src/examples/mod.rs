use charts_rs::SchemaLevel;
use once_cell::sync::Lazy;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(RustEmbed)]
#[folder = "examples/"]
struct ExampleAssets;

#[derive(Debug, Clone, Deserialize)]
struct MetaCategory {
    key: String,
    title_zh: String,
    title_en: String,
    file: String,
}

#[derive(Debug, Clone, Deserialize)]
struct MetaFile {
    featured: Vec<String>,
    categories: Vec<MetaCategory>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawExampleItem {
    id: String,
    chart_type: String,
    #[serde(default)]
    diagram_type: Option<String>,
    label_zh: String,
    label_en: String,
    short: String,
    hint_zh: String,
    hint_en: String,
    glyph: String,
    options: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExampleItem {
    pub id: String,
    pub chart_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagram_type: Option<String>,
    pub label_zh: String,
    pub label_en: String,
    pub short: String,
    pub hint_zh: String,
    pub hint_en: String,
    pub glyph: String,
    pub options: serde_json::Value,
    pub essential_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExampleCategory {
    pub key: String,
    pub title_zh: String,
    pub title_en: String,
    pub items: Vec<ExampleItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExamplesCatalog {
    pub featured: Vec<String>,
    pub categories: Vec<ExampleCategory>,
}

fn compute_essential_keys(chart_type: &str, options: &serde_json::Value) -> Vec<String> {
    let mut keys = BTreeSet::new();
    for k in ["type", "theme", "font_family", "compact"] {
        keys.insert(k.to_string());
    }
    if let Ok(schema) = charts_rs::chart_json_schema_with(chart_type, SchemaLevel::Essential)
        && let Some(props) = schema.get("properties").and_then(|v| v.as_object())
    {
        for k in props.keys() {
            keys.insert(k.clone());
        }
    }
    if let Some(obj) = options.as_object() {
        for k in obj.keys() {
            keys.insert(k.clone());
        }
    }
    keys.into_iter().collect()
}

fn load_asset_str(name: &str) -> String {
    let file = ExampleAssets::get(name)
        .unwrap_or_else(|| panic!("missing embedded example asset: {name}"));
    String::from_utf8(file.data.into_owned())
        .unwrap_or_else(|err| panic!("invalid utf-8 in example asset {name}: {err}"))
}

static CATALOG: Lazy<ExamplesCatalog> = Lazy::new(|| {
    let meta: MetaFile =
        serde_json::from_str(&load_asset_str("meta.json")).expect("parse examples/meta.json");
    let mut categories = Vec::with_capacity(meta.categories.len());
    for cat in meta.categories {
        let raw_items: Vec<RawExampleItem> = serde_json::from_str(&load_asset_str(&cat.file))
            .unwrap_or_else(|err| panic!("parse examples/{}: {err}", cat.file));
        let items = raw_items
            .into_iter()
            .map(|item| {
                let essential_keys = compute_essential_keys(&item.chart_type, &item.options);
                ExampleItem {
                    id: item.id,
                    chart_type: item.chart_type,
                    diagram_type: item.diagram_type,
                    label_zh: item.label_zh,
                    label_en: item.label_en,
                    short: item.short,
                    hint_zh: item.hint_zh,
                    hint_en: item.hint_en,
                    glyph: item.glyph,
                    options: item.options,
                    essential_keys,
                }
            })
            .collect();
        categories.push(ExampleCategory {
            key: cat.key,
            title_zh: cat.title_zh,
            title_en: cat.title_en,
            items,
        });
    }
    ExamplesCatalog {
        featured: meta.featured,
        categories,
    }
});

pub fn catalog() -> &'static ExamplesCatalog {
    &CATALOG
}

pub fn all_examples() -> impl Iterator<Item = &'static ExampleItem> {
    CATALOG.categories.iter().flat_map(|cat| cat.items.iter())
}

pub fn examples_for_chart_type(chart_type: &str) -> Vec<&'static ExampleItem> {
    all_examples()
        .filter(|item| item.chart_type == chart_type)
        .collect()
}

pub fn all_mermaid_examples() -> Vec<&'static ExampleItem> {
    examples_for_chart_type("mermaid")
}

pub fn canonical_mermaid_diagram(name: &str) -> String {
    let trimmed = name.trim();
    let caps = charts_rs::mermaid_capabilities();
    for &(alias, canonical) in caps.diagram_aliases {
        if alias.eq_ignore_ascii_case(trimmed) {
            return canonical.to_string();
        }
    }
    for &canonical in caps.supported_diagrams {
        if canonical.eq_ignore_ascii_case(trimmed) {
            return canonical.to_string();
        }
    }
    trimmed.to_string()
}

pub fn example_for_mermaid_diagram(diagram: &str) -> Option<&'static ExampleItem> {
    let target = canonical_mermaid_diagram(diagram);
    all_mermaid_examples().into_iter().find(|item| {
        item.diagram_type
            .as_deref()
            .is_some_and(|d| d.eq_ignore_ascii_case(&target))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::maps;
    use charts_rs::RenderLimits;
    use std::collections::{HashMap, HashSet};

    fn find_by_id(id: &str) -> Option<&'static ExampleItem> {
        all_examples().find(|item| item.id == id)
    }

    fn examples_summary_by_type() -> HashMap<&'static str, usize> {
        let mut counts = HashMap::new();
        for item in all_examples() {
            *counts.entry(item.chart_type.as_str()).or_insert(0) += 1;
        }
        counts
    }

    #[test]
    fn example_ids_are_unique_and_featured_exist() {
        let mut seen = HashSet::new();
        for item in all_examples() {
            assert!(
                seen.insert(item.id.as_str()),
                "duplicate example id: {}",
                item.id
            );
        }
        for id in &catalog().featured {
            assert!(find_by_id(id).is_some(), "missing featured example: {id}");
        }
    }

    #[test]
    fn all_examples_validate_and_render() {
        maps::init_builtin_maps();
        let limits = RenderLimits::default();
        for item in all_examples() {
            let issues = charts_rs::validate_chart_json_with_limits(
                &item.chart_type,
                &item.options,
                &limits,
            )
            .unwrap_or_else(|err| panic!("validate error on {}: {err}", item.id));
            assert!(
                issues.is_empty(),
                "validation issues on {} ({}): {:?}",
                item.id,
                item.chart_type,
                issues
            );
            let svg = charts_rs::render_chart_from_value_with_limits(
                &item.chart_type,
                &item.options,
                &limits,
            )
            .unwrap_or_else(|err| panic!("render error on {}: {err}", item.id));
            assert!(
                svg.starts_with("<svg"),
                "expected SVG output for {}, got prefix {:?}",
                item.id,
                &svg[..svg.len().min(32)]
            );
        }
    }

    #[test]
    fn examples_cover_all_chart_types_and_mermaid_diagrams() {
        let counts = examples_summary_by_type();
        for &chart_type in charts_rs::list_chart_types() {
            assert!(
                counts.get(chart_type).copied().unwrap_or(0) >= 1,
                "chart type `{chart_type}` has no example in unified library"
            );
        }

        let caps = charts_rs::mermaid_capabilities();
        for &diagram in caps.supported_diagrams {
            assert!(
                example_for_mermaid_diagram(diagram).is_some(),
                "canonical mermaid diagram `{diagram}` has no example"
            );
        }
        for &(alias, canonical) in caps.diagram_aliases {
            let ex = example_for_mermaid_diagram(alias)
                .unwrap_or_else(|| panic!("alias `{alias}` did not resolve"));
            assert_eq!(ex.diagram_type.as_deref(), Some(canonical));
        }
    }
}
