import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { startHttpServer } from "./httpServer.js";
import { processPlaylists } from "./processPlaylists.js";

interface AppConfig {
  repoUrl: string;
  repoBranch: string;
  streamProxyPrefix: string;
  rtspProxyPrefix: string;
  httpPort: number;
  updateIntervalMs: number;
  httpRoot: string;
  upstreamDir: string;
  stateFile: string;
}

function getConfig(): AppConfig {
  const httpRoot = process.env.HTTP_ROOT ?? "/data/public";
  return {
    repoUrl: process.env.REPO_URL ?? "https://github.com/YueChan/Live.git",
    repoBranch: process.env.REPO_BRANCH ?? "main",
    streamProxyPrefix:
      process.env.STREAM_PROXY_PREFIX ?? "http://192.168.2.10:4022/udp/",
    rtspProxyPrefix:
      process.env.RTSP_PROXY_PREFIX ?? "http://192.168.2.10:4022/rtsp/",
    httpPort: Number.parseInt(process.env.HTTP_PORT ?? "8888", 10),
    updateIntervalMs:
      Number.parseInt(process.env.UPDATE_INTERVAL_SECONDS ?? "21600", 10) * 1000,
    httpRoot,
    upstreamDir: process.env.UPSTREAM_DIR ?? "/data/upstream",
    stateFile: path.join(path.dirname(httpRoot), "last_processed_commit"),
  };
}

function runCommand(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `Command failed: ${args.join(" ")}`));
    });
  });
}

async function syncRepo(config: AppConfig): Promise<void> {
  const gitDir = path.join(config.upstreamDir, ".git");
  try {
    await mkdir(config.upstreamDir, { recursive: true });
    const gitStats = await stat(gitDir);
    if (!gitStats.isDirectory()) {
      throw new Error(`${gitDir} is not a git directory`);
    }
  } catch {
    await rm(config.upstreamDir, { recursive: true, force: true });
    await runCommand([
      "git",
      "clone",
      "--branch",
      config.repoBranch,
      "--single-branch",
      config.repoUrl,
      config.upstreamDir,
    ]);
    return;
  }

  await runCommand(["git", "-C", config.upstreamDir, "fetch", "--depth", "1", "origin", config.repoBranch]);
  await runCommand(["git", "-C", config.upstreamDir, "checkout", "-f", config.repoBranch]);
  await runCommand([
    "git",
    "-C",
    config.upstreamDir,
    "reset",
    "--hard",
    `origin/${config.repoBranch}`,
  ]);
}

async function currentCommit(upstreamDir: string): Promise<string> {
  return runCommand(["git", "-C", upstreamDir, "rev-parse", "HEAD"]);
}

async function readLastProcessedCommit(stateFile: string): Promise<string> {
  try {
    return (await readFile(stateFile, "utf8")).trim();
  } catch {
    return "";
  }
}

async function writeLastProcessedCommit(stateFile: string, commit: string): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${commit}\n`, "utf8");
}

async function refreshOnce(config: AppConfig): Promise<void> {
  console.log(`[updater] syncing ${config.repoUrl}@${config.repoBranch}`);
  await syncRepo(config);

  const newCommit = await currentCommit(config.upstreamDir);
  const lastCommit = await readLastProcessedCommit(config.stateFile);
  const indexPath = path.join(config.httpRoot, "index.json");

  let needsRefresh = false;
  try {
    await readFile(indexPath, "utf8");
    needsRefresh = newCommit !== lastCommit;
  } catch {
    needsRefresh = true;
  }

  if (!needsRefresh) {
    console.log(`[updater] no upstream changes detected commit=${newCommit}`);
    return;
  }

  await processPlaylists({
    sourceDir: config.upstreamDir,
    outputDir: config.httpRoot,
    streamProxyPrefix: config.streamProxyPrefix,
    rtspProxyPrefix: config.rtspProxyPrefix,
    repoUrl: config.repoUrl,
    repoBranch: config.repoBranch,
  });
  await writeLastProcessedCommit(config.stateFile, newCommit);
  console.log(
    `[updater] playlists refreshed at ${new Date().toISOString()} commit=${newCommit}`,
  );
}

async function main(): Promise<void> {
  const config = getConfig();
  await mkdir(config.httpRoot, { recursive: true });
  await mkdir(config.upstreamDir, { recursive: true });

  startHttpServer(config.httpRoot, config.httpPort);

  try {
    await refreshOnce(config);
  } catch (error) {
    console.error("[updater] initial sync failed; http server will stay up and retry later");
    console.error(error);
  }

  setInterval(async () => {
    try {
      await refreshOnce(config);
    } catch (error) {
      console.error(
        `[updater] sync failed; retrying after ${config.updateIntervalMs / 1000}s`,
      );
      console.error(error);
    }
  }, config.updateIntervalMs);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
