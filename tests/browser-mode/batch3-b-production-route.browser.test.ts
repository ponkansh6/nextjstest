import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Batch3BRouteCase } from "./batch3-b-route.command";

async function inspect(scenario: Batch3BRouteCase) {
  const result = await commands.inspectBatch3BProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

it("p45-b-tooltip-dismiss-231-case01 — production touch opens, then scrolling dismisses tooltip and cursor", async () => {
  const values = await inspect("tooltip-scroll-dismiss");
  expect(values.tooltipVisibleBeforeScroll).toBe(true);
  expect(values.closeVisibleBeforeScroll).toBe(true);
  expect(values.cursorCountBeforeScroll).toBe(1);
  expect(values.scrollY).toBeGreaterThan(0);
  expect(values.closeButtonHidden).toBe(true);
  expect(values.cursorCount).toBe(0);
});

it("p45-a-a11y-info-outside-click — production info dialog closes without changing scroll", async () => {
  const values = await inspect("info-outside-scroll");
  expect(values.scrollBefore).toBeGreaterThan(100);
  expect(values.dialogClosed).toBe(true);
  expect(Math.abs((values.scrollAfter as number) - (values.scrollBefore as number))).toBeLessThan(
    50,
  );
});

it("p45-a-advanced-series-normal — production advanced route publishes registry and table series", async () => {
  const values = await inspect("advanced-series");
  expect(values.normalDescriptors).toContain("CTIミクロ基本系列（名目・参考）");
  expect(values.normalSeries).toContain("CTI消費支出（参考）");
  expect(values.normalSeries).not.toContain("CTIミクロ基本系列（名目・参考・延長）");
  expect(values.normalExtendedLegendVisible).toBe(false);
  expect(values.advancedDescriptors).toContain("CTIミクロ基本系列（名目・参考）");
  expect(values.advancedSeries).toContain("CTI消費支出（参考）");
  expect(values.advancedSeries).toContain("CTIミクロ基本系列（名目・参考・延長）");
  expect(values.advancedExtendedLegendVisible).toBe(true);
  expect(values.normalMainLegendVisible).toBe(true);
  expect(values.normalSalaryLegendVisible).toBe(true);
  expect(values.normalCpiLegendVisible).toBe(true);
  expect(values.normalCtiLegendVisible).toBe(true);
  expect(values.tableText).toContain("CTIミクロ基本系列(名目・延長)");
  expect(values.tableText).toContain("CTI消費支出(参考)");
});

it("p45-a-cagr-sheet-01 — production section trigger opens the CAGR dialog", async () => {
  const values = await inspect("cagr-sheet");
  expect(values.triggerVisible).toBe(true);
  expect(values.dialogVisible).toBe(true);
});

it("p45-a-cpi-sections — production CPI section renders an area path", async () => {
  const values = await inspect("cpi-area");
  expect(values.sectionVisible).toBe(true);
  expect(values.areaPathCount).toBeGreaterThan(0);
  expect(values.firstAreaPathVisible).toBe(true);
  expect(values.scrollBeforeLegend).toBeGreaterThan(100);
  expect(
    Math.abs((values.scrollAfterLegend as number) - (values.scrollBeforeLegend as number)),
  ).toBeLessThan(50);
  expect(values.tooltipRootPresent).toBe(true);
  expect(values.totalAttributePresent).toBe(true);
  expect(values.totalVisible).toBe(true);
  expect(values.totalText).toMatch(/\S/);
  const rows = values.tooltipRows as { key: string | null; order: string | null; text: string }[];
  expect(rows).toHaveLength(12);
  expect(rows.every((row) => row.key && row.order !== null && row.text)).toBe(true);
  expect(values.requiredNamesPresent).toEqual([true, true, true]);
  expect(values.housingAriaAfterHide).toBe("false");
  expect(values.hiddenTooltipRootPresent).toBe(true);
  expect(values.hiddenTooltipTotalVisible).toBe(true);
  expect(values.hiddenTooltipRowCount).toBe(11);
  expect(values.hiddenHousingRowCount).toBe(0);
});

it("p45-b-plan24-rendering-71 — production ranges render legacy and CTI data without GDP headers", async () => {
  const values = await inspect("plan24-legacy-gdp");
  expect(values.nominal2005to2017Headers).toContain("年月");
  expect(values.real2005to2017Headers).toContain("年月");
  expect(values.nominal2005to2017Bars).toBeGreaterThan(0);
  expect(values.real2005to2017Bars).toBeGreaterThan(0);
  expect(values.lines2005to2017).toBe(0);
  expect(values.nominal2018Bars).toBeGreaterThan(0);
  expect(values.real2018Bars).toBeGreaterThan(0);
  expect(values.lines2018).toBe(0);
  expect(values.nominal2018Headers).not.toContain("GDP");
  expect(values.nominal2018Headers).not.toContain("民間最終消費支出");
  expect(values.real2018Headers).not.toContain("GDP");
  expect(values.nominal2018Headers).toContain("年月");
  expect(values.real2018Headers).toContain("年月");
});

it("p45-b-plan24-rendering-88 — 2025 production tables contain Q1/Q4 values and tooltips omit GDP", async () => {
  const tables = (await inspect("plan24-2025-table-tooltip")).tables as {
    headers: string[];
    supportIndex: number;
    foodLabel: string;
    periods: {
      period: string;
      supportValue?: string;
      foodValue: string;
      tooltipHasPeriod: boolean;
      tooltipFoodValueVisible: boolean;
      tooltipHasCalculatedTotal: boolean;
      tooltipHasGdp: boolean;
      calculatedTotal: string;
    }[];
    csv: string;
  }[];
  expect(tables).toHaveLength(2);
  for (const table of tables) {
    expect(table.headers.some((header) => /GDP|民間最終消費支出/.test(header))).toBe(false);
    expect(table.supportIndex).toBeGreaterThanOrEqual(0);
    expect(table.foodLabel).toContain("食料");
    expect(table.periods).toHaveLength(2);
    for (const period of table.periods) {
      expect(period.supportValue?.trim()).toBeTruthy();
      expect(period.foodValue.trim()).toBeTruthy();
      expect(period.tooltipHasPeriod).toBe(true);
      expect(period.tooltipFoodValueVisible).toBe(true);
      expect(period.tooltipHasCalculatedTotal).toBe(true);
      expect(period.tooltipHasGdp).toBe(false);
      expect(table.csv).toContain(period.foodValue);
    }
    expect(table.csv).toContain("2025Q1");
    expect(table.csv).toContain("2025Q4");
    expect(table.csv).not.toContain("GDP");
  }
  expect(tables[0].headers.some((header) => header.includes("民間最終消費"))).toBe(false);
});

it("p45-b-tooltip-stack-total-108-e2e-t9 — production area hover exposes live total and transferred row count", async () => {
  const values = await inspect("t9-total");
  const viewport = values.viewport as { width: number; height: number };
  const box = values.viewportBox as { x: number; y: number; width: number; height: number };
  expect(values.sectionVisible).toBe(true);
  expect(values.areaPathCount).toBeGreaterThan(0);
  expect(viewport.width).toBeGreaterThan(0);
  expect(viewport.height).toBeGreaterThan(0);
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(values.tooltipVisible).toBe(true);
  expect(values.tooltipRootPresent).toBe(true);
  expect(values.totalAttributePresent).toBe(true);
  expect(values.totalVisible).toBe(true);
  expect(values.totalText).toContain("合計");
  expect(values.rowCount).toBe(12);
  const rows = values.tooltipRows as { key: string | null; order: string | null; text: string }[];
  expect(rows).toHaveLength(12);
  expect(rows.every((row) => row.key && row.order !== null && row.text)).toBe(true);
  expect(values.requiredNamesPresent).toEqual([true, true, true]);
  expect(values.housingAriaAfterHide).toBe("false");
  expect(values.hiddenTooltipRootPresent).toBe(true);
  expect(values.hiddenTooltipTotalVisible).toBe(true);
  expect(values.hiddenTooltipRowCount).toBe(11);
  expect(values.hiddenHousingRowCount).toBe(0);
});

for (const [width, scenario] of [
  [768, "boundary-768"],
  [769, "boundary-769"],
] as const) {
  it(
    "p45-b-consumption-boundary-85-" +
      width +
      "px — production route axes and chart geometry fit viewport",
    async () => {
      const values = await inspect(scenario);
      const measurements = values.measurements as {
        chart: { left: number; right: number; width: number; height: number };
        svg: {
          left: number;
          right: number;
          top: number;
          bottom: number;
          width: number;
          height: number;
        };
        section: { left: number; right: number };
        paddingTop: string;
        aspectRatio: string;
        xTicks: {
          left: number;
          right: number;
          top: number;
          bottom: number;
          width: number;
          height: number;
          anchor: string | null;
        }[];
        yTicks: {
          left: number;
          right: number;
          top: number;
          bottom: number;
          width: number;
          height: number;
        }[];
      }[];
      expect(measurements).toHaveLength(2);
      expect(values.initialNominalGeometryReady).toBe(true);
      for (const geometry of measurements) {
        expect(geometry.paddingTop).toBe(width === 768 ? "24px" : "64px");
        expect(geometry.aspectRatio.replaceAll(" ", "")).toBe(width === 768 ? "auto" : "4/3");
        expect(geometry.chart.width).toBeGreaterThan(0);
        expect(geometry.chart.height).toBeGreaterThan(0);
        expect(geometry.chart.left).toBeGreaterThanOrEqual(0);
        expect(geometry.chart.right).toBeLessThanOrEqual(width + 1);
        expect(geometry.svg.width).toBeGreaterThan(0);
        expect(geometry.svg.height).toBeGreaterThan(0);
        expect(geometry.svg.left).toBeGreaterThanOrEqual(0);
        expect(geometry.svg.right).toBeLessThanOrEqual(width + 1);
        expect(geometry.yTicks.length).toBeGreaterThan(1);
        expect(geometry.xTicks.length).toBeGreaterThan(1);
        expect(
          geometry.yTicks.every(
            (box) =>
              box.width > 0 &&
              box.height > 0 &&
              box.right <= geometry.svg.right + 1 &&
              box.top >= geometry.svg.top - 1 &&
              box.bottom <= geometry.svg.bottom + 1,
          ),
        ).toBe(true);
        expect(
          geometry.xTicks.every(
            (box) =>
              box.width > 0 &&
              box.height > 0 &&
              box.top >= geometry.svg.top - 1 &&
              box.bottom <= geometry.svg.bottom + 1 &&
              box.anchor === "middle",
          ),
        ).toBe(true);
        expect(geometry.section.left).toBeGreaterThanOrEqual(0);
        expect(geometry.section.right).toBeLessThanOrEqual(width + 1);
      }
      expect(
        (values.overflow as { scrollWidth: number; clientWidth: number }).scrollWidth,
      ).toBeLessThanOrEqual(
        (values.overflow as { scrollWidth: number; clientWidth: number }).clientWidth,
      );
    },
  );
}
