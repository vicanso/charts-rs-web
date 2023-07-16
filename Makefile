lint:
	cargo clippy

fmt:
	cargo fmt

dev:
	cargo watch -w src -x 'run'

udeps:
	cargo +nightly udeps

release:
	date > assets/build_date
	git rev-parse --short HEAD > assets/commit
	cargo build --release