import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import CpiChart from "../../src/app/components/CpiChart";
import { CagrPanel } from "../../src/app/components/CagrPanel";
import { NewGraph } from "../../src/app/components/NewGraph";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { StackedAreaChart } from "../../src/app/components/StackedAreaChart";
import {
  formatCpiTooltipTotal,
  formatCpiTooltipValue,
} from "../../src/app/components/CustomTooltip";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import {
  createComparisonSeriesRegistry,
  CPI_CATEGORIES,
  CTI_BASIC_EXTENSION_KEY,
  CONSUMPTION_TOTAL_12MA_KEY,
  SUPPORT_SERIES_KEY_NOMINAL,
  buildCpiTooltipMetadata,
  stackedColors,
  stackedKeys,
} from "../../src/lib/chartConstants";
import {
  QUARTERLY_PLAN40_V2_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import { useCagrState } from "../../src/hooks/useCagrState";
import type { CpiData } from "../../src/types";
import type { CpiView, QuarterlyView } from "../../src/types/chart";
import { renderBrowserComponent } from "./renderBrowserComponent";

vi.mock("next/navigation", () => ({
  default: {},
  useSearchParams: () => new URLSearchParams("from=2020&to=2021"),
}));

const CHART_COLORS = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};

const MONTHLY_DATA: CpiData[] = ["2020年1月", "2021年1月"].map((年月, index) => ({
  年月,
  総合: 100 + index,
  生鮮食品を除く総合: 99 + index,
  持家の帰属家賃を除く総合: 98 + index,
  "消費支出（参考）": null,
  "CPI総合(参考)": 100 + index,
  所定内給与: 250 + index,
  所定外給与: 45 + index,
  特別給与: 80 + index,
  時間当たり給与: 280 + index,
  "15歳以上国民当たり給与": 210 + index,
  ...Object.fromEntries(stackedKeys.map((key, keyIndex) => [key, 90 + keyIndex + index])),
}));

const CPI_VIEW_DATA = MONTHLY_DATA.map((row) => row as CpiView);

function ComparisonSeriesFixture() {
  const registry = createComparisonSeriesRegistry({ status: "valid", reason: null });
  const data = MONTHLY_DATA.map((row, index) => ({
    ...row,
    ...Object.fromEntries(registry.map(({ key }) => [key, 100 + index])),
  }));
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("b3m-advanced-series-normal", { dataLength: data.length });

  return (
    <div style={{ width: 1000 }}>
      <NewGraph
        sectionId="b3m-new-graph"
        data={data}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={CHART_COLORS}
        isMobile={false}
        tooltipProps={tooltip.tooltipProps}
        comparisonSeriesRegistry={registry}
        showAdvanced={false}
      />
    </div>
  );
}

function CpiSectionsFixture() {
  return (
    <CpiChart
      data={CPI_VIEW_DATA}
      quarterlyNominalData={[]}
      quarterlyRealData={[]}
      totalEarningData={[]}
      maxCpiDate={{ year: 2021, month: 1 }}
    />
  );
}

function createQuarterlyData(periods: { year: number; quarter: number }[]): QuarterlyView[] {
  const keys = [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS, ...QUARTERLY_PUBLIC_REAL_KEYS];
  const supportKey = SUPPORT_SERIES_KEY_NOMINAL;
  return periods.map(({ year, quarter }, rowIndex) => {
    const label = `${year}Q${quarter}`;
    const row = { label, 年: year, quarter, 年月: label };
    const values = Object.fromEntries(
      keys.map((key, keyIndex) => [
        key,
        key === supportKey && rowIndex === 1 ? null : 100 + keyIndex,
      ]),
    );
    return { ...row, ...values } as QuarterlyView;
  });
}

function Plan24RenderingFixture({ data }: { data: QuarterlyView[] }) {
  const keys = [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS];
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("b3m-plan24-rendering", {
    dataLength: data.length,
    showAllPayload: true,
    includeUnmappedPayload: true,
  });
  return (
    <div style={{ width: 1000 }}>
      <SpendingBarChart
        title="消費支出（名目）"
        testId="b3m-plan24-rendering"
        data={data}
        keys={keys}
        colors={keys.map(() => "#2563eb")}
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
      />
    </div>
  );
}

function StackedTooltipFixture() {
  const keys = [...stackedKeys];
  const data: CpiData[] = [0, 1].map((index) => ({
    ...MONTHLY_DATA[index],
    ...Object.fromEntries(keys.map((key, keyIndex) => [key, 10 + index + keyIndex])),
  }));
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("b3m-stacked-tooltip", {
    dataLength: data.length,
    showTotal: true,
    totalIncludedKeys: keys,
    showAllPayload: true,
    seriesMeta: buildCpiTooltipMetadata(keys),
    includeUnmappedPayload: true,
    valueFormatter: formatCpiTooltipValue,
    totalFormatter: formatCpiTooltipTotal,
  });
  return (
    <div style={{ width: 1000 }}>
      <StackedAreaChart
        title="費目別寄与度"
        sectionId="b3m-stacked-tooltip-chart"
        data={data}
        keys={keys}
        colors={stackedColors}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={CHART_COLORS}
        tooltipProps={tooltip.tooltipProps}
        onReset={() => {}}
      />
    </div>
  );
}

describe("B3m Chromium slices", () => {
  it("p45-a-advanced-series-normal", async () => {
    await page.viewport(1280, 800);
    renderBrowserComponent(<ComparisonSeriesFixture />);
    const chart = document.querySelector<HTMLElement>("#b3m-new-graph");
    expect(chart).not.toBeNull();
    const normalKeys = ["CPI総合(12MA)", "総合(12MA)", CONSUMPTION_TOTAL_12MA_KEY];
    for (const key of normalKeys) {
      const legend = chart!.querySelector<HTMLElement>(`[data-key="${key}"]`);
      expect(legend).not.toBeNull();
      await expect.element(legend!).toBeVisible();
    }
    expect(chart!.querySelector(`[data-key="${CTI_BASIC_EXTENSION_KEY}"]`)).toBeNull();
    const renderedLines = chart!.querySelectorAll(".recharts-line-curve");
    expect(renderedLines).toHaveLength(3);
  });

  it("p45-a-cpi-sections", async () => {
    window.__MOUNT_ALL__ = true;
    window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2021`);
    renderBrowserComponent(<CpiSectionsFixture />);
    await expect.element(page.getByText("CPI費目別", { exact: true })).toBeInTheDocument();
    const salaryButtons = await page.getByRole("button", { name: "給与", exact: true }).all();
    let hasSalarySectionTab = false;
    for (const button of salaryButtons) {
      if ((await button.element()).hasAttribute("aria-current")) {
        hasSalarySectionTab = true;
        break;
      }
    }
    expect(hasSalarySectionTab).toBe(true);
    const chart = page.getByRole("img", { name: "物価指数 費目別寄与度の積み上げグラフ" });
    await expect.element(chart).toBeVisible();
    const chartElement = await chart.element();
    expect(chartElement.querySelectorAll("path.recharts-area-area").length).toBeGreaterThan(0);
  });

  it("p45-b-plan24-rendering-71", async () => {
    renderBrowserComponent(
      <Plan24RenderingFixture
        data={createQuarterlyData([
          { year: 2005, quarter: 1 },
          { year: 2018, quarter: 1 },
        ])}
      />,
    );
    const chart = page.getByTestId("b3m-plan24-rendering");
    const chartElement = await chart.element();
    const firstBar = chartElement.querySelector<HTMLElement>(".recharts-bar-rectangle");
    expect(firstBar).not.toBeNull();
    expect(firstBar).toBeVisible();
    expect(chartElement.querySelectorAll(".recharts-line-curve")).toHaveLength(0);
  });

  it("p45-b-plan24-rendering-88", async () => {
    renderBrowserComponent(
      <Plan24RenderingFixture
        data={createQuarterlyData([
          { year: 2025, quarter: 1 },
          { year: 2025, quarter: 4 },
        ])}
      />,
    );
    const chart = page.getByTestId("b3m-plan24-rendering");
    const chartElement = await chart.element();
    const firstBar = chartElement.querySelector<HTMLElement>(".recharts-bar-rectangle");
    expect(firstBar).not.toBeNull();
    expect(firstBar).toBeVisible();
    await userEvent.hover(firstBar!);
    const tooltip = chartElement.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
    expect(tooltip).not.toBeNull();
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent("2025Q1");
    const expectedFirstKey = QUARTERLY_PLAN40_V2_NOMINAL_KEYS[0];
    const expectedRow = tooltip!.querySelector(
      `[data-tooltip-row="true"][data-tooltip-key="${expectedFirstKey}"]`,
    );
    expect(expectedRow).toHaveTextContent("100.00");
  });

  it("p45-b-tooltip-stack-total-108", async () => {
    await page.viewport(1280, 800);
    renderBrowserComponent(<StackedTooltipFixture />);
    const chart = page.getByRole("img", { name: "物価指数 費目別寄与度の積み上げグラフ" });
    const chartElement = await chart.element();
    const area = chartElement.querySelector<HTMLElement>("path.recharts-area-area");
    expect(area).not.toBeNull();
    expect(area).toBeVisible();
    await userEvent.hover(area!);
    const tooltip = document.querySelector<HTMLElement>('[data-tooltip-root="true"]');
    expect(tooltip).not.toBeNull();
    await expect.element(tooltip!).toBeVisible();
    expect(tooltip!.querySelectorAll('[data-tooltip-row="true"]')).toHaveLength(
      CPI_CATEGORIES.length,
    );
    const total = tooltip!.querySelector<HTMLElement>('[data-tooltip-total="true"]');
    expect(total).not.toBeNull();
    await expect.element(total!).toBeVisible();
  });
});

afterEach(() => {
  window.__MOUNT_ALL__ = false;
});
