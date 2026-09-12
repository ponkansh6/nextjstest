import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const CHARTS = ["spending-chart-nominal", "spending-chart-real"] as const;
const BOUNDARY_WIDTHS = [768, 769] as const;
const chart = (page: Page, id: string) => page.getByTestId(id);
const chartElementSelector = '[role="img"][aria-label$="の推移グラフ"]';

async function loadNominalConsumptionSection(page: Page) {
  const placeholder = page.locator('[data-lazy-section="section-consumption-nominal"]');
  const nominal = chart(page, "spending-chart-nominal");
  const [nominalCount, placeholderCount] = await Promise.all([
    nominal.count(),
    placeholder.count(),
  ]);
  if (nominalCount === 0 || placeholderCount === 0) {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
  }
  await placeholder.scrollIntoViewIfNeeded();
  await expect(nominal).toBeAttached({ timeout: 15000 });
  await expect(nominal.locator(chartElementSelector)).toBeVisible({ timeout: 15000 });
  await expect(nominal.locator(".recharts-xAxis-tick-labels text").first()).toBeAttached({
    timeout: 15000,
  });
  await expect(nominal.locator(".recharts-yAxis-tick-labels text").first()).toBeAttached({
    timeout: 15000,
  });
}

async function waitForChartToStabilize(root: Locator) {
  await root.scrollIntoViewIfNeeded();
  let previousSignature = "";
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const signature = await root.evaluate((section) => {
          const chartElement = section.querySelector<HTMLElement>(
            '[role="img"][aria-label$="の推移グラフ"]',
          );
          const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface");
          const xTicks = [
            ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
          ];
          const yTicks = [
            ...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
          ];
          if (!chartElement || !svg || xTicks.length < 2 || yTicks.length < 2) return "";
          const boxes = [chartElement, svg, ...xTicks, ...yTicks].map((element) =>
            element.getBoundingClientRect(),
          );
          if (
            boxes.some(
              (box) =>
                [box.left, box.right, box.top, box.bottom].some(
                  (value) => !Number.isFinite(value),
                ) || [box.width, box.height].some((value) => !Number.isFinite(value) || value <= 0),
            )
          )
            return "";
          return boxes
            .map((box) =>
              [box.left, box.right, box.top, box.bottom, box.width, box.height]
                .map(Math.round)
                .join(","),
            )
            .join("|");
        });
        if (signature && signature === previousSignature) stableSamples += 1;
        else stableSamples = 0;
        previousSignature = signature;
        return stableSamples;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(2);
}

test.describe("消費支出グラフ 768px境界（Desktop Chromium）", () => {
  for (const width of BOUNDARY_WIDTHS) {
    test(`${width}px: 実viewportのレイアウト・矩形・overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 667 });
      await page.addInitScript(() => {
        window.__MOUNT_ALL__ = true;
      });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await loadNominalConsumptionSection(page);
      await expect(chart(page, CHARTS[0])).toBeAttached({ timeout: 15000 });
      const first = chart(page, CHARTS[0]);
      await expect(first.locator(chartElementSelector)).toBeVisible({ timeout: 15000 });
      await expect(first.locator(".recharts-xAxis-tick-labels text").first()).toBeAttached({
        timeout: 15000,
      });
      await expect(first.locator(".recharts-yAxis-tick-labels text").first()).toBeAttached({
        timeout: 15000,
      });

      const layout = await first.evaluate((section) => {
        const container = section.closest<HTMLElement>(".container");
        const chartElement = section.querySelector<HTMLElement>(
          '[role="img"][aria-label$="の推移グラフ"]',
        );
        if (!container || !chartElement)
          throw new Error("Consumption chart layout elements are unavailable");
        return {
          paddingTop: getComputedStyle(container).paddingTop,
          aspectRatio: getComputedStyle(chartElement).aspectRatio,
        };
      });
      expect(layout.paddingTop).toBe(width <= 768 ? "24px" : "64px");
      expect(layout.aspectRatio).toBe(width === 768 ? "auto" : "4 / 3");

      for (const id of CHARTS) {
        const root = chart(page, id);
        await expect(root).toBeVisible({ timeout: 15000 });
        await waitForChartToStabilize(root);
        const geometry = await root.evaluate((section) => {
          const chartElement = section.querySelector<HTMLElement>(
            '[role="img"][aria-label$="の推移グラフ"]',
          );
          const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface");
          const xTicks = [
            ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
          ];
          const yTicks = [
            ...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
          ];
          if (!chartElement || !svg || xTicks.length < 2 || yTicks.length < 1)
            throw new Error("Boundary chart or axis labels are unavailable");
          const chartBox = chartElement.getBoundingClientRect();
          const svgBox = svg.getBoundingClientRect();
          const sectionBox = (section as HTMLElement).getBoundingClientRect();
          return {
            chart: chartBox,
            svg: svgBox,
            section: sectionBox,
            xTicks: xTicks.map((tick) => ({
              box: tick.getBoundingClientRect(),
              textAnchor: tick.getAttribute("text-anchor"),
            })),
            yTicks: yTicks.map((tick) => tick.getBoundingClientRect()),
          };
        });
        expect(geometry.svg.width).toBeGreaterThan(0);
        expect(geometry.svg.height).toBeGreaterThan(0);
        expect(geometry.chart.width).toBeGreaterThan(0);
        expect(geometry.chart.height).toBeGreaterThan(0);
        expect(geometry.chart.left).toBeGreaterThanOrEqual(0);
        expect(geometry.chart.right).toBeLessThanOrEqual(width + 1);
        expect(geometry.svg.left).toBeGreaterThanOrEqual(0);
        expect(geometry.svg.right).toBeLessThanOrEqual(width + 1);
        expect(
          geometry.yTicks.every(
            (box) =>
              box.width > 0 &&
              box.height > 0 &&
              // Recharts reserves the Y-axis gutter to the left of the plot surface.
              // The label is intentionally outside the surface, but must remain in the viewport.
              box.right <= geometry.svg.right + 1 &&
              box.top >= geometry.svg.top - 1 &&
              box.bottom <= geometry.svg.bottom + 1,
          ),
        ).toBe(true);
        expect(
          geometry.xTicks.every(
            ({ box, textAnchor }) =>
              box.width > 0 &&
              box.height > 0 &&
              box.top >= geometry.svg.top - 1 &&
              box.bottom <= geometry.svg.bottom + 1 &&
              textAnchor === "middle",
          ),
        ).toBe(true);
        expect(
          geometry.xTicks
            .slice(1)
            .every(({ box }, index) => box.left >= geometry.xTicks[index].box.right),
        ).toBe(true);
        expect(geometry.section.left).toBeGreaterThanOrEqual(0);
        expect(geometry.section.right).toBeLessThanOrEqual(width + 1);
      }
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }
});
