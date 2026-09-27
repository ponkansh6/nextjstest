import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_CLI = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
const VITEST_CLI = path.join(PROJECT_ROOT, "node_modules", "vitest", "vitest.mjs");
const HOST = "127.0.0.1";
const BUILD_ID = path.join(PROJECT_ROOT, ".next", "BUILD_ID");
const CTI_ARTIFACT_ROOT = path.join(PROJECT_ROOT, "data", "source", "official-cti-2025-long-term");
const VITEST_CONFIGS = {
  all: [
    "vitest.browser.phase6-b01.config.ts",
    "vitest.browser.phase6-b02.config.ts",
    "vitest.browser.phase6-b03.config.ts",
    "vitest.browser.phase6-b04.config.ts",
    "vitest.browser.phase6-b05.config.ts",
    "vitest.browser.phase6-b06.config.ts",
    "vitest.browser.phase6-b07.config.ts",
    "vitest.browser.phase6-b08.config.ts",
    "vitest.browser.phase6-b09.config.ts",
    "vitest.browser.phase6-b10.config.ts",
    "vitest.browser.phase6-b11.config.ts",
    "vitest.browser.phase6-b12.config.ts",
    "vitest.browser.phase6-b13.config.ts",
    "vitest.browser.phase6-b14.config.ts",
    "vitest.browser.next-route.config.ts",
    "vitest.browser.webkit.config.ts",
  ],
  "phase6-b01": ["vitest.browser.phase6-b01.config.ts"],
  "phase6-b02": ["vitest.browser.phase6-b02.config.ts"],
  "phase6-b03": ["vitest.browser.phase6-b03.config.ts"],
  "phase6-b04": ["vitest.browser.phase6-b04.config.ts"],
  "phase6-b05": ["vitest.browser.phase6-b05.config.ts"],
  "phase6-b06": ["vitest.browser.phase6-b06.config.ts"],
  "phase6-b07": ["vitest.browser.phase6-b07.config.ts"],
  "phase6-b08": ["vitest.browser.phase6-b08.config.ts"],
  "phase6-b09": ["vitest.browser.phase6-b09.config.ts"],
  "phase6-b10": ["vitest.browser.phase6-b10.config.ts"],
  "phase6-b11": ["vitest.browser.phase6-b11.config.ts"],
  "phase6-b12": ["vitest.browser.phase6-b12.config.ts"],
  "phase6-b13": ["vitest.browser.phase6-b13.config.ts"],
  "phase6-b14": ["vitest.browser.phase6-b14.config.ts"],
};

function selectVitestConfigs(args) {
  if (args.length === 0) return VITEST_CONFIGS.all;
  if (args.length === 1 && args[0] === "--only=phase6-b01") return VITEST_CONFIGS["phase6-b01"];
  if (args.length === 1 && args[0] === "--only=phase6-b02") return VITEST_CONFIGS["phase6-b02"];
  if (args.length === 1 && args[0] === "--only=phase6-b03") return VITEST_CONFIGS["phase6-b03"];
  if (args.length === 1 && args[0] === "--only=phase6-b04") return VITEST_CONFIGS["phase6-b04"];
  if (args.length === 1 && args[0] === "--only=phase6-b05") return VITEST_CONFIGS["phase6-b05"];
  if (args.length === 1 && args[0] === "--only=phase6-b06") return VITEST_CONFIGS["phase6-b06"];
  if (args.length === 1 && args[0] === "--only=phase6-b07") return VITEST_CONFIGS["phase6-b07"];
  if (args.length === 1 && args[0] === "--only=phase6-b08") return VITEST_CONFIGS["phase6-b08"];
  if (args.length === 1 && args[0] === "--only=phase6-b09") return VITEST_CONFIGS["phase6-b09"];
  if (args.length === 1 && args[0] === "--only=phase6-b10") return VITEST_CONFIGS["phase6-b10"];
  if (args.length === 1 && args[0] === "--only=phase6-b11") return VITEST_CONFIGS["phase6-b11"];
  if (args.length === 1 && args[0] === "--only=phase6-b12") return VITEST_CONFIGS["phase6-b12"];
  if (args.length === 1 && args[0] === "--only=phase6-b13") return VITEST_CONFIGS["phase6-b13"];
  if (args.length === 1 && args[0] === "--only=phase6-b14") return VITEST_CONFIGS["phase6-b14"];
  throw new Error(
    "Usage: node scripts/run-next-route-poc.mjs [--only=phase6-b01|phase6-b02|phase6-b03|phase6-b04|phase6-b05|phase6-b06|phase6-b07|phase6-b08|phase6-b09|phase6-b10|phase6-b11|phase6-b12|phase6-b13|phase6-b14]",
  );
}

function parsePort(rawPort) {
  if (rawPort !== undefined && !/^\d+$/.test(rawPort)) {
    throw new Error("NEXT_ROUTE_POC_PORT must be an integer between 1024 and 65535.");
  }
  const port = rawPort === undefined ? undefined : Number(rawPort);
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error("NEXT_ROUTE_POC_PORT must be an integer between 1024 and 65535.");
  }
  return port;
}

async function allocateLoopbackPort() {
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
  return address.port;
}

function appendOutput(current, chunk) {
  return `${current}${chunk.toString()}`.slice(-8_000);
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(forceKillTimer);
      resolve();
    };
    child.once("exit", finish);
    const forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.kill("SIGTERM");
  });
}

function isAddressInUse(output) {
  return /EADDRINUSE|address already in use|port .* already in use/i.test(output);
}

async function startNextServer(port) {
  const baseUrl = `http://${HOST}:${port}`;
  const child = spawn(
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
      if (spawnError) throw new Error(`Could not start Next.js: ${spawnError.message}`);
      if (exitInfo) {
        const error = new Error(`next start exited before route readiness. ${output}`);
        error.code = isAddressInUse(output) ? "EADDRINUSE" : "NEXT_START_EXIT";
        throw error;
      }

      try {
        const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_500) });
        if (response.ok && (await response.text()).includes("物価・賃金・消費の推移")) {
          // Allow an immediately competing listener to surface as EADDRINUSE
          // before accepting the route as served by this child.
          await delay(200);
          if (exitInfo) {
            const error = new Error(`next start exited during readiness. ${output}`);
            error.code = isAddressInUse(output) ? "EADDRINUSE" : "NEXT_START_EXIT";
            throw error;
          }
          return { child, port };
        }
      } catch (error) {
        if (error?.code === "EADDRINUSE" || error?.code === "NEXT_START_EXIT") throw error;
        // The route is not ready yet; retry until the fixed deadline.
      }
      await delay(250);
    }
    throw new Error(`next start did not serve the expected dashboard before timeout. ${output}`);
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function startWithAvailablePort(explicitPort) {
  const attempts = explicitPort === undefined ? 8 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const port = explicitPort ?? (await allocateLoopbackPort());
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

function runVitestConfig(port, config) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [VITEST_CLI, "run", "--config", config], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NEXT_ROUTE_POC_PORT: String(port) },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function runVitest(port, configs) {
  for (const config of configs) {
    const code = await runVitestConfig(port, config);
    if (code !== 0) return code;
  }
  return 0;
}

async function main() {
  const configs = selectVitestConfigs(process.argv.slice(2));
  if (!existsSync(BUILD_ID)) {
    throw new Error("Next route PoC requires a production build. Run `pnpm run build` first.");
  }

  const explicitPort = parsePort(process.env.NEXT_ROUTE_POC_PORT);
  const server = await startWithAvailablePort(explicitPort);
  try {
    process.exitCode = await runVitest(server.port, configs);
  } finally {
    await stopChild(server.child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
