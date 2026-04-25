# Docker IPTV Sync App

这个 Docker app 会完成下面几件事：

1. 定期同步 `https://github.com/YueChan/Live`
2. 把 IPTV 列表里的多播地址改写成 HTTP 单播前缀地址
3. 把回看里的 `rtsp://...` 地址改写成 RTSP 代理前缀地址
4. 启动一个 HTTP 服务，把处理后的列表文件暴露给局域网设备访问
5. 按固定间隔自动刷新本地文件

## 启动方式

```bash
docker compose up -d --build
```

启动后，局域网中的设备可以通过下面的地址访问：

```text
http://<你的主机IP>:8000/
```

例如：

```text
http://192.168.1.20:8888/IPTV.m3u
http://192.168.1.20:8888/Global.m3u
http://192.168.1.20:8888/index.json
```

## 可配置项

可以在 `docker-compose.yml` 中调整这些环境变量：

- `REPO_URL`：上游仓库地址，默认 `https://github.com/YueChan/Live.git`
- `REPO_BRANCH`：分支名，默认 `main`
- `STREAM_PROXY_PREFIX`：改写前缀，默认 `http://192.168.2.10:4022/udp/`
- `RTSP_PROXY_PREFIX`：回看 RTSP 改写前缀，默认 `http://192.168.2.10:4022/rtsp/`
- `HTTP_PORT`：容器内 HTTP 端口，默认 `8888`
- `UPDATE_INTERVAL_SECONDS`：更新间隔，默认 `21600` 秒，也就是 6 小时
- `TZ`：时区，默认 `Asia/Shanghai`

## 数据目录

容器会把数据写到挂载目录 `./data`：

- `./data/upstream`：克隆下来的上游仓库
- `./data/public`：HTTP 对外提供的处理后文件

## 地址改写规则

程序会处理以下文本列表文件：

- `.m3u`
- `.m3u8`
- `.txt`

会把其中的直播多播地址改写为配置的 HTTP 前缀地址，保留原始组播 IP 和端口；同时把 `rtsp://...` 回看地址改写成配置的 RTSP 代理前缀。

例如：

```text
rtp://239.3.1.129:8008
```

会改成：

```text
http://192.168.2.10:4022/udp/239.3.1.129:8008
```

例如回看地址：

```text
rtsp://61.135.88.136/TVOD/88888892/224/example.smil?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}
```

会改成：

```text
http://192.168.2.10:4022/rtsp/rtsp://61.135.88.136/TVOD/88888892/224/example.smil?playseek=${(b)yyyyMMddHHmmss}-${(e)yyyyMMddHHmmss}
```

## 说明

这里默认按两种规则处理：

- 直播组播 URL 改成 `http://192.168.2.10:4022/udp/<组播地址>`
- 回看 RTSP URL 改成 `http://192.168.2.10:4022/rtsp/<原始rtsp地址>`
