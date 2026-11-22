use glob::glob;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Once, OnceLock, RwLock};

static BUILTIN_DEMO_GEO_JSON: &str = include_str!("../../maps/demo.json");

#[derive(Debug, Clone, Serialize)]
pub struct MapInfo {
    pub name: String,
    pub feature_count: usize,
    pub regions: Vec<String>,
}

static MAP_REGISTRY: OnceLock<RwLock<BTreeMap<String, MapInfo>>> = OnceLock::new();
static BUILTIN_INIT: Once = Once::new();

fn registry() -> &'static RwLock<BTreeMap<String, MapInfo>> {
    MAP_REGISTRY.get_or_init(|| RwLock::new(BTreeMap::new()))
}

fn feature_region_name(feature: &serde_json::Value) -> Option<String> {
    if let Some(name) = feature
        .get("properties")
        .and_then(|p| p.get("name"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(name.to_string());
    }
    feature
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

fn extract_regions(geo_json: &serde_json::Value) -> (usize, Vec<String>) {
    let mut seen = HashSet::new();
    let mut regions = Vec::new();
    let mut count = 0usize;

    match geo_json.get("type").and_then(|v| v.as_str()) {
        Some("FeatureCollection") => {
            if let Some(features) = geo_json.get("features").and_then(|v| v.as_array()) {
                count = features.len();
                for feature in features {
                    if let Some(name) = feature_region_name(feature)
                        && seen.insert(name.clone())
                    {
                        regions.push(name);
                    }
                }
            }
        }
        Some("Feature") => {
            count = 1;
            if let Some(name) = feature_region_name(geo_json) {
                regions.push(name);
            }
        }
        _ => {}
    }

    (count, regions)
}

pub fn register_map(name: &str, value: serde_json::Value) -> Result<MapInfo, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("map name must not be empty".to_string());
    }
    let (feature_count, regions) = extract_regions(&value);
    charts_rs::register_geo_json(trimmed, value).map_err(|err| err.to_string())?;
    let info = MapInfo {
        name: trimmed.to_string(),
        feature_count,
        regions,
    };
    if let Ok(mut guard) = registry().write() {
        guard.insert(trimmed.to_string(), info.clone());
    }
    Ok(info)
}

pub fn init_builtin_maps() {
    BUILTIN_INIT.call_once(|| {
        match serde_json::from_str::<serde_json::Value>(BUILTIN_DEMO_GEO_JSON) {
            Ok(value) => {
                if let Err(err) = register_map("demo", value) {
                    tracing::error!(error = err, "register builtin demo map fail");
                }
            }
            Err(err) => {
                tracing::error!(error = err.to_string(), "parse builtin demo map fail");
            }
        }
    });
}

fn map_name_from_path(base: &Path, file: &Path) -> Option<String> {
    let rel = file.strip_prefix(base).unwrap_or(file);
    let stem_path = rel.with_extension("");
    let raw = stem_path.to_string_lossy().replace('\\', "/");
    let trimmed = raw.trim_matches('/');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn load_maps_from_dir(dir: &str) {
    let dir = dir.trim();
    if dir.is_empty() {
        return;
    }
    let base = Path::new(dir);
    let patterns = [
        format!("{dir}/*.json"),
        format!("{dir}/*.geojson"),
        format!("{dir}/**/*.json"),
        format!("{dir}/**/*.geojson"),
    ];
    let mut files = BTreeSet::<PathBuf>::new();
    for pattern in patterns {
        if let Ok(entries) = glob(&pattern) {
            for entry in entries.flatten() {
                if entry.is_file() {
                    files.insert(entry);
                }
            }
        }
    }
    for file in files {
        let Some(name) = map_name_from_path(base, &file) else {
            continue;
        };
        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(err) => {
                tracing::warn!(path = %file.display(), error = err.to_string(), "read geojson file fail");
                continue;
            }
        };
        let value: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(path = %file.display(), error = err.to_string(), "parse geojson file fail");
                continue;
            }
        };
        if let Err(err) = register_map(&name, value) {
            tracing::warn!(map = name, path = %file.display(), error = err, "register geojson fail");
        }
    }
}

pub fn list_maps() -> Vec<MapInfo> {
    init_builtin_maps();
    let registered = charts_rs::list_geo_json();
    let guard = registry().read().ok();
    registered
        .into_iter()
        .map(|name| {
            guard
                .as_ref()
                .and_then(|map| map.get(&name).cloned())
                .unwrap_or(MapInfo {
                    name,
                    feature_count: 0,
                    regions: Vec::new(),
                })
        })
        .collect()
}

#[cfg(test)]
fn get_map_info(name: &str) -> Option<MapInfo> {
    init_builtin_maps();
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(guard) = registry().read()
        && let Some(info) = guard.get(trimmed)
    {
        return Some(info.clone());
    }
    if charts_rs::list_geo_json().iter().any(|n| n == trimmed) {
        return Some(MapInfo {
            name: trimmed.to_string(),
            feature_count: 0,
            regions: Vec::new(),
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_demo_map_registered_with_regions() {
        init_builtin_maps();
        let maps = list_maps();
        let demo = maps.iter().find(|m| m.name == "demo").expect("demo map");
        assert!(demo.feature_count >= 10);
        assert!(demo.regions.contains(&"Alder".to_string()));
        assert!(demo.regions.contains(&"Cedar".to_string()));
        assert!(get_map_info("demo").is_some());
        assert!(get_map_info("nonexistent_map_xyz").is_none());
    }
}
