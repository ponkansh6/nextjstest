import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const CHARTS = ["spending-chart-nominal", "spending-chart-real"] as const;
const WIDTHS = [320, 375, 390, 430] as const;

const chart = (page: Page, id: string) => page.getByTestId(id);
const bars = (root: Locator) => root.locator(".recharts-bar-rectangle");

async function tapVisibleBar(page: Page, root: Locator) {
  await root.scrollIntoViewIfNeeded();
  for (let i = (await bars(root).count()) - 1; i >= 0; i -= 1) {
    const box = await bars(root).nth(i).boundingBox();
    const viewport = page.viewportSize();
    if (
      box &&
      viewport &&
      box.width > 0 &&
      box.height > 0 &&
      box.x >= 0 &&
      box.x + box.width <= viewport.width
    ) {
      await bars(root)
        .nth(i)
        .click({ position: { x: box.width / 2, y: Math.min(box.height / 2, 20) } });
      return;
    }
  }
  throw new Error("No visible consumption bar was actionable");
}

test.describe("消費支出グラフ モバイル可読性の証跡", () => {
  for (const width of WIDTHS) {
    test(`${width}px: 名目・実質の専用余白、Y軸、棒、X軸が画面内に収まる`, async ({ page }) => {
      await page.setViewportSize({ width, height: 667 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      for (const id of CHARTS) {
        const root = chart(page, id);
        await expect(root).toBeVisible({ timeout: 15000 });
        const geometry = await root.evaluate((element) => {
          const section = element as HTMLElement;
          const wrapper = section.querySelector(".spendingChartWrapper") as HTMLElement | null;
          const svg = section.querySelector("svg.recharts-surface");
          // Tick lines and labels are separate Recharts groups. Measure the
          // native text nodes that are actually painted by the custom tick.
          const yTicks = [
            ...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
          ];
          const xTicks = [
            ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
          ];
          const bar = section.querySelector(".recharts-bar-rectangle") as SVGGraphicsElement | null;
          if (!svg || xTicks.length === 0 || yTicks.length === 0) {
            throw new Error("Consumption chart axis label text nodes are unavailable");
          }
          const style = getComputedStyle(section);
          const svgBox = svg?.getBoundingClientRect();
          const barBox = bar?.getBoundingClientRect();
          const barCenters = [
            ...section.querySelectorAll<SVGGraphicsElement>(".recharts-bar-rectangle"),
          ]
            .map((rect) => rect.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0)
            .map((box) => box.left + box.width / 2)
            .sort((a, b) => a - b)
            .filter((center, index, centers) => index === 0 || center - centers[index - 1] > 1);
          return {
            sectionPaddingBottom: parseFloat(style.paddingBottom),
            wrapperWidth: wrapper?.getBoundingClientRect().width ?? 0,
            svgLeft: svgBox?.left ?? 0,
            svgRight: svgBox?.right ?? 0,
            svgTop: svgBox?.top ?? 0,
            svgBottom: svgBox?.bottom ?? 0,
            barWidth: barBox?.width ?? 0,
            barCenterGaps: barCenters.slice(1).map((center, index) => center - barCenters[index]),
            yTickCount: yTicks.length,
            xTickCount: xTicks.length,
            xTexts: xTicks
              .map((tick) => tick.textContent?.trim())
              .filter((text): text is string => Boolean(text)),
            xTextGeometry: xTicks
              .map((text) => {
                const box = text.getBoundingClientRect();
                return {
                  left: box.left,
                  right: box.right,
                  top: box.top,
                  bottom: box.bottom,
                  width: box.width,
                  height: box.height,
                };
              })
              .sort((a, b) => a.left - b.left),
            yValues: yTicks
              .map((tick) => Number(tick.textContent?.trim().replaceAll(",", "")))
              .filter((value) => Number.isFinite(value)),
          };
        });

        expect(
          geometry.sectionPaddingBottom,
          `${id}: safe-area-aware dedicated bottom space`,
        ).toBeGreaterThanOrEqual(32);
        expect(geometry.wrapperWidth, `${id}: chart wrapper width`).toBeLessThanOrEqual(
          width - 16 + 1,
        );
        expect(geometry.svgRight, `${id}: chart SVG must not exceed viewport`).toBeLessThanOrEqual(
          width + 1,
        );
        expect(geometry.yTickCount, `${id}: Y axis is rendered`).toBeGreaterThan(1);
        expect(geometry.yValues.length, `${id}: Y axis has numeric ticks`).toBeGreaterThan(1);
        expect(
          geometry.yValues.every((value) => value >= 0),
          `${id}: Y axis tick values are valid`,
        ).toBe(true);
        expect(
          geometry.barWidth,
          `${id}: mobile bar width is positive and bounded`,
        ).toBeGreaterThan(0);
        expect(geometry.barWidth).toBeLessThanOrEqual(width <= 350 ? 9 : 11);
        expect(geometry.barCenterGaps, `${id}: bars have readable category spacing`).toEqual(
          expect.arrayContaining([expect.any(Number)]),
        );
        expect(
          Math.min(...geometry.barCenterGaps),
          `${id}: bar centers do not overlap`,
        ).toBeGreaterThan(geometry.barWidth);
        expect(geometry.xTickCount, `${id}: X axis has ticks`).toBeGreaterThan(1);
        expect(
          geometry.xTexts.every((text) => /^\d{4}Q[1-4]$/.test(text ?? "")),
          `${id}: X labels are complete`,
        ).toBe(true);
        expect(
          geometry.xTextGeometry.length,
          `${id}: X tick SVG text has measurable geometry`,
        ).toBe(geometry.xTickCount);
        expect(
          geometry.xTextGeometry.every(
            (box) =>
              [box.left, box.right, box.top, box.bottom, box.width, box.height].every(
                Number.isFinite,
              ) &&
              box.width > 0 &&
              box.height > 0,
          ),
          `${id}: X tick text rectangles are finite and non-zero`,
        ).toBe(true);
        expect(
          geometry.xTextGeometry.every(
            (box) =>
              box.left >= geometry.svgLeft &&
              box.right <= geometry.svgRight &&
              box.top >= geometry.svgTop &&
              box.bottom <= geometry.svgBottom,
          ),
          `${id}: X tick labels are inside the SVG display rectangle`,
        ).toBe(true);
        expect(
          geometry.xTextGeometry
            .slice(1)
            .every((box, index) => box.left >= geometry.xTextGeometry[index].right),
          `${id}: adjacent X tick SVG text rectangles do not intersect`,
        ).toBe(true);
      }

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `${width}px: no horizontal overflow`).toBeLessThanOrEqual(
        overflow.clientWidth,
      );
    });
  }

  for (const viewport of [
    { width: 375, height: 667, name: "375x667" },
    { width: 320, height: 480, name: "320x480" },
    { width: 667, height: 375, name: "landscape" },
  ]) {
    test(`${viewport.name}: 名目・実質tooltipが全費目を内部スクロール表示し、閉じる操作が機能する`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      for (const id of CHARTS) {
        const root = chart(page, id);
        await expect(root).toBeVisible({ timeout: 15000 });
        await tapVisibleBar(page, root);
        const tooltip = root.locator('.recharts-tooltip-wrapper [style*="position: fixed"]');
        await expect(tooltip).toBeVisible({ timeout: 5000 });
        await expect(tooltip).toContainText("合計");
        const payloadRows = await tooltip
          .locator(":scope > div")
          .evaluateAll(
            (children) =>
              children.filter(
                (child) =>
                  child.querySelectorAll(":scope > span").length >= 2 &&
                  !child.textContent?.trim().startsWith("合計"),
              ).length,
          );
        expect(
          payloadRows,
          `${id}: tooltip displays all payload categories`,
        ).toBeGreaterThanOrEqual(10);
        await expect(
          tooltip,
          `${id}: tooltip does not collapse the top five categories`,
        ).not.toContainText(/他\s*\d+\s*件/);
        const detail = await tooltip.evaluate((element) => {
          const el = element as HTMLElement;
          const box = el.getBoundingClientRect();
          return {
            overflowY: getComputedStyle(el).overflowY,
            maxHeight: parseFloat(getComputedStyle(el).maxHeight),
            paddingBottom: parseFloat(getComputedStyle(el).paddingBottom),
            safeAreaPadding: el.style.paddingBottom,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
          };
        });
        expect(detail.overflowY).toBe("auto");
        expect(detail.maxHeight).toBeGreaterThan(0);
        expect(detail.paddingBottom).toBeGreaterThanOrEqual(10);
        expect(detail.safeAreaPadding).toContain("env(safe-area-inset-bottom");
        expect(detail.scrollHeight).toBeGreaterThan(detail.clientHeight);
        expect(detail.box.left).toBeGreaterThanOrEqual(0);
        expect(detail.box.right).toBeLessThanOrEqual(viewport.width);
        expect(detail.box.top).toBeGreaterThanOrEqual(0);
        expect(detail.box.bottom).toBeLessThanOrEqual(viewport.height);
        await tooltip.evaluate((element) => {
          (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight;
        });
        expect(
          await tooltip.evaluate(
            (element) => (element as HTMLElement).scrollTop + (element as HTMLElement).clientHeight,
          ),
        ).toBeGreaterThanOrEqual(detail.scrollHeight - 1);
        const close = tooltip.getByRole("button", { name: "閉じる" });
        await expect(close).toBeVisible();
        const closeBox = await close.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        });
        expect(
          closeBox.left,
          `${id}: scrolled tooltip close button is inside viewport`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          closeBox.right,
          `${id}: scrolled tooltip close button is inside viewport`,
        ).toBeLessThanOrEqual(viewport.width);
        expect(
          closeBox.top,
          `${id}: scrolled tooltip close button is inside viewport`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          closeBox.bottom,
          `${id}: scrolled tooltip close button is inside viewport`,
        ).toBeLessThanOrEqual(viewport.height);
        await close.click();
        await expect(tooltip).toBeHidden();
      }
    });
  }
});
