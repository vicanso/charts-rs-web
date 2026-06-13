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

# 服务账号：/bin/false 禁止登录；-m 仍创建 home，便于显式 `docker exec -it <container> bash`。
RUN groupadd -g 1000 rust \
  && useradd -u 1000 -g rust -s /bin/false -m rust

# 所有 COPY 统一用数字 1000:1000 指定属主，落到运行时用户 rust；
# 源文件已带正确权限位（脚本/二进制 755、数据 644），无需再 --chmod。
# slim 镜像不带 CA bundle，仅复制必需的证书包而非整个宿主 SSL 目录；运行阶段不跑 apt。
COPY --from=builder --chown=1000:1000 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
# 图表文字渲染所需字体。
COPY --from=builder --chown=1000:1000 /charts-rs-web/fonts /usr/share/fonts
COPY --from=builder --chown=1000:1000 /charts-rs-web/target/release/charts-rs-web /usr/local/bin/charts-rs-web
COPY --from=builder --chown=1000:1000 /charts-rs-web/entrypoint.sh /entrypoint.sh
COPY --from=builder --chown=1000:1000 /charts-rs-web/httpstat /usr/local/bin/httpstat

ENV RUST_ENV=production
ENV CHARTS_FONT_PATH=/usr/share/fonts

USER rust

WORKDIR /home/rust

HEALTHCHECK --timeout=10s --interval=10s CMD [ "httpstat", "http://127.0.0.1:5000/ping", "-s"]

CMD ["charts-rs-web"]

ENTRYPOINT ["/entrypoint.sh"]
