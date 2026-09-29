import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { desktop1280x720ContextOptions, withIsolatedContext } from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B08Id =
  | "p45-b-real-consumption-99-page-tsx-e2e-real-consumption-chart-with-actual-browser"
  | "p45-b-real-consumption-128-page-tsx-e2e-real-consumption-chart-with-actual-browser"
  | "p45-b-real-consumption-156-page-tsx-e2e-real-consumption-chart-with-actual-browser";

type Observation = Record<string, unknown>;

async function stage<T>(id: Phase6B08Id, name: string, action: () => Promise<T>): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b08-stage] ${id} ${name} started`);
  try {
    const result = await action();
    console.info(`[phase6-b08-stage] ${id} ${name} completed in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b08-stage] ${id} ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  }
}

async function preparePage(page: import("@playwright/test").Page, id: Phase6B08Id) {
  await stage(id, "install source fixture mount behavior", () =>
    page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    }),
  );
  await stage(id, "navigate to production route", async () => {
    await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, { timeout: 30_000 });
  });
  await stage(id, "wait for source fixture network idle", () =>
    page.waitForLoadState("networkidle", { timeout: 15_000 }),
  );
}

export const inspectPhase6B08: BrowserCommand<[id: Phase6B08Id], Observation> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  return withIsolatedContext(browser, desktop1280x720ContextOptions(), async (isolated) => {
    const page = await isolated.newPage();
    await preparePage(page, id);

    if (id.startsWith("p45-b-real-consumption-99-")) {
      const firstLegendItem = page.locator("[aria-pressed]").first();
      const visible = await stage(id, "check first page-global legend item visibility", () =>
        firstLegendItem.isVisible({ timeout: 10_000 }),
      );
      const clickCompleted = await stage(
        id,
        "attempt first legend click with source 5s timeout",
        async () => {
          try {
            await firstLegendItem.click({ timeout: 5_000 });
            return true;
          } catch {
            return false;
          }
        },
      );
      await stage(id, "wait source 500ms settle interval", () => page.waitForTimeout(500));
      return { visible, clickCompleted };
    }

    const realSection = page.locator("#section-consumption-real");
    await stage(id, "scroll real-consumption section into view", () =>
      realSection.scrollIntoViewIfNeeded({ timeout: 15_000 }),
    );
    await stage(id, "wait for real-consumption section visibility", () =>
      realSection.waitFor({ state: "visible", timeout: 15_000 }),
    );
    const sectionVisible = await stage(id, "read real-consumption section visibility", () =>
      realSection.isVisible(),
    );

    if (id.startsWith("p45-b-real-consumption-128-")) {
      const details = realSection.locator("details").first();
      const summary = realSection.locator("summary");
      const detailsCount = await stage(id, "count section accordion details", () =>
        details.count(),
      );
      const detailsOpen =
        detailsCount > 0
          ? await stage(id, "read closed accordion details state", () =>
              details.evaluate((element) => element.hasAttribute("open")),
            )
          : false;
      await stage(id, "wait for accordion summary visibility", () =>
        summary.waitFor({ state: "visible", timeout: 5_000 }),
      );
      const summaryVisible = await stage(id, "read accordion summary visibility", () =>
        summary.isVisible(),
      );
      const legendItemVisibility = await stage(
        id,
        "read section-local legend item visibility",
        async () => {
          const items = realSection.locator("[aria-pressed]");
          const count = await items.count();
          const visibility: boolean[] = [];
          for (let index = 0; index < count; index += 1)
            visibility.push(await items.nth(index).isVisible());
          return visibility;
        },
      );
      return { sectionVisible, summaryVisible, detailsCount, detailsOpen, legendItemVisibility };
    }

    const details = realSection.locator("details").first();
    const summary = realSection.locator("summary");
    await stage(id, "click accordion summary", () => summary.click({ timeout: 10_000 }));
    const detailsOpen = await stage(id, "read open accordion details state", () =>
      details.evaluate((element) => element.hasAttribute("open")),
    );
    const firstLegendItem = realSection.locator("[aria-pressed]").first();
    await stage(id, "wait for first section-local legend item visibility", () =>
      firstLegendItem.waitFor({ state: "visible", timeout: 10_000 }),
    );
    const firstLegendItemVisible = await stage(
      id,
      "read first section-local legend item visibility",
      () => firstLegendItem.isVisible(),
    );
    return { sectionVisible, detailsOpen, firstLegendItemVisible };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B08: (id: Phase6B08Id) => Promise<unknown>;
  }
}
