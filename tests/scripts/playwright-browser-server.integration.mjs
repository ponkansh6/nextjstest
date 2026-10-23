// spec-ref: browser-mode-persistent-chromium-lifecycle
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const managerPath = path.join(repoRoot, "scripts/playwright-browser-server.mjs");
const timeoutMs = 120_000;

function runNode(args, env, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out running ${args[0]}`));
    }, timeout);
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr });
    });
  });
}

test(
  "persistent Chromium manager preserves one isolated server across connections and CLI runs",
  { timeout: timeoutMs },
  async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "playwright-browser-server-"));
    const statePath = path.join(stateDir, "state.json");
    const env = { ...process.env, PLAYWRIGHT_BROWSER_SERVER_STATE_DIR: stateDir };
    const logs = [];
    const command = async (...args) => {
      const result = await runNode([managerPath, ...args], env);
      logs.push(result.stdout, result.stderr);
      return result;
    };

    try {
      await writeFile(statePath, "{malformed");
      const malformedStatus = await command("status");
      assert.equal(malformedStatus.code, 1);
      assert.match(malformedStatus.stdout, /stale/);

      const coldStarts = await Promise.all([command("start"), command("start")]);
      for (const result of coldStarts) assert.equal(result.code, 0, result.stderr);
      const firstState = JSON.parse(await readFile(statePath, "utf8"));

      const repeatedStart = await command("start");
      assert.equal(repeatedStart.code, 0, repeatedStart.stderr);
      assert.equal(JSON.parse(await readFile(statePath, "utf8")).instanceId, firstState.instanceId);

      const browserA = await chromium.connect({ wsEndpoint: firstState.wsEndpoint });
      const browserB = await chromium.connect({ wsEndpoint: firstState.wsEndpoint });
      const contextA = await browserA.newContext();
      const contextB = await browserB.newContext();
      try {
        await contextA.addCookies([
          { name: "isolated", value: "context-a", url: "http://127.0.0.1/" },
        ]);
        await contextB.addCookies([
          { name: "isolated", value: "context-b", url: "http://127.0.0.1/" },
        ]);
        assert.equal((await contextA.cookies())[0].value, "context-a");
        assert.equal((await contextB.cookies())[0].value, "context-b");

        await browserA.close();
        assert.equal((await contextB.cookies())[0].value, "context-b");
      } finally {
        await contextA.close().catch(() => {});
        await contextB.close().catch(() => {});
        await browserB.close().catch(() => {});
      }

      const browserC = await chromium.connect({ wsEndpoint: firstState.wsEndpoint });
      try {
        const freshContext = await browserC.newContext();
        try {
          assert.deepEqual(await freshContext.cookies(), []);
        } finally {
          await freshContext.close();
        }
      } finally {
        await browserC.close();
      }

      const runChild = await command(
        "run",
        "--",
        process.execPath,
        "-e",
        'process.stdout.write(process.env.PLAYWRIGHT_BROWSER_SERVER || "missing")',
      );
      assert.equal(runChild.code, 0, runChild.stderr);
      assert.equal(runChild.stdout, "1");

      const nonzeroChild = await command("run", "--", process.execPath, "-e", "process.exit(23)");
      assert.equal(nonzeroChild.code, 23);

      const stopped = await command("stop");
      assert.equal(stopped.code, 0, stopped.stderr);
      assert.equal(await command("stop").then((result) => result.code), 0);
      await assert.rejects(readFile(statePath), { code: "ENOENT" });
      const afterStop = await command("run", "--", process.execPath, "-e", "process.exit(0)");
      assert.equal(afterStop.code, 1);
      assert.match(afterStop.stderr, /stopped/);

      const logged = logs.join("\n");
      assert.equal(logged.includes(firstState.wsEndpoint), false);
      assert.equal(logged.includes(firstState.controlToken), false);
    } finally {
      await command("stop").catch(() => {});
      await rm(stateDir, { recursive: true, force: true });
    }
  },
);
