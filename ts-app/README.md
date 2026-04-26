# TypeScript Prototype

这是现有 IPTV 同步服务的 TypeScript 重写尝试版，放在独立目录里，不影响当前正在运行的 Python 版本。

## 功能

- 定期同步 `https://github.com/YueChan/Live`
- 把直播组播地址改写成 `STREAM_PROXY_PREFIX + 组播地址`
- 把回看 `rtsp://...` 地址改写成 `RTSP_PROXY_PREFIX + 原始rtsp地址`
- 启动带 UTF-8 文本响应头的本地 HTTP 服务

## 本地开发

```bash
bun install
bun run build
bun run start
```

开发模式：

```bash
bun install
bun run dev
```

## Docker 试跑

这个目录自己就可以单独启动：

```bash
docker compose up -d --build
```

为了不和现有服务冲突，这里默认映射：

```text
http://<你的主机IP>:8889/IPTV.m3u
```
