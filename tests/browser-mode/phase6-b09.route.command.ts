import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B09Id =
  "p45-b-real-consumption-174-page-tsx-e2e-real-consumption-chart-with-actual-browser";

async function stage<T>(name: string, action: () => Promise<T>): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b09-stage] ${name} started`);
  try {
    const result = await action();
    console.info(`[phase6-b09-stage] ${name} completed in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b09-stage] ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  }
}

export const inspectPhase6B09: BrowserCommand<[id: Phase6B09Id], unknown> = async ({
  context,
  provider,
}) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  const isolated = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await isolated.newPage();
  try {
    await stage("install source fixture mount behavior", () =>
      page.addInitScript(() => {
        (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
      }),
    );
    await stage("navigate to production route", async () => {
      await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, { timeout: 30_000 });
    });
    await stage("wait for network idle", () =>
      page.waitForLoadState("networkidle", { timeout: 15_000 }),
    );

    const realSection = page.locator("#section-consumption-real");
    await stage("scroll real-consumption section into view", () =>
      realSection.scrollIntoViewIfNeeded({ timeout: 15_000 }),
    );
    await stage("wait for real-consumption section visibility", () =>
      realSection.waitFor({ state: "visible", timeout: 15_000 }),
    );
    const sectionVisible = await stage("read real-consumption section visibility", () =>
      realSection.isVisible(),
    );

    const summary = realSection.locator("summary");
    await stage("wait for summary visibility", () =>
      summary.waitFor({ state: "visible", timeout: 5_000 }),
    );
    const summaryVisible = await stage("read summary visibility", () => summary.isVisible());
    return { sectionVisible, summaryVisible };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B09: (id: Phase6B09Id) => Promise<unknown>;
  }
}
