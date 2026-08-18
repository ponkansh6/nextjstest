import { execSync } from "child_process";

const port = Number(process.env.E2E_PORT ?? 3100);

try {
  const pidOutput = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
  if (!pidOutput) {
    console.log(`E2E ポート ${port} にプロセスはいません。`);
    process.exit(0);
  }

  const pids = pidOutput.split("\n").filter(Boolean);
  for (const pidStr of pids) {
    const pid = Number(pidStr);
    if (!pid) continue;

    let cmd = "";
    try {
      cmd = execSync(`ps -p ${pid} -o command=`, { encoding: "utf-8" }).trim();
    } catch {
      cmd = "(unknown)";
    }

    console.log(`プロセスを発見しました (PID: ${pid}, CMD: ${cmd})。終了シグナルを送信します...`);
    try {
      execSync(`kill -TERM ${pid}`);
    } catch {
      // ignore
    }

    // 1秒待機
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);

    try {
      execSync(`kill -9 ${pid}`);
    } catch {
      // ignore
    }
    console.log(`PID ${pid} を終了しました。`);
  }
} catch {
  console.log(`E2E ポート ${port} にプロセスはいません。`);
}
