import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
// @ts-expect-error Vitest's Vite transform resolves this raw CSS import at runtime.
import globalsCss from "../../src/app/globals.css?raw";
import {
  CPI_CATEGORIES,
  getDisplayLabel,
  getLegendLabel,
  stackedColors,
} from "../../src/lib/chartConstants";
import type { Batch1RouteCase } from "./batch1-route.command";

vi.setConfig({ testTimeout: 45_000 });

async function inspect(scenario: Batch1RouteCase) {
  const result = await commands.inspectBatch1ProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

function sourceColor(token: string, dark = false): string {
  let css = globalsCss;
  if (dark) {
    const start = css.indexOf(':root[data-theme="dark"]');
    const open = css.indexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let index = open; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}" && --depth === 0) {
        end = index;
        break;
      }
    }
    if (end < 0) throw new Error("Dark source token block is missing");
    css = css.slice(open + 1, end);
  }
  const value = css.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Source CSS token --${token} is missing`);
  const channels = value
    .slice(1)
    .match(/.{2}/g)!
    .map((channel: string) => Number.parseInt(channel, 16));
  return `rgb(${channels.join(", ")})`;
}

it("p45-a-a11y-sheet-tab-trap — production route traps keyboard focus in the open sheet", async () => {
  expect((await inspect("a11y-sheet-tab-trap")).focusInsideDialog).toBe(true);
});

it("p45-a-cagr-sheet-02 — production sheet accepts a start year and renders its result", async () => {
  const values = await inspect("cagr-calculate");
  expect(values.dialogVisible).toBe(true);
  expect(values.result).toMatch(/^-?\d+\.\d{2}%$/);
});

it("p45-a-cagr-sheet-03 — production (10,10) hit test lands on the backdrop and closes the sheet", async () => {
  const values = await inspect("cagr-backdrop-coordinate");
  expect(values.dialogWasVisible).toBe(true);
  expect(values.hitTargetWasBackdrop).toBe(true);
  expect(values.dialogClosed).toBe(true);
});

it("p45-a-cagr-sheet-04 — production page has no horizontal overflow at 375px", async () => {
  const values = await inspect("cagr-mobile-overflow");
  expect(values.scrollWidth).toBeLessThanOrEqual(values.clientWidth as number);
});

it("p45-a-cagr-sheet-05 — production open sheet leaves 120px of chart visible at 375x667", async () => {
  const values = await inspect("cagr-chart-visible-height");
  expect(values.dialogVisible).toBe(true);
  expect(values.visibleHeight).toBeGreaterThanOrEqual(120);
});

it("p45-a-cagr-sheet-06 — production page omits the CAGR section and tab", async () => {
  const values = await inspect("cagr-section-omitted");
  expect(values.sectionPresent).toBe(false);
  expect(values.tabPresent).toBe(false);
});

it("p45-a-cagr-sheet-07 — production result sheet does not need inner scrolling", async () => {
  const values = await inspect("cagr-result-no-scroll");
  expect(values.dialogVisible).toBe(true);
  expect(values.innerOverflow).toBeLessThanOrEqual(0);
});

it("p45-a-cagr-sheet-08 — production result detail and note fit 375x667", async () => {
  const values = await inspect("cagr-result-portrait-bounds");
  expect(values.dialogVisible).toBe(true);
  expect(values.detailBottom).toBeLessThanOrEqual(values.viewportHeight as number);
  expect(values.noteBottom).toBeLessThanOrEqual(values.viewportHeight as number);
});

it("p45-a-cagr-sheet-09 — production result detail fits 667x375", async () => {
  const values = await inspect("cagr-result-landscape-bounds");
  expect(values.dialogVisible).toBe(true);
  expect(values.detailBottom).toBeLessThanOrEqual(values.viewportHeight as number);
});

it("p45-a-cpi-legend-scroll — production CPI legend toggle preserves scroll", async () => {
  const values = await inspect("cpi-legend-scroll");
  expect(values.before, "precondition: section-stacked is below the top").toBeGreaterThan(100);
  expect(values.pressedBefore).toBe("true");
  expect(values.pressedAfter).toBe("false");
  expect(Math.abs((values.after as number) - (values.before as number))).toBeLessThan(50);
});

it("p45-a-cpi-tooltip-rows — production CPI tooltip has the 12-row root/row contract", async () => {
  const values = await inspect("cpi-tooltip-rows");
  expect(values.tooltipVisible).toBe(true);
  expect(values.totalVisible).toBe(true);
  expect(values.rowCount).toBe(12);
  expect(values.rowContractValid).toBe(true);
  expect(values.rootMarked).toBe(true);
  expect(values.rowKeys).toEqual(CPI_CATEGORIES);
  expect(values.rowOrders).toEqual(CPI_CATEGORIES.map((_, index) => String(index)));
  expect(values.rowLabels).toEqual(CPI_CATEGORIES.map(getDisplayLabel));
  expect((values.rowTexts as string[]).join(" ")).toContain("住居");
  expect((values.rowTexts as string[]).join(" ")).toContain("交通・自動車等関係費");
  expect((values.rowTexts as string[]).join(" ")).toContain("諸雑費");
});

it("p45-a-cpi-tooltip-rows — production hidden CPI series is absent after rehover", async () => {
  const values = await inspect("cpi-tooltip-hidden-row");
  expect(values.tooltipVisible).toBe(true);
  expect(values.totalVisible).toBe(true);
  expect(values.rowCount).toBe(11);
  expect(values.hiddenHousingAbsent).toBe(true);
  expect(values.rowContractValid).toBe(true);
  expect(values.hiddenLegendPressed).toBe("false");
  expect(values.rowKeys).toEqual(CPI_CATEGORIES.filter((key) => key !== "住居"));
  expect(values.rowOrders).toEqual(CPI_CATEGORIES.slice(1).map((_, index) => String(index + 1)));
  expect(values.rowLabels).toEqual(CPI_CATEGORIES.slice(1).map(getDisplayLabel));
});

it("p45-a-earnings-hover — production earnings plot hover shows its tooltip", async () => {
  const values = await inspect("earnings-hover");
  expect(values.plotVisible).toBe(true);
  expect(values.plotInViewport).toBe(true);
  expect(values.tooltipVisible).toBe(true);
  expect(values.separatorBorder).not.toBe("0px");
});

it("p45-a-earnings-hidden-series-hover — production hidden-series rehover keeps tooltip and separator", async () => {
  const values = await inspect("earnings-hidden-hover");
  expect(values.plotVisible).toBe(true);
  expect(values.plotInViewport).toBe(true);
  expect(values.tooltipVisible).toBe(true);
  expect(values.separatorBorder).not.toBe("0px");
  expect(values.initialTooltipVisible).toBe(true);
  expect(values.initialSeparatorBorder).not.toBe("0px");
  expect(values.hiddenLegendPressed).toBe("false");
});

it("p45-a-legend-entertainment-series9 — production CPI legend swatch matches --series-9", async () => {
  const values = await inspect("legend-series9");
  expect(values.colors).toEqual([sourceColor("series-9")]);
});

it("p45-a-legend-food-nominal — production spending legend swatch matches --nominal-food", async () => {
  const values = await inspect("legend-nominal-food");
  expect(values.colors).toEqual([sourceColor("nominal-food")]);
});

it("p45-a-legend-dark-all12 — production dark theme exposes all 12 source-colored legends", async () => {
  const values = await inspect("legend-dark-all12");
  expect(values.theme).toBe("dark");
  expect(values.visibleCount).toBe(12);
  expect(values.colors).toEqual(
    CPI_CATEGORIES.map((category, index) => {
      const token = stackedColors[index]?.match(/--([\w-]+)/)?.[1];
      if (!token) throw new Error(`No source token for ${getLegendLabel(category)}`);
      return sourceColor(token, true);
    }),
  );
});

it("p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg — production CPI axis omits both boundary labels", async () => {
  const values = await inspect("monthly-boundary-cpi");
  const labels = values.axisLabels as string[];
  expect(values.firstTickLabel).not.toBe("");
  expect(labels).not.toContain("2017年12月");
  expect(labels).not.toContain("2018年1月");
});

it("p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg — production earnings axis omits both boundary labels", async () => {
  const values = await inspect("monthly-boundary-earnings");
  const labels = values.axisLabels as string[];
  expect(values.firstTickLabel).not.toBe("");
  expect(labels).not.toContain("2017年12月");
  expect(labels).not.toContain("2018年1月");
});

it("p45-b-range-change-107-e2e — production route starts with nominal and real bars", async () => {
  const values = await inspect("range-sanity");
  expect(values.nominalVisible).toBe(true);
  expect(values.realVisible).toBe(true);
  expect(values.nominalBarCount).toBeGreaterThan(0);
  expect(values.realBarCount).toBeGreaterThan(0);
  expect(values.nominalBarCount).toBe(values.nominalProjectedValues);
  expect(values.realBarCount).toBe(
    (values.realProjectedValues as number) - (values.realTotalProjectedValues as number),
  );
  expect(values.realTotalMarkerCount).toBe(0);
});

it("p45-b-range-change-187-e2e-1 — production single-year selection renders four periods", async () => {
  const values = await inspect("range-single-year");
  expect(values.url).toContain("from=2017");
  expect(values.url).toContain("to=2017");
  expect(values.nominalRows).toBe(4);
  expect(values.realRows).toBe(4);
  expect(values.nominalBars).toBeGreaterThan(0);
  expect(values.realBars).toBeGreaterThan(0);
  expect(values.nominalBars).toBe(values.nominalProjectedValues);
  expect(values.realBars).toBe(
    (values.realProjectedValues as number) - (values.realTotalProjectedValues as number),
  );
  expect(values.realTotalMarkerCount).toBe(0);
});
