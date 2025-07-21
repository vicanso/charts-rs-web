FROM node:22-alpine AS webbuilder

COPY . /charts-rs-web
RUN apk update \
  && apk add git make \
  && cd /charts-rs-web \
  && make build-web

FROM rust:1.88 AS builder

COPY --from=webbuilder /charts-rs-web /charts-rs-web

RUN apt update \
  && apt install -y --no-install-recommends git make build-essential pkg-config nasm curl 
RUN apt install -y --no-install-recommends ca-certificates tzdata 
RUN rustup target list --installed
RUN cd /charts-rs-web \
  && curl -L https://github.com/vicanso/http-stat-rs/releases/latest/download/httpstat-linux-musl-$(uname -m).tar.gz | tar -xzf - \
  && make release 

FROM debian:12-slim

EXPOSE 5000

COPY --from=builder /charts-rs-web/fonts /usr/share/fonts
COPY --from=builder /charts-rs-web/entrypoint.sh /entrypoint.sh
COPY --from=builder /charts-rs-web/target/release/charts-rs-web /usr/local/bin/charts-rs-web
COPY --from=builder /charts-rs-web/httpstat /usr/local/bin/httpstat
COPY --from=builder /etc/ssl /etc/ssl

# tzdata 安装所有时区配置或可根据需要只添加所需时区

RUN groupadd -g 1000 rust \
  && useradd -u 1000 -g rust -s /bin/bash -m rust 

ENV RUST_ENV=production
ENV CHARTS_FONT_PATH=/usr/share/fonts

USER rust

WORKDIR /home/rust

HEALTHCHECK --timeout=10s --interval=10s CMD [ "httpstat", "http://127.0.0.1:5000/ping" ]

CMD ["charts-rs-web"]

ENTRYPOINT ["/entrypoint.sh"]
