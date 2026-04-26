import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const PLAYLIST_EXTENSIONS = new Set([".m3u", ".m3u8", ".txt"]);
const MULTICAST_URL_RE =
  /(?<scheme>(?:rtp|udp|rtsp):\/\/)(?<ip>(?:2(?:2[4-9]|3\d)|23\d)\.\d{1,3}\.\d{1,3}\.\d{1,3})(?<rest>:\d+[^\s\r\n,]*)?/gi;
const RTSP_URL_RE = /rtsp:\/\/[^\s"',]+/gi;

export interface ProcessOptions {
  sourceDir: string;
  outputDir: string;
  streamProxyPrefix: string;
  rtspProxyPrefix: string;
  repoUrl: string;
  repoBranch: string;
}

interface FileStatEntry {
  file: string;
  type: "playlist" | "static";
  replacements: number;
}

export function rewritePlaylist(
  content: string,
  streamProxyPrefix: string,
  rtspProxyPrefix: string,
): { content: string; replacements: number } {
  let replacements = 0;

  const multicastRewritten = content.replace(
    MULTICAST_URL_RE,
    (_match, _scheme, ip, rest: string | undefined) => {
      replacements += 1;
      const portAndSuffix = rest?.startsWith(":") ? rest.slice(1) : rest ?? "";
      return portAndSuffix
        ? `${streamProxyPrefix}${ip}:${portAndSuffix}`
        : `${streamProxyPrefix}${ip}`;
    },
  );

  const rtspRewritten = multicastRewritten.replace(RTSP_URL_RE, (match) => {
    replacements += 1;
    return `${rtspProxyPrefix}${match}`;
  });

  return { content: rtspRewritten, replacements };
}

async function emptyDirChildren(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const children = await readdir(directory);
  await Promise.all(
    children.map((child) =>
      rm(path.join(directory, child), { recursive: true, force: true }),
    ),
  );
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  const children = await readdir(root, { withFileTypes: true });
  const sorted = [...children].sort((a, b) => a.name.localeCompare(b.name));
  for (const child of sorted) {
    if (child.name === ".git") {
      continue;
    }
    const fullPath = path.join(root, child.name);
    if (child.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    if (child.isFile()) {
      yield fullPath;
    }
  }
}

function shouldProcessTextFile(filePath: string): boolean {
  return PLAYLIST_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function buildIndex(outputDir: string, stats: FileStatEntry[]): Promise<void> {
  const payload = {
    generated_files: stats,
    note: "Playlist files are rewritten to proxy URLs while preserving original filenames.",
  };
  await writeFile(
    path.join(outputDir, "index.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function writeLocalReadme(outputDir: string, options: ProcessOptions): Promise<void> {
  const readme = [
    "# Local IPTV Mirror",
    "",
    `- Source repo: ${options.repoUrl}`,
    `- Branch: ${options.repoBranch}`,
    `- Stream proxy prefix: ${options.streamProxyPrefix}`,
    `- RTSP proxy prefix: ${options.rtspProxyPrefix}`,
    "- Generated files index: /index.json",
    "",
    "Playlist files rewrite multicast live URLs to the configured HTTP proxy prefix and prefix RTSP catchup URLs with the configured RTSP proxy prefix.",
    "",
  ].join("\n");
  await writeFile(path.join(outputDir, "README.local.md"), readme, "utf8");
}

export async function processPlaylists(options: ProcessOptions): Promise<void> {
  const sourceStats = await stat(options.sourceDir).catch(() => null);
  if (!sourceStats?.isDirectory()) {
    throw new Error(`source directory not found: ${options.sourceDir}`);
  }

  await emptyDirChildren(options.outputDir);
  const fileStats: FileStatEntry[] = [];

  for await (const filePath of walkFiles(options.sourceDir)) {
    const relativePath = path.relative(options.sourceDir, filePath);
    const destination = path.join(options.outputDir, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });

    if (shouldProcessTextFile(filePath)) {
      const original = await readFile(filePath, "utf8");
      const rewritten = rewritePlaylist(
        original,
        options.streamProxyPrefix,
        options.rtspProxyPrefix,
      );
      await writeFile(destination, rewritten.content, "utf8");
      fileStats.push({
        file: relativePath,
        type: "playlist",
        replacements: rewritten.replacements,
      });
    } else {
      await cp(filePath, destination, { force: true });
      fileStats.push({ file: relativePath, type: "static", replacements: 0 });
    }
  }

  await buildIndex(options.outputDir, fileStats);
  await writeLocalReadme(options.outputDir, options);
}
