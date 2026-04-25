#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from pathlib import Path


PLAYLIST_EXTENSIONS = {".m3u", ".m3u8", ".txt"}
MULTICAST_URL_RE = re.compile(
    r"(?P<scheme>(?:rtp|udp|rtsp)://)(?P<ip>(?:2(?:2[4-9]|3\d)|23\d)\.\d{1,3}\.\d{1,3}\.\d{1,3})(?P<rest>:\d+[^\s\r\n,]*)?",
    re.IGNORECASE,
)
RTSP_URL_RE = re.compile(r"rtsp://[^\s\"',]+", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert multicast playlist addresses into HTTP proxy URLs."
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stream-proxy-prefix", required=True)
    parser.add_argument("--rtsp-proxy-prefix", required=True)
    return parser.parse_args()


def should_process_text_file(path: Path) -> bool:
    return path.suffix.lower() in PLAYLIST_EXTENSIONS


def rewrite_playlist(
    content: str, stream_proxy_prefix: str, rtsp_proxy_prefix: str
) -> tuple[str, int]:
    replacements = 0

    def replace_url(match: re.Match[str]) -> str:
        nonlocal replacements
        replacements += 1
        multicast_ip = match.group("ip")
        rest = match.group("rest") or ""
        port_and_suffix = rest[1:] if rest.startswith(":") else rest
        return f"{stream_proxy_prefix}{multicast_ip}:{port_and_suffix}" if port_and_suffix else f"{stream_proxy_prefix}{multicast_ip}"

    updated = MULTICAST_URL_RE.sub(replace_url, content)

    def replace_rtsp_url(match: re.Match[str]) -> str:
        nonlocal replacements
        replacements += 1
        return f"{rtsp_proxy_prefix}{match.group(0)}"

    updated = RTSP_URL_RE.sub(replace_rtsp_url, updated)
    return updated, replacements


def safe_rmtree_children(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for child in directory.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def build_index(output_dir: Path, stats: list[dict[str, object]]) -> None:
    index = {
        "generated_files": stats,
        "note": "Playlist files are rewritten to a single unicast IP while preserving original filenames.",
    }
    (output_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    source_dir = args.source
    output_dir = args.output

    if not source_dir.is_dir():
        raise SystemExit(f"source directory not found: {source_dir}")

    safe_rmtree_children(output_dir)

    stats: list[dict[str, object]] = []

    for path in sorted(source_dir.rglob("*")):
        if ".git" in path.parts:
            continue
        if path.is_dir():
            continue

        relative = path.relative_to(source_dir)
        destination = output_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)

        if should_process_text_file(path):
            original = path.read_text(encoding="utf-8", errors="ignore")
            rewritten, replacements = rewrite_playlist(
                original, args.stream_proxy_prefix, args.rtsp_proxy_prefix
            )
            destination.write_text(rewritten, encoding="utf-8")
            stats.append(
                {
                    "file": str(relative),
                    "type": "playlist",
                    "replacements": replacements,
                }
            )
        else:
            shutil.copy2(path, destination)
            stats.append({"file": str(relative), "type": "static", "replacements": 0})

    build_index(output_dir, stats)

    readme_path = output_dir / "README.local.md"
    readme_path.write_text(
        "\n".join(
            [
                "# Local IPTV Mirror",
                "",
                f"- Source repo: {os.environ.get('REPO_URL', '')}",
                f"- Branch: {os.environ.get('REPO_BRANCH', '')}",
                f"- Stream proxy prefix: {args.stream_proxy_prefix}",
                f"- RTSP proxy prefix: {args.rtsp_proxy_prefix}",
                f"- Generated files index: /index.json",
                "",
                "Playlist files rewrite multicast live URLs to the configured HTTP proxy prefix and prefix RTSP catchup URLs with the configured RTSP proxy prefix.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
