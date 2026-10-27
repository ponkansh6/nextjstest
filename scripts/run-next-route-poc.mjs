import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  PIXEL7_BROWSER_MODE_FULL_NAMES,
  PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
} from "./browser-mode-case-manifest.mjs";
import { preserveBrowserModeReport } from "./browser-mode-report-output.mjs";
import { assertBrowserModeProjectPassed } from "./browser-mode-report-validation.mjs";
import { assertBrowserRouteBuildCurrent } from "./browser-route-build-fingerprint.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_CLI = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
const VITEST_CLI = path.join(PROJECT_ROOT, "node_modules", "vitest", "vitest.mjs");
const HOST = "127.0.0.1";
const DEFAULT_VITEST_TIMEOUT_MS = 15 * 60 * 1_000;
const CHILD_KILL_GRACE_MS = 5_000;
const BROWSER_API_PORT_START = 63_000;
const BROWSER_API_PORT_END = 63_999;
const BUILD_ID = path.join(PROJECT_ROOT, ".next", "BUILD_ID");
const CTI_ARTIFACT_ROOT = path.join(PROJECT_ROOT, "data", "source", "official-cti-2025-long-term");
const VITEST_CONFIG = "tests/config/browser/vitest.browser.config.ts";
function parseRunnerArgs(args) {
  const profileJson = args.includes("--profile-json");
  const projects = args.filter((arg) => arg.startsWith("--project="));
  const unknown = args.filter((arg) => arg !== "--profile-json" && !arg.startsWith("--project="));
  if (unknown.length || projects.length > 1)
    throw new Error("Usage: node scripts/run-next-route-poc.mjs --project=pixel7 [--profile-json]");
  const project = projects[0]?.slice("--project=".length) ?? "pixel7";
  if (project !== "pixel7")
    throw new Error("The production route runner accepts only the pixel7 project.");
  return { config: VITEST_CONFIG, project, profileJson };
}

function createProfileJsonOutputs(configs) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${randomUUID()}`;
  const directory = path.join(PROJECT_ROOT, "results", "plan45", "phase6", `profile-${runId}`);
  mkdirSync(directory, { recursive: true });
  return configs.map((config) => ({
    config,
    file: path.join(directory, `${path.basename(config, ".config.ts")}.json`),
  }));
}

function parsePort(rawPort) {
  if (rawPort !== undefined && !/^\d+$/.test(rawPort)) {
    throw new Error("NEXT_ROUTE_POC_PORT must be an integer between 1024 and 65535.");
  }
  const port = rawPort === undefined ? undefined : Number(rawPort);
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error("NEXT_ROUTE_POC_PORT must be an integer between 1024 and 65535.");
  }
  if (port !== undefined && port !== 3001)
    throw new Error("NEXT_ROUTE_POC_PORT may only be set to the approved 127.0.0.1 port 3001.");
  return port;
}

async function allocateLoopbackPort() {
  throwIfInterrupted();
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("Could not allocate a loopback port for the Next route PoC.");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  throwIfInterrupted();
  return address.port;
}

async function isLoopbackPortAvailable(port) {
  throwIfInterrupted();
  const server = createServer();
  const available = await new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.listen(port, HOST, () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
  throwIfInterrupted();
  return available;
}

async function allocateRunLocalBrowserApiPorts(configs) {
  const rangeSize = BROWSER_API_PORT_END - BROWSER_API_PORT_START + 1;
  const ports = [];
  const used = new Set();
  const base = (process.pid * 31 + Date.now()) % rangeSize;

  for (let configIndex = 0; configIndex < configs.length; configIndex += 1) {
    throwIfInterrupted();
    let selected;
    for (let offset = 0; offset < rangeSize; offset += 1) {
      const candidate = BROWSER_API_PORT_START + ((base + configIndex * 97 + offset) % rangeSize);
      if (used.has(candidate)) continue;
      if (await isLoopbackPortAvailable(candidate)) {
        selected = candidate;
        break;
      }
    }
    throwIfInterrupted();
    if (selected === undefined) {
      throw new Error("Could not allocate an unused Browser Mode API port for the full run.");
    }
    used.add(selected);
    ports.push(selected);
  }
  return ports;
}

function appendOutput(current, chunk) {
  return `${current}${chunk.toString()}`.slice(-8_000);
}

const activeChildren = new Set();
const childStopTasks = new WeakMap();

function signalChildGroup(child, signal) {
  try {
    if (process.platform !== "win32" && child.pid && child.spawnargs) {
      process.kill(-child.pid, signal);
    } else if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function childGroupExists(child) {
  if (process.platform === "win32" || !child.pid || !child.spawnargs) {
    return child.exitCode === null && child.signalCode === null;
  }
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return Promise.race([new Promise((resolve) => child.once("close", resolve)), delay(timeoutMs)]);
}

function stopChild(child) {
  if (childStopTasks.has(child)) return childStopTasks.get(child);
  const task = (async () => {
    signalChildGroup(child, "SIGTERM");
    const deadline = Date.now() + CHILD_KILL_GRACE_MS;
    while (childGroupExists(child) && Date.now() < deadline) await delay(100);
    if (childGroupExists(child)) signalChildGroup(child, "SIGKILL");
    await waitForChildClose(child, 1_000);
    activeChildren.delete(child);
  })();
  childStopTasks.set(child, task);
  return task;
}

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
  });
  activeChildren.add(child);
  child.once("close", () => activeChildren.delete(child));
  return child;
}

function parseVitestTimeout(rawValue) {
  if (rawValue === undefined) return DEFAULT_VITEST_TIMEOUT_MS;
  if (!/^\d+$/.test(rawValue) || Number(rawValue) < 1) {
    throw new Error("NEXT_ROUTE_POC_VITEST_TIMEOUT_MS must be a positive integer in milliseconds.");
  }
  return Number(rawValue);
}

let receivedSignal;
const shutdownController = new AbortController();
function throwIfInterrupted() {
  if (!shutdownController.signal.aborted) return;
  const error = new Error(`Interrupted by ${receivedSignal ?? "shutdown signal"}.`);
  error.code = receivedSignal === "SIGINT" ? 130 : 143;
  throw error;
}

function handleSignal(signal) {
  if (receivedSignal) return;
  receivedSignal = signal;
  shutdownController.abort(signal);
  const exitCode = signal === "SIGINT" ? 130 : 143;
  void Promise.allSettled([...activeChildren].map(stopChild)).then((results) => {
    for (const result of results) {
      if (result.status === "rejected")
        console.error(`[browser-mode] cleanup failed after ${signal}: ${result.reason}`);
    }
    process.exitCode = exitCode;
  });
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

function vitestExitCode(code, signal) {
  if (code !== null) return code;
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 1;
}

function isAddressInUse(output) {
  return /EADDRINUSE|address already in use|port .* already in use/i.test(output);
}

async function startNextServer(port) {
  throwIfInterrupted();
  const baseUrl = `http://${HOST}:${port}`;
  const child = spawnManaged(
    process.execPath,
    [NEXT_CLI, "start", "--hostname", HOST, "--port", String(port)],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, CTI_BASIC_ARTIFACT_ROOT: CTI_ARTIFACT_ROOT },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let spawnError;
  let exitInfo;
  child.stdout?.on("data", (chunk) => (output = appendOutput(output, chunk)));
  child.stderr?.on("data", (chunk) => (output = appendOutput(output, chunk)));
  child.once("error", (error) => (spawnError = error));
  child.once("close", (code, signal) => (exitInfo = { code, signal }));

  const deadline = Date.now() + 60_000;
  try {
    while (Date.now() < deadline) {
      throwIfInterrupted();
      if (spawnError) throw new Error(`Could not start Next.js: ${spawnError.message}`);
      if (exitInfo) {
        const error = new Error(`next start exited before route readiness. ${output}`);
        error.code = isAddressInUse(output) ? "EADDRINUSE" : "NEXT_START_EXIT";
        throw error;
      }

      try {
        const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_500) });
        throwIfInterrupted();
        if (response.ok && (await response.text()).includes("物価・賃金・消費の推移")) {
          // Allow an immediately competing listener to surface as EADDRINUSE
          // before accepting the route as served by this child.
          await delay(200);
          throwIfInterrupted();
          if (exitInfo) {
            const error = new Error(`next start exited during readiness. ${output}`);
            error.code = isAddressInUse(output) ? "EADDRINUSE" : "NEXT_START_EXIT";
            throw error;
          }
          return { child, port };
        }
      } catch (error) {
        if (shutdownController.signal.aborted) throw error;
        if (error?.code === "EADDRINUSE" || error?.code === "NEXT_START_EXIT") throw error;
        // The route is not ready yet; retry until the fixed deadline.
      }
      await delay(250);
    }
    throw new Error(`next start did not serve the expected dashboard before timeout. ${output}`);
  } catch (error) {
    try {
      await stopChild(child);
    } catch (cleanupError) {
      console.error(
        `[browser-mode] Next cleanup failed after startup error: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
      );
    }
    throw error;
  }
}

async function startWithAvailablePort(explicitPort) {
  const attempts = explicitPort === undefined ? 8 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfInterrupted();
    const port = explicitPort ?? (await allocateLoopbackPort());
    throwIfInterrupted();
    try {
      return await startNextServer(port);
    } catch (error) {
      if (error.code !== "EADDRINUSE" || explicitPort !== undefined || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw new Error("Could not start the Next route PoC after allocating fresh loopback ports.");
}

function runVitestConfig(port, config, project, timeoutMs, browserApiPort, profileJsonPath) {
  return new Promise((resolve, reject) => {
    try {
      throwIfInterrupted();
    } catch (error) {
      reject(error);
      return;
    }
    const startedAt = Date.now();
    const reportPath = path.join(
      os.tmpdir(),
      `next-route-report-${process.pid}-${randomUUID()}.json`,
    );
    console.log(`[browser-mode] start ${config}`);
    const childEnv = { ...process.env, NEXT_ROUTE_POC_PORT: String(port) };
    childEnv.VITEST_BROWSER_API_PORT = String(browserApiPort);
    const vitestArgs = [
      VITEST_CLI,
      "run",
      "--config",
      config,
      `--project=${project}`,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${reportPath}`,
    ];
    if (profileJsonPath) console.log(`[browser-mode] JSON profile ${config} -> ${profileJsonPath}`);
    const child = spawnManaged(process.execPath, vitestArgs, {
      cwd: PROJECT_ROOT,
      env: childEnv,
      stdio: "inherit",
    });
    let settled = false;
    let timedOut = false;
    const finish = async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      let finalCode = code;
      if (existsSync(reportPath) && process.env.BROWSER_MODE_REPORT_PATH) {
        try {
          await preserveBrowserModeReport(reportPath, process.env.BROWSER_MODE_REPORT_PATH);
        } catch (error) {
          console.error(
            `[browser-mode] could not preserve requested Vitest JSON report: ${error instanceof Error ? error.message : error}`,
          );
          finalCode = 1;
        }
      }
      if (code === 0) {
        try {
          const report = JSON.parse(readFileSync(reportPath, "utf8"));
          const fullNames = assertBrowserModeProjectPassed(
            report,
            "tests/browser-mode/pixel7.browser.test.tsx",
            PIXEL7_BROWSER_MODE_FULL_NAMES,
            PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
          );
          console.log(
            `[browser-mode] validated ${fullNames.length} pixel7 cases: ${JSON.stringify(fullNames)}`,
          );
          if (profileJsonPath)
            writeFileSync(profileJsonPath, `${JSON.stringify(report, null, 2)}\n`);
        } catch (error) {
          console.error(
            `[browser-mode] could not verify the full ${project} project: ${error instanceof Error ? error.message : error}`,
          );
          finalCode = 1;
        }
      }
      try {
        rmSync(reportPath, { force: true });
      } catch (error) {
        console.error(
          `[browser-mode] could not remove temporary Vitest report: ${error instanceof Error ? error.message : error}`,
        );
      }
      console.log(
        `[browser-mode] finish ${config} elapsed=${((Date.now() - startedAt) / 1_000).toFixed(2)}s exit=${finalCode}`,
      );
      resolve(finalCode);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(
        `[browser-mode] timeout ${config} after ${timeoutMs}ms; terminating process group`,
      );
      void stopChild(child).then(
        () => finish(124),
        (error) => {
          console.error(`[browser-mode] cleanup failed after timeout: ${error}`);
          finish(124);
        },
      );
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("close", (code, signal) => {
      void finish(timedOut ? 124 : vitestExitCode(code, signal));
    });
  });
}

async function runVitest(port, config, project, timeoutMs, profileJson) {
  throwIfInterrupted();
  const configs = [config];
  const browserApiPorts = await allocateRunLocalBrowserApiPorts(configs);
  const profileOutputs = profileJson ? createProfileJsonOutputs(configs) : [];
  throwIfInterrupted();
  const profileJsonPath = profileOutputs.find((output) => output.config === config)?.file;
  return runVitestConfig(port, config, project, timeoutMs, browserApiPorts[0], profileJsonPath);
}

async function main() {
  throwIfInterrupted();
  const { config, project, profileJson } = parseRunnerArgs(process.argv.slice(2));
  if (!existsSync(BUILD_ID))
    throw new Error("Next route tests require a production build. Run `pnpm run build` first.");
  await assertBrowserRouteBuildCurrent();

  const explicitPort = parsePort(process.env.NEXT_ROUTE_POC_PORT);
  const vitestTimeoutMs = parseVitestTimeout(process.env.NEXT_ROUTE_POC_VITEST_TIMEOUT_MS);
  throwIfInterrupted();
  const server = await startWithAvailablePort(explicitPort);
  let primaryError;
  try {
    process.exitCode = await runVitest(server.port, config, project, vitestTimeoutMs, profileJson);
  } catch (error) {
    primaryError = error;
  }
  try {
    await stopChild(server.child);
  } catch (cleanupError) {
    console.error(
      `[browser-mode] Next server cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
    );
    if (!primaryError) primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
