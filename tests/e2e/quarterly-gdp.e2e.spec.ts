import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";

test.describe("Plan21 quarterly GDP smoke", () => {
  test("ready state renders quarterly consumption, raw/comparison GDP, table, and CSV", async ({
    page,
  }) => {
    await page.goto("/");

    const nominal = page.getByTestId("spending-chart-nominal");
    const real = page.getByTestId("spending-chart-real");
    await expect(nominal).toBeVisible({ timeout: 15000 });
    await expect(real).toBeVisible({ timeout: 15000 });
    await expect(nominal).toHaveText(/消費支出（名目）/);
    await expect(real).toHaveText(/消費支出（実質）/);

    for (const [section, rawLabel, comparisonLabel] of [
      [nominal, "GDP名目原値", "GDP名目比較指数（2025Q1-Q4平均=100）"],
      [real, "GDP実質原値", "GDP実質比較指数（2025Q1-Q4平均=100）"],
    ] as const) {
      if (rawLabel === "GDP実質原値") {
        await section.locator("details").locator("summary").click();
      }
      await expect(section.getByText(rawLabel, { exact: true })).toBeVisible();
      await expect(section.getByText(comparisonLabel, { exact: true })).toBeVisible();
      await expect(section).toContainText("2025Q1");
    }

    const tableChecks = [
      [
        "nominal",
        "#data-table-section-consumption-nominal",
        "cti_support_nominal_quarterly2025.csv",
        "GDP名目原値",
        "GDP名目比較指数",
      ] as const,
      [
        "real",
        "#data-table-section-consumption-real",
        "cti_support_real_quarterly2025.csv",
        "GDP実質原値",
        "GDP実質比較指数",
      ] as const,
    ];
    for (const [, selector, sourceName, rawHeader, comparisonHeader] of tableChecks) {
      const table = page.locator(selector);
      await table.getByText(/データテーブルを表示/).click();
      await expect(table.locator("tbody tr")).toHaveCount(12);
      const headers = await table.locator("thead th").allTextContents();
      const rawIndex = headers.findIndex((header) => header.includes(rawHeader));
      const comparisonIndex = headers.findIndex((header) => header.includes(comparisonHeader));
      expect(rawIndex).toBeGreaterThanOrEqual(0);
      expect(comparisonIndex).toBeGreaterThanOrEqual(0);

      const source = await readFile(`data/source/${sourceName}`, "utf8");
      const sourceRows = source
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(","));
      const targetRows = sourceRows.filter(([period]) => period.startsWith("2025-Q"));
      expect(targetRows).toHaveLength(4);
      const q1 = Number(targetRows[0][1]);
      const q4 = Number(targetRows[3][1]);
      expect(q1).not.toBe(q4);
      const average = targetRows.reduce((sum, row) => sum + Number(row[1]), 0) / 4;

      for (const [period, displayPeriod, expectedRaw] of [
        ["2025Q1", "2025年1月", q1],
        ["2025Q4", "2025年10月", q4],
      ] as const) {
        const cells = table.locator("tbody tr").filter({ hasText: displayPeriod }).locator("td");
        await expect(cells.first()).toHaveText(displayPeriod);
        await expect(cells.nth(rawIndex)).toHaveText(Number(expectedRaw).toFixed(2));
      }
      const comparisonCells = table
        .locator("tbody tr")
        .filter({ hasText: "2025年1月" })
        .locator("td");
      await expect(comparisonCells.nth(comparisonIndex)).toHaveText(
        ((q1 / average) * 100).toFixed(2),
      );
    }

    const nominalTable = page.locator("#data-table-section-consumption-nominal");
    await expect(nominalTable.locator("th").filter({ hasText: "GDP名目原値" })).toBeVisible();
    await expect(nominalTable.locator("th").filter({ hasText: "GDP名目比較指数" })).toBeVisible();
    await expect(nominalTable).toContainText("2025年10月");

    const download = page.waitForEvent("download");
    await nominalTable.getByRole("button", { name: /CSVでダウンロード/ }).click();
    const csvPath = await (await download).path();
    expect(csvPath).not.toBeNull();
    const csv = await readFile(csvPath!, "utf8");
    expect(csv).toContain("GDP名目原値");
    expect(csv).toContain("GDP名目比較指数（2025Q1-Q4平均=100）");
  });
});
