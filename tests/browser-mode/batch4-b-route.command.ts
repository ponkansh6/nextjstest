import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { devices } from "@playwright/test";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";
import { buildContextOptions, withIsolatedContext } from "./isolated-route-context";

export type Batch4BRouteCase =
  | "start-nominal"
  | "start-real"
  | "end-nominal"
  | "end-real"
  | "range-errors"
  | "range-scroll"
  | "section-scrollbar-webkit"
  | "section-horizontal-webkit"
  | "section-mask-webkit"
  | "section-tab-target-chromium"
  | "section-tab-target-webkit";

export interface Batch4BRouteObservation {
  url: string;
  responseStatus: number;
  values: Record<string, unknown>;
}

const isWebKitCase = (scenario: Batch4BRouteCase) => scenario.endsWith("-webkit");

export const inspectBatch4BProductionCase: BrowserCommand<
  [scenario: Batch4BRouteCase],
  Batch4BRouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright")
    throw new Error("Batch 4B production checks require Playwright.");
  const browser = context.browser();
  if (!browser) throw new Error("The Playwright Browser is unavailable to the Batch 4B command.");
  const webkit = browser.browserType().name() === "webkit";
  if (isWebKitCase(scenario) !== webkit) {
    throw new Error(
      `${scenario} requires ${isWebKitCase(scenario) ? "WebKit" : "Chromium"}, received ${browser.browserType().name()}.`,
    );
  }
  const iphone13 = devices["iPhone 13"];
  const styleOnlySectionCase =
    scenario === "section-scrollbar-webkit" ||
    scenario === "section-horizontal-webkit" ||
    scenario === "section-mask-webkit";
  const viewport = webkit
    ? styleOnlySectionCase
      ? { width: 375, height: 800 }
      : iphone13.viewport
    : { width: 1280, height: 720 };
  const contextOptions = buildContextOptions(webkit ? iphone13 : {}, {
    viewport,
    ...(webkit ? { screen: { width: 390, height: 844 } } : {}),
  });
  return withIsolatedContext(browser, contextOptions, async (isolated) => {
    const page = await isolated.newPage();
    if (!styleOnlySectionCase) {
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
    const values: Record<string, unknown> = {};
    if (webkit) {
      values.deviceContext = await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        screen: { width: screen.width, height: screen.height },
        deviceScaleFactor: devicePixelRatio,
        userAgent: navigator.userAgent,
      }));
    }

    const openRange = async () => {
      if (
        !(await page
          .locator("#startYear")
          .isVisible()
          .catch(() => false))
      ) {
        await page.getByRole("button", { name: "表示期間を変更" }).click();
        await page.locator("#startYear").waitFor({ state: "visible" });
      }
    };
    const setRange = async (start: number, end: number) => {
      await openRange();
      if (start <= end) {
        await page.locator("#startYear").selectOption(String(start));
        await openRange();
        await page.locator("#endYear").selectOption(String(end));
      } else {
        await page.locator("#endYear").selectOption(String(end));
        await openRange();
        await page.locator("#startYear").selectOption(String(start));
      }
    };
    const chartCounts = async (testId: string) => {
      const root = page.getByTestId(testId);
      return {
        periods: await root.locator("[data-chart-data-row]").count(),
        visibleBars: await root.locator(".recharts-bar-rectangle").evaluateAll(
          (elements) =>
            elements.filter((element) => {
              const bounds = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                bounds.width > 0 &&
                bounds.height > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                Number(style.opacity) > 0
              );
            }).length,
        ),
      };
    };
    const waitForNarrowerPeriods = async (testId: string, before: number) => {
      await page.waitForFunction(
        ({ id, count }) => {
          const root = document.querySelector(`[data-testid="${id}"]`);
          return root != null && root.querySelectorAll("[data-chart-data-row]").length < count;
        },
        { id: testId, count: before },
        { timeout: 15_000 },
      );
    };

    if (["start-nominal", "start-real", "end-nominal", "end-real"].includes(scenario)) {
      await page
        .getByTestId(
          scenario.endsWith("nominal") ? "spending-chart-nominal" : "spending-chart-real",
        )
        .locator(".recharts-bar-rectangle")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await openRange();
      const nominal = scenario.endsWith("nominal");
      const testId = nominal ? "spending-chart-nominal" : "spending-chart-real";
      const before = await chartCounts(testId);
      const startOptions = await page.locator("#startYear option").allTextContents();
      const endOptions = await page.locator("#endYear option").allTextContents();
      const raisingStart = scenario.startsWith("start-");
      const chosen = raisingStart
        ? Number(startOptions[1]?.replace("年", ""))
        : Number(endOptions[endOptions.length - 2]?.replace("年", ""));
      if (!Number.isFinite(chosen) || chosen <= 0)
        throw new Error(`${scenario}: range option is unavailable.`);
      // These four source cases change exactly one select. The change closes
      // the sheet, so do not reopen it to select the unchanged field.
      await page.locator(raisingStart ? "#startYear" : "#endYear").selectOption(String(chosen));
      await page.locator("#startYear").waitFor({ state: "hidden", timeout: 5_000 });
      await page.waitForTimeout(100);
      await waitForNarrowerPeriods(testId, before.periods);
      await page.waitForFunction(
        (id) => {
          const root = document.querySelector(`[data-testid="${id}"]`);
          if (!root) return false;
          return Array.from(root.querySelectorAll(".recharts-bar-rectangle")).some((element) => {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              bounds.width > 0 &&
              bounds.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity) > 0
            );
          });
        },
        testId,
        { timeout: 10_000 },
      );
      const after = await chartCounts(testId);
      values.testId = testId;
      values.before = before;
      values.after = after;
    } else if (scenario === "range-errors") {
      await page
        .getByTestId("spending-chart-nominal")
        .locator(".recharts-bar-rectangle")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await openRange();
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      const startOptions = await page.locator("#startYear option").allTextContents();
      const endOptions = await page.locator("#endYear option").allTextContents();
      if (startOptions.length > 1 && endOptions.length > 0) {
        const newStart = Number(startOptions[1]?.replace("年", ""));
        const currentEnd = Number(endOptions[endOptions.length - 1]?.replace("年", ""));
        if (newStart && currentEnd && newStart <= currentEnd) await setRange(newStart, currentEnd);
      }
      if (endOptions.length > 1 && startOptions.length > 0) {
        const currentStart = Number(startOptions[0]?.replace("年", ""));
        const newEnd = Number(endOptions[endOptions.length - 2]?.replace("年", ""));
        if (currentStart && newEnd && currentStart <= newEnd) await setRange(currentStart, newEnd);
      }
      values.errors = errors;
    } else if (scenario === "range-scroll") {
      const nominal = page.getByTestId("spending-chart-nominal");
      await nominal
        .locator(".recharts-bar-rectangle")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await openRange();
      await nominal.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 300));
      const before = await page.evaluate(() => window.scrollY);
      if (before <= 50) throw new Error(`Scroll precondition failed: ${before}px.`);
      const options = await page.locator("#startYear option").allTextContents();
      const currentEnd = Number(await page.locator("#endYear").inputValue());
      const newStart = Number(options[1]?.replace("年", ""));
      if (!newStart || !Number.isFinite(currentEnd))
        throw new Error("A valid start-year option was unavailable.");
      // Keep the sheet open and make only the one selection measured by the source case.
      await page.locator("#startYear").selectOption(String(newStart));
      await page.waitForTimeout(500);
      values.before = before;
      values.after = await page.evaluate(() => window.scrollY);
    } else if (scenario.startsWith("section-")) {
      const tabs = page.locator('[class*="sectionTabsScroll"]');
      if (scenario === "section-scrollbar-webkit") {
        values.scrollbarWidth = await tabs.evaluate(
          (element) => getComputedStyle(element).scrollbarWidth,
        );
      } else if (scenario === "section-horizontal-webkit") {
        values.geometry = await tabs.evaluate((element) => {
          const before = element.scrollLeft;
          element.scrollLeft = element.scrollWidth;
          return {
            before,
            after: element.scrollLeft,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        });
      } else if (scenario === "section-mask-webkit") {
        values.mask = await tabs.evaluate((element) => {
          const css = getComputedStyle(element);
          return {
            maskImage: css.maskImage,
            webkitMaskImage:
              (css as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage ?? "none",
          };
        });
      } else {
        const section = page.locator("#section-new-graph");
        const targetTab = page
          .locator('[class*="sectionTabs"]')
          .getByRole("button", { name: "3種比較", exact: true });
        const before = await page.evaluate(() => window.scrollY);
        await targetTab.click();
        await page.waitForTimeout(1_000);
        values.target = await section.evaluate((element, beforeScroll) => {
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            before: beforeScroll,
            scrollY: window.scrollY,
            inViewport: rect.bottom > 0 && rect.top < innerHeight,
          };
        }, before);
      }
    }
    return { url: page.url(), responseStatus: response.status(), values };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch4BProductionCase: (scenario: Batch4BRouteCase) => Promise<Batch4BRouteObservation>;
  }
}
