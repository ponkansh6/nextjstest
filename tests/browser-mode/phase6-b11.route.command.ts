import type { Locator, Page } from "@playwright/test";
import { devices } from "@playwright/test";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B11Id =
  | "p45-b-tooltip-dismiss-207-1"
  | "p45-b-tooltip-dismiss-249-case01"
  | "p45-b-tooltip-dismiss-284-case01";

type Point = { x: number; y: number };
type ContextEvidence = {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  deviceScaleFactor: number;
  touchPoints: number;
  userAgent: string;
};

async function stage<T>(
  id: Phase6B11Id,
  name: string,
  timeoutMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b11-stage] ${id} ${name} started (timeout ${timeoutMs}ms)`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action().then((result) => {
        console.info(`[phase6-b11-stage] ${id} ${name} completed in ${Date.now() - started}ms`);
        return result;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b11-stage] ${id} ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function findViewportBar(page: Page, chart: Locator): Promise<Point> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");

  let lastError: unknown;
  for (let retry = 0; retry < 4; retry += 1) {
    try {
      const bars = chart.locator(".recharts-bar-rectangle");
      await bars.first().scrollIntoViewIfNeeded({ timeout: 5_000 });
      for (let index = 0; index < (await bars.count()); index += 1) {
        // Re-read after count because Recharts can replace the SVG subtree.
        const bar = chart.locator(".recharts-bar-rectangle").nth(index);
        const box = await bar.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) continue;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (point.x < 0 || point.x > viewport.width || point.y < 0 || point.y > viewport.height)
          continue;
        const hitsBar = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
          point,
        );
        if (hitsBar) return point;
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

async function preparePage(page: Page, id: Phase6B11Id): Promise<ContextEvidence> {
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
  return stage(id, "record effective Pixel 7 touch context", 5_000, () =>
    page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      screen: { width: screen.width, height: screen.height },
      deviceScaleFactor: devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
    })),
  );
}

async function countCursor(page: Page, id: Phase6B11Id, action: string) {
  return stage(id, action, 5_000, () => page.locator(".recharts-tooltip-cursor").count());
}

export const inspectPhase6B11: BrowserCommand<[id: Phase6B11Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  const isolated = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await isolated.newPage();
  try {
    const contextEvidence = await preparePage(page, id);
    const nominalChart = page.getByTestId("spending-chart-nominal");
    const closeButton = page.getByRole("button", { name: "閉じる" });

    if (id === "p45-b-tooltip-dismiss-207-1") {
      const realChart = page.getByTestId("spending-chart-real");
      await stage(id, "scroll real-consumption chart into view before nominal tap", 15_000, () =>
        realChart.scrollIntoViewIfNeeded(),
      );
      const nominalPoint = await stage(
        id,
        "find hit-tested nominal bar point (up to 4 retries)",
        45_000,
        () => findViewportBar(page, nominalChart),
      );
      await stage(id, "touch tap nominal bar", 10_000, () =>
        page.touchscreen.tap(nominalPoint.x, nominalPoint.y),
      );
      await stage(id, "wait for close button visible after nominal tap", 7_000, () =>
        closeButton.waitFor({ state: "visible", timeout: 5_000 }),
      );
      const cursorAfterNominal = await countCursor(page, id, "count cursor after nominal tap");

      const realPoint = await stage(
        id,
        "find fresh hit-tested real bar point (up to 4 retries)",
        45_000,
        () => findViewportBar(page, realChart),
      );
      await stage(id, "touch tap real bar", 10_000, () =>
        page.touchscreen.tap(realPoint.x, realPoint.y),
      );
      await stage(id, "wait for close button visible after real tap", 7_000, () =>
        closeButton.waitFor({ state: "visible", timeout: 5_000 }),
      );
      const cursorAfterReal = await countCursor(page, id, "count global cursor after real tap");
      return {
        id,
        contextEvidence,
        cursorAfterNominal,
        closeVisibleAfterNominal: true,
        cursorAfterReal,
        closeVisibleAfterReal: true,
      };
    }

    if (id === "p45-b-tooltip-dismiss-249-case01") {
      const wrapper = nominalChart.locator(".recharts-wrapper");
      await stage(id, "scroll nominal recharts wrapper into view", 15_000, () =>
        wrapper.scrollIntoViewIfNeeded(),
      );
      const box = await stage(id, "read nominal wrapper bounding box", 5_000, () =>
        wrapper.boundingBox(),
      );
      if (!box) return { id, contextEvidence, gestureDispatched: false };

      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const client = await stage(id, "create Chrome DevTools Protocol session", 5_000, () =>
        page.context().newCDPSession(page),
      );
      await stage(id, "dispatch touchStart at wrapper center", 5_000, () =>
        client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: center.x, y: center.y }],
        }),
      );
      for (let index = 1; index <= 5; index += 1) {
        await stage(id, `dispatch touchMove ${index}/5`, 5_000, () =>
          client.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: center.x, y: center.y + index * 15 }],
          }),
        );
      }
      await stage(id, "dispatch touchEnd", 5_000, () =>
        client.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        }),
      );
      await stage(id, "wait for close button hidden at gesture end", 7_000, () =>
        closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
      );
      return { id, contextEvidence, gestureDispatched: true, closeHiddenAtGestureEnd: true };
    }

    const nominalPoint = await stage(
      id,
      "find hit-tested nominal bar point (up to 4 retries)",
      45_000,
      () => findViewportBar(page, nominalChart),
    );
    await stage(id, "touch tap nominal bar", 10_000, () =>
      page.touchscreen.tap(nominalPoint.x, nominalPoint.y),
    );
    await stage(id, "wait for close button visible after first tap", 7_000, () =>
      closeButton.waitFor({ state: "visible", timeout: 5_000 }),
    );
    await stage(id, "touch tap close button", 10_000, () => closeButton.tap({ timeout: 5_000 }));
    await stage(id, "wait for close button hidden after close tap", 7_000, () =>
      closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    const repeatPoint = await stage(
      id,
      "find fresh actionable nominal bar point (up to 4 retries)",
      45_000,
      () => findViewportBar(page, nominalChart),
    );
    await stage(id, "touch tap fresh nominal bar point", 10_000, () =>
      page.touchscreen.tap(repeatPoint.x, repeatPoint.y),
    );
    await stage(id, "wait for close button visible after retap", 7_000, () =>
      closeButton.waitFor({ state: "visible", timeout: 5_000 }),
    );
    return {
      id,
      contextEvidence,
      closeVisibleAfterFirstTap: true,
      closeHiddenAfterCloseTap: true,
      closeVisibleAfterRetap: true,
    };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B11: (id: Phase6B11Id) => Promise<unknown>;
  }
}
