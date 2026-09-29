import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";
import {
  QUARTERLY_PLAN40_V2_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import { renderBrowserComponent } from "./renderBrowserComponent";

type ChartKind = "nominal" | "real";
const CHART_KEYS: Record<ChartKind, string[]> = {
  nominal: [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS],
  real: [...QUARTERLY_PUBLIC_REAL_KEYS],
};
const CHART_TITLE: Record<ChartKind, string> = {
  nominal: "消費支出（名目）",
  real: "消費支出（実質）",
};

const CHART_COLORS = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
};

const FIXTURE_GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; min-height: 100%; }
  body { display: flex; flex-direction: column; font-family: system-ui, Arial, sans-serif; }
`;

function createQuarterlyData(kind: ChartKind): ComponentProps<typeof SpendingBarChart>["data"] {
  const keys = CHART_KEYS[kind];
  const supportKey = kind === "nominal" ? SUPPORT_SERIES_KEY_NOMINAL : SUPPORT_SERIES_KEY_REAL;
  // Match the route's 84-quarter period span and full public key contract.
  return Array.from({ length: 84 }, (_, index) => {
    const actualYear = 2005 + Math.floor(index / 4);
    const quarter = (index % 4) + 1;
    const row: Record<string, string | number | null> = {
      label: `${actualYear}Q${quarter}`,
      年: actualYear,
      quarter,
      年月: `${actualYear}Q${quarter}`,
    };
    for (const [keyIndex, key] of keys.entries()) {
      if (key === supportKey) {
        row[key] = actualYear < 2018 ? 420 + (index % 4) * 7 : null;
      } else {
        row[key] =
          actualYear < 2018 ? 140 + keyIndex * 9 : 90 + keyIndex * 9 + (actualYear - 2018) * 2;
      }
    }
    return row as ComponentProps<typeof SpendingBarChart>["data"][number];
  }) as ComponentProps<typeof SpendingBarChart>["data"];
}

function SpendingReadabilityFixture({ kind }: { kind: ChartKind }) {
  const keys = CHART_KEYS[kind];
  const data = createQuarterlyData(kind);
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind(`readability-${kind}`, {
    dataLength: data.length,
    includeUnmappedPayload: true,
  });

  return (
    <>
      <style>{FIXTURE_GLOBAL_CSS}</style>
      {/* Match the production `.container` width and 1rem horizontal padding from globals.css. */}
      <main style={{ width: "100%", paddingLeft: "1rem", paddingRight: "1rem" }}>
        <SpendingBarChart
          title={CHART_TITLE[kind]}
          testId={`readability-${kind}`}
          data={data}
          keys={keys}
          colors={keys.map((_, index) => (index % 2 ? "#1d4ed8" : "#be123c"))}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
          legendMode="collapsible"
          isMobile
        />
      </main>
    </>
  );
}

async function renderAtWidth(width: 320 | 375 | 390 | 430, kind: ChartKind) {
  await page.viewport(width, 667);
  expect(window.innerWidth).toBe(width);
  expect(window.innerHeight).toBe(667);
  renderBrowserComponent(<SpendingReadabilityFixture kind={kind} />);

  const chart = page.getByTestId(`readability-${kind}`);
  await expect.element(chart).toBeVisible();
  const chartElement = await chart.element();
  const yTick = chartElement.querySelector<SVGTextElement>(".recharts-yAxis-tick-labels text");
  const xTick = chartElement.querySelector<SVGTextElement>(".recharts-xAxis-tick-labels text");
  if (!yTick || !xTick) throw new Error(`Chart axes are missing for ${kind}`);
  await expect.element(page.elementLocator(yTick)).toBeVisible();
  await expect.element(page.elementLocator(xTick)).toBeVisible();

  const section = chartElement;
  const wrapper = section.querySelector<HTMLElement>('[class*="spendingChartWrapper"]');
  const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface");
  const yTicks = [...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text")];
  const xTicks = [...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text")];
  const bars = [...section.querySelectorAll<SVGGraphicsElement>(".recharts-bar-rectangle")];
  if (!svg || !wrapper || xTicks.length === 0 || yTicks.length === 0 || bars.length === 0) {
    throw new Error("Rendered SpendingBarChart geometry is unavailable");
  }

  const svgBox = svg.getBoundingClientRect();
  const barBoxes = bars.map((bar) => bar.getBoundingClientRect());
  const firstVisibleBar = barBoxes.find((box) => box.width > 0 && box.height > 0);
  if (!firstVisibleBar) throw new Error("Rendered SpendingBarChart has no visible bars");
  const barCenters = barBoxes
    .filter((box) => box.width > 0 && box.height > 0)
    .map((box) => box.left + box.width / 2)
    .sort((a, b) => a - b)
    .filter((center, index, centers) => index === 0 || center - centers[index - 1] > 1);
  const xTextGeometry = xTicks
    .map((tick) => {
      const box = tick.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        textAnchor: tick.getAttribute("text-anchor"),
      };
    })
    .sort((a, b) => a.left - b.left);

  return {
    width,
    sectionPaddingBottom: parseFloat(getComputedStyle(section).paddingBottom),
    wrapperWidth: wrapper.getBoundingClientRect().width,
    svgLeft: svgBox.left,
    svgRight: svgBox.right,
    svgTop: svgBox.top,
    svgBottom: svgBox.bottom,
    barWidth: firstVisibleBar.width,
    barCenterGaps: barCenters.slice(1).map((center, index) => center - barCenters[index]),
    yTickCount: yTicks.length,
    yValues: yTicks
      .map((tick) => Number(tick.textContent?.trim().replaceAll(",", "")))
      .filter((value) => Number.isFinite(value)),
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    xTickCount: xTicks.length,
    xTickTexts: xTicks.map((tick) => tick.textContent?.trim() ?? ""),
    xTextGeometry,
  };
}

function assertChartGeometry(geometry: Awaited<ReturnType<typeof renderAtWidth>>) {
  expect(geometry.sectionPaddingBottom).toBeGreaterThanOrEqual(32);
  expect(geometry.wrapperWidth).toBeLessThanOrEqual(geometry.width - 16 + 1);
  expect(geometry.svgLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.svgRight).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.yTickCount).toBeGreaterThan(1);
  expect(geometry.yValues.length).toBeGreaterThan(1);
  expect(geometry.yValues.every((value) => value >= 0)).toBe(true);
  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth);
  expect(geometry.barWidth).toBeGreaterThan(0);
  expect(geometry.barWidth).toBeLessThanOrEqual(geometry.width <= 350 ? 9 : 11);
  expect(geometry.barCenterGaps).toEqual(expect.arrayContaining([expect.any(Number)]));
  expect(Math.min(...geometry.barCenterGaps)).toBeGreaterThan(geometry.barWidth);
  expect(geometry.xTickCount).toBeGreaterThan(1);
  expect(geometry.xTickTexts.every((text) => /^\d{4}Q[1-4]$/.test(text))).toBe(true);
  expect(geometry.xTextGeometry.length).toBe(geometry.xTickCount);
  expect(
    geometry.xTextGeometry.every(
      (box) =>
        [box.left, box.right, box.top, box.bottom, box.width, box.height].every(Number.isFinite) &&
        box.width > 0 &&
        box.height > 0,
    ),
  ).toBe(true);
  expect(
    geometry.xTextGeometry.every(
      (box) =>
        box.top >= geometry.svgTop &&
        box.bottom <= geometry.svgBottom &&
        box.left >= 0 &&
        box.right <= geometry.width &&
        box.textAnchor === "middle",
    ),
  ).toBe(true);
}

describe("SpendingBarChart mobile readability geometry in Chromium", () => {
  it("320px nominal chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(320, "nominal"));
  });

  it("320px real chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(320, "real"));
  });

  it("375px nominal chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(375, "nominal"));
  });

  it("375px real chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(375, "real"));
  });

  it("390px nominal chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(390, "nominal"));
  });

  it("390px real chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(390, "real"));
  });

  it("430px nominal chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(430, "nominal"));
  });

  it("430px real chart geometry and rendered axes", async () => {
    assertChartGeometry(await renderAtWidth(430, "real"));
  });
});
