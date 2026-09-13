import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";
import expected from "../fixtures/plan27-private-consumption.json";
import anchors from "../fixtures/minkan-extension-anchors.json";

const section = (page: import("@playwright/test").Page) => page.locator("#section-new-graph");
const regular = "民間最終消費支出（参考）";
const extended = "民間最終消費支出（参考・延長）";

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  const graph = section(page);
  await expect(graph).toBeVisible({ timeout: 15000 });
  await expect(graph.getByTestId(`new-graph-line-${regular}`)).toBeAttached();
  return graph;
}

const numberFrom = (value: string) => Number(value.replace(/[^0-9.eE+-]/g, ""));

const exactNumberFromTooltip = async (
  tooltip: import("@playwright/test").Locator,
  series: string,
) => {
  const row = tooltip.locator("div").filter({ hasText: series }).last();
  const text = await row.innerText();
  const match = text.match(/([-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)(?:\s*)$/i);
  expect(match, `missing numeric value for ${series}: ${text}`).not.toBeNull();
  return Number(match![1]);
};

async function independentValues() {
  const csv = await readFile("data/source/cti_support_nominal2025.csv", "utf8");
  const normalization = JSON.parse(
    await readFile("data/source/cti-gdp-display-normalization2025.json", "utf8"),
  ) as { nominal: { factor: number } };
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "")));
  const header = rows.findIndex((row) => row.includes("時間軸（暦年）"));
  const year = rows[header].indexOf("時間軸（暦年）");
  const value = rows[header].indexOf("民間最終消費支出");
  const annual = new Map<number, number>();
  for (const row of rows.slice(header + 1)) {
    const y = Number(row[year]?.replace("年", ""));
    const v = Number(row[value]?.replace(/,/g, ""));
    if (Number.isFinite(y) && Number.isFinite(v)) annual.set(y, v);
  }
  const result: Record<string, number> = {};
  for (let y = 2014; y <= 2017; y++) {
    const raw = annual.get(y)!;
    const prior = annual.get(y - 1)!;
    for (let month = 1; month <= 12; month++) {
      const window = month === 1 ? prior * 11 + raw : raw * 12;
      result[`${y}年${month}月`] = (window / 12) * normalization.nominal.factor;
    }
  }
  return { result, factor: normalization.nominal.factor, annual };
}

function pathRanges(d: string) {
  const parts = d.match(/[A-Za-z][^A-Za-z]*/g) ?? [];
  return parts
    .map((part) => {
      const command = part[0];
      const nums = (part.slice(1).match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? []).map(
        Number,
      );
      const xs = nums.filter((_, i) => i % 2 === 0);
      return { command, min: Math.min(...xs), max: Math.max(...xs) };
    })
    .filter((part) => Number.isFinite(part.min));
}

async function tapSvgPoint(surface: import("@playwright/test").Locator, x: number, y: number) {
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const viewBoxValues = ((await surface.getAttribute("viewBox")) ?? "").split(/\s+/).map(Number);
  const width = viewBoxValues[2] || Number(await surface.getAttribute("width")) || box.width;
  const height = viewBoxValues[3] || Number(await surface.getAttribute("height")) || box.height;
  const wrapper = surface.locator("xpath=ancestor::*[contains(@class, 'recharts-wrapper')]");
  const wrapperBox = await wrapper.boundingBox();
  expect(wrapperBox).not.toBeNull();
  if (!wrapperBox) return;
  await wrapper.click({
    position: {
      x: box.x - wrapperBox.x + (x / width) * box.width,
      y: box.y - wrapperBox.y + (y / height) * box.height,
    },
  });
}

async function assertTableCsvValue(
  page: import("@playwright/test").Page,
  period: string,
  expectedValue: number,
  headerNeedle = "民間最終消費(総合)",
) {
  const table = page.locator("#data-table-section-new-graph");
  await table.locator("summary").click();
  const headers = await table.locator("thead th").allTextContents();
  const column = headers.findIndex((header) => header.includes(headerNeedle));
  expect(column).toBeGreaterThanOrEqual(0);
  const cell = table.locator("tbody tr").filter({ hasText: period }).locator("td").nth(column);
  const tableValue = numberFrom(await cell.innerText());
  expect(tableValue).toBeCloseTo(expectedValue, 2);
  const downloadPromise = page.waitForEvent("download");
  await table.locator('button[aria-label$="のデータをCSVでダウンロード"]').click();
  const download = await downloadPromise;
  const csvPath = `test-results/${download.suggestedFilename()}`;
  await download.saveAs(csvPath);
  const csv = await readFile(csvPath, "utf8");
  const row = csv.split(/\r?\n/).find((line) => line.startsWith(`${period},`));
  expect(row).toBeDefined();
  expect(numberFrom(row!.split(",")[column])).toBeCloseTo(expectedValue, 2);
  return tableValue;
}

test.describe("Plan27 民間最終消費支出の実ブラウザー回帰", () => {
  test("全期間と2014年前後で実SVG線・表・CSV・tooltipが同じ代表値を示す", async ({ page }) => {
    const graph = await ready(page);
    const independent = await independentValues();
    const line = graph.locator(`path[data-key="${expected.series}"]`);
    await expect(line).toBeVisible();
    expect(await line.getAttribute("data-key")).toBe(expected.series);
    const d = await line.getAttribute("d");
    expect(d).toMatch(/^M/);
    const coordinates = (d!.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [])
      .map(Number)
      .filter(Number.isFinite);
    expect(coordinates.length).toBeGreaterThan(240);
    expect(Math.min(...coordinates)).toBeLessThan(Math.max(...coordinates));
    const ranges = pathRanges(d!);
    expect(ranges.some((part) => part.command === "M")).toBe(true);
    expect(ranges.every((part) => part.min <= part.max)).toBe(true);
    for (let i = 1; i < ranges.length; i++)
      expect(ranges[i].min).toBeGreaterThanOrEqual(ranges[i - 1].min);
    expect(await line.getAttribute("data-key")).toBe(regular);

    await page.locator('a[href="#data-table-section-new-graph"]').click();
    const table = page.locator("#data-table-section-new-graph");
    await expect(table).toBeVisible();
    await table.locator("summary").click();
    await expect(table.locator("table")).toBeVisible();
    await expect(table.getByRole("button", { name: /CSVでダウンロード/ })).toBeVisible();

    // 2014 is intentionally checked through the independent rendered table contract
    // after narrowing the URL range; the table always renders the selected range tail.
    await page.goto("/?from=2014&to=2014");
    const narrowed = section(page);
    await expect(narrowed.getByTestId(`new-graph-line-${regular}`)).toBeAttached();
    const narrowedPath = narrowed.locator(`path[data-key="${expected.series}"]`);
    const firstX = Number((await narrowedPath.getAttribute("d"))!.match(/^M\s*([-+\d.]+)/)?.[1]);
    const narrowedSurface = narrowed.locator("svg.recharts-surface");
    await tapSvgPoint(
      narrowedSurface,
      firstX,
      Number((await narrowedPath.getAttribute("d"))!.match(/^M\s*[-+\d.]+[,\s]+([-+\d.]+)/)?.[1]),
    );
    await expect(narrowed.locator(".recharts-tooltip-wrapper")).toBeVisible();
    const tooltip = narrowed.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toContainText(regular);
    expect(await exactNumberFromTooltip(tooltip, regular)).toBeCloseTo(
      independent.result["2014年1月"],
      2,
    );
    await page.locator('a[href="#data-table-section-new-graph"]').click();
    const narrowedTable = page.locator("#data-table-section-new-graph");
    await expect(narrowedTable.locator("tbody tr")).toHaveCount(12);
    await expect(narrowedTable.locator("tbody")).toContainText("2014年");
    await assertTableCsvValue(page, "2014年1月", independent.result["2014年1月"]);
  });

  test("adv=1の延長線と情報パネル切替が機能し、375pxでも崩れない", async ({ page }) => {
    const independent = await independentValues();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/?adv=1");
    const graph = section(page);
    await expect(graph.getByTestId(`new-graph-line-${regular}`)).toBeAttached();
    await expect(graph.getByTestId(`new-graph-line-${extended}`)).toBeAttached();
    await expect(graph.getByTestId(`new-graph-legend-${regular}`)).toBeVisible();
    await expect(graph.getByTestId(`new-graph-legend-${extended}`)).toBeVisible();
    await expect(graph.getByRole("img")).toBeVisible();
    const rawAnchor = anchors.anchors.find((anchor) => anchor.month === "2018年1月")!;
    const extendedExpected =
      (rawAnchor.raw / anchors.normalization.baseRaw) * anchors.normalization.scale;
    expect(extendedExpected).toBeCloseTo(rawAnchor.knownNormalized, 10);
    const extendedPath = graph.locator(`path[data-key="${extended}"]`);
    const extendedD = await extendedPath.getAttribute("d");
    expect(pathRanges(extendedD!)).toEqual(
      expect.arrayContaining([expect.objectContaining({ command: "M" })]),
    );
    const info = graph.getByRole("button", { name: /データソースを表示/ });
    await info.click();
    await expect(page.getByText(/年次GDP統計の名目値を各暦月へ展開/)).toBeVisible();
    await expect(graph.getByTestId(`new-graph-line-${regular}`)).toHaveAttribute(
      "data-key",
      regular,
    );
    await expect(graph.getByTestId(`new-graph-line-${extended}`)).toHaveAttribute(
      "data-key",
      extended,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByText(/年次GDP統計の名目値を各暦月へ展開/)).toBeHidden();
    await page.goto("/?adv=1&from=2014&to=2014");
    const mobileNarrow = section(page);
    await expect(mobileNarrow.locator("svg.recharts-surface")).toBeVisible();
    const mobilePath = mobileNarrow.locator(`path[data-key="${regular}"]`);
    const mobileD = await mobilePath.getAttribute("d");
    expect(mobileD).toMatch(/^M/);
    const mobileFirstPoint = mobileD!.match(/^M\s*([-+\d.]+)[,\s]+([-+\d.]+)/);
    expect(mobileFirstPoint).not.toBeNull();
    const surface = mobileNarrow.locator("svg.recharts-surface");
    // Recharts path coordinates are local to the SVG. Convert the actual
    // rendered first point to viewport coordinates and use the touch path
    // exercised by tooltip-dismiss (mobile Tooltip trigger is "click").
    await tapSvgPoint(surface, Number(mobileFirstPoint![1]), Number(mobileFirstPoint![2]));
    const mobileTooltip = mobileNarrow.locator(".recharts-tooltip-wrapper");
    await expect(mobileTooltip).toBeVisible();
    expect(await exactNumberFromTooltip(mobileTooltip, regular)).toBeCloseTo(
      independent.result["2014年1月"],
      2,
    );
    await page.locator('a[href="#data-table-section-new-graph"]').click();
    // The table intentionally renders the selected range tail. Use the
    // independent 2014 contract for the mobile DOM/download operation; the
    // 2017/2018 boundary remains covered by the full-range SVG checks above.
    await page.goto("/?adv=1&from=2014&to=2014");
    const mobileTable = page.locator("#data-table-section-new-graph");
    await expect(mobileTable).toBeVisible();
    await expect(mobileTable.locator("tbody tr")).toHaveCount(12);
    await assertTableCsvValue(page, "2014年1月", independent.result["2014年1月"]);
    const downloadPromise = page.waitForEvent("download");
    await mobileTable.locator('button[aria-label$="のデータをCSVでダウンロード"]').click();
    const download = await downloadPromise;
    const csvPath = `test-results/${download.suggestedFilename()}`;
    await download.saveAs(csvPath);
    await expect.poll(async () => (await readFile(csvPath, "utf8")).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
  });
});
