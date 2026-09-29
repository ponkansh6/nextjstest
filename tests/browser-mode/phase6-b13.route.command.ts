import { devices } from "@playwright/test";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";
import { buildContextOptions, withIsolatedContext } from "./isolated-route-context";

export type Phase6B13Id =
  | "p45-b-tooltip-dismiss-473-case01"
  | "p45-b-tooltip-dismiss-508-case01"
  | "p45-b-tooltip-dismiss-535-case01";

type ContextEvidence = {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  deviceScaleFactor: number;
  touchPoints: number;
  userAgent: string;
};

async function stage<T>(
  id: Phase6B13Id,
  name: string,
  timeoutMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b13-stage] ${id} ${name} started (timeout ${timeoutMs}ms)`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action().then((result) => {
        console.info(`[phase6-b13-stage] ${id} ${name} completed in ${Date.now() - started}ms`);
        return result;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b13-stage] ${id} ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function preparePage(
  page: import("@playwright/test").Page,
  id: Phase6B13Id,
): Promise<ContextEvidence> {
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

async function waitForScrollYToSettle(
  page: import("@playwright/test").Page,
  id: Phase6B13Id,
): Promise<number> {
  let previous = await page.evaluate(() => window.scrollY);
  let stableSamples = 0;
  let intervalIndex = 0;
  const started = Date.now();
  const intervals = [100, 200, 300];
  while (stableSamples < 2) {
    if (Date.now() - started >= 5_000) {
      throw new Error(
        `[phase6-b13-stage] ${id} scrollY did not settle after 5s (stableSamples=${stableSamples}, scrollY=${previous})`,
      );
    }
    await page.waitForTimeout(intervals[intervalIndex % intervals.length]!);
    intervalIndex += 1;
    const current = await page.evaluate(() => window.scrollY);
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
  }
  return stableSamples;
}

async function stackedWrapperTap(page: import("@playwright/test").Page, id: Phase6B13Id) {
  await stage(id, "navigate to stacked chart section", 15_000, async () => {
    await page.locator("#section-stacked").scrollIntoViewIfNeeded({ timeout: 10_000 });
  });
  const wrapper = page.locator("#section-stacked .recharts-wrapper").first();
  await stage(id, "wait for first stacked chart wrapper visible", 12_000, () =>
    wrapper.waitFor({ state: "visible", timeout: 10_000 }),
  );
  const box = await stage(id, "read first stacked chart wrapper bounding box", 5_000, () =>
    wrapper.boundingBox(),
  );
  if (!box) return { boxAvailable: false as const };
  await stage(id, "touch stacked wrapper center", 10_000, () =>
    page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2),
  );
  return { boxAvailable: true as const };
}

export const inspectPhase6B13: BrowserCommand<[id: Phase6B13Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  return withIsolatedContext(browser, buildContextOptions(devices["Pixel 7"]), async (isolated) => {
    const page = await isolated.newPage();
    const contextEvidence = await preparePage(page, id);
    const closeButton = page.getByRole("button", { name: "閉じる" });

    if (id === "p45-b-tooltip-dismiss-473-case01" || id === "p45-b-tooltip-dismiss-508-case01") {
      const tap = await stackedWrapperTap(page, id);
      if (!tap.boxAvailable) return { id, contextEvidence, boxAvailable: false };
      await stage(id, "wait for close button visible after stacked chart tap", 7_000, () =>
        closeButton.waitFor({ state: "visible", timeout: 5_000 }),
      );
      const activeDotCountAfterTap = await stage(
        id,
        "count active dots after stacked chart tap",
        5_000,
        () => page.locator(".recharts-active-dot").count(),
      );

      if (id === "p45-b-tooltip-dismiss-473-case01") {
        const cursorCountAfterTap = await stage(
          id,
          "count cursor after stacked chart tap",
          5_000,
          () => page.locator(".recharts-tooltip-cursor").count(),
        );
        const heading = page.getByRole("heading", { name: /費目別寄与度/ }).first();
        await stage(id, "touch stacked chart heading outside wrapper", 10_000, () =>
          heading.tap({ timeout: 5_000 }),
        );
        await stage(id, "wait for close button hidden after heading touch", 7_000, () =>
          closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
        );
        const cursorCountAfterDismiss = await stage(
          id,
          "count cursor after heading touch",
          5_000,
          () => page.locator(".recharts-tooltip-cursor").count(),
        );
        const activeDotCountAfterDismiss = await stage(
          id,
          "count active dots after heading touch",
          5_000,
          () => page.locator(".recharts-active-dot").count(),
        );
        return {
          id,
          contextEvidence,
          boxAvailable: true,
          closeVisibleAfterTap: true,
          cursorCountAfterTap,
          activeDotCountAfterTap,
          closeHiddenAfterHeadingTouch: true,
          cursorCountAfterDismiss,
          activeDotCountAfterDismiss,
        };
      }

      await stage(id, "touch close button", 10_000, () => closeButton.tap({ timeout: 5_000 }));
      await stage(id, "wait for close button hidden after close touch", 7_000, () =>
        closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
      );
      const activeDotCountAfterClose = await stage(
        id,
        "count active dots after close touch",
        5_000,
        () => page.locator(".recharts-active-dot").count(),
      );
      return {
        id,
        contextEvidence,
        boxAvailable: true,
        closeVisibleAfterTap: true,
        activeDotCountAfterTap,
        closeHiddenAfterCloseTouch: true,
        activeDotCountAfterClose,
      };
    }

    const cpiWrapper = page.locator("#section-cpi-major .recharts-wrapper").first();
    await stage(id, "scroll CPI-major wrapper into view", 15_000, () =>
      cpiWrapper.scrollIntoViewIfNeeded({ timeout: 10_000 }),
    );
    const tabButton = page.getByRole("button", { name: "給与", exact: true });
    await stage(id, "touch salary tab", 10_000, () => tabButton.tap({ timeout: 8_000 }));

    // Source behavior reads the moving wrapper immediately after the tab touch.
    const box = await stage(
      id,
      "immediately read CPI wrapper bounding box after tab touch",
      5_000,
      () => cpiWrapper.boundingBox(),
    );
    let gestureDispatched = false;
    if (box) {
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const client = await stage(id, "create CDP session for in-flight tab gesture", 5_000, () =>
        page.context().newCDPSession(page),
      );
      await stage(id, "dispatch touchStart at immediate CPI wrapper center", 5_000, () =>
        client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: center.x, y: center.y }],
        }),
      );
      await stage(id, "dispatch touchEnd at CPI wrapper", 5_000, () =>
        client.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        }),
      );
      gestureDispatched = true;
    }
    await stage(id, "wait for close button hidden after optional wrapper touch", 7_000, () =>
      closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    const stableSamples = await stage(
      id,
      "wait for scrollY to settle with two stable samples",
      5_200,
      () => waitForScrollYToSettle(page, id),
    );
    await stage(id, "wait for close button hidden after scroll settles", 7_000, () =>
      closeButton.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    return {
      id,
      contextEvidence,
      wrapperBoxAvailable: box !== null,
      gestureDispatched,
      stableSamples,
      closeHiddenAfterGesture: true,
      closeHiddenAfterSettle: true,
    };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B13: (id: Phase6B13Id) => Promise<unknown>;
  }
}
