import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";

const INTERNAL_SERIES = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数/;

async function hoverQuarterActionableMark(
  page: import("@playwright/test").Page,
  testId: string,
  index: number,
) {
  const chart = page.getByTestId(testId);
  await chart.scrollIntoViewIfNeeded();
  // 開始年を2025年に設定しているため、先頭の棒は2025Q1に対応する。
  await expect(
    chart.locator(".recharts-xAxis-tick-labels text").filter({ hasText: "2025Q1" }).first(),
  ).toBeVisible();
  await chart.locator(".recharts-bar-rectangle").nth(index).hover();
  return chart.locator(".recharts-tooltip-wrapper");
}

test.describe("Plan23 quarterly public projection", () => {
  test("ready state renders only the two public quarterly consumption series", async ({ page }) => {
    await page.goto("/");

    const nominal = page.getByTestId("spending-chart-nominal");
    const real = page.getByTestId("spending-chart-real");
    await expect(nominal).toBeVisible({ timeout: 15000 });
    await expect(real).toBeVisible({ timeout: 15000 });
    await expect(nominal).toHaveText(/消費支出（名目）/);
    await expect(real).toHaveText(/消費支出（実質）/);

    // 実質チャートの凡例は仕様上初期折畳のため、公開系列を検証する前に展開する。
    const realLegend = real.locator("summary");
    await expect(realLegend).toContainText("費目・四半期を変更");
    await expect(realLegend).toContainText(/費目 \d+\/\d+・四半期 \d+\/\d+/);
    await expect(realLegend).toContainText("全選択");
    await realLegend.click();

    for (const section of [nominal, real]) {
      await expect(section.getByText("民間最終消費", { exact: true })).toBeVisible();
      await expect(section).not.toContainText(INTERNAL_SERIES);
    }

    const tableChecks = [
      ["#data-table-section-consumption-nominal", "民間最終消費", "GDP名目"] as const,
      ["#data-table-section-consumption-real", "民間最終消費", "GDP実質"] as const,
    ];
    for (const [selector, rawHeader, comparisonHeader] of tableChecks) {
      const table = page.locator(selector);
      await table.getByText(/データテーブルを表示/).click();
      await expect(table.locator("tbody tr")).toHaveCount(12);
      const headers = await table.locator("thead th").allTextContents();
      expect(headers.filter((header) => header.includes(rawHeader))).toHaveLength(1);
      expect(headers.some((header) => header.includes(comparisonHeader))).toBe(false);
      expect(headers.some((header) => INTERNAL_SERIES.test(header))).toBe(false);

      const supportIndex = headers.findIndex((header) => header.includes(rawHeader));
      const csvDownload = page.waitForEvent("download", { timeout: 15000 });
      await table.getByRole("button", { name: /CSVでダウンロード/ }).click();
      const csvPath = await (await csvDownload).path();
      expect(csvPath).not.toBeNull();
      const csvRows = (await readFile(csvPath!, "utf8"))
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.split(","));
      // Plan23のデータ結合後の数値検証はunitテストに委ねる。
      for (const period of ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]) {
        const cells = table.locator("tbody tr").filter({ hasText: period }).locator("td");
        await expect(cells.first()).toHaveText(period);
        const tableValue = await cells.nth(supportIndex).innerText();
        expect(tableValue).not.toBe("");
        const csvRow = csvRows.find(([rowPeriod]) => rowPeriod === period);
        expect(csvRow).toBeDefined();
        expect(csvRow?.[supportIndex]).toBe(tableValue);
      }
    }

    await page.getByRole("button", { name: "表示期間を変更" }).click();
    await page.locator("#startYear").selectOption("2025");

    for (const [kind, testId, selector, ctiLabel] of [
      ["nominal", "spending-chart-nominal", "#data-table-section-consumption-nominal", "食料"],
      ["real", "spending-chart-real", "#data-table-section-consumption-real", "食料"],
    ] as const) {
      const table = page.locator(selector);
      await expect(table.locator("th").filter({ hasText: "GDP" })).toHaveCount(0);
      await expect(table).toContainText("2025Q4");
      const publicHeaders = await table.locator("thead th").allTextContents();
      const publicIndex = publicHeaders.findIndex((header) => header.includes(ctiLabel));
      expect(publicIndex).toBeGreaterThanOrEqual(0);
      const download = page.waitForEvent("download", { timeout: 15000 });
      await table.getByRole("button", { name: /CSVでダウンロード/ }).click();
      const csvPath = await (await download).path();
      expect(csvPath).not.toBeNull();
      const csv = await readFile(csvPath!, "utf8");
      expect(csv).toContain(ctiLabel);
      expect(csv).not.toMatch(INTERNAL_SERIES);
      const csvLines = csv.trim().split(/\r?\n/);
      const csvHeaders = csvLines[0].split(",");
      expect(csvHeaders.some((header) => header.includes("GDP"))).toBe(false);
      const publicColumnIndex = csvHeaders.findIndex((header) => header.includes(ctiLabel));
      expect(publicColumnIndex).toBeGreaterThanOrEqual(0);
      const csvRows = csvLines.slice(1).map((line) => line.split(","));
      for (const period of ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]) {
        const row = csvRows.find(([rowPeriod]) => rowPeriod === period);
        expect(row).toBeDefined();
        const value = Number(row?.[publicColumnIndex]);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).not.toBe(0);
      }

      for (const [period, index] of [
        ["2025Q1", 0],
        ["2025Q4", 3],
      ] as const) {
        const tooltip = await hoverQuarterActionableMark(page, testId, index);
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText(ctiLabel);
        await expect(tooltip.locator("text=合計")).toBeVisible();
        await expect(tooltip.locator("p").first()).toHaveText(period);
        const tableValue = await table
          .locator("tbody tr")
          .filter({ hasText: period })
          .locator("td")
          .nth(publicIndex)
          .innerText();
        await expect(tooltip).toContainText(tableValue);
        await expect(tooltip).not.toContainText(INTERNAL_SERIES);
        await expect(tooltip).not.toContainText("GDP");
      }
    }
  });
});
