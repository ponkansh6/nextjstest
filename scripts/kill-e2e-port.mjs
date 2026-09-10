import { execFileSync } from "child_process";

const port = Number(process.env.E2E_PORT ?? 3100);
const pids = new Set();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`不正な E2E ポートです: ${process.env.E2E_PORT}`);
  process.exit(1);
}

const addPids = (output) => {
  for (const match of output.matchAll(/\b\d+\b/g)) {
    const pid = Number(match[0]);
    if (pid > 0) pids.add(pid);
  }
};

const addFuserPids = (output) => {
  for (const match of output.matchAll(/(?:^|:)\s*(\d+)(?=\s|$)/gm)) {
    pids.add(Number(match[1]));
  }
};

const addSsPids = (output) => {
  for (const match of output.matchAll(/users:\([^\n]*?pid=(\d+)/g)) {
    pids.add(Number(match[1]));
  }
};

try {
  addPids(execFileSync("lsof", [`-ti:${port}`], { encoding: "utf-8" }));
} catch {
  // lsof may be unavailable or return no PID.
}

if (pids.size === 0) {
  try {
    addFuserPids(
      execFileSync("fuser", ["-n", "tcp", String(port)], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    // fuser may be unavailable or return no PID.
  }
}

if (pids.size === 0) {
  try {
    const ssOutput = execFileSync("ss", ["-ltnp"], { encoding: "utf-8" });
    for (const line of ssOutput.split("\n")) {
      if (line.includes(`:${port} `) || line.endsWith(`:${port}`)) addSsPids(line);
    }
  } catch {
    // ss may be unavailable.
  }
}

for (const pid of pids) {
  let cmd = "";
  try {
    cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf-8",
    }).trim();
  } catch {
    continue;
  }

  if (!/(?:next\s+start|next-server|next\/dist\/server)/.test(cmd)) {
    console.log(`PID ${pid} は E2E 用 Next プロセスではないため終了しません (CMD: ${cmd})。`);
    continue;
  }

  console.log(`プロセスを発見しました (PID: ${pid}, CMD: ${cmd})。終了シグナルを送信します...`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }

  // 1秒待機
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
  console.log(`PID ${pid} を終了しました。`);
}

if (pids.size === 0) {
  console.log(`E2E ポート ${port} にプロセスはいません。`);
}
