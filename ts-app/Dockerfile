FROM oven/bun:1.2.13-alpine

RUN apk add --no-cache git tzdata

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src

RUN bun run build

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

CMD ["bun", "dist/main.js"]
