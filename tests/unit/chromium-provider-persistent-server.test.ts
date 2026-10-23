// spec-ref: browser-mode-persistent-chromium-lifecycle
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const providerMock = vi.hoisted(() => vi.fn((options: unknown) => ({ options })));
vi.mock("@vitest/browser-playwright", () => ({ playwright: providerMock }));

const requireFromRepo = createRequire(path.join(process.cwd(), "package.json"));
const playwrightVersion = (requireFromRepo("@playwright/test/package.json") as { version: string })
  .version;
const fixtureRoots: string[] = [];

async function stateFixture(value: unknown) {
  const root = await mkdtemp(path.join(os.tmpdir(), "chromium-provider-state-"));
  fixtureRoots.push(root);
  await writeFile(path.join(root, "state.json"), JSON.stringify(value));
  vi.stubEnv("PLAYWRIGHT_BROWSER_SERVER_STATE_DIR", root);
  vi.stubEnv("PLAYWRIGHT_BROWSER_SERVER", "1");
}

async function loadProvider() {
  vi.resetModules();
  return import("../../tests/config/browser/chromium-provider");
}

function validState(overrides: Record<string, unknown> = {}) {
  return {
    pid: 123,
    instanceId: "fixture-instance",
    wsEndpoint: "ws://127.0.0.1:12345/fixture",
    playwrightVersion,
    browserName: "chromium",
    ...overrides,
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("persistent Chromium provider configuration", () => {
  it("uses the normal launch provider when persistent mode is not opted into", async () => {
    vi.stubEnv("PLAYWRIGHT_BROWSER_SERVER", "");
    const { chromiumPlaywrightProvider } = await loadProvider();
    const options = { launchOptions: { headless: true } };

    expect(chromiumPlaywrightProvider(options)).toEqual({ options });
    expect(providerMock).toHaveBeenCalledWith(options);
  });

  it.each([
    ["missing state", null],
    ["nonobject state", []],
    ["version mismatch", validState({ playwrightVersion: "0.0.0" })],
    ["non-loopback endpoint", validState({ wsEndpoint: "ws://192.0.2.10:12345/fixture" })],
  ])("fails closed for %s instead of silently launching another browser", async (_case, state) => {
    if (state !== null) await stateFixture(state);
    else {
      const root = await mkdtemp(path.join(os.tmpdir(), "chromium-provider-state-"));
      fixtureRoots.push(root);
      vi.stubEnv("PLAYWRIGHT_BROWSER_SERVER_STATE_DIR", root);
      vi.stubEnv("PLAYWRIGHT_BROWSER_SERVER", "1");
    }
    const { chromiumPlaywrightProvider } = await loadProvider();

    expect(() => chromiumPlaywrightProvider()).toThrow(/browser server/i);
    expect(providerMock).not.toHaveBeenCalled();
  });

  it("connects to the validated endpoint and keeps caller provider options", async () => {
    await stateFixture(validState());
    const { chromiumPlaywrightProvider } = await loadProvider();
    const options = {
      launchOptions: { headless: true },
      connectOptions: { wsEndpoint: "ws://127.0.0.1:1/overridden", slowMo: 10 },
    };

    chromiumPlaywrightProvider(options);

    expect(providerMock).toHaveBeenCalledWith({
      ...options,
      connectOptions: {
        slowMo: 10,
        wsEndpoint: "ws://127.0.0.1:12345/fixture",
        timeout: 10_000,
      },
    });
  });
});
