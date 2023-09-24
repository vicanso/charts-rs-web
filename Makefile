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

# 如果要使用需注释 profile.release 中的 strip
bloat:
	cargo bloat --release --crates

release:
	cargo build --release