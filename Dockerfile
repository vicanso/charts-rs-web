FROM rust:alpine as builder

COPY . /charts-rs-web

RUN apk update \
  && apk add git make build-base pkgconfig
RUN rustup target list --installed
RUN cd /charts-rs-web \
  && make release 

FROM alpine 

EXPOSE 7001

# tzdata 安装所有时区配置或可根据需要只添加所需时区

RUN addgroup -g 1000 rust \
  && adduser -u 1000 -G rust -s /bin/sh -D rust \
  && apk add --no-cache ca-certificates tzdata

COPY --from=builder /charts-rs-web/target/release/charts-rs-web /usr/local/bin/charts-rs-web
COPY --from=builder /charts-rs-web/entrypoint.sh /entrypoint.sh

ENV RUST_ENV=production

USER rust

WORKDIR /home/rust

HEALTHCHECK --timeout=10s --interval=10s CMD [ "wget", "http://127.0.0.1:5000/ping", "-q", "-O", "-"]

CMD ["charts-rs-web"]

ENTRYPOINT ["/entrypoint.sh"]