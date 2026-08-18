import { FullConfig } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * lsof でポート占有プロセスを取得する。
 * net.createServer プローブは Playwright の webServer 起動と競合するため使わない。
 * lsof のみで判定し、PID とコマンドを返す。
 */
function findOccupyingProcess(port: number): { pid: number; cmd: string } | null {
  try {
    const pidOutput = execSync(`lsof -ti:${port}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!pidOutput) return null;
    const pids = pidOutput.split("\n").filter(Boolean);
    for (const pidStr of pids) {
      const pid = Number(pidStr);
      if (!pid) continue;
      let cmd = "";
      try {
        cmd = execSync(`ps -p ${pid} -o command=`, {
          encoding: "utf-8",
          timeout: 3000,
        }).trim();
      } catch {
        // プロセスが既に消えている
      }
      return { pid, cmd };
    }
  } catch {
    // lsof が見つからない、またはタイムアウト
  }
  return null;
}

function findNewestMtime(dirOrFiles: string[]): number {
  let newest = 0;
  for (const target of dirOrFiles) {
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(target, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(target, entry.name);
        const mtime = findNewestMtime([fullPath]);
        if (mtime > newest) newest = mtime;
      }
    } else {
      if (stat.mtimeMs > newest) newest = stat.mtimeMs;
    }
  }
  return newest;
}

export default async function globalSetup(config: FullConfig) {
  // 1. Port check and auto cleanup (P2)
  const webServerUrl = config.webServer?.url;
  let port = 3100;
  if (webServerUrl) {
    try {
      const parsed = new URL(webServerUrl);
      port = Number(parsed.port) || 3100;
    } catch {
      // fallback
    }
  }

  // lsof で E2E_PORT に LISTEN しているプロセスを確認
  // （net.createServer は Playwright webServer とポート竞争するため使わない）
  const occupant = findOccupyingProcess(port);
  if (occupant) {
    const { pid, cmd } = occupant;

    // Playwright / rtk 自体がポートを掴んでいる場合はスキップ
    // （Playwright が webServer を起動する際に一時的にポートが見えることがある）
    if (/playwright|rtk/i.test(cmd)) {
      // skip — Playwright の webServer 起動プロセスの可能性
    } else if (/next/i.test(cmd)) {
      // 残骸プロセス: next-server 系は自動 kill
      console.log(`[globalSetup] 残骸プロセスを停止: PID=${pid} CMD=${cmd}`);
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 1000));
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    } else {
      throw new Error(
        `E2E ポート ${port} が別プロセスに使われています。\n` +
          `  PID  : ${pid}\n` +
          `  CMD  : ${cmd}\n` +
          `解消するには次を実行してください:\n` +
          `  kill ${pid}\n` +
          `（E2E のポートは E2E_PORT 環境変数で変更できます）`,
      );
    }
  }

  // 2. Staleness guard (P3)
  if (process.env.E2E_SKIP_STALE_CHECK !== "1") {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    if (!fs.existsSync(buildIdPath)) {
      throw new Error(
        `.next/BUILD_ID が存在しません。先にビルドを実行してください。\n` +
          `  pnpm build && pnpm test:e2e`,
      );
    }

    const buildIdStat = fs.statSync(buildIdPath);
    const buildMtime = buildIdStat.mtimeMs;

    const sourceTargets = ["src", "server", "public", "package.json"];
    const configFiles = fs.readdirSync(process.cwd()).filter((f) => f.startsWith("next.config."));
    const targetsToScan = [...sourceTargets, ...configFiles];

    const newestSourceMtime = findNewestMtime(targetsToScan);

    if (newestSourceMtime > buildMtime) {
      const formatDate = (ms: number) => new Date(ms).toLocaleTimeString();
      throw new Error(
        `.ネクストのビルドがソースより古いです（最終ビルド: ${formatDate(buildMtime)} / 最新の変更: ${formatDate(newestSourceMtime)}）。\n` +
          `古いバンドルを検証してしまうため中断しました。次を実行してください:\n` +
          `  pnpm test:e2e:fresh`,
      );
    }
  }
}
