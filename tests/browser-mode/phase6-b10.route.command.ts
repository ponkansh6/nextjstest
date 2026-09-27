import type { Locator, Page } from "@playwright/test";
import { devices } from "@playwright/test";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B10Id =
  | "p45-b-tooltip-dismiss-138-case01"
  | "p45-b-tooltip-dismiss-159-mobile-pixel-tooltip-escape-tooltip"
  | "p45-b-tooltip-dismiss-188-case01";

type ViewportPoint = { x: number; y: number };
type B10Observation = {
  id: Phase6B10Id;
  contextEvidence: {
    viewport: { width: number; height: number } | null;
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    touchPoints: number;
    userAgent: string;
  };
  cursorBefore?: number;
  cursorAfter?: number;
  tooltipVisibleAfterTap?: boolean;
  tooltipVisibleAfterEscape?: boolean;
  closeHiddenAfterEscape?: boolean;
  closeVisibleBeforeClose?: boolean;
  closeHiddenAfterClose?: boolean;
  closeHiddenAfterOutsideTap?: boolean;
  tooltipVisibleAfterRetap?: boolean;
};

async function stage<T>(
  id: Phase6B10Id,
  name: string,
  timeoutMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b10-stage] ${id} ${name} started (timeout ${timeoutMs}ms)`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action().then((result) => {
        console.info(`[phase6-b10-stage] ${id} ${name} completed in ${Date.now() - started}ms`);
        return result;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b10-stage] ${id} ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function findViewportBar(page: Page, chart: Locator): Promise<ViewportPoint> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");

  let lastError: unknown;
  for (let retry = 0; retry < 4; retry += 1) {
    try {
      const bars = chart.locator(".recharts-bar-rectangle");
      await bars.first().scrollIntoViewIfNeeded({ timeout: 5_000 });

      for (let index = 0; index < (await bars.count()); index += 1) {
        // Re-read the locator each time because Recharts can replace the SVG subtree.
        const bar = chart.locator(".recharts-bar-rectangle").nth(index);
        const box = await bar.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) continue;

        const point = { x: box.x + box.width * 0.5, y: box.y + box.height / 2 };
        if (
          point.x >= 0 &&
          point.x <= viewport.width &&
          point.y >= 0 &&
          point.y <= viewport.height
        ) {
          const hitsBar = await page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
            point,
          );
          if (hitsBar) return point;
        }
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error(
    `No actionable bar tap point is inside the viewport (${viewport.width}x${viewport.height}) after 4 retries`,
  );
}

async function openProductionPage(page: Page, id: Phase6B10Id): Promise<void> {
  await stage(id, "install shared fixture mount behavior", 5_000, () =>
    page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    }),
  );
  await stage(id, "navigate to production route", 30_000, async () => {
    await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, { timeout: 30_000 });
  });
  await stage(id, "wait for network idle", 20_000, () =>
    page.waitForLoadState("networkidle", { timeout: 15_000 }),
  );
}

export const inspectPhase6B10: BrowserCommand<[id: Phase6B10Id], B10Observation> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  // This is the mobile-pixel project's effective context: Pixel 7 viewport, touch, scale, and UA.
  const isolated = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await isolated.newPage();
  try {
    await openProductionPage(page, id);
    const contextEvidence = await stage(id, "record effective Pixel 7 touch context", 5_000, () =>
      page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        screen: { width: screen.width, height: screen.height },
        deviceScaleFactor: devicePixelRatio,
        touchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent,
      })),
    );
    const chart = page.getByTestId("spending-chart-nominal");
    const point = await stage(
      id,
      "find visible hit-tested nominal bar tap point (up to 4 retries)",
      45_000,
      () => findViewportBar(page, chart),
    );
    const cursor = page.locator(".recharts-tooltip-cursor");
    const tooltip = page.locator("[data-custom-tooltip]");
    const closeButton = page.getByRole("button", { name: "閉じる" });

    await stage(id, "touch tap hit-tested nominal bar", 10_000, () =>
      page.touchscreen.tap(point.x, point.y),
    );

    if (id === "p45-b-tooltip-dismiss-138-case01") {
      const cursorBefore = await stage(id, "count tooltip cursor after bar tap", 5_000, () =>
        cursor.count(),
      );
      await stage(id, "touch tap close button", 10_000, () => closeButton.tap({ timeout: 5_000 }));
      await stage(id, "wait for close button hidden after close tap", 7_000, () =>
        closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
      );
      const cursorAfter = await stage(id, "count tooltip cursor after close tap", 5_000, () =>
        cursor.count(),
      );
      return { id, contextEvidence, cursorBefore, cursorAfter, closeHiddenAfterClose: true };
    }

    if (id === "p45-b-tooltip-dismiss-159-mobile-pixel-tooltip-escape-tooltip") {
      await stage(id, "wait for custom tooltip visible after bar tap", 7_000, () =>
        tooltip.waitFor({ state: "visible", timeout: 5_000 }),
      );
      const tooltipVisibleAfterTap = await stage(
        id,
        "read custom tooltip visibility after tap",
        5_000,
        () => tooltip.isVisible(),
      );
      await stage(id, "press Escape", 10_000, () => page.keyboard.press("Escape"));
      await stage(id, "wait for tooltip hidden after Escape", 7_000, () =>
        tooltip.waitFor({ state: "hidden", timeout: 5_000 }),
      );
      await stage(id, "wait for close button hidden after Escape", 7_000, () =>
        closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
      );
      const closeHiddenAfterEscape = await stage(
        id,
        "read close button visibility after Escape",
        5_000,
        async () => !(await closeButton.isVisible()),
      );
      const tooltipVisibleAfterEscape = await stage(
        id,
        "read custom tooltip visibility after Escape",
        5_000,
        () => tooltip.isVisible(),
      );
      // No pointer movement or other action occurs between Escape and this same-coordinate retap.
      await stage(id, "immediately retap same nominal bar coordinate", 10_000, () =>
        page.touchscreen.tap(point.x, point.y),
      );
      await stage(id, "wait for custom tooltip visible after retap", 7_000, () =>
        tooltip.waitFor({ state: "visible", timeout: 5_000 }),
      );
      const tooltipVisibleAfterRetap = await stage(
        id,
        "read custom tooltip visibility after retap",
        5_000,
        () => tooltip.isVisible(),
      );
      return {
        id,
        contextEvidence,
        tooltipVisibleAfterTap,
        tooltipVisibleAfterEscape,
        closeHiddenAfterEscape,
        tooltipVisibleAfterRetap,
      };
    }

    const closeVisibleBeforeClose = await stage(
      id,
      "wait for close button visible after bar tap",
      7_000,
      async () => {
        await closeButton.waitFor({ state: "visible", timeout: 5_000 });
        return closeButton.isVisible();
      },
    );
    const cursorBefore = await stage(id, "count tooltip cursor before outside tap", 5_000, () =>
      cursor.count(),
    );
    const heading = page.getByRole("heading", { name: /消費支出（名目）/ }).first();
    await stage(id, "touch tap nominal chart heading outside chart", 10_000, () =>
      heading.tap({ timeout: 5_000 }),
    );
    await stage(id, "wait for close button hidden after outside tap", 7_000, () =>
      closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    const cursorAfter = await stage(id, "count tooltip cursor after outside tap", 5_000, () =>
      cursor.count(),
    );
    return {
      id,
      contextEvidence,
      cursorBefore,
      cursorAfter,
      closeVisibleBeforeClose,
      closeHiddenAfterOutsideTap: true,
    };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B10: (id: Phase6B10Id) => Promise<B10Observation>;
  }
}
