import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([".m3u", ".m3u8", ".txt", ".json", ".md", ".html"]);
const CONTENT_TYPES = new Map<string, string>([
  [".m3u", "application/vnd.apple.mpegurl"],
  [".m3u8", "application/vnd.apple.mpegurl"],
  [".txt", "text/plain"],
  [".json", "application/json"],
  [".md", "text/markdown"],
  [".html", "text/html"],
]);

function guessContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const baseType = CONTENT_TYPES.get(extension) ?? "application/octet-stream";
  return TEXT_EXTENSIONS.has(extension) ? `${baseType}; charset=utf-8` : baseType;
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(message);
}

export function startHttpServer(rootDir: string, port: number): void {
  const server = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(request.url?.split("?")[0] ?? "/");
      const normalized = requestPath === "/" ? "/index.json" : requestPath;
      const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(rootDir, safePath);

      await access(filePath);
      const fileStats = await stat(filePath);

      if (fileStats.isDirectory()) {
        sendError(response, 403, "Directory listing is disabled.\n");
        return;
      }

      response.statusCode = 200;
      response.setHeader("Content-Type", guessContentType(filePath));
      response.setHeader("Content-Length", fileStats.size);
      response.setHeader("Last-Modified", fileStats.mtime.toUTCString());

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      createReadStream(filePath).pipe(response);
    } catch {
      sendError(response, 404, "Not Found\n");
    }
  });

  server.listen(port, "0.0.0.0");
}
