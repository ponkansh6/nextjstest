import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const GDP_FACTORS = { nominal: 0.0011398911460950036, real: 0.001298186239096047 };
const chartIds = ["spending-chart-nominal", "spending-chart-real"] as const;
const supportKeys = {
  "spending-chart-nominal": "民間最終消費支出（名目）",
  "spending-chart-real": "民間最終消費支出（実質）",
} as const;
const ACTION_TIMEOUT = 5_000;
const ASSERTION_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;
const SCREENSHOT_TIMEOUT = 5_000;

async function expectedGdpValue(kind: keyof typeof GDP_FACTORS, period: string) {
  const file =
    kind === "nominal"
      ? "data/source/cti_support_nominal_quarterly2025.csv"
      : "data/source/cti_support_real_quarterly2025.csv";
  const row = (await readFile(file, "utf8"))
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","))
    .find(([candidate]) => candidate === period.replace("Q", "-Q"));
  if (!row) throw new Error(`Missing GDP fixture row: ${period}`);
  return (Number(row[1]) * GDP_FACTORS[kind]).toFixed(2);
}

const bars = (page: Page, id: string) => page.getByTestId(id).locator(".recharts-bar-rectangle");
const series = (page: Page, id: string, key: string) =>
  page.getByTestId(id).getByTestId(`spending-series-${key}`);

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

  test("2017Q4以前はGDP単独棒、2018Q1以降はCTI棒でGDP線を描画しない", async ({ page }) => {
    for (const id of chartIds) {
      expect(await page.getByTestId(id).locator(".recharts-line-curve").count()).toBe(0);
    }
    await setRange(page, 2017, 2018);
    await saveChartScreenshots(page, "2017q4-boundary", 1280);
    await saveChartScreenshots(page, "2017q4-boundary", 375);
    for (const id of chartIds) {
      const chart = page.getByTestId(id);
      await expect(chart).toHaveAttribute("data-gdp-periods", /^2017Q1,2017Q2,2017Q3,2017Q4$/);
      await expect(chart).toHaveAttribute("data-cti-periods", /^2018Q1,2018Q2,2018Q3,2018Q4$/);
      await expect(series(page, id, supportKeys[id]).first()).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 812 });
      await expect(bars(page, id).first()).toBeVisible({ timeout: ASSERTION_TIMEOUT });
      const kind = id === "spending-chart-nominal" ? "nominal" : "real";
      const expected = await expectedGdpValue(kind, "2017Q4");
      const tooltip = await hoverBar(page, id, 3);
      await expect(tooltip).toContainText(`合計${expected}`);
      await expect(tooltip).toContainText(`${supportKeys[id]}: ${expected}`);
    }
    await page.setViewportSize({ width: 1280, height: 812 });
    await setRange(page, 2018, 2018);
    await saveChartScreenshots(page, "2018q1-boundary", 1280);
    await saveChartScreenshots(page, "2018q1-boundary", 375);
    for (const id of chartIds) {
      const chart = page.getByTestId(id);
      await expect(chart).toHaveAttribute("data-gdp-periods", "");
      await expect(chart).toHaveAttribute("data-cti-periods", /2018Q1/);
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
        "民間最終消費支出",
      ] as const,
      ["spending-chart-real", "#data-table-section-consumption-real", "民間最終消費支出"] as const,
    ]) {
      const table = page.locator(tableId);
      await table.getByText(/データテーブルを表示/).click({ timeout: ACTION_TIMEOUT });
      await expect(table).toContainText("2025Q4", { timeout: ASSERTION_TIMEOUT });
      const headers = await table.locator("thead th").allTextContents();
      const supportIndex = headers.findIndex((header) => header.includes(label));
      expect(supportIndex).toBeGreaterThanOrEqual(0);
      const valueIndex = headers.findIndex((header) => header.includes("食料"));
      expect(valueIndex).toBeGreaterThanOrEqual(0);
      const foodLabel = headers[valueIndex].trim();
      const foodTooltipLabel = `${foodLabel}（${id.endsWith("nominal") ? "名目" : "実質"}）`;
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
        await expect(tooltip).toContainText(`${foodTooltipLabel}: ${foodValue}`);
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
