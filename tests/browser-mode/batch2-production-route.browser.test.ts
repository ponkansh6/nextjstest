import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Batch2RouteCase } from "./batch2-route.command";

async function inspect(scenario: Batch2RouteCase) {
  const result = await commands.inspectBatch2ProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

it("p45-b-range-change-200-e2e-2 — production route updates the 2017–2018 URL and eight-period contracts", async () => {
  const values = await inspect("range-two-year");
  expect(values.singleYearUrl).toMatch(/from=2017.*to=2017/);
  expect(values.singleYearNominalPeriods).toBe(4);
  expect(values.url).toMatch(/from=2017.*to=2018/);
  expect(values.nominalPeriods).toBe(8);
  expect(values.realPeriods).toBe(8);
  expect(values.nominalBars).toBeGreaterThan(0);
  expect(values.nominalBars).toBe(values.nominalContractValues);
  expect(values.realBars).toBeGreaterThan(0);
  expect(values.realBars).toBe(values.realContractValues);
});

it("p45-b-range-change-215-e2e — both range selections close the production sheet", async () => {
  const values = await inspect("range-sheet-close");
  expect(values.closedAfterStart).toBe(false);
  expect(values.closedAfterEnd).toBe(false);
});

it("p45-b-range-change-303-e2e-2005-url — maximum range closes, updates controls, URL, and route data", async () => {
  const values = await inspect("range-max-url");
  expect(values.customRangeUrl).toMatch(/from=2015.*to=2020/);
  expect(values.maxButtonVisible).toBe(true);
  expect(values.startYear).toBe("2005");
  expect(values.latestYear).toBeGreaterThan(2000);
  expect(values.latestYearOption).toBe(`${values.latestYear}年`);
  expect(values.endYear).toBe(String(values.latestYear));
  expect(values.sheetClosed).toBe(true);
  expect(values.url).not.toContain("from=");
  expect(values.url).not.toContain("to=");
  expect(values.nominalRows).toBeGreaterThan(0);
});

it("p45-b-section-tabs-scroll-47-case01-chromium — production navigation places the target in the viewport", async () => {
  const values = await inspect("section-tab-target");
  expect(values.inViewport).toBe(true);
  expect(values.bottom as number).toBeGreaterThan(0);
  expect(values.top as number).toBeLessThan(800);
  expect(values.scrollY).toBeGreaterThan(0);
});

it("p45-b-section-tabs-scroll-120-case01-chromium — production section tabs hide the native scrollbar", async () => {
  expect((await inspect("section-scrollbar")).scrollbarWidth).toBe("none");
});

it("p45-b-section-tabs-scroll-127-case01-chromium — production tabs overflow and scroll horizontally", async () => {
  const geometry = (await inspect("section-horizontal-scroll")).geometry as Record<string, number>;
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.after).toBeGreaterThan(geometry.before);
});

it("p45-b-section-tabs-scroll-142-mask-image-chromium — production tabs apply the right-edge mask", async () => {
  const geometry = (await inspect("section-mask")).geometry as Record<string, string>;
  expect(geometry.maskImage).not.toBe("none");
  expect(geometry.webkitMaskImage).not.toBe("none");
});

it("p45-b-spending-filter-35-e2e-q1 — hiding Q1 removes rendered nominal bars", async () => {
  const values = await inspect("spending-q1-filter");
  expect(values.pressedAfter).toBe("false");
  expect(values.filteredCount).toBeLessThan(values.initialCount as number);
  expect(values.allQuartersHiddenCount).toBe(0);
  expect(values.restoredCount).toBe(values.initialCount);
});

it("p45-b-spending-filter-64-e2e — hiding a production category removes rendered nominal bars", async () => {
  const values = await inspect("spending-category-filter");
  expect(values.pressedAfter).toBe("false");
  expect(values.filteredCount).toBeLessThan(values.initialCount as number);
  expect(values.chartVisible).toBe(true);
});

it("p45-b-tooltip-dismiss-578-chromium-escape-dismiss — production hover opens then Escape dismisses tooltip", async () => {
  const values = await inspect("tooltip-escape");
  expect(values.visibleBeforeEscape).toBe(true);
  expect(values.hiddenAfterEscape).toBe(true);
  expect(values.visibleAfterRehover).toBe(true);
  expect(values.hiddenAfterMouseLeave).toBe(true);
  expect(values.visibleBeforeOutsideClick).toBe(true);
  expect(values.hiddenAfterOutsideClick).toBe(true);
});

it("p45-b-tooltip-stack-total-65-e2e-t7-2022 — hovering a 2022 production bar shows a total", async () => {
  const values = await inspect("tooltip-total");
  expect(values.barCount).toBeGreaterThan(5);
  expect(values.totalVisible).toBe(true);
  expect(values.totalText).toContain("合計");
});

it("p45-b-tooltip-stack-total-81-e2e-t8-tooltip — hiding food removes its production tooltip row", async () => {
  const values = await inspect("tooltip-hidden-row");
  expect(values.foodRowVisibleBefore).toBe(true);
  expect(values.ariaBefore).toBe("true");
  expect(values.ariaAfter).toBe("false");
  expect(values.tooltipVisibleAfterRehover).toBe(true);
  expect(values.foodRowCountAfter).toBe(0);
});

it("p45-b-consumption-mobile-acceptance-37 — production mobile legend buttons meet 32px bounds", async () => {
  const sizes = (await inspect("mobile-legend-size")).sizes as Record<
    string,
    { width: number; height: number }[]
  >;
  for (const chartSizes of Object.values(sizes)) {
    expect(chartSizes.length).toBeGreaterThan(0);
    expect(chartSizes.every(({ width, height }) => width >= 32 && height >= 32)).toBe(true);
  }
});

it("p45-b-consumption-mobile-acceptance-63 — production mobile tooltips show readable content in viewport", async () => {
  const metrics = (await inspect("mobile-tooltip-style")).metrics as {
    visible: boolean;
    inViewport: boolean;
    totalFontSize: number;
    labelSizes: number[];
    valueRightAligned: boolean;
  }[];
  expect(metrics).toHaveLength(2);
  for (const metric of metrics) {
    expect(metric.visible).toBe(true);
    expect(metric.inViewport).toBe(true);
    expect(metric.totalFontSize).toBeGreaterThanOrEqual(16);
    expect(metric.labelSizes.length).toBeGreaterThan(0);
    expect(metric.labelSizes.every((size) => size >= 14)).toBe(true);
    expect(metric.valueRightAligned).toBe(true);
  }
});

it("p45-b-consumption-mobile-acceptance-122 — production mobile summaries are closed, visible, and one line", async () => {
  const summaries = (await inspect("mobile-summary")).summaries as {
    open: boolean;
    visible: boolean;
    text: string;
    whiteSpace: string;
  }[];
  expect(summaries).toHaveLength(2);
  for (const summary of summaries) {
    expect(summary.open).toBe(false);
    expect(summary.visible).toBe(true);
    expect(summary.text).toMatch(/\S/);
    expect(summary.whiteSpace).toBe("nowrap");
  }
});

it("p45-b-consumption-mobile-acceptance-139 — touch hides all production series and restores bars with aria state", async () => {
  const values = await inspect("mobile-hide-restore");
  expect(values.allHiddenAfterRelease).toBe(true);
  expect(values.barsWhenHidden).toBe(0);
  expect(values.seriesBeforeTap).toBe("false");
  expect(values.seriesAfterTap).toBe("true");
  expect(values.barsAfterRestore).toBeGreaterThan(0);
});

it("p45-b-consumption-mobile-acceptance-161 — dark zoomed production tooltip has content and closes", async () => {
  const values = await inspect("mobile-dark-zoom-tooltip");
  expect(values.theme).toBe("dark");
  expect(values.closeVisible).toBe(true);
  expect(values.categoryVisible).toBe(true);
  expect(values.categoryText).toMatch(/\S/);
  expect(values.valueVisible).toBe(true);
  expect(values.closed).toBe(true);
});

for (const [width, scenario] of [
  [320, "readability-320"],
  [375, "readability-375"],
  [390, "readability-390"],
] as const) {
  it(`p45-b-consumption-mobile-readability-52-${width}px-y-x — production route chart axes fit without document overflow`, async () => {
    const values = await inspect(scenario);
    const measurements = values.measurements as {
      viewportWidth: number;
      sectionPaddingBottom: number;
      wrapperWidth: number;
      svgLeft: number;
      svgRight: number;
      svgTop: number;
      svgBottom: number;
      yValues: number[];
      yTickCount: number;
      yValueCount: number;
      barWidth: number;
      barCenterGaps: number[];
      xTickCount: number;
      xTexts: string[];
      xTextGeometry: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
        textAnchor: string | null;
      }[];
    }[];
    expect(measurements).toHaveLength(2);
    for (const geometry of measurements) {
      expect(geometry.viewportWidth).toBe(width);
      expect(geometry.sectionPaddingBottom).toBeGreaterThanOrEqual(32);
      expect(geometry.wrapperWidth).toBeLessThanOrEqual(width - 16 + 1);
      expect(geometry.svgLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.svgRight).toBeLessThanOrEqual(width + 1);
      expect(geometry.yTickCount).toBeGreaterThan(1);
      expect(geometry.yValueCount).toBeGreaterThan(1);
      expect(geometry.yValues.every((value) => value >= 0)).toBe(true);
      expect(geometry.barWidth).toBeGreaterThan(0);
      expect(geometry.barWidth).toBeLessThanOrEqual(width <= 350 ? 9 : 11);
      expect(geometry.barCenterGaps).toEqual(expect.arrayContaining([expect.any(Number)]));
      expect(Math.min(...geometry.barCenterGaps)).toBeGreaterThan(geometry.barWidth);
      expect(geometry.xTickCount).toBeGreaterThan(1);
      expect(geometry.xTextGeometry).toHaveLength(geometry.xTickCount);
      expect(
        geometry.xTextGeometry.every(
          (box) =>
            [box.left, box.right, box.top, box.bottom, box.width, box.height].every(
              Number.isFinite,
            ) &&
            box.width > 0 &&
            box.height > 0 &&
            box.top >= geometry.svgTop &&
            box.bottom <= geometry.svgBottom &&
            box.textAnchor === "middle",
        ),
      ).toBe(true);
      expect(geometry.xTexts.every((text) => /^\d{4}Q[1-4]$/.test(text))).toBe(true);
    }
    const overflow = values.documentOverflow as { scrollWidth: number; clientWidth: number };
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}
