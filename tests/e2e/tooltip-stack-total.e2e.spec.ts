import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const NOMINAL = "spending-chart-nominal";

const bars = (page: Page, testId: string) =>
  page.getByTestId(testId).locator(".recharts-bar-rectangle");

test.describe("ツールチップ積み上げ合計表示 E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(bars(page, NOMINAL).first()).toBeVisible({ timeout: 10000 });
  });

  test("T7: 消費支出（名目）の2022年以降の棒をホバーするとツールチップに「合計」が出る", async ({
    page,
  }) => {
    const nominalBars = bars(page, NOMINAL);
    const count = await nominalBars.count();
    expect(count).toBeGreaterThan(5);

    const targetBar = nominalBars.nth(Math.min(count - 2, 5));
    await targetBar.hover();

    const chartWrapper = page.getByTestId(NOMINAL);
    const tooltip = chartWrapper.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator("text=合計")).toBeVisible();
  });

  test("T8: 凡例で系列を非表示にすると合計値が減る", async ({ page }) => {
    const nominalBars = bars(page, NOMINAL);
    const count = await nominalBars.count();
    const targetIndex = Math.min(count - 2, 5);
    const bar = nominalBars.nth(targetIndex);
    await bar.hover();

    const chartWrapper = page.getByTestId(NOMINAL);
    const tooltip = chartWrapper.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator("text=合計")).toBeVisible();

    const totalTextBefore = await tooltip.locator("text=合計").locator("xpath=..").textContent();

    const legendButtons = page.getByTestId(NOMINAL).locator("[aria-pressed]");
    const foodButton = legendButtons.nth(4);
    await foodButton.click();
    await page.waitForTimeout(300);

    const barAfter = bars(page, NOMINAL).nth(targetIndex);
    await barAfter.hover();
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
