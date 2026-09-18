import { test, expect } from "./fixtures";
import expected from "../fixtures/plan27-private-consumption.json";

const NOMINAL_SECTION = "#section-consumption-nominal";
const NOMINAL_CHART = "spending-chart-nominal";
const RETIRED_WAGE_CTI = /CTIミクロ基本系列（名目・(?:原数値|参考|参考・延長)）/;

test.describe("Plan27/38 名目CTI四半期消費支出回帰", () => {
  test("2005Q1〜2017Q4の52四半期をgraph/table/CSVで公開し、給与CTI registryを混入しない", async ({
    page,
  }) => {
    await page.goto("/");
    const section = page.locator(NOMINAL_SECTION);
    await expect(section).toBeVisible({ timeout: 15000 });
    await section.scrollIntoViewIfNeeded();
    const chart = page.getByTestId(NOMINAL_CHART);
    await expect(chart).toBeVisible();
    const contractRows = chart.locator('[data-testid="chart-data-contract"] [data-chart-data-row]');
    const contractPeriods = await contractRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-period") ?? ""),
    );
    const targetPeriods = contractPeriods.filter((period) =>
      /^200[5-9]Q[1-4]$|^201[0-7]Q[1-4]$/.test(period),
    );
    expect(targetPeriods).toHaveLength(expected.quarterCount);
    expect(targetPeriods[0]).toBe("2005Q1");
    expect(targetPeriods.at(-1)).toBe("2017Q4");

    const postBoundaryEvidence = await contractRows.evaluateAll(
      (rows, seriesKey) =>
        rows
          .filter((row) => (row.getAttribute("data-period") ?? "") >= "2018Q1")
          .map((row) => {
            const cell = row.querySelector(`[data-series-key="${seriesKey}"]`);
            const stackedValues = [...row.querySelectorAll("[data-series-key]")]
              .filter((candidate) => candidate.getAttribute("data-series-key") !== seriesKey)
              .map((candidate) => candidate.getAttribute("data-value") ?? "null");
            return {
              period: row.getAttribute("data-period") ?? "",
              value: cell?.getAttribute("data-value") ?? "",
              status: cell?.getAttribute("data-status") ?? "",
              reason: cell?.getAttribute("data-reason") ?? "",
              hasStackedValue: stackedValues.some((value) => value !== "null"),
            };
          }),
      expected.series,
    );
    expect(postBoundaryEvidence.length).toBeGreaterThan(0);
    expect(postBoundaryEvidence.every((row) => row.value === "null")).toBe(true);
    expect(postBoundaryEvidence.every((row) => row.status === "invalid")).toBe(true);
    expect(postBoundaryEvidence.every((row) => row.reason === "unavailable")).toBe(true);
    expect(postBoundaryEvidence.every((row) => row.hasStackedValue)).toBe(true);
    const nominalBars = chart.locator(".recharts-bar").first().locator(".recharts-bar-rectangle");
    const nominalBarCount = await nominalBars.count();
    expect(nominalBarCount).toBeGreaterThan(0);
    expect(nominalBarCount).toBeLessThanOrEqual(expected.quarterCount);
    const table = page.locator("#data-table-section-consumption-nominal");
    await table.locator("summary").click();
    const tablePeriods = await table
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows
          .map(
            (row) =>
              row.getAttribute("data-period") ??
              row.querySelector("[data-period]")?.getAttribute("data-period") ??
              row.querySelector("td")?.textContent?.trim() ??
              "",
          )
          .filter((period) => /^200[5-9]Q[1-4]$|^201[0-7]Q[1-4]$/.test(period)),
      );
    expect(tablePeriods).toHaveLength(52);
    const headers = await table.locator("thead th").allTextContents();
    expect(headers.join(" ")).toContain(expected.label);
    expect(headers.join(" ")).not.toMatch(RETIRED_WAGE_CTI);
    expect(headers.join(" ")).not.toMatch(/GDP/);
    const downloadPromise = page.waitForEvent("download");
    await table.locator('button[aria-label$="のデータをCSVでダウンロード"]').click();
    const download = await downloadPromise;
    const csvPath = `test-results/${download.suggestedFilename()}`;
    await download.saveAs(csvPath);
    const csv = await (await import("node:fs/promises")).readFile(csvPath, "utf8");
    expect(csv).toContain(expected.label);
    expect(csv).not.toMatch(RETIRED_WAGE_CTI);
    expect(csv).not.toMatch(/GDP/);
  });

  test("nominal CTI key is distinct from the real chart boundary", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("spending-chart-real")).toBeVisible({ timeout: 15000 });
    const realTable = page.locator("#data-table-section-consumption-real");
    await realTable.locator("summary").click();
    expect(await realTable.locator("thead").innerText()).not.toContain(expected.label);
  });
});
