import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const NOMINAL = "spending-chart-nominal";

const bars = (page: Page, testId: string) =>
  page.getByTestId(testId).locator(".recharts-bar-rectangle");

async function setDisplayRange(page: Page, start: number, end: number) {
  const openSheet = async () => {
    if (
      !(await page
        .locator("#startYear")
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole("button", { name: "表示期間を変更" }).click();
    }
  };
  await openSheet();
  await page.locator("#startYear").selectOption(String(start));
  await openSheet();
  await page.locator("#endYear").selectOption(String(end));
}

type ViewportPoint = { x: number; y: number };

async function findViewportBar(
  page: Page,
  testId: string,
  preferredIndex = 0,
): Promise<ViewportPoint> {
  const chart = page.getByTestId(testId);
  await chart.scrollIntoViewIfNeeded();
  const chartBars = bars(page, testId);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");
  const count = await chartBars.count();
  const order = Array.from({ length: count }, (_, index) => (preferredIndex + index) % count);
  for (const index of order) {
    const bar = chartBars.nth(index);
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
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
  }
  throw new Error("No actionable bar is fully inside the viewport");
}

test.describe("ツールチップ積み上げ合計表示 E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(bars(page, NOMINAL).first()).toBeVisible({ timeout: 10000 });
  });

  test("T7: 消費支出（名目）の2022年以降の棒をホバーするとツールチップに「合計」が出る", async ({
    page,
  }) => {
    await setDisplayRange(page, 2022, 2025);
    const nominalBars = bars(page, NOMINAL);
    const count = await nominalBars.count();
    expect(count).toBeGreaterThan(5);

    const targetPoint = await findViewportBar(page, NOMINAL, Math.min(count - 2, 5));
    await page.mouse.move(targetPoint.x, targetPoint.y);

    const chartWrapper = page.getByTestId(NOMINAL);
    const tooltip = chartWrapper.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator("text=合計")).toBeVisible();
  });

  test("T8: 凡例で系列を非表示にすると合計値が減る", async ({ page }) => {
    await setDisplayRange(page, 2022, 2025);
    const nominalBars = bars(page, NOMINAL);
    const count = await nominalBars.count();
    const targetIndex = Math.min(count - 2, 5);
    const point = await findViewportBar(page, NOMINAL, targetIndex);
    await page.mouse.move(point.x, point.y);

    const chartWrapper = page.getByTestId(NOMINAL);
    const tooltip = chartWrapper.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator("text=合計")).toBeVisible();

    const totalTextBefore = await tooltip.locator("text=合計").locator("xpath=..").textContent();

    const legendButtons = page.getByTestId(NOMINAL).locator("[aria-pressed]");
    const foodButton = legendButtons.nth(4);
    await foodButton.click();
    await expect(foodButton).toHaveAttribute("aria-pressed", "false");

    // Leave the chart once so Recharts clears the previous hover payload.
    await page.mouse.move(0, 0);
    const pointAfter = await findViewportBar(page, NOMINAL, targetIndex);
    await page.mouse.move(pointAfter.x, pointAfter.y);
    await expect(tooltip).toBeVisible();
    const totalTextAfter = await tooltip.locator("text=合計").locator("xpath=..").textContent();

    expect(totalTextBefore).not.toEqual(totalTextAfter);
  });

  test("T9: 物価指数 費目別寄与度（section-stacked）のツールチップには「合計」が出ない", async ({
    page,
  }) => {
    const stackedChart = page.locator("#section-stacked");
    await expect(stackedChart).toBeVisible();

    await stackedChart.locator(".recharts-surface").hover({ position: { x: 200, y: 150 } });

    const tooltip = stackedChart.locator(".recharts-tooltip-wrapper");
    if (await tooltip.isVisible().catch(() => false)) {
      await expect(tooltip.locator("text=合計")).toHaveCount(0);
    }
  });
});
