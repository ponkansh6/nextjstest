import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";

const INTERNAL_SERIES = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数/;
const GDP_FACTORS = { nominal: 0.0011398911460950036, real: 0.001298186239096047 };

async function expectedGdpValues(kind: "nominal" | "real") {
  const file =
    kind === "nominal"
      ? "data/source/cti_support_nominal_quarterly2025.csv"
      : "data/source/cti_support_real_quarterly2025.csv";
  const lines = (await readFile(file, "utf8")).trim().split("\n").slice(1);
  return new Map(
    lines
      .map((line) => line.split(","))
      .filter(([period]) => /^2025-Q[1-4]$/.test(period))
      .map(([period, raw]) => [
        period.replace("-", ""),
        (Number(raw) * GDP_FACTORS[kind]).toFixed(2),
      ]),
  );
}

async function hoverQuarterActionableMark(page: import("@playwright/test").Page, testId: string) {
  const chart = page.getByTestId(testId);
  await chart.scrollIntoViewIfNeeded();
  // 開始年を2025年に設定しているため、先頭の棒は2025Q1に対応する。
  await expect(chart.getByText("2025Q1", { exact: true })).toBeVisible();
  await chart.locator(".recharts-bar-rectangle").first().hover();
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
    await expect(realLegend).toHaveText("凡例を表示（費目・四半期）");
    await realLegend.click();

    for (const section of [nominal, real]) {
      await expect(section.getByText("民間最終消費支出", { exact: true })).toBeVisible();
      await expect(section).not.toContainText(INTERNAL_SERIES);
    }

    const expected = {
      nominal: await expectedGdpValues("nominal"),
      real: await expectedGdpValues("real"),
    };
    const tableChecks = [
      [
        "nominal",
        "#data-table-section-consumption-nominal",
        "民間最終消費支出",
        "GDP名目",
      ] as const,
      ["real", "#data-table-section-consumption-real", "民間最終消費支出", "GDP実質"] as const,
    ];
    for (const [kind, selector, rawHeader, comparisonHeader] of tableChecks) {
      const table = page.locator(selector);
      await table.getByText(/データテーブルを表示/).click();
      await expect(table.locator("tbody tr")).toHaveCount(12);
      const headers = await table.locator("thead th").allTextContents();
      expect(headers.filter((header) => header.includes(rawHeader))).toHaveLength(1);
      expect(headers.some((header) => header.includes(comparisonHeader))).toBe(false);
      expect(headers.some((header) => INTERNAL_SERIES.test(header))).toBe(false);

      const supportIndex = headers.findIndex((header) => header.includes(rawHeader));
      for (const period of ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]) {
        const cells = table.locator("tbody tr").filter({ hasText: period }).locator("td");
        const expectedValue = expected[kind].get(period);
        expect(expectedValue).toBeDefined();
        await expect(cells.first()).toHaveText(period);
        await expect(cells.nth(supportIndex)).toHaveText(expectedValue!);
      }
    }

    await page.getByRole("button", { name: "表示期間を変更" }).click();
    await page.locator("#startYear").selectOption("2025");

    for (const [kind, testId, selector, publicLabel] of [
      [
        "nominal",
        "spending-chart-nominal",
        "#data-table-section-consumption-nominal",
        "民間最終消費支出",
      ],
      ["real", "spending-chart-real", "#data-table-section-consumption-real", "民間最終消費支出"],
    ] as const) {
      const table = page.locator(selector);
      await expect(table.locator("th").filter({ hasText: "GDP" })).toHaveCount(0);
      await expect(table).toContainText("2025Q4");
      const download = page.waitForEvent("download");
      await table.getByRole("button", { name: /CSVでダウンロード/ }).click();
      const csvPath = await (await download).path();
      expect(csvPath).not.toBeNull();
      const csv = await readFile(csvPath!, "utf8");
      expect(csv).toContain(publicLabel);
      expect(csv).not.toMatch(INTERNAL_SERIES);
      const csvLines = csv.trim().split(/\r?\n/);
      const csvHeaders = csvLines[0].split(",");
      const publicColumnIndex = csvHeaders.findIndex((header) => header.includes(publicLabel));
      expect(publicColumnIndex).toBeGreaterThanOrEqual(0);
      const csvRows = csvLines.slice(1).map((line) => line.split(","));
      for (const period of ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]) {
        const row = csvRows.find(([rowPeriod]) => rowPeriod === period);
        expect(row).toBeDefined();
        expect(row?.[publicColumnIndex]).toBe(expected[kind].get(period));
      }

      const tooltip = await hoverQuarterActionableMark(page, testId);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText(publicLabel);
      await expect(tooltip.locator("p").first()).toHaveText("2025Q1");
      const tooltipText = await tooltip.textContent();
      const expectedValue = expected[kind].get("2025Q1");
      expect(expectedValue).toBeDefined();
      const escapedPublicLabel = publicLabel.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
      const valuePattern = new RegExp(
        `${escapedPublicLabel}\\s*(?:（[^）]*）)?\\s*[:：]\\s*(-?\\d+(?:\\.\\d+)?)`,
        "g",
      );
      const displayedValues = tooltipText
        ? [...tooltipText.matchAll(valuePattern)].map((match) => Number(match[1]))
        : [];
      const expectedNumber = Number(expectedValue);
      const displayedValue = displayedValues.find(
        (value) => Number.isFinite(value) && Math.abs(value - expectedNumber) <= 0.005,
      );
      expect(displayedValue).toBeDefined();
      expect(displayedValue!).toBeCloseTo(expectedNumber, 2);
      await expect(tooltip).not.toContainText(INTERNAL_SERIES);
    }
  });
});
