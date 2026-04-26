#!/usr/bin/env python3
from __future__ import annotations

import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


TEXT_EXTENSIONS = {
    ".m3u",
    ".m3u8",
    ".txt",
    ".json",
    ".md",
    ".html",
}


class UTF8StaticHandler(SimpleHTTPRequestHandler):
    def guess_type(self, path: str) -> str:
        content_type = super().guess_type(path)
        _, extension = os.path.splitext(path.lower())
        if extension in TEXT_EXTENSIONS and "charset=" not in content_type.lower():
            return f"{content_type}; charset=utf-8"
        return content_type


def main() -> None:
    port = int(os.environ.get("HTTP_PORT", "8888"))
    directory = os.environ.get("HTTP_ROOT", "/data/public")
    handler = partial(UTF8StaticHandler, directory=directory)
    server = ThreadingHTTPServer(("0.0.0.0", port), handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
