import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";

test.describe("Plan22 quarterly public projection", () => {
  test("ready state renders only the two public quarterly consumption series", async ({ page }) => {
    await page.goto("/");

    const nominal = page.getByTestId("spending-chart-nominal");
    const real = page.getByTestId("spending-chart-real");
    await expect(nominal).toBeVisible({ timeout: 15000 });
    await expect(real).toBeVisible({ timeout: 15000 });
    await expect(nominal).toHaveText(/消費支出（名目）/);
    await expect(real).toHaveText(/消費支出（実質）/);

    for (const section of [nominal, real]) {
      await expect(section.getByText("民間最終消費支出", { exact: true })).toBeVisible();
      for (const hidden of ["GDP名目原値", "GDP名目比較指数", "GDP実質原値", "GDP実質比較指数"]) {
        await expect(section).not.toContainText(hidden);
      }
      await expect(section).toContainText("2025Q1");
    }

    const tableChecks = [
      [
        "nominal",
        "#data-table-section-consumption-nominal",
        "民間最終消費支出",
        "GDP名目",
      ] as const,
      ["real", "#data-table-section-consumption-real", "民間最終消費支出", "GDP実質"] as const,
    ];
    for (const [, selector, rawHeader, comparisonHeader] of tableChecks) {
      const table = page.locator(selector);
      await table.getByText(/データテーブルを表示/).click();
      await expect(table.locator("tbody tr")).toHaveCount(12);
      const headers = await table.locator("thead th").allTextContents();
      expect(headers.filter((header) => header.includes(rawHeader))).toHaveLength(1);
      expect(headers.some((header) => header.includes(comparisonHeader))).toBe(false);
      expect(
        headers.some((header) =>
          /GDP名目原値|GDP実質原値|GDP名目比較指数|GDP実質比較指数/.test(header),
        ),
      ).toBe(false);

      const supportIndex = headers.findIndex((header) => header.includes(rawHeader));
      for (const displayPeriod of ["2025年1月", "2025年10月"]) {
        const cells = table.locator("tbody tr").filter({ hasText: displayPeriod }).locator("td");
        await expect(cells.first()).toHaveText(displayPeriod);
        await expect(cells.nth(supportIndex)).not.toHaveText("-");
      }
    }

    const nominalTable = page.locator("#data-table-section-consumption-nominal");
    await expect(nominalTable.locator("th").filter({ hasText: "GDP" })).toHaveCount(0);
    await expect(nominalTable).toContainText("2025年10月");

    const download = page.waitForEvent("download");
    await nominalTable.getByRole("button", { name: /CSVでダウンロード/ }).click();
    const csvPath = await (await download).path();
    expect(csvPath).not.toBeNull();
    const csv = await readFile(csvPath!, "utf8");
    expect(csv).not.toMatch(/GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数/);
  });
});
