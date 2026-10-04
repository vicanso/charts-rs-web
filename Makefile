lint:
	cargo clippy

fmt:
	cargo fmt

dev:
	cargo watch -w src -x 'run'

udeps:
	cargo +nightly udeps
build-web:
	cd web && yarn && yarn build && cd .. && rm -rf dist && mv web/dist .

# 同步charts-rs的JSON参数文档(MCP使用)，升级charts-rs后执行
sync-chart-docs:
	cp "$$(dirname "$$(cargo metadata --format-version 1 | grep -o '"manifest_path":"[^"]*charts-rs-[0-9][^"]*"' | head -1 | cut -d'"' -f4)")/docs/json.md" src/mcp/chart_options.md

# 如果要使用需注释 profile.release 中的 strip
bloat:
	cargo bloat --release --crates

release:
	cargo build --release