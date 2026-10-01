import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";
import {
  CPI_CATEGORIES,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  getLegendLabel,
} from "../../src/lib/chartConstants";
import { buildContextOptions, withIsolatedContext } from "./isolated-route-context";

export type Batch1RouteCase =
  | "a11y-sheet-tab-trap"
  | "cagr-calculate"
  | "cagr-backdrop-coordinate"
  | "cagr-mobile-overflow"
  | "cagr-chart-visible-height"
  | "cagr-section-omitted"
  | "cagr-result-no-scroll"
  | "cagr-result-portrait-bounds"
  | "cagr-result-landscape-bounds"
  | "cpi-legend-scroll"
  | "cpi-tooltip-rows"
  | "cpi-tooltip-hidden-row"
  | "earnings-hover"
  | "earnings-hidden-hover"
  | "legend-series9"
  | "legend-nominal-food"
  | "legend-dark-all12"
  | "monthly-boundary-cpi"
  | "monthly-boundary-earnings"
  | "range-sanity"
  | "range-single-year";

export interface Batch1RouteObservation {
  url: string;
  responseStatus: number;
  values: Record<string, string | number | boolean | string[] | null>;
}

export const inspectBatch1ProductionCase: BrowserCommand<
  [scenario: Batch1RouteCase],
  Batch1RouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright") {
    throw new Error(`Batch 1 production checks require Playwright; received ${provider.name}.`);
  }
  const browser = context.browser();
  if (!browser) throw new Error("The Playwright Browser is unavailable to the batch command.");

  const viewport =
    scenario.includes("portrait") ||
    scenario.includes("overflow") ||
    scenario === "cagr-chart-visible-height"
      ? { width: 375, height: 667 }
      : scenario.includes("landscape")
        ? { width: 667, height: 375 }
        : { width: 1280, height: scenario === "earnings-hover" ? 720 : 800 };
  return withIsolatedContext(
    browser,
    buildContextOptions({ viewport }),
    async (isolatedContext) => {
      const page = await isolatedContext.newPage();
      // Match the shared E2E fixture: production assertions are about rendered
      // route behavior, not the lazy-mount sentinel's default off-screen state.
      await page.addInitScript(() => {
        window.__MOUNT_ALL__ = true;
      });
      if (scenario === "legend-dark-all12") {
        await page.addInitScript(() => localStorage.setItem("theme", "dark"));
      }
      const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
        waitUntil: "domcontentloaded",
      });
      if (!response) throw new Error("Production route navigation returned no response.");
      await page
        .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
        .waitFor({ state: "visible", timeout: 30_000 });

      const values: Batch1RouteObservation["values"] = {};
      const openCagr = async () => {
        const section = page.locator("#section-stacked");
        await section.scrollIntoViewIfNeeded();
        await section.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }).click();
        return page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
      };
      const openRangeSheet = async () => {
        await page.getByRole("button", { name: "表示期間を変更" }).click();
        await page.locator("#startYear").waitFor({ state: "visible" });
      };
      const rangeTo = async (start: number, end: number) => {
        await openRangeSheet();
        await page.locator("#startYear").selectOption(String(start));
        await openRangeSheet();
        await page.locator("#endYear").selectOption(String(end));
      };

      switch (scenario) {
        case "a11y-sheet-tab-trap": {
          await openRangeSheet();
          for (let index = 0; index < 10; index += 1) await page.keyboard.press("Tab");
          values.focusInsideDialog = await page.evaluate(() =>
            Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)),
          );
          break;
        }
        case "cagr-calculate": {
          const dialog = await openCagr();
          await page.locator("#cagrStartYear").selectOption("2015");
          await page.getByRole("button", { name: "計算する" }).click();
          const result = page.locator("[class*='cagrResultValue']");
          await result.waitFor({ state: "visible", timeout: 10_000 });
          values.dialogVisible = await dialog.isVisible();
          values.result = (await result.textContent())?.trim() ?? null;
          break;
        }
        case "cagr-backdrop-coordinate": {
          const dialog = await openCagr();
          values.dialogWasVisible = await dialog.isVisible();
          const hit = await page.evaluate(() => {
            const el = document.elementFromPoint(10, 10);
            return el?.matches("[class*='bottomSheetBackdrop']") ?? false;
          });
          await page.mouse.click(10, 10);
          values.dialogVisibleAfterClick = await dialog.isVisible().catch(() => false);
          values.hitTargetWasBackdrop = hit;
          values.dialogClosed = await dialog
            .waitFor({ state: "hidden", timeout: 5_000 })
            .then(() => true)
            .catch(() => false);
          break;
        }
        case "cagr-mobile-overflow": {
          values.scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          values.clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
          break;
        }
        case "cagr-chart-visible-height": {
          await openCagr();
          values.dialogVisible = await page
            .getByRole("dialog", { name: "年率上昇率（CAGR）" })
            .isVisible();
          values.visibleHeight = await page.evaluate(() => {
            const chart = document.querySelector("#section-stacked [class*='chartWrapper']")!;
            const sheet = document.querySelector(
              "[class*='bottomSheet']:not([class*='Backdrop'])",
            )!;
            const c = chart.getBoundingClientRect();
            const s = sheet.getBoundingClientRect();
            return Math.max(0, Math.min(c.bottom, s.top) - Math.max(c.top, 0));
          });
          break;
        }
        case "cagr-section-omitted": {
          values.sectionPresent = (await page.locator("#section-cagr").count()) > 0;
          values.tabPresent = await page
            .locator('[class*="sectionTabs"] button')
            .evaluateAll((buttons) =>
              buttons.some((button) => button.textContent?.trim() === "CPI年率"),
            );
          break;
        }
        case "cagr-result-no-scroll":
        case "cagr-result-portrait-bounds":
        case "cagr-result-landscape-bounds": {
          await openCagr();
          await page.getByRole("button", { name: "計算する" }).click();
          await page
            .locator("[class*='cagrResultValue']")
            .waitFor({ state: "visible", timeout: 10_000 });
          values.dialogVisible = await page
            .getByRole("dialog", { name: "年率上昇率（CAGR）" })
            .isVisible();
          if (scenario === "cagr-result-no-scroll") {
            values.innerOverflow = await page.evaluate(() => {
              const sheet = document.querySelector<HTMLElement>(
                "[class*='bottomSheet']:not([class*='Backdrop']):not([class*='Header']):not([class*='Title']):not([class*='Close'])",
              )!;
              return sheet.scrollHeight - sheet.clientHeight;
            });
          } else {
            values.detailBottom = await page
              .locator("[class*='cagrResultDetail']")
              .evaluate((el) => el.getBoundingClientRect().bottom);
            values.viewportHeight = await page.evaluate(() => window.innerHeight);
            if (scenario === "cagr-result-portrait-bounds") {
              values.noteBottom = await page
                .locator("[class*='cagrSheetNote']")
                .evaluate((el) => el.getBoundingClientRect().bottom);
            }
          }
          break;
        }
        case "cpi-legend-scroll": {
          await page.waitForLoadState("networkidle");
          const section = page.locator("#section-stacked");
          const button = section.getByRole("button", { name: "住居", exact: true });
          await button.scrollIntoViewIfNeeded();
          const before = await page.evaluate(() => window.scrollY);
          values.before = before;
          values.pressedBefore = await button.getAttribute("aria-pressed");
          await button.click();
          await page.waitForTimeout(500);
          values.after = await page.evaluate(() => window.scrollY);
          values.pressedAfter = await button.getAttribute("aria-pressed");
          break;
        }
        case "cpi-tooltip-rows":
        case "cpi-tooltip-hidden-row": {
          await page.waitForLoadState("networkidle");
          const section = page.locator("#section-stacked");
          await section.scrollIntoViewIfNeeded();
          if (scenario === "cpi-tooltip-hidden-row") {
            await section.getByRole("button", { name: "住居", exact: true }).click();
            await page.mouse.move(0, 0);
          }
          const chart = section.locator(".recharts-wrapper").first();
          const plot = chart.locator("path.recharts-area-area:visible").first();
          await plot.hover();
          const tooltip = section.locator('[data-tooltip-root="true"]');
          await tooltip.waitFor({ state: "visible", timeout: 5_000 });
          values.tooltipVisible = await tooltip.isVisible();
          values.totalVisible = await tooltip.locator('[data-tooltip-total="true"]').isVisible();
          const contract = await tooltip.locator('[data-tooltip-row="true"]').evaluateAll((rows) =>
            rows.map((row) => ({
              key: row.getAttribute("data-tooltip-key") ?? "",
              label: row.getAttribute("data-tooltip-label") ?? "",
              order: row.getAttribute("data-tooltip-order") ?? "",
              text: row.textContent?.trim() ?? "",
            })),
          );
          values.rootMarked = (await tooltip.getAttribute("data-tooltip-root")) === "true";
          values.rowCount = contract.length;
          values.rowKeys = contract.map((row) => row.key);
          values.rowLabels = contract.map((row) => row.label);
          values.rowOrders = contract.map((row) => row.order);
          values.rowTexts = contract.map((row) => row.text);
          values.rowContractValid = contract.every((row) => row.key && row.order && row.text);
          values.hiddenHousingAbsent = !contract.some((row) => row.key === "住居");
          if (scenario === "cpi-tooltip-hidden-row") {
            values.hiddenLegendPressed = await section
              .getByRole("button", { name: "住居", exact: true })
              .getAttribute("aria-pressed");
          }
          break;
        }
        case "earnings-hover":
        case "earnings-hidden-hover": {
          await page.waitForLoadState("networkidle");
          const section = page.locator("#section-earnings");
          await section.scrollIntoViewIfNeeded();
          const wrapper = section.locator(".recharts-wrapper").first();
          const plots = wrapper.locator(
            "path.recharts-area-area:visible, path.recharts-line-curve:visible",
          );
          let plot: import("@playwright/test").Locator = plots.first();
          if (scenario === "earnings-hover") {
            const size = page.viewportSize();
            if (!size) throw new Error("Playwright viewport is unavailable.");
            let foundInViewport = false;
            for (let index = 0; index < (await plots.count()); index += 1) {
              const candidate = plots.nth(index);
              const box = await candidate.boundingBox();
              if (
                box &&
                box.width > 0 &&
                box.height > 0 &&
                box.x >= 0 &&
                box.y >= 0 &&
                box.x + box.width <= size.width &&
                box.y + box.height <= size.height
              ) {
                plot = candidate;
                foundInViewport = true;
                break;
              }
            }
            if (!foundInViewport)
              throw new Error("No earnings plot fits fully inside the viewport.");
          }
          await plot.waitFor({ state: "visible", timeout: 10_000 });
          if (scenario === "earnings-hidden-hover") {
            await plot.hover();
            const initialTooltip = section.locator('[data-tooltip-root="true"]');
            await initialTooltip.waitFor({ state: "visible", timeout: 5_000 });
            values.initialTooltipVisible = await initialTooltip.isVisible();
            values.initialSeparatorBorder = await initialTooltip
              .locator('[data-tooltip-group-separator="true"]')
              .first()
              .evaluate((el) => getComputedStyle(el).borderTopWidth)
              .catch(() => "0px");
            const hidden = section.getByTestId("legend-所定内給与");
            await hidden.click();
            values.hiddenLegendPressed = await hidden.getAttribute("aria-pressed");
            await page.mouse.move(0, 0);
          }
          if (scenario === "earnings-hover") {
            const selectedPlotBox = await plot.boundingBox();
            if (!selectedPlotBox) throw new Error("Selected earnings plot has no bounding box.");
            await page.mouse.move(
              selectedPlotBox.x + selectedPlotBox.width * 0.5,
              selectedPlotBox.y + selectedPlotBox.height * 0.45,
            );
          } else {
            await plot.hover();
          }
          const tooltip = section.locator('[data-tooltip-root="true"]');
          await tooltip.waitFor({ state: "visible", timeout: 5_000 });
          values.plotVisible = await plot.isVisible();
          const plotBox = await plot.boundingBox();
          const size = page.viewportSize();
          values.plotInViewport = Boolean(
            plotBox &&
            size &&
            plotBox.width > 0 &&
            plotBox.height > 0 &&
            plotBox.x >= 0 &&
            plotBox.y >= 0 &&
            plotBox.x + plotBox.width <= size.width &&
            plotBox.y + plotBox.height <= size.height,
          );
          values.tooltipVisible = await tooltip.isVisible();
          values.separatorBorder = await tooltip
            .locator('[data-tooltip-group-separator="true"]')
            .first()
            .evaluate((el) => getComputedStyle(el).borderTopWidth)
            .catch(() => "0px");
          break;
        }
        case "legend-series9":
        case "legend-nominal-food":
        case "legend-dark-all12": {
          await page.waitForLoadState("networkidle");
          const dark = scenario === "legend-dark-all12";
          const scope = dark
            ? page.locator("#section-stacked")
            : page.locator(
                scenario === "legend-series9" ? "#section-stacked" : "#section-consumption-nominal",
              );
          const labels =
            scenario === "legend-series9"
              ? [getLegendLabel("教養娯楽")]
              : scenario === "legend-nominal-food"
                ? ["食料"]
                : CPI_CATEGORIES.map(getLegendLabel);
          const colors: string[] = [];
          for (const label of labels) {
            const button = scope.getByRole("button", { name: label, exact: true }).first();
            await button.waitFor({ state: "visible", timeout: 10_000 });
            if (scenario === "legend-series9" || scenario === "legend-nominal-food" || dark) {
              colors.push(
                await button
                  .locator("span")
                  .first()
                  .evaluate((el) => getComputedStyle(el).backgroundColor),
              );
            }
          }
          values.theme = await page.locator("html").getAttribute("data-theme");
          values.visibleCount = labels.length;
          values.colors = colors;
          break;
        }
        case "monthly-boundary-cpi":
        case "monthly-boundary-earnings": {
          await page.waitForLoadState("networkidle");
          const section = page.locator(
            scenario === "monthly-boundary-cpi" ? "#section-stacked" : "#section-earnings",
          );
          await section.scrollIntoViewIfNeeded();
          const ticks = section.locator(".recharts-xAxis-tick-labels text");
          await ticks.first().waitFor({ state: "visible", timeout: 15_000 });
          values.firstTickLabel = (await ticks.first().textContent())?.trim() ?? "";
          values.axisLabels = await ticks.allTextContents();
          break;
        }
        case "range-sanity": {
          await page.waitForLoadState("networkidle");
          const nominalBars = page.locator(
            '[data-testid="spending-chart-nominal"] .recharts-bar-rectangle',
          );
          const realBars = page.locator(
            '[data-testid="spending-chart-real"] .recharts-bar-rectangle',
          );
          await nominalBars.first().waitFor({ state: "visible", timeout: 10_000 });
          await realBars.first().waitFor({ state: "visible", timeout: 10_000 });
          values.nominalBarCount = await nominalBars.count();
          values.realBarCount = await realBars.count();
          values.nominalContractRows = await page
            .locator(
              '[data-testid="spending-chart-nominal"] [data-testid="chart-data-contract"] [data-chart-data-row]',
            )
            .count();
          values.realContractRows = await page
            .locator(
              '[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-chart-data-row]',
            )
            .count();
          values.nominalProjectedValues = await page
            .locator(
              '[data-testid="spending-chart-nominal"] [data-testid="chart-data-contract"] [data-series-key][data-value-type="number"]',
            )
            .count();
          values.realProjectedValues = await page
            .locator(
              '[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-series-key][data-value-type="number"]',
            )
            .count();
          values.realTotalProjectedValues = await page
            .locator(
              `[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-series-key="${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"][data-value-type="number"]`,
            )
            .count();
          values.realTotalMarkerCount = await page
            .locator(
              `[data-testid="spending-chart-real"] [data-testid="spending-series-marker-${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"]`,
            )
            .count();
          values.nominalVisible = await page
            .locator('[data-testid="spending-chart-nominal"] .recharts-bar-rectangle')
            .first()
            .isVisible();
          values.realVisible = await page
            .locator('[data-testid="spending-chart-real"] .recharts-bar-rectangle')
            .first()
            .isVisible();
          break;
        }
        case "range-single-year": {
          await page.waitForLoadState("networkidle");
          await page
            .locator(
              '[data-testid="spending-chart-nominal"] [data-testid="chart-data-contract"] [data-chart-data-row]',
            )
            .first()
            .waitFor({ state: "attached", timeout: 10_000 });
          await page
            .locator(
              '[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-chart-data-row]',
            )
            .first()
            .waitFor({ state: "attached", timeout: 10_000 });
          await rangeTo(2017, 2017);
          values.url = page.url();
          values.nominalRows = await page
            .locator(
              '[data-testid="spending-chart-nominal"] [data-testid="chart-data-contract"] [data-chart-data-row]',
            )
            .count();
          values.realRows = await page
            .locator(
              '[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-chart-data-row]',
            )
            .count();
          values.nominalBars = await page
            .locator('[data-testid="spending-chart-nominal"] .recharts-bar-rectangle')
            .count();
          values.realBars = await page
            .locator('[data-testid="spending-chart-real"] .recharts-bar-rectangle')
            .count();
          values.nominalProjectedValues = await page
            .locator(
              '[data-testid="spending-chart-nominal"] [data-testid="chart-data-contract"] [data-series-key][data-value-type="number"]',
            )
            .count();
          values.realProjectedValues = await page
            .locator(
              '[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-series-key][data-value-type="number"]',
            )
            .count();
          values.realTotalProjectedValues = await page
            .locator(
              `[data-testid="spending-chart-real"] [data-testid="chart-data-contract"] [data-series-key="${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"][data-value-type="number"]`,
            )
            .count();
          values.realTotalMarkerCount = await page
            .locator(
              `[data-testid="spending-chart-real"] [data-testid="spending-series-marker-${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"]`,
            )
            .count();
          break;
        }
      }

      return { url: page.url(), responseStatus: response.status(), values };
    },
  );
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch1ProductionCase: (scenario: Batch1RouteCase) => Promise<Batch1RouteObservation>;
  }
}
