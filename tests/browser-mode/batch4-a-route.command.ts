import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { devices } from "@playwright/test";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Batch4ARouteCase =
  | "earnings-readability-375"
  | "earnings-readability-430"
  | "sticky-tabs-transform"
  | "document-overflow-320"
  | "document-overflow-375"
  | "document-overflow-390"
  | "document-overflow-430";

export interface Batch4ARouteObservation {
  responseStatus: number;
  url: string;
  values: Record<string, unknown>;
}

const WIDTHS: Record<Batch4ARouteCase, number> = {
  "earnings-readability-375": 375,
  "earnings-readability-430": 430,
  "sticky-tabs-transform": 375,
  "document-overflow-320": 320,
  "document-overflow-375": 375,
  "document-overflow-390": 390,
  "document-overflow-430": 430,
};

export const inspectBatch4AProductionCase: BrowserCommand<
  [scenario: Batch4ARouteCase],
  Batch4ARouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright") throw new Error("Batch 4A requires the Playwright provider.");
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable.");

  const width = WIDTHS[scenario];
  const height = 667;
  const pixel7 = devices["Pixel 7"];
  const isolated = await browser.newContext({
    screen: { width: 412, height: 915 },
    userAgent: pixel7.userAgent,
    deviceScaleFactor: pixel7.deviceScaleFactor,
    isMobile: pixel7.isMobile,
    hasTouch: pixel7.hasTouch,
    viewport: { width, height },
  });
  const page = await isolated.newPage();
  try {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
    });
    if (!response) throw new Error("Production route navigation returned no response.");
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const values: Record<string, unknown> = {};
    if (scenario.startsWith("earnings-readability-")) {
      const section = page.locator("#section-earnings");
      await section.waitFor({ state: "visible", timeout: 15_000 });
      await section.scrollIntoViewIfNeeded();
      const chart = section.locator(".recharts-wrapper").first();
      await chart.waitFor({ state: "visible" });
      const chartBox = await chart.boundingBox();
      if (!chartBox) throw new Error("Earnings chart has no visible bounding box.");
      await page.mouse.click(chartBox.x + chartBox.width / 2, chartBox.y + chartBox.height / 2);

      const tooltip = section.locator('[data-tooltip-root="true"]');
      await tooltip.waitFor({ state: "visible", timeout: 5_000 });
      values.tooltip = await tooltip.evaluate((root) => {
        const rootBox = root.getBoundingClientRect();
        const rows = [...root.querySelectorAll<HTMLElement>('[data-tooltip-row="true"]')];
        return {
          rootBox: {
            left: rootBox.left,
            right: rootBox.right,
            top: rootBox.top,
            bottom: rootBox.bottom,
          },
          rows: rows.map((row) => {
            const rowBox = row.getBoundingClientRect();
            const spans = [...row.children].filter(
              (child) => child.tagName === "SPAN",
            ) as HTMLElement[];
            const label = spans.find((span) => !span.hasAttribute("data-tooltip-color"));
            const value = spans.at(-1);
            return {
              label: label?.textContent?.trim() ?? null,
              value: value?.textContent?.trim() ?? null,
              rowBox: {
                left: rowBox.left,
                right: rowBox.right,
                top: rowBox.top,
                bottom: rowBox.bottom,
              },
              labelMeasure: label
                ? { scrollWidth: label.scrollWidth, clientWidth: label.clientWidth }
                : null,
              separator: row.getAttribute("data-tooltip-group-separator") === "true",
              borderTop: getComputedStyle(row).borderTopWidth,
            };
          }),
          total: (() => {
            const total = root.querySelector<HTMLElement>('[data-tooltip-total="true"]');
            const box = total?.getBoundingClientRect();
            return {
              label: total?.firstElementChild?.textContent?.trim() ?? null,
              value: total?.lastElementChild?.textContent?.trim() ?? null,
              box: box
                ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
                : null,
            };
          })(),
          viewport: { width: innerWidth, height: innerHeight },
        };
      });
    } else if (scenario === "sticky-tabs-transform") {
      values.transform = await page.evaluate(() => {
        const el = Array.from(
          document.querySelectorAll<HTMLElement>('[class*="sectionTabs"]'),
        ).find((candidate) => !candidate.className.includes("sectionTabsScroll"));
        return el ? getComputedStyle(el).transform : null;
      });
      const observedDevice = await page.evaluate(() => ({
        screen: { width: screen.width, height: screen.height },
        deviceScaleFactor: window.devicePixelRatio,
        touchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent,
      }));
      values.browserContext = {
        engine: browser.browserType().name(),
        mobileEmulation: pixel7.isMobile,
        touchEnabled: pixel7.hasTouch,
        viewport: page.viewportSize(),
        ...observedDevice,
      };
    } else {
      values.overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
    }
    return { responseStatus: response.status(), url: page.url(), values };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch4AProductionCase: (scenario: Batch4ARouteCase) => Promise<Batch4ARouteObservation>;
  }
}
