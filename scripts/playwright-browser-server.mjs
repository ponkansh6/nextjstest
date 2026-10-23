import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = resolve(
  repoRoot,
  process.env.PLAYWRIGHT_BROWSER_SERVER_STATE_DIR ?? ".cache/playwright-browser-server",
);
const statePath = resolve(stateDir, "state.json");
const lockPath = resolve(stateDir, "start.lock");
const scriptPath = fileURLToPath(import.meta.url);
const startTimeoutMs = 20_000;
const stopTimeoutMs = 10_000;
const pollIntervalMs = 100;

async function getPlaywrightVersion() {
  const packageJson = JSON.parse(
    await readFile(resolve(repoRoot, "node_modules/@playwright/test/package.json"), "utf8"),
  );
  return packageJson.version;
}

async function readState() {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    return state && typeof state === "object" && !Array.isArray(state) ? state : { invalid: true };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return { invalid: true };
  }
}

async function writeState(state) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const tempPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(tempPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  await rename(tempPath, statePath);
}

async function removeOwnState(instanceId) {
  const current = await readState();
  if (current?.instanceId === instanceId) await rm(statePath, { force: true });
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function controlRequest(state, action, timeoutMs = 1000) {
  if (!Number.isInteger(state?.controlPort) || !state?.controlToken || !state?.instanceId)
    return false;
  return new Promise((resolveRequest) => {
    const request = fetch(`http://127.0.0.1:${state.controlPort}/${action}`, {
      method: "POST",
      headers: {
        "x-playwright-server-token": state.controlToken,
        "x-playwright-server-instance": state.instanceId,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    request
      .then(async (response) => {
        if (!response.ok) return resolveRequest(false);
        const body = await response.json();
        resolveRequest(body.instanceId === state.instanceId);
      })
      .catch(() => resolveRequest(false));
  });
}

async function inspectState(state, version) {
  if (!state || state.invalid) return { status: state ? "stale" : "stopped", state: null };
  if (!(await controlRequest(state, "health"))) return { status: "stale", state };
  if (state.browserName !== "chromium" || state.playwrightVersion !== version) {
    return { status: "stale", state };
  }
  return { status: "running", state };
}

async function deleteStaleState(state) {
  const current = await readState();
  if (current?.instanceId === state?.instanceId) await rm(statePath, { force: true });
}

async function acquireStartLock() {
  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    try {
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      const handle = await open(lockPath, "wx", 0o600);
      const lockInstanceId = randomUUID();
      await handle.writeFile(JSON.stringify({ pid: process.pid, lockInstanceId }));
      return async () => {
        await handle.close().catch(() => {});
        try {
          const lock = JSON.parse(await readFile(lockPath, "utf8"));
          if (lock.lockInstanceId === lockInstanceId) await rm(lockPath, { force: true });
        } catch {
          // A replacement or corrupt lock is not ours to remove.
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        if (!Number.isInteger(lock?.pid) || lock.pid < 1 || !lock.lockInstanceId) {
          throw new Error("Malformed Playwright browser server start lock.");
        }
        let ownerAlive = true;
        try {
          process.kill(lock.pid, 0);
        } catch (probeError) {
          ownerAlive = probeError.code !== "ESRCH";
        }
        if (!ownerAlive && Number.isInteger(lock.pid)) {
          await rm(lockPath, { force: true });
        }
      } catch (readError) {
        if (readError.code === "ENOENT") continue;
        const info = await stat(lockPath).catch(() => null);
        if (info && Date.now() - info.mtimeMs > startTimeoutMs * 2) {
          await rm(lockPath, { force: true });
        }
      }
      const current = await readState();
      const currentStatus = await inspectState(current, await getPlaywrightVersion());
      if (currentStatus.status === "running") return null;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
    }
  }
  throw new Error("Timed out waiting for another Playwright browser server start operation.");
}

async function startServer() {
  const version = await getPlaywrightVersion();
  const releaseLock = await acquireStartLock();
  if (!releaseLock) {
    const existing = await inspectState(await readState(), version);
    if (existing.status === "running") {
      process.stdout.write("Playwright browser server is already running.\n");
      return;
    }
    throw new Error("Playwright browser server start is already in progress.");
  }

  try {
    let current = await readState();
    let inspected = await inspectState(current, version);
    if (inspected.status === "running") {
      process.stdout.write("Playwright browser server is already running.\n");
      return;
    }
    if (current) {
      if (current.instanceId) {
        const canControl = await controlRequest(current, "health");
        if (canControl) {
          await controlRequest(current, "stop", 1000);
          const stopDeadline = Date.now() + stopTimeoutMs;
          while (Date.now() < stopDeadline) {
            const latest = await readState();
            if (!latest || latest.instanceId !== current.instanceId) break;
            await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
          }
          const latest = await readState();
          if (latest?.instanceId === current.instanceId) {
            throw new Error("Timed out stopping the stale Playwright browser server.");
          }
        } else {
          await deleteStaleState(current);
        }
      } else {
        await rm(statePath, { force: true });
      }
    }

    const child = spawn(process.execPath, [scriptPath, "__daemon"], {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      env: { ...process.env },
    });
    const handshake = await waitForDaemonHandshake(child, 16_000);
    if (handshake.type === "error") {
      throw new Error(
        `Playwright browser server failed to start: ${handshake.message}\nCheck that Playwright Chromium is installed, then retry: pnpm test:browser:server:start`,
      );
    }
    child.unref();
    process.stdout.write("Playwright browser server started.\n");
  } finally {
    await releaseLock();
  }
}

function waitForDaemonHandshake(child, timeoutMs) {
  return new Promise((resolveHandshake, rejectHandshake) => {
    let output = "";
    let settled = false;
    const finish = (error, message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      child.stdout?.destroy();
      if (error) rejectHandshake(error);
      else resolveHandshake(message);
    };
    const timeout = setTimeout(() => {
      finish(new Error("Timed out waiting for the Playwright browser server startup handshake."));
    }, timeoutMs);
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (!settled)
        finish(
          new Error(`Playwright browser server exited during startup (code ${code ?? "unknown"}).`),
        );
    });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      output += chunk;
      const newline = output.indexOf("\n");
      if (newline === -1) return;
      try {
        finish(null, JSON.parse(output.slice(0, newline)));
      } catch {
        finish(new Error("Playwright browser server returned an invalid startup response."));
      }
    });
  });
}

async function runDaemon() {
  const instanceId = randomUUID();
  const controlToken = randomUUID();
  let browserServer;
  let closing = false;
  let browserAlive = false;
  let control;

  const cleanup = async () => {
    if (closing) return;
    closing = true;
    if (browserServer) await browserServer.close().catch(() => {});
    if (control?.listening) await new Promise((resolveClose) => control.close(resolveClose));
    await removeOwnState(instanceId);
  };

  const handleSignal = () => void cleanup().finally(() => process.exit(0));
  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
  process.on("uncaughtException", () => void cleanup().finally(() => process.exit(1)));
  process.on("unhandledRejection", () => void cleanup().finally(() => process.exit(1)));

  try {
    browserServer = await chromium.launchServer({
      host: "127.0.0.1",
      headless: true,
      timeout: 12_000,
    });
    browserAlive = true;
    browserServer.once("close", () => {
      browserAlive = false;
      void cleanup();
    });
    control = createServer((request, response) => {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.writeHead(403).end();
        return;
      }
      const authorized =
        request.method === "POST" &&
        request.headers["x-playwright-server-token"] === controlToken &&
        request.headers["x-playwright-server-instance"] === instanceId;
      if (!authorized) {
        response.writeHead(404).end();
        return;
      }
      if (request.url === "/health" && !browserAlive) {
        response.writeHead(503).end();
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ instanceId }));
      if (request.url === "/stop") void cleanup();
    });
    await new Promise((resolveListen, rejectListen) => {
      control.once("error", rejectListen);
      control.listen(0, "127.0.0.1", resolveListen);
    });
    const address = control.address();
    if (!address || typeof address === "string")
      throw new Error("Failed to bind the local control server.");

    const state = {
      pid: process.pid,
      instanceId,
      wsEndpoint: browserServer.wsEndpoint(),
      playwrightVersion: await getPlaywrightVersion(),
      browserName: "chromium",
      controlPort: address.port,
      controlToken,
    };
    await writeState(state);
    process.stdout.write(`${JSON.stringify({ type: "ready" })}\n`);
    process.stdout.end();
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ type: "error", message: error.message })}\n`);
    process.stdout.end();
    await cleanup();
    process.exitCode = 1;
  }
}

async function stopServer() {
  const state = await readState();
  if (!state || state.invalid) {
    if (state?.invalid) await rm(statePath, { force: true });
    process.stdout.write("Playwright browser server is stopped.\n");
    return;
  }
  const deadline = Date.now() + stopTimeoutMs;
  if (state.instanceId) await controlRequest(state, "stop");
  while (Date.now() < deadline) {
    const current = await readState();
    if (!current || current.instanceId !== state.instanceId) {
      process.stdout.write("Playwright browser server is stopped.\n");
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
  }
  if (!(await controlRequest(state, "health"))) {
    await deleteStaleState(state);
    process.stdout.write("Playwright browser server is stopped.\n");
    return;
  }
  throw new Error("Timed out waiting for the Playwright browser server to stop.");
}

async function showStatus() {
  const version = await getPlaywrightVersion();
  const inspected = await inspectState(await readState(), version);
  process.stdout.write(`${inspected.status}\n`);
  if (inspected.status === "stale") process.exitCode = 1;
}

async function runWithServer(command) {
  if (command.length === 0) throw new Error("Usage: run -- <command> [args...]");
  const version = await getPlaywrightVersion();
  const inspected = await inspectState(await readState(), version);
  if (inspected.status !== "running") {
    throw new Error(
      `Playwright browser server is ${inspected.status}; run pnpm test:browser:server:start before the test, and pnpm test:browser:server:stop when finished.`,
    );
  }
  const child = spawn(command[0], command.slice(1), {
    cwd: repoRoot,
    env: { ...process.env, PLAYWRIGHT_BROWSER_SERVER: "1" },
    stdio: "inherit",
    shell: false,
  });
  child.once("error", (error) => {
    process.stderr.write(`Unable to start command: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "__daemon") return runDaemon();
  if (command === "start" && args.length === 0) return startServer();
  if (command === "stop" && args.length === 0) return stopServer();
  if (command === "status" && args.length === 0) return showStatus();
  if (command === "run") {
    const commandIndex = args[0] === "--" ? 1 : 0;
    return runWithServer(args.slice(commandIndex));
  }
  throw new Error("Usage: playwright-browser-server.mjs <start|stop|status|run -- command...>");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
