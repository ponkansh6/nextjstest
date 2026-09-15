import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = resolve(root, "artifacts/cache-and-e2e-measurement.json");
const fixture = resolve(root, "tests/fixtures/cache-measure-loader.ts");
const SERVER_TIMEOUT_MS = 90_000;
const CLEANUP_TIMEOUT_MS = 5_000;

function help() {
  console.log(`Usage: node scripts/measure-cache-and-e2e.mjs [options]

Measures the existing test cache helper and, when .next exists, a managed Next
server lifecycle. It does not build the app or run the full Playwright suite.

Options:
  --output <file>          JSON artifact path (default: ${defaultOutput})
  --port <number>          E2E server port (default: an isolated free port)
  --e2e-command <json>     Optional JSON argv array to run while the server is ready
  --skip-cache             Do not run the cache fixture
  --skip-server            Do not start a Next server
  --help                   Show this help
`);
}

function parseArgs(argv) {
  const options = {
    output: defaultOutput,
    port: null,
    e2eCommand: null,
    skipCache: false,
    skipServer: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--skip-cache") options.skipCache = true;
    else if (arg === "--skip-server") options.skipServer = true;
    else if (arg === "--output") options.output = resolve(root, argv[++index]);
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--e2e-command") {
      const value = argv[++index];
      try {
        options.e2eCommand = JSON.parse(value);
      } catch {
        throw new Error("--e2e-command must be a JSON array of argv strings");
      }
      if (
        !Array.isArray(options.e2eCommand) ||
        options.e2eCommand.length === 0 ||
        options.e2eCommand.some((part) => typeof part !== "string" || part.length === 0)
      ) {
        throw new Error("--e2e-command must be a non-empty JSON array of non-empty strings");
      }
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (
    options.port !== null &&
    (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
  ) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  if (options.e2eCommand && options.skipServer)
    throw new Error("--e2e-command cannot be used with --skip-server");
  const outputRelativeToRoot = relative(root, options.output);
  const outputRelativeToTmp = relative(resolve(tmpdir()), options.output);
  const allowed = (candidate) =>
    candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate));
  if (!allowed(outputRelativeToRoot) && !allowed(outputRelativeToTmp)) {
    throw new Error("--output must be inside the repository root or OS temporary directory");
  }
  return options;
}

function runCacheFixture() {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "pnpm",
      ["exec", "tsx", fixture],
      { cwd: root, env: { ...process.env, VITEST: "1" } },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`cache fixture failed: ${error.message}\n${stderr}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(stdout));
        } catch (parseError) {
          reject(
            new Error(`cache fixture returned invalid JSON: ${parseError.message}\n${stderr}`),
          );
        }
      },
    );
  });
}

function reservePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

function isPortOpen(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolvePromise(value);
    };
    socket.setTimeout(250, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function isProcessGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForReady(port, child) {
  const started = performance.now();
  while (performance.now() - started < SERVER_TIMEOUT_MS) {
    if (child.exitCode !== null)
      throw new Error(`server exited before readiness (code ${child.exitCode})`);
    if (await isPortOpen(port)) return Number((performance.now() - started).toFixed(3));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`server did not become ready within ${SERVER_TIMEOUT_MS}ms`);
}

async function stopManagedProcess(child) {
  const started = performance.now();
  const signals = { sigtermSent: false, sigkillSent: false };
  if (child?.pid && isProcessGroupAlive(child.pid)) {
    try {
      process.kill(-child.pid, "SIGTERM");
      signals.sigtermSent = true;
    } catch {}
    const deadline = performance.now() + CLEANUP_TIMEOUT_MS;
    while (performance.now() < deadline && isProcessGroupAlive(child.pid)) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    if (isProcessGroupAlive(child.pid)) {
      try {
        process.kill(-child.pid, "SIGKILL");
        signals.sigkillSent = true;
      } catch {}
      const killDeadline = performance.now() + 1_000;
      while (performance.now() < killDeadline && isProcessGroupAlive(child.pid)) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
    }
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  return {
    wallMs: Number((performance.now() - started).toFixed(3)),
    signals,
    pidResidual: Boolean(child?.pid && isProcessGroupAlive(child.pid)),
  };
}

async function writeArtifact(artifact, output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
}

async function measureE2E(options, onSignalComplete = async () => {}) {
  const tempDir = await mkdtemp(join(tmpdir(), "nextjstest-cache-e2e-"));
  const nextDir = join(root, ".next");
  let nextState;
  try {
    const nextStats = await stat(nextDir);
    const ageMs = Date.now() - nextStats.mtimeMs;
    nextState = {
      exists: true,
      mtime: new Date(nextStats.mtimeMs).toISOString(),
      ageMs,
      stale: ageMs > 24 * 60 * 60 * 1000,
    };
  } catch {
    nextState = { exists: false, stale: false };
  }
  let port;
  try {
    port = options.port ?? (await reservePort());
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
  const result = {
    tempDir,
    port,
    next: nextState,
    server: { status: "skipped" },
    test: { status: "skipped" },
    cleanup: null,
  };
  let serverChild;
  let testChild;
  let cleanupDone = false;
  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    const serverCleanup = await stopManagedProcess(serverChild);
    const testCleanup = await stopManagedProcess(testChild);
    const portResidual = await isPortOpen(port);
    result.cleanup = {
      ...serverCleanup,
      portResidual,
      server: { ...serverCleanup, portResidual },
      test: testCleanup,
    };
    await rm(tempDir, { recursive: true, force: true });
    result.tempDirCleaned = true;
  };
  const handleSignal = (signal) => {
    void cleanup()
      .then(() => onSignalComplete(result))
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  try {
    if (options.skipServer || !nextState.exists) {
      result.server.reason = options.skipServer ? "--skip-server" : "no .next build output";
      if (options.e2eCommand) throw new Error("cannot run --e2e-command without a server");
      return result;
    }
    const logPath = join(tempDir, "next-server.log");
    const logHandle = await import("node:fs/promises").then(({ open }) => open(logPath, "w"));
    serverChild = spawn("pnpm", ["start", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: root,
      detached: true,
      env: { ...process.env, E2E_PORT: String(port) },
      stdio: ["ignore", logHandle.fd, logHandle.fd],
    });
    await logHandle.close();
    const serverStarted = performance.now();
    try {
      if (await isPortOpen(port)) {
        throw new Error(`server port ${port} is already in use`);
      }
      const readyMs = await waitForReady(port, serverChild);
      result.server = { status: "ready", pid: serverChild.pid, startupMs: readyMs, logPath };
    } catch (error) {
      result.server = {
        status: "failed",
        pid: serverChild.pid,
        startupMs: Number((performance.now() - serverStarted).toFixed(3)),
        error: error.message,
        logPath,
      };
    }
    if (options.e2eCommand && result.server.status === "ready") {
      const testStarted = performance.now();
      const test = await new Promise((resolvePromise) => {
        const [command, ...args] = options.e2eCommand;
        testChild = spawn(command, args, {
          cwd: root,
          shell: false,
          detached: true,
          env: { ...process.env, E2E_PORT: String(port), BASE_URL: `http://127.0.0.1:${port}` },
          stdio: "inherit",
        });
        testChild.once("error", (error) =>
          resolvePromise({
            status: "failed",
            error: error.message,
            wallMs: Number((performance.now() - testStarted).toFixed(3)),
          }),
        );
        testChild.once("close", (code, signal) =>
          resolvePromise({
            status: code === 0 ? "passed" : "failed",
            exitCode: code,
            signal,
            wallMs: Number((performance.now() - testStarted).toFixed(3)),
          }),
        );
      });
      result.test = test;
    } else if (options.e2eCommand) {
      result.test = { status: "skipped", reason: "server failed to start" };
    }
  } finally {
    await cleanup();
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return help();
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cwd: root,
    options,
    cache: null,
    e2e: null,
  };
  if (!options.skipCache) artifact.cache = await runCacheFixture();
  artifact.e2e = await measureE2E(options, async (result) => {
    artifact.e2e = result;
    await writeArtifact(artifact, options.output);
  });
  await writeArtifact(artifact, options.output);
  console.log(`Measurement artifact written to ${options.output}`);
  if (artifact.e2e.server?.status === "failed" || artifact.e2e.test?.status === "failed") {
    process.exitCode = artifact.e2e.test?.status === "failed" ? artifact.e2e.test.exitCode || 1 : 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
