FROM node:24-alpine AS webbuilder

COPY . /charts-rs-web
RUN apk update \
  && apk add git make \
  && cd /charts-rs-web \
  && make build-web

FROM rust:1.95.0 AS builder

COPY --from=webbuilder /charts-rs-web /charts-rs-web

RUN apt update \
  && apt install -y --no-install-recommends git make build-essential pkg-config nasm curl 
RUN apt install -y --no-install-recommends ca-certificates tzdata 
RUN rustup target list --installed
RUN cd /charts-rs-web \
  && curl -L https://github.com/vicanso/http-stat-rs/releases/latest/download/httpstat-linux-musl-$(uname -m).tar.gz | tar -xzf - \
  && make release 

FROM debian:trixie-slim

EXPOSE 5000

# slim 镜像不带 CA bundle，从 builder 阶段复制其生成的证书即可。
# 运行阶段不跑 apt，避免把 dpkg/debconf 的元数据永久写进镜像层。
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# 图表文字渲染所需字体，root 所有、全局可读。
COPY --from=builder /charts-rs-web/fonts /usr/share/fonts

# 服务账号：/bin/false 禁止登录；-m 仍创建 home，便于显式 `docker exec -it <container> bash`。
# 先建用户，下面的 COPY --chown 才能落到该用户。
RUN groupadd -g 1000 rust \
  && useradd -u 1000 -g rust -s /bin/false -m rust

COPY --from=builder --chown=rust:rust --chmod=755 /charts-rs-web/target/release/charts-rs-web /usr/local/bin/charts-rs-web
COPY --from=builder --chown=rust:rust --chmod=755 /charts-rs-web/entrypoint.sh /entrypoint.sh
COPY --from=builder --chown=rust:rust --chmod=755 /charts-rs-web/httpstat /usr/local/bin/httpstat

ENV RUST_ENV=production
ENV CHARTS_FONT_PATH=/usr/share/fonts

USER rust

WORKDIR /home/rust

HEALTHCHECK --timeout=10s --interval=10s CMD [ "httpstat", "http://127.0.0.1:5000/ping", "-s"]

CMD ["charts-rs-web"]

ENTRYPOINT ["/entrypoint.sh"]
