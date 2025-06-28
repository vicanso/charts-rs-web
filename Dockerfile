FROM node:22-alpine AS webbuilder

COPY . /charts-rs-web
RUN apk update \
  && apk add git make \
  && cd /charts-rs-web \
  && make build-web

FROM rust:1.88-alpine AS builder

COPY --from=webbuilder /charts-rs-web /charts-rs-web

RUN apk update \
  && apk add git make build-base pkgconfig nasm curl \
RUN rustup target list --installed
RUN cd /charts-rs-web \
  && curl -L https://github.com/vicanso/http-stat-rs/releases/latest/download/httpstat-linux-musl-$(uname -m).tar.gz | tar -xzf - \
  && make release 

FROM alpine

EXPOSE 5000

COPY --from=builder /charts-rs-web/fonts /usr/share/fonts
COPY --from=builder /charts-rs-web/entrypoint.sh /entrypoint.sh
COPY --from=builder /charts-rs-web/target/release/charts-rs-web /usr/local/bin/charts-rs-web
COPY --from=builder /charts-rs-web/httpstat /usr/local/bin/httpstat

# tzdata 安装所有时区配置或可根据需要只添加所需时区

RUN addgroup -g 1000 rust \
  && adduser -u 1000 -G rust -s /bin/sh -D rust \
  && apk add --no-cache ca-certificates tzdata

ENV RUST_ENV=production
ENV CHARTS_FONT_PATH=/usr/share/fonts

USER rust

WORKDIR /home/rust

HEALTHCHECK --timeout=10s --interval=10s CMD [ "wget", "http://127.0.0.1:5000/ping", "-q", "-O", "-"]

CMD ["charts-rs-web"]

ENTRYPOINT ["/entrypoint.sh"]
