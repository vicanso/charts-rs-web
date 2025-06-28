use axum::{error_handling::HandleErrorLayer, middleware::from_fn, Router};
use axum_client_ip::ClientIpSource;
use glob::glob;
use std::net::SocketAddr;
use std::time::Duration;
use std::{env, fs, str::FromStr};
use substring::Substring;
use tokio::signal;
use tower::ServiceBuilder;
use tower_http::compression::predicate::{NotForContentType, Predicate, SizeAbove};
use tower_http::compression::CompressionLayer;

use tracing::info;
use tracing::Level;
use tracing_subscriber::FmtSubscriber;

mod config;
mod controller;
mod dist;
mod error;
mod middleware;
mod util;

fn init_logger() {
    let mut level = Level::INFO;
    if let Ok(log_level) = env::var("LOG_LEVEL") {
        if let Ok(value) = Level::from_str(log_level.as_str()) {
            level = value;
        }
    }

    let timer = tracing_subscriber::fmt::time::OffsetTime::local_rfc_3339().unwrap_or_else(|_| {
        tracing_subscriber::fmt::time::OffsetTime::new(
            time::UtcOffset::from_hms(0, 0, 0).unwrap(),
            time::format_description::well_known::Rfc3339,
        )
    });

    let subscriber = FmtSubscriber::builder()
        .with_max_level(level)
        .with_timer(timer)
        .with_ansi(util::is_development())
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("setting default subscriber failed");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("signal received, starting graceful shutdown");
}

#[tokio::main]
async fn run() {
    let predicate = SizeAbove::new(1024)
        .and(NotForContentType::GRPC)
        .and(NotForContentType::IMAGES)
        .and(NotForContentType::SSE);

    // build our application with a route
    let app = Router::new()
        .merge(controller::new_router())
        .layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(error::handle_error))
                .timeout(Duration::from_secs(30)),
        )
        // 后面的layer先执行
        .layer(
            // service builder 顺序执行
            ServiceBuilder::new()
                .layer(CompressionLayer::new().compress_when(predicate))
                .layer(from_fn(middleware::access_log))
                .layer(from_fn(middleware::entry))
                .layer(ClientIpSource::RightmostXForwardedFor.into_extension()),
        );

    let basic_config = config::must_new_basic_config();

    info!("listening on http://{}", basic_config.listen);
    let listener = tokio::net::TcpListener::bind(basic_config.listen)
        .await
        .unwrap();

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .unwrap();
}

fn load_fonts(dir: &str) {
    let mut font_files = vec![];

    let file_paths = [
        format!(r#"{dir}/*.ttf"#),
        format!(r#"{dir}/*.otf"#),
        format!(r#"{dir}/**/*.ttf"#),
        format!(r#"{dir}/**/*.otf"#),
    ];
    for file_path in file_paths.iter() {
        for entry in glob(file_path)
            .expect("Failed to read glob pattern")
            .flatten()
        {
            font_files.push(entry)
        }
    }

    let mut font_buffers = vec![];
    for item in font_files.iter() {
        if let Ok(buf) = fs::read(item) {
            font_buffers.push(buf);
        }
    }
    let arr: Vec<&[u8]> = font_buffers.iter().map(|item| item.as_slice()).collect();
    charts_rs::get_or_try_init_fonts(Some(arr)).unwrap();
}
fn main() {
    init_logger();
    if let Ok(font_path) = env::var("CHARTS_FONT_PATH") {
        info!(font_path, "loading fonts");
        for item in font_path.split(',') {
            load_fonts(item);
        }
    }
    let prefix = "CHARTS_THEME_";
    for (name, value) in env::vars() {
        if !name.starts_with(prefix) {
            continue;
        }
        let name = name.substring(prefix.len(), name.len());
        if name.is_empty() {
            continue;
        }
        match serde_json::from_str::<charts_rs::Theme>(&value) {
            Ok(theme) => {
                charts_rs::add_theme(name, theme);
            }
            Err(err) => {
                tracing::error!(error = err.to_string(), "add theme fail");
            }
        }
    }
    let families = charts_rs::get_font_families().unwrap();
    let themes = charts_rs::list_theme_name();
    info!(
        families = families.join(","),
        themes = themes.join(","),
        "get charts theme and family"
    );
    run();
}
