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
      await expect(section.getByText(rawLabel, { exact: true })).toBeVisible();
      await expect(section.getByText(comparisonLabel, { exact: true })).toBeVisible();
      await expect(section).toContainText("2025Q1");
      await expect(section).toContainText("2025Q4");
    }

    const nominalTable = page.locator("#data-table-section-consumption-nominal");
    await nominalTable.locator("summary").click();
    await expect(nominalTable.locator("th").filter({ hasText: "GDP名目原値" })).toBeVisible();
    await expect(nominalTable.locator("th").filter({ hasText: "GDP名目比較指数" })).toBeVisible();
    await expect(nominalTable).toContainText("2025Q4");

    const download = page.waitForEvent("download");
    await nominalTable.getByRole("button", { name: /CSVでダウンロード/ }).click();
    const csvPath = await (await download).path();
    expect(csvPath).not.toBeNull();
    const csv = await readFile(csvPath!, "utf8");
    expect(csv).toContain("GDP名目原値");
    expect(csv).toContain("GDP名目比較指数（2025Q1-Q4平均=100）");
  });
});
