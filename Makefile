lint:
	cargo clippy

fmt:
	cargo fmt

dev:
	cargo watch -w src -x 'run'

udeps:
	cargo +nightly udeps
build-web:
	cd web && yarn build && cd .. && rm -rf dist && mv web/dist .

release:
	cargo build --release