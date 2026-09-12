import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const CHARTS = ["spending-chart-nominal", "spending-chart-real"] as const;

async function tapVisibleBar(page: Page, chart: Locator) {
  await chart.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");

  const bars = chart.locator(".recharts-bar-rectangle");
  // 先頭には費目値のない古い期が含まれるため、最新期側から探す。
  for (let index = (await bars.count()) - 1; index >= 0; index -= 1) {
    const bar = bars.nth(index);
    const box = await bar.boundingBox();
    if (
      box &&
      box.width > 0 &&
      box.height > 0 &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height
    ) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      return;
    }
  }
  throw new Error("No actionable consumption bar is fully inside the viewport");
}

test.describe("消費支出 mobile-pixel acceptance (Plan25/OpenSpec)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-pixel", "mobile-pixel の実DOM証跡のみを検証する");
  });

  test("名目・実質の凡例ボタンは実DOMで32px以上の幅・高さを持つ", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const id of CHARTS) {
      const chart = page.getByTestId(id);
      await expect(chart).toBeVisible({ timeout: 15000 });
      const summary = chart.locator("summary");
      await summary.click();
      const buttons = chart.locator("button[aria-pressed]");
      await expect(buttons.first()).toBeVisible();
      const sizes = await buttons.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
      expect(sizes.length, `${id}: 凡例ボタンが存在する`).toBeGreaterThan(0);
      expect(
        sizes.every(({ width, height }) => width >= 32 && height >= 32),
        `${id}: 凡例ボタンの実DOM幅・高さは32px以上であるべき: ${JSON.stringify(sizes)}`,
      ).toBe(true);
    }
  });

  test("名目・実質tooltipの費目名は14px以上、合計は16px以上、数値セルは右揃え", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const id of CHARTS) {
      const chart = page.getByTestId(id);
      await expect(chart).toBeVisible({ timeout: 15000 });
      await tapVisibleBar(page, chart);

      const tooltip = chart.locator('.recharts-tooltip-wrapper > div[style*="position: fixed"]');
      await expect(tooltip).toBeVisible({ timeout: 5000 });
      const metrics = await tooltip.evaluate((element) => {
        const rows = [...element.querySelectorAll<HTMLElement>(":scope > div")];
        const total = rows.find((row) => row.textContent?.trim().startsWith("合計"));
        const expenseRows = rows.filter(
          (row) =>
            !row.textContent?.trim().startsWith("合計") &&
            row.querySelectorAll<HTMLElement>(":scope > span").length >= 2,
        );
        return {
          totalFontSize: total ? parseFloat(getComputedStyle(total).fontSize) : 0,
          expenseFontSizes: expenseRows.map((row) => {
            const cells = row.querySelectorAll<HTMLElement>(":scope > span");
            const label = [...cells].find(
              (cell) =>
                Boolean(cell.textContent?.trim()) &&
                getComputedStyle(cell).marginLeft !== "auto" &&
                getComputedStyle(cell).width !== "8px",
            );
            return label ? parseFloat(getComputedStyle(label).fontSize) : 0;
          }),
          numericAlignments: expenseRows.map((row) => {
            const cells = row.querySelectorAll<HTMLElement>(":scope > span");
            const numeric = cells[cells.length - 1];
            return numeric
              ? {
                  computed: getComputedStyle(numeric).textAlign,
                }
              : { computed: "" };
          }),
        };
      });

      expect(metrics.totalFontSize, `${id}: 合計のfont-size`).toBeGreaterThanOrEqual(16);
      expect(metrics.expenseFontSizes, `${id}: 費目名のfont-size`).not.toEqual([]);
      expect(
        metrics.expenseFontSizes.every((size) => size >= 14),
        `${id}: 費目名は14px以上`,
      ).toBe(true);
      expect(
        metrics.numericAlignments.every(({ computed }) => computed === "right"),
        `${id}: 数値セルのcomputed text-align`,
      ).toBe(true);
    }
  });

  test("名目・実質の初期summaryは閉じ、費目・四半期の変更方法と状態要約を示す", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const id of CHARTS) {
      const chart = page.getByTestId(id);
      await expect(chart).toBeVisible({ timeout: 15000 });
      const details = chart.locator("details");
      const summary = details.locator("summary");
      await expect(details).not.toHaveAttribute("open");
      await expect(summary).toContainText("費目・四半期");
      await expect(summary).toContainText(/変更|状態|表示/);
    }
  });

  test("凡例で全系列を非表示にすると空状態を示し、1系列の再選択でチャートが復帰する", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chart = page.getByTestId("spending-chart-nominal");
    await expect(chart).toBeVisible({ timeout: 15000 });
    await chart.locator("summary").click();
    const series = chart.locator("button[aria-pressed]").filter({ hasText: /.+/ }).nth(4);
    const seriesName = (await series.textContent())?.trim();
    const initialBars = chart.locator(".recharts-bar-rectangle");
    await chart.getByRole("button", { name: "全選択解除" }).click();
    await expect(chart.locator(".recharts-bar-rectangle")).toHaveCount(0);
    await expect(chart).toContainText(
      /系列.*表示|表示.*系列|表示する系列がありません|データがありません/,
    );

    await series.click();
    await expect(series).toHaveAttribute("aria-pressed", "true");
    await expect(initialBars.first()).toBeVisible();
    expect(seriesName).toBeTruthy();
  });

  test("dark modeと文字拡大後もtooltipを閉じられ、費目名と値が可視である", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload({ waitUntil: "networkidle" });
    await page.keyboard.press("Control++");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const chart = page.getByTestId("spending-chart-nominal");
    await expect(chart).toBeVisible({ timeout: 15000 });
    await tapVisibleBar(page, chart);
    const tooltip = chart.locator('.recharts-tooltip-wrapper > div[style*="position: fixed"]');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(tooltip.getByRole("button", { name: "閉じる" })).toBeVisible();
    const rows = tooltip.locator(":scope > div");
    await expect(rows.nth(1)).toBeVisible();
    await expect(tooltip).toContainText(/食料|住居|光熱・水道/);
    await expect(tooltip).toContainText(/\d/);
    await tooltip.getByRole("button", { name: "閉じる" }).click();
    await expect(tooltip).toBeHidden();
  });

  test("375x667でtooltip最下部までスクロール後も閉じるbuttonがviewport内に表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/", { waitUntil: "networkidle" });

    for (const id of CHARTS) {
      const chart = page.getByTestId(id);
      await expect(chart).toBeVisible({ timeout: 15000 });
      await tapVisibleBar(page, chart);

      const tooltip = chart.locator('.recharts-tooltip-wrapper > div[style*="position: fixed"]');
      await expect(tooltip).toBeVisible({ timeout: 5000 });
      const scrollHeight = await tooltip.evaluate((element) => {
        const el = element as HTMLElement;
        el.scrollTop = el.scrollHeight;
        return el.scrollHeight;
      });
      expect(
        await tooltip.evaluate((element) => {
          const el = element as HTMLElement;
          return el.scrollTop + el.clientHeight;
        }),
        `${id}: tooltip scroll reaches the bottom`,
      ).toBeGreaterThanOrEqual(scrollHeight - 1);

      const close = tooltip.getByRole("button", { name: "閉じる" });
      await expect(close).toBeVisible();
      const closeBox = await close.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      });
      expect(closeBox.left, `${id}: close button left is in viewport`).toBeGreaterThanOrEqual(0);
      expect(closeBox.right, `${id}: close button right is in viewport`).toBeLessThanOrEqual(375);
      expect(closeBox.top, `${id}: close button top is in viewport`).toBeGreaterThanOrEqual(0);
      expect(closeBox.bottom, `${id}: close button bottom is in viewport`).toBeLessThanOrEqual(667);

      await close.click();
      await expect(tooltip).toBeHidden();
    }
  });
});
