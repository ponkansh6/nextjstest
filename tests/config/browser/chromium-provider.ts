import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { playwright, type PlaywrightProviderOptions } from "@vitest/browser-playwright";

const repoRoot = path.resolve(__dirname, "../../..");
const stateDir = process.env.PLAYWRIGHT_BROWSER_SERVER_STATE_DIR
  ? path.resolve(repoRoot, process.env.PLAYWRIGHT_BROWSER_SERVER_STATE_DIR)
  : path.join(repoRoot, ".cache/playwright-browser-server");
const statePath = path.join(stateDir, "state.json");
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
const playwrightVersion = (requireFromRepo("@playwright/test/package.json") as { version: string })
  .version;

interface BrowserServerState {
  pid: number;
  instanceId: string;
  wsEndpoint: string;
  playwrightVersion: string;
  browserName: "chromium";
}

function readBrowserServerState(): BrowserServerState {
  let parsedState: unknown;
  try {
    parsedState = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
  } catch {
    throw new Error(
      `PLAYWRIGHT_BROWSER_SERVER=1 requires a valid browser server state at ${statePath}. Start it with pnpm test:browser:server:start and stop it with pnpm test:browser:server:stop.`,
    );
  }

  if (typeof parsedState !== "object" || parsedState === null || Array.isArray(parsedState)) {
    throw new Error(
      `Invalid Playwright browser server state at ${statePath}. Start it with pnpm test:browser:server:start and stop it with pnpm test:browser:server:stop.`,
    );
  }

  const state = parsedState as Partial<BrowserServerState>;
  let endpoint: URL;
  try {
    endpoint = new URL(state.wsEndpoint ?? "");
  } catch {
    throw new Error(
      `Invalid Playwright browser server state at ${statePath}. Start it with pnpm test:browser:server:start and stop it with pnpm test:browser:server:stop.`,
    );
  }

  if (
    !Number.isSafeInteger(state.pid) ||
    state.pid! <= 0 ||
    typeof state.instanceId !== "string" ||
    state.instanceId.length === 0 ||
    state.browserName !== "chromium" ||
    state.playwrightVersion !== playwrightVersion ||
    !["ws:", "wss:"].includes(endpoint.protocol) ||
    endpoint.hostname !== "127.0.0.1"
  ) {
    const reason =
      state.playwrightVersion !== playwrightVersion
        ? `Playwright version mismatch (state: ${String(state.playwrightVersion)}, current: ${playwrightVersion})`
        : "invalid state fields or non-loopback WebSocket endpoint";
    throw new Error(
      `Cannot use Playwright browser server: ${reason}. Start it with pnpm test:browser:server:start and stop it with pnpm test:browser:server:stop.`,
    );
  }

  return state as BrowserServerState;
}

export function chromiumPlaywrightProvider(options: PlaywrightProviderOptions = {}) {
  if (process.env.PLAYWRIGHT_BROWSER_SERVER !== "1") {
    return playwright(options);
  }

  const state = readBrowserServerState();
  return playwright({
    ...options,
    connectOptions: { ...options.connectOptions, wsEndpoint: state.wsEndpoint, timeout: 10_000 },
  });
}
