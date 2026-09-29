import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { devices } from "@playwright/test";
import {
  QUARTERLY_PLAN40_V2_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";
import { buildContextOptions, withIsolatedContext } from "./isolated-route-context";

export type Batch3ARouteCase =
  | "readability-430"
  | "tooltip-scroll-375"
  | "tooltip-scroll-320"
  | "tooltip-scroll-landscape"
  | "mobile-tap-targets"
  | "mobile-range-layout"
  | "lazymount-initial"
  | "lazymount-scroll";

export interface Batch3ARouteObservation {
  url: string;
  responseStatus: number;
  values: Record<string, any>;
}

const VIEWPORTS: Record<Batch3ARouteCase, { width: number; height: number }> = {
  "readability-430": { width: 430, height: 667 },
  "tooltip-scroll-375": { width: 375, height: 667 },
  "tooltip-scroll-320": { width: 320, height: 480 },
  "tooltip-scroll-landscape": { width: 667, height: 375 },
  "mobile-tap-targets": { width: 375, height: 667 },
  "mobile-range-layout": { width: 375, height: 667 },
  "lazymount-initial": { width: 375, height: 667 },
  "lazymount-scroll": { width: 375, height: 667 },
};

const mobileCases = new Set<Batch3ARouteCase>([
  "readability-430",
  "tooltip-scroll-375",
  "tooltip-scroll-320",
  "tooltip-scroll-landscape",
  "mobile-tap-targets",
  "mobile-range-layout",
  "lazymount-initial",
  "lazymount-scroll",
]);
const pixel7Cases = new Set<Batch3ARouteCase>(["readability-430", "tooltip-scroll-375"]);
const pixel7 = devices["Pixel 7"];

export const inspectBatch3AProductionCase: BrowserCommand<
  [scenario: Batch3ARouteCase],
  Batch3ARouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright") {
    throw new Error(`Batch 3A production checks require Playwright; received ${provider.name}.`);
  }
  const browser = context.browser();
  if (!browser) throw new Error("The Playwright Browser is unavailable to the batch command.");
  const viewport = VIEWPORTS[scenario];
  const usePixel7 = pixel7Cases.has(scenario);
  const contextOptions = buildContextOptions(usePixel7 ? pixel7 : {}, {
    viewport,
    ...(mobileCases.has(scenario) ? { isMobile: true, hasTouch: true } : {}),
    ...(usePixel7
      ? {
          screen: { width: 412, height: 915 },
          userAgent: pixel7.userAgent,
          deviceScaleFactor: pixel7.deviceScaleFactor,
          isMobile: pixel7.isMobile,
          hasTouch: pixel7.hasTouch,
        }
      : {}),
  });
  return withIsolatedContext(browser, contextOptions, async (isolatedContext) => {
    const page = await isolatedContext.newPage();
    // Match the normal production route fixture except for the two LazyMount
    // cases, whose contract specifically depends on the default lazy behavior.
    if (scenario !== "lazymount-initial" && scenario !== "lazymount-scroll") {
      await page.addInitScript(() => {
        window.__MOUNT_ALL__ = true;
      });
    }
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
    });
    if (!response) throw new Error("Production route navigation returned no response.");
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const values: Record<string, any> = {};
    if (usePixel7) {
      values.pixel7Context = await page.evaluate(() => ({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: { width: window.screen.width, height: window.screen.height },
        deviceScaleFactor: window.devicePixelRatio,
        maxTouchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent,
      }));
      values.pixel7Descriptor = {
        isMobile: pixel7.isMobile,
        hasTouch: pixel7.hasTouch,
        deviceScaleFactor: pixel7.deviceScaleFactor,
        screen: { width: 412, height: 915 },
        userAgent: pixel7.userAgent,
      };
    }

    if (scenario === "readability-430") {
      const measurements: Record<string, unknown>[] = [];
      for (const id of ["spending-chart-nominal", "spending-chart-real"]) {
        const root = page.getByTestId(id);
        await root.waitFor({ state: "visible", timeout: 15_000 });
        await root.scrollIntoViewIfNeeded();
        measurements.push(
          await root.evaluate((element) => {
            const section = element as HTMLElement;
            const wrapper = section.querySelector<HTMLElement>(".spendingChartWrapper");
            const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface");
            const yTicks = [
              ...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
            ];
            const xTicks = [
              ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
            ];
            const bar = section.querySelector<SVGGraphicsElement>(".recharts-bar-rectangle");
            const svgBox = svg?.getBoundingClientRect();
            const barBox = bar?.getBoundingClientRect();
            const barCenters = [
              ...section.querySelectorAll<SVGGraphicsElement>(".recharts-bar-rectangle"),
            ]
              .map((item) => item.getBoundingClientRect())
              .filter((box) => box.width > 0 && box.height > 0)
              .map((box) => box.left + box.width / 2)
              .sort((a, b) => a - b)
              .filter((center, index, centers) => index === 0 || center - centers[index - 1] > 1);
            return {
              visible:
                section.getBoundingClientRect().width > 0 &&
                section.getBoundingClientRect().height > 0,
              sectionPaddingBottom: Number.parseFloat(getComputedStyle(section).paddingBottom),
              wrapperWidth: wrapper?.getBoundingClientRect().width ?? 0,
              svgLeft: svgBox?.left ?? 0,
              svgRight: svgBox?.right ?? 0,
              svgTop: svgBox?.top ?? 0,
              svgBottom: svgBox?.bottom ?? 0,
              barWidth: barBox?.width ?? 0,
              barCenterGaps: barCenters.slice(1).map((center, index) => center - barCenters[index]),
              yTickCount: yTicks.length,
              yValues: yTicks
                .map((tick) => Number(tick.textContent?.trim().replaceAll(",", "")))
                .filter(Number.isFinite),
              xTickCount: xTicks.length,
              xTexts: xTicks.map((tick) => tick.textContent?.trim() ?? ""),
              xTextGeometry: xTicks.map((tick) => {
                const box = tick.getBoundingClientRect();
                return {
                  left: box.left,
                  right: box.right,
                  top: box.top,
                  bottom: box.bottom,
                  width: box.width,
                  height: box.height,
                  textAnchor: tick.getAttribute("text-anchor"),
                };
              }),
            };
          }),
        );
      }
      values.measurements = measurements;
      values.documentOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
    } else if (scenario.startsWith("tooltip-scroll-")) {
      const expectedKeys = {
        "spending-chart-nominal": [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS],
        "spending-chart-real": [...QUARTERLY_PUBLIC_REAL_KEYS],
      };
      const charts: Record<string, unknown>[] = [];
      for (const id of Object.keys(expectedKeys)) {
        const root = page.getByTestId(id);
        await root.waitFor({ state: "visible", timeout: 15_000 });
        await root.scrollIntoViewIfNeeded();
        const bars = root.locator(".recharts-bar-rectangle");
        let tapped = false;
        for (let index = (await bars.count()) - 1; index >= 0; index -= 1) {
          const box = await bars.nth(index).boundingBox();
          if (
            box &&
            box.width > 0 &&
            box.height > 0 &&
            box.x >= 0 &&
            box.x + box.width <= viewport.width &&
            box.y >= 0 &&
            box.y + box.height <= viewport.height
          ) {
            await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
            tapped = true;
            break;
          }
        }
        if (!tapped)
          throw new Error(
            `${id}: no visible production bar can be tapped at ${viewport.width}x${viewport.height}`,
          );
        const tooltip = root.locator('.recharts-tooltip-wrapper [style*="position: fixed"]');
        await tooltip.waitFor({ state: "visible", timeout: 10_000 });
        const payloadKeys = await tooltip
          .locator('[data-tooltip-row="true"]')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-tooltip-key")));
        const box = await tooltip.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const scrollPosition = await tooltip.evaluate((element) => {
          const tooltip = element as HTMLElement;
          tooltip.scrollTop = tooltip.scrollHeight;
          return {
            scrollTop: tooltip.scrollTop,
            scrollHeight: tooltip.scrollHeight,
            clientHeight: tooltip.clientHeight,
          };
        });
        const maximumScrollTop = scrollPosition.scrollHeight - scrollPosition.clientHeight;
        if (scrollPosition.scrollTop < maximumScrollTop - 1) {
          throw new Error(`${id}: tooltip did not reach its maximum scroll position`);
        }
        const close = tooltip.getByRole("button", { name: "閉じる" });
        const closeBox = await close.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        await close.click();
        await tooltip.waitFor({ state: "hidden", timeout: 5_000 });
        charts.push({
          id,
          expectedKeys: expectedKeys[id as keyof typeof expectedKeys],
          payloadKeys,
          box,
          scrollPosition,
          closeBox,
          dismissed: !(await tooltip.isVisible().catch(() => false)),
        });
      }
      values.charts = charts;
    } else if (scenario === "mobile-tap-targets") {
      const buttons = await page.getByRole("button").all();
      values.buttonCount = buttons.length;
      const tooSmall: string[] = [];
      for (const button of buttons) {
        if (!(await button.isVisible())) continue;
        const box = await button.boundingBox();
        if (!box) continue;
        const isLegendChip = await button.evaluate((el) => el.className.includes("legendItem"));
        // Only SectionTabs controls have separate P42-324 coverage; range
        // controls remain in the global P42-323 production scan.
        const isSectionControl = await button.evaluate((el) => el.className.includes("sectionTab"));
        if (isSectionControl) continue;
        const minSize = isLegendChip ? 32 : 44;
        if (box.width < minSize || box.height < minSize) {
          const label =
            (await button.getAttribute("aria-label")) ??
            (await button.textContent())?.trim() ??
            "(no label)";
          tooSmall.push(
            `${label}: ${Math.round(box.width)}x${Math.round(box.height)} (基準: ${minSize}px)`,
          );
        }
      }
      values.tooSmall = tooSmall;
    } else if (scenario === "mobile-range-layout") {
      await page.getByRole("button", { name: "表示期間を変更" }).click();
      const start = page.locator("#startYear");
      const end = page.locator("#endYear");
      const max = page.getByRole("button", { name: "最大期間" });
      await start.waitFor({ state: "visible" });
      await end.waitFor({ state: "visible" });
      await max.waitFor({ state: "visible" });
      values.startBox = await start.boundingBox();
      values.endBox = await end.boundingBox();
      values.maxBox = await max.boundingBox();
    } else if (scenario === "lazymount-initial") {
      values.sectionCount = await page.locator("#section-new-graph").count();
    } else if (scenario === "lazymount-scroll") {
      values.beforeScrollCount = await page.locator("#section-new-graph").count();
      values.scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.locator("#section-new-graph").waitFor({ state: "attached", timeout: 15_000 });
      values.afterScrollCount = await page.locator("#section-new-graph").count();
      values.scrollY = await page.evaluate(() => window.scrollY);
    }
    return { url: page.url(), responseStatus: response.status(), values };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch3AProductionCase: (scenario: Batch3ARouteCase) => Promise<Batch3ARouteObservation>;
  }
}
