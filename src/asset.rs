/// 项目相关静态资源数据
use rust_embed::{EmbeddedFile, RustEmbed};

#[derive(RustEmbed)]
#[folder = "assets/"]
struct Assets;

pub fn get_source_han_sans() -> Option<EmbeddedFile> {
    Assets::get("SourceHanSansCN-VF.ttf")
}
