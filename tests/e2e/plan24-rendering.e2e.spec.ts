import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const chartIds = ["spending-chart-nominal", "spending-chart-real"] as const;
const publicKeys = {
  "spending-chart-nominal": "CTIミクロ四半期系列（名目）",
  "spending-chart-real": "民間最終消費支出（実質）",
} as const;
const ACTION_TIMEOUT = 5_000;
const ASSERTION_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;
const SCREENSHOT_TIMEOUT = 15_000;

const bars = (page: Page, id: string) => page.getByTestId(id).locator(".recharts-bar-rectangle");
async function setRange(page: Page, start: number, end: number) {
  const open = async () => {
    if (
      !(await page
        .locator("#startYear")
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole("button", { name: "表示期間を変更" }).click({ timeout: ACTION_TIMEOUT });
    }
    await expect(page.locator("#startYear")).toBeVisible({ timeout: ACTION_TIMEOUT });
  };
  // ChartFilters disables options that would temporarily make start > end.
  // Follow the same safe ordering as the range-change E2E, reopening the sheet
  // after each change because the filter sheet closes on change.
  if (start < end) {
    await open();
    await page.locator("#startYear").selectOption(String(start), { timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(100);
    await open();
    await page.locator("#endYear").selectOption(String(end), { timeout: ACTION_TIMEOUT });
  } else {
    await open();
    await page.locator("#endYear").selectOption(String(end), { timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(100);
    await open();
    await page.locator("#startYear").selectOption(String(start), { timeout: ACTION_TIMEOUT });
  }
}

async function selectAllQuarters(page: Page, id: string) {
  const chart = page.getByTestId(id);
  for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
    const button = chart.getByRole("button", { name: quarter, exact: true });
    if ((await button.getAttribute("aria-pressed")) !== "true") {
      await button.click({ timeout: ACTION_TIMEOUT });
    }
  }
}

async function hoverBar(page: Page, id: string, index = 0) {
  await page.waitForTimeout(250);
  const chartBars = bars(page, id);
  const bar = index === -1 ? chartBars.last() : chartBars.nth(index);
  await expect(bar).toBeVisible({ timeout: ACTION_TIMEOUT });
  await bar.hover({ timeout: ACTION_TIMEOUT });
  const tooltip = page.getByTestId(id).locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toBeVisible({ timeout: ASSERTION_TIMEOUT });
  return tooltip;
}

async function saveChartScreenshots(page: Page, range: string, width: number) {
  const viewport = width === 375 ? "375px" : "normal";
  const directory = `artifacts/plan24/screenshots/${range}/${viewport}`;
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width, height: 812 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  for (const [kind, id] of [
    ["nominal", chartIds[0]],
    ["real", chartIds[1]],
  ] as const) {
    await page.getByTestId(id).screenshot({
      path: `${directory}/${kind}.png`,
      timeout: SCREENSHOT_TIMEOUT,
    });
  }
}

test.describe("Plan24 rendering contract", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { timeout: NAVIGATION_TIMEOUT });
    for (const id of chartIds) {
      await expect(bars(page, id).first()).toBeVisible({ timeout: ASSERTION_TIMEOUT });
    }
  });

  test("名目CTIは2005〜2017専用、2018以降はlegacy費目でGDPを公開しない", async ({ page }) => {
    for (const id of chartIds) {
      expect(await page.getByTestId(id).locator(".recharts-line-curve").count()).toBe(0);
    }
    await setRange(page, 2005, 2017);
    await selectAllQuarters(page, "spending-chart-nominal");
    await saveChartScreenshots(page, "2017q4-boundary", 1280);
    await saveChartScreenshots(page, "2017q4-boundary", 375);
    for (const id of chartIds) {
      const chart = page.getByTestId(id);
      const contract = chart.locator('[data-testid="chart-data-contract"]');
      expect(await contract.getAttribute("data-series")).toContain(publicKeys[id]);
      const supportPeriods = (await chart.getAttribute("data-support-periods"))?.split(",") ?? [];
      expect(await contract.getAttribute("data-series")).not.toMatch(/GDP(?:名目|実質)/);
      if (id === "spending-chart-nominal") {
        expect(supportPeriods).toHaveLength(52);
        expect(supportPeriods[0]).toBe("2005Q1");
        expect(supportPeriods.at(-1)).toBe("2017Q4");
        const periods = await contract
          .locator("[data-chart-data-row]")
          .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-period") ?? ""));
        expect(periods).toHaveLength(52);
        expect(periods[0]).toBe("2005Q1");
        expect(periods.at(-1)).toBe("2017Q4");
      } else {
        expect(supportPeriods).toContain("2017Q4");
      }
    }
    await page.setViewportSize({ width: 1280, height: 812 });
    await setRange(page, 2018, 2018);
    await saveChartScreenshots(page, "2018q1-boundary", 1280);
    await saveChartScreenshots(page, "2018q1-boundary", 375);
    for (const id of chartIds) {
      const chart = page.getByTestId(id);
      await expect(chart).toHaveAttribute("data-cti-periods", /2018Q1/);
      await expect(chart).toHaveAttribute("data-support-periods", "");
      expect(
        await chart.locator('[data-testid="chart-data-contract"]').getAttribute("data-series"),
      ).not.toMatch(/GDP(?:名目|実質)/);
    }
  });

  test("Q1〜Q4の切替と表示期間変更が実描画に反映される", async ({ page }) => {
    const chart = page.getByTestId("spending-chart-nominal");
    const initial = await bars(page, "spending-chart-nominal").count();
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
      const button = chart.getByRole("button", { name: quarter, exact: true });
      await button.click({ timeout: ACTION_TIMEOUT });
      await expect(button).toHaveAttribute("aria-pressed", "false", { timeout: ASSERTION_TIMEOUT });
    }
    expect(await bars(page, "spending-chart-nominal").count()).toBeLessThan(initial);
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
      const button = chart.getByRole("button", { name: quarter, exact: true });
      await button.click({ timeout: ACTION_TIMEOUT });
      await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: ASSERTION_TIMEOUT });
    }
    await page.setViewportSize({ width: 1280, height: 812 });
    await setRange(page, 2025, 2025);
    await saveChartScreenshots(page, "2025q1-q4", 1280);
    await saveChartScreenshots(page, "2025q1-q4", 375);
    expect(await bars(page, "spending-chart-nominal").count()).toBeGreaterThan(0);
    // 途中欠損/未readyは実データのブラウザ経路では生成できないため、
    // quarterly-gdp-join.test.ts の未ready契約とclient-calculations契約で検証する。
  });

  test("2025Q1/Q4の表・CSV・tooltipの表示値を再確認", async ({ page }) => {
    await setRange(page, 2025, 2025);
    for (const [id, tableId, label] of [
      [
        "spending-chart-nominal",
        "#data-table-section-consumption-nominal",
        "CTIミクロ（名目・四半期平均）",
      ] as const,
      ["spending-chart-real", "#data-table-section-consumption-real", "民間最終消費"] as const,
    ]) {
      const table = page.locator(tableId);
      await table.getByText(/データテーブルを表示/).click({ timeout: ACTION_TIMEOUT });
      await expect(table).toContainText("2025Q4", { timeout: ASSERTION_TIMEOUT });
      const headers = await table.locator("thead th").allTextContents();
      expect(headers.some((header) => /GDP|民間最終消費支出/.test(header))).toBe(false);
      if (id === "spending-chart-nominal") {
        expect(headers.some((header) => header.includes("民間最終消費"))).toBe(false);
      }
      const supportIndex = headers.findIndex((header) => header.includes(label));
      expect(supportIndex).toBeGreaterThanOrEqual(0);
      const valueIndex = headers.findIndex((header) => header.includes("食料"));
      expect(valueIndex).toBeGreaterThanOrEqual(0);
      const foodLabel = headers[valueIndex].trim();
      const foodTooltipLabel = foodLabel;
      for (const [period, barIndex] of [
        ["2025Q1", 0],
        ["2025Q4", 3],
      ] as const) {
        const row = table.locator("tbody tr").filter({ hasText: period }).locator("td");
        const foodValue = await row.nth(valueIndex).innerText();
        const total = (await row.allInnerTexts())
          .slice(1)
          .map((value, offset) => ({ value: Number(value), index: offset + 1 }))
          .filter(({ index }) => index !== supportIndex)
          .map(({ value }) => value)
          .filter(Number.isFinite)
          .reduce((sum, value) => sum + value, 0)
          .toFixed(2);
        await expect(row.nth(supportIndex)).not.toHaveText("", { timeout: ASSERTION_TIMEOUT });
        const tooltip = await hoverBar(page, id, barIndex);
        await expect(tooltip).toContainText(period, { timeout: ASSERTION_TIMEOUT });
        const foodRow = tooltip.getByText(foodTooltipLabel, { exact: true }).locator("..");
        await expect(foodRow.getByText(foodValue, { exact: true })).toBeVisible();
        await expect(tooltip).toContainText(`合計${total}`);
        await expect(tooltip).not.toContainText("GDP");
      }
    }
  });

  test("Plan24の比較ケースを通常幅と375px幅でチャート要素保存する", async ({ page }) => {
    const cases = [
      ["all", undefined],
      ["latest-year", [2026, 2026] as const],
    ] as const;
    for (const [name, range] of cases) {
      if (range) {
        await page.goto("/", { timeout: NAVIGATION_TIMEOUT });
        await expect(bars(page, chartIds[0]).first()).toBeVisible({ timeout: ASSERTION_TIMEOUT });
        await expect(bars(page, chartIds[1]).first()).toBeVisible({ timeout: ASSERTION_TIMEOUT });
      }
      await page.setViewportSize({ width: 1280, height: 812 });
      if (range) await setRange(page, ...range);
      await saveChartScreenshots(page, name, 1280);
      await saveChartScreenshots(page, name, 375);
    }
  });
});
