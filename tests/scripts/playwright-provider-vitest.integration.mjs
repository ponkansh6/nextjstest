// spec-ref: browser-mode-persistent-chromium-lifecycle
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stateDirPrefix = "playwright-provider-vitest-";
const testTimeoutMs = 300_000;
const componentTimeoutMs = 180_000;
const routeTimeoutMs = 180_000;

function spawnGeneric(command, args, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
      } else {
        child.kill("SIGTERM");
      }
      finish(reject, new Error(`Timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
    }, timeoutMs);
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      complete(value);
    };

    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code, signal) =>
      finish(resolve, { code: code ?? (signal ? 1 : 0), stdout, stderr }),
    );
  });
}

function safeLog(result, state) {
  return `${result.stdout}\n${result.stderr}`
    .replaceAll(state?.wsEndpoint ?? "\0", "[browser endpoint redacted]")
    .replaceAll(state?.controlToken ?? "\0", "[control token redacted]")
    .trim();
}

function assertCommandSucceeded(label, result, state) {
  assert.equal(
    result.code,
    0,
    `${label} exited with ${result.code}:
${safeLog(result, state)}`,
  );
}

async function readState(statePath) {
  return JSON.parse(await readFile(statePath, "utf8"));
}

test(
  "real Vitest Browser Mode runs through the persistent Chromium provider",
  { timeout: testTimeoutMs },
  async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), stateDirPrefix));
    const statePath = path.join(stateDir, "state.json");
    const env = { ...process.env, PLAYWRIGHT_BROWSER_SERVER_STATE_DIR: stateDir };
    let initialState;

    const run = (args, timeoutMs = 30_000) => spawnGeneric("pnpm", args, { env, timeoutMs });
    const checkRunningSameInstance = async (label) => {
      const state = await readState(statePath);
      assert.equal(
        state.instanceId,
        initialState.instanceId,
        `${label} replaced the server instance`,
      );
      assert.equal(state.pid, initialState.pid, `${label} replaced the server process`);
      const status = await run(["test:browser:server:status"]);
      assertCommandSucceeded(`${label} status`, status, state);
      assert.match(status.stdout, /running/, `${label} did not leave the server running`);
    };

    try {
      const started = await run(["test:browser:server:start"]);
      assertCommandSucceeded("persistent browser start", started);
      initialState = await readState(statePath);

      const standard = await run(
        ["test:browser:server:run", "--", "pnpm", "test:browser:standard"],
        componentTimeoutMs,
      );
      assertCommandSucceeded("standard Chromium Browser Mode suite", standard, initialState);
      await checkRunningSameInstance("standard Browser Mode suite");

      const focused = await run(
        [
          "test:browser:server:run",
          "--",
          "pnpm",
          "exec",
          "vitest",
          "run",
          "--config",
          "tests/config/browser/vitest.browser.config.ts",
          "tests/browser-mode/harness-isolation.browser.test.tsx",
        ],
        60_000,
      );
      assertCommandSucceeded(
        "focused persistent-provider Browser Mode test",
        focused,
        initialState,
      );
      await checkRunningSameInstance("focused Browser Mode test");

      if (process.env.PLAYWRIGHT_SERVER_VERIFY_ROUTES === "1") {
        const route = await run(
          ["test:browser:server:run", "--", "pnpm", "test:browser:phase6-b01:built"],
          routeTimeoutMs,
        );
        assertCommandSucceeded("built phase6-b01 production route test", route, initialState);
        await checkRunningSameInstance("production route test");
      }

      const stopped = await run(["test:browser:server:stop"]);
      assertCommandSucceeded("persistent browser stop", stopped, initialState);
      const status = await run(["test:browser:server:status"]);
      assertCommandSucceeded("stopped browser status", status, initialState);
      assert.match(status.stdout, /stopped/);
      await assert.rejects(readFile(statePath), { code: "ENOENT" });
    } finally {
      await run(["test:browser:server:stop"], 15_000).catch(() => {});
      await rm(stateDir, { recursive: true, force: true });
    }
  },
);
