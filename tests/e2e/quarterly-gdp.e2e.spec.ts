import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";

const INTERNAL_SERIES = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数/;

async function hoverFirstActionableMark(page: import("@playwright/test").Page, testId: string) {
  const chart = page.getByTestId(testId);
  await chart.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");
  const marks = chart.locator(".recharts-bar-rectangle, .recharts-dot");
  for (let index = 0; index < (await marks.count()); index += 1) {
    const mark = marks.nth(index);
    const box = await mark.boundingBox();
    if (
      box &&
      box.width > 0 &&
      box.height > 0 &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height
    ) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      return;
    }
  }
  throw new Error(`No actionable mark found in ${testId}`);
}

test.describe("Plan22 quarterly public projection", () => {
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
      expect(headers.some((header) => INTERNAL_SERIES.test(header))).toBe(false);

      const supportIndex = headers.findIndex((header) => header.includes(rawHeader));
      for (const displayPeriod of ["2025年1月", "2025年10月"]) {
        const cells = table.locator("tbody tr").filter({ hasText: displayPeriod }).locator("td");
        await expect(cells.first()).toHaveText(displayPeriod);
        await expect(cells.nth(supportIndex)).not.toHaveText("-");
      }
    }

    for (const [testId, selector, publicLabel] of [
      ["spending-chart-nominal", "#data-table-section-consumption-nominal", "民間最終消費支出"],
      ["spending-chart-real", "#data-table-section-consumption-real", "民間最終消費支出"],
    ] as const) {
      const table = page.locator(selector);
      await expect(table.locator("th").filter({ hasText: "GDP" })).toHaveCount(0);
      await expect(table).toContainText("2025年10月");
      const download = page.waitForEvent("download");
      await table.getByRole("button", { name: /CSVでダウンロード/ }).click();
      const csvPath = await (await download).path();
      expect(csvPath).not.toBeNull();
      const csv = await readFile(csvPath!, "utf8");
      expect(csv).toContain(publicLabel);
      expect(csv).not.toMatch(INTERNAL_SERIES);

      await hoverFirstActionableMark(page, testId);
      const tooltip = page.getByTestId(testId).locator(".recharts-tooltip-wrapper");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText(publicLabel);
      await expect(tooltip).not.toContainText(INTERNAL_SERIES);
    }
  });
});
