import type { Locator, Page } from "@playwright/test";
import { devices } from "@playwright/test";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { buildContextOptions, withIsolatedContext } from "./isolated-route-context";
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
  tooltipVisibleAfterClose?: boolean;
  tooltipVisibleAfterOutsideTap?: boolean;
  closeVisibleAfterRetap?: boolean;
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

async function findDrawerOverlayTapPoint(page: Page): Promise<ViewportPoint> {
  const result = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]');
    const popup = document.querySelector<HTMLElement>('[data-slot="drawer-popup"]');
    if (!overlay || !popup) {
      return { point: null, reason: `missing ${!overlay ? "Drawer overlay" : "Drawer popup"}` };
    }

    const overlayStyle = getComputedStyle(overlay);
    const overlayRect = overlay.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const visible =
      overlayStyle.display !== "none" &&
      overlayStyle.visibility !== "hidden" &&
      overlayStyle.pointerEvents !== "none" &&
      Number(overlayStyle.opacity) > 0 &&
      overlayRect.width > 0 &&
      overlayRect.height > 0;
    if (!visible) {
      return {
        point: null,
        reason: "Drawer overlay is not visible and hit-testable",
        overlayRect: {
          x: overlayRect.x,
          y: overlayRect.y,
          width: overlayRect.width,
          height: overlayRect.height,
        },
        overlayStyle: {
          display: overlayStyle.display,
          visibility: overlayStyle.visibility,
          pointerEvents: overlayStyle.pointerEvents,
          opacity: overlayStyle.opacity,
        },
      };
    }

    const left = Math.max(0, overlayRect.left);
    const right = Math.min(innerWidth, overlayRect.right);
    const top = Math.max(0, overlayRect.top);
    const bottom = Math.min(innerHeight, overlayRect.bottom);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const inset = 8;
    const candidates = [
      { x: centerX, y: top + inset },
      { x: centerX, y: bottom - inset },
      { x: left + inset, y: centerY },
      { x: right - inset, y: centerY },
      ...[0.2, 0.5, 0.8].flatMap((xRatio) =>
        [0.2, 0.5, 0.8].map((yRatio) => ({
          x: left + (right - left) * xRatio,
          y: top + (bottom - top) * yRatio,
        })),
      ),
    ];

    for (const point of candidates) {
      if (
        point.x < left ||
        point.x > right ||
        point.y < top ||
        point.y > bottom ||
        (point.x >= popupRect.left &&
          point.x <= popupRect.right &&
          point.y >= popupRect.top &&
          point.y <= popupRect.bottom)
      ) {
        continue;
      }
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit && (hit === overlay || overlay.contains(hit))) return { point };
    }

    return {
      point: null,
      reason: "No in-viewport point outside the Drawer popup hit-tests to the Drawer overlay",
      overlayRect: {
        x: overlayRect.x,
        y: overlayRect.y,
        width: overlayRect.width,
        height: overlayRect.height,
      },
      popupRect: {
        x: popupRect.x,
        y: popupRect.y,
        width: popupRect.width,
        height: popupRect.height,
      },
      viewport: { width: innerWidth, height: innerHeight },
      candidates,
    };
  });

  if (!result.point) {
    throw new Error(`Cannot find a safe Drawer overlay tap point: ${JSON.stringify(result)}`);
  }
  return result.point;
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
  return withIsolatedContext(browser, buildContextOptions(devices["Pixel 7"]), async (isolated) => {
    const page = await isolated.newPage();
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
      await stage(id, "wait for custom tooltip hidden after close tap", 7_000, () =>
        tooltip.waitFor({ state: "hidden", timeout: 5_000 }),
      );
      const tooltipVisibleAfterClose = await stage(
        id,
        "read custom tooltip visibility after close tap",
        5_000,
        () => tooltip.isVisible(),
      );
      const cursorAfter = await stage(id, "count tooltip cursor after close tap", 5_000, () =>
        cursor.count(),
      );
      return {
        id,
        contextEvidence,
        cursorBefore,
        cursorAfter,
        closeHiddenAfterClose: true,
        tooltipVisibleAfterClose,
      };
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
      const closeVisibleAfterRetap = await stage(
        id,
        "read close button visibility after retap",
        5_000,
        () => closeButton.isVisible(),
      );
      return {
        id,
        contextEvidence,
        tooltipVisibleAfterTap,
        tooltipVisibleAfterEscape,
        closeHiddenAfterEscape,
        tooltipVisibleAfterRetap,
        closeVisibleAfterRetap,
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
    const outsideTapPoint = await stage(
      id,
      "find visible Drawer overlay point outside popup",
      5_000,
      () => findDrawerOverlayTapPoint(page),
    );
    await stage(id, "touch tap hit-tested Drawer overlay outside popup", 10_000, () =>
      page.touchscreen.tap(outsideTapPoint.x, outsideTapPoint.y),
    );
    await stage(id, "wait for close button hidden after outside tap", 7_000, () =>
      closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    await stage(id, "wait for custom tooltip hidden after outside tap", 7_000, () =>
      tooltip.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    const tooltipVisibleAfterOutsideTap = await stage(
      id,
      "read custom tooltip visibility after outside tap",
      5_000,
      () => tooltip.isVisible(),
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
      tooltipVisibleAfterOutsideTap,
    };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B10: (id: Phase6B10Id) => Promise<B10Observation>;
  }
}
