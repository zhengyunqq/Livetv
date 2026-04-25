FROM python:3.12-alpine

RUN apk add --no-cache git tzdata

WORKDIR /app

COPY scripts/ /app/scripts/

RUN chmod +x /app/scripts/entrypoint.sh /app/scripts/updater.sh

ENV REPO_URL="https://github.com/YueChan/Live.git" \
    REPO_BRANCH="main" \
    STREAM_PROXY_PREFIX="http://192.168.2.10:4022/udp/" \
    RTSP_PROXY_PREFIX="http://192.168.2.10:4022/rtsp/" \
    HTTP_PORT="8888" \
    UPDATE_INTERVAL_SECONDS="21600" \
    HTTP_ROOT="/data/public" \
    UPSTREAM_DIR="/data/upstream" \
    TZ="Asia/Shanghai"

VOLUME ["/data"]

EXPOSE 8888

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
