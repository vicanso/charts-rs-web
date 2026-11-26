mod app_config;

pub use app_config::{
    ShortLinkConfig, get_env, must_new_basic_config, must_new_mcp_config, must_new_render_limits,
    must_new_short_link_config,
};
