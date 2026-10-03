import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const chart = ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="chart" data-rows={data ? JSON.stringify(data) : undefined}>
      {children}
    </div>
  );
  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    AreaChart: chart,
    LineChart: chart,
    BarChart: chart,
    Area: ({ dataKey }: { dataKey: string }) => <i data-testid="area-series" data-key={dataKey} />,
    Line: ({ dataKey }: { dataKey: string }) => <i data-testid="line-series" data-key={dataKey} />,
    Bar: ({
      dataKey,
      fill,
      ...props
    }: {
      dataKey: string;
      fill?: string;
      [key: string]: unknown;
    }) => (
      <i
        data-testid={(props["data-testid"] as string | undefined) ?? "bar-series"}
        data-key={dataKey}
        data-fill={fill}
      />
    ),
    usePlotArea: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    YAxis: () => null,
    XAxis: ({ tick }: { tick?: (props: Record<string, unknown>) => React.ReactNode }) =>
      typeof tick === "function"
        ? tick({ x: 0, y: 0, index: 0, payload: { value: "2025Q1" }, visibleTicksCount: 2 })
        : null,
  };
});

vi.mock("@/app/components/charts/YearReferenceLines", () => ({
  YearReferenceLines: () => null,
}));
vi.mock("@/app/components/charts/TimeSeriesXAxis", () => ({
  TimeSeriesXAxis: () => null,
}));
vi.mock("@/app/components/charts/XAxisEdgeTick", () => ({ XAxisEdgeTick: () => null }));
vi.mock("@/app/components/ChartInfoContentRenderer", () => ({
  default: ({ footer }: { footer?: React.ReactNode }) => (
    <span data-testid="chart-info">{footer}</span>
  ),
}));

import { EarningsBreakdownChart } from "@/app/components/EarningsBreakdownChart";
import { MajorIndicesChart } from "@/app/components/MajorIndicesChart";
import { NewGraph } from "@/app/components/NewGraph";
import {
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  CONSUMPTION_TOTAL_12MA_KEY,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  createComparisonSeriesRegistry,
} from "@/lib/chartConstants";
import { SpendingBarChart } from "@/app/components/SpendingBarChart";

afterEach(cleanup);

const chartColors = {
  axisText: "#111",
  axisTextEmphasis: "#000",
  gridStroke: "#ddd",
  barFill: "#888",
};
const tooltipProps = {} as React.ComponentProps<typeof EarningsBreakdownChart>["tooltipProps"];

describe("chart series public-data edge cases", () => {
  it("renders earnings area and line series, skipping hidden and non-finite values in its public maximum", () => {
    const data = [
      { 年月: "2024年1月", 所定内給与: 10, 所定外給与: Number.NaN, 時間当たり給与: 12 },
      { 年月: "2024年2月", 所定内給与: null, 所定外給与: 4, 時間当たり給与: 8 },
    ] as any;
    const onToggle = vi.fn();
    render(
      <EarningsBreakdownChart
        sectionId="earnings"
        data={data}
        hiddenKeys={["特別給与", "15歳以上国民当たり給与", "CPI総合(参考)"]}
        onToggle={onToggle}
        chartColors={chartColors}
        isMobile
        tooltipProps={tooltipProps}
        activeDot
        publicExtraKeys={["extra"]}
      />,
    );

    fireEvent.click(screen.getByTestId("legend-所定内給与"));
    expect(onToggle).toHaveBeenCalledWith("所定内給与");
    expect(
      screen.getAllByTestId("area-series").map((node) => node.getAttribute("data-key")),
    ).toEqual(["所定内給与", "所定外給与"]);
    expect(
      screen.getAllByTestId("line-series").map((node) => node.getAttribute("data-key")),
    ).toEqual(["時間当たり給与"]);
    expect(screen.getByTestId("chart-data-contract").getAttribute("data-series")).toContain(
      "extra",
    );
  });

  it("handles empty/all-hidden and sparse major-index data", () => {
    const onToggle = vi.fn();
    const common = {
      keys: ["総合", "住居"],
      colors: ["red", "blue"],
      onToggle,
      chartColors,
      tooltipProps,
      onClick: vi.fn(),
      activeDot: true,
    };
    const { rerender } = render(
      <MajorIndicesChart data={[]} hiddenKeys={["総合", "住居"]} {...common} />,
    );
    expect(screen.getAllByTestId("legend-総合")).toHaveLength(1);
    expect(screen.queryAllByTestId("area-series")).toHaveLength(0);

    rerender(
      <MajorIndicesChart
        data={
          [
            { 年月: "2025年1月", 総合: Number.POSITIVE_INFINITY, 住居: null },
            { 年月: "2025年2月", 総合: 20, 住居: 15 },
          ] as any
        }
        hiddenKeys={["住居"]}
        {...common}
      />,
    );
    fireEvent.click(screen.getByTestId("legend-住居"));
    expect(onToggle).toHaveBeenCalledWith("住居");
    expect(
      screen.getAllByTestId("area-series").map((node) => node.getAttribute("data-key")),
    ).toEqual(["総合"]);
  });

  it("respects advanced comparison registry entries and optional information/pointer props", () => {
    const onToggle = vi.fn();
    const registry = [
      ...createComparisonSeriesRegistry({ status: "valid", reason: null }),
      {
        key: "advanced-comparison",
        color: "#0f0",
        label: "Advanced comparison",
        displayName: "Advanced comparison",
        advanced: true,
      },
    ];
    const data = [
      { 年月: "2024年1月", "CPI総合(12MA)": null, "総合(12MA)": 100 },
      { 年月: "2024年2月", "CPI総合(12MA)": 101, "総合(12MA)": 102 },
    ] as any;
    const { rerender } = render(
      <NewGraph
        data={data}
        hiddenKeys={["CPI総合(12MA)"]}
        onToggle={onToggle}
        chartColors={chartColors}
        isMobile={false}
        tooltipProps={tooltipProps}
        comparisonSeriesRegistry={registry}
        chartKey="earnings"
        advancedToggle={<button>advanced footer</button>}
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
      />,
    );
    expect(screen.getByTestId("chart-info").textContent).toContain("advanced footer");
    expect(screen.getAllByTestId(/new-graph-legend-/)).toHaveLength(3);
    expect(
      screen.getAllByTestId("line-series").map((node) => node.getAttribute("data-key")),
    ).toEqual(["総合(12MA)", CONSUMPTION_TOTAL_12MA_KEY]);

    rerender(
      <NewGraph
        data={data}
        hiddenKeys={[]}
        onToggle={onToggle}
        chartColors={chartColors}
        isMobile
        tooltipProps={tooltipProps}
        comparisonSeriesRegistry={registry}
        showAdvanced
      />,
    );
    expect(screen.getAllByTestId(/new-graph-legend-/).length).toBeGreaterThan(3);
    fireEvent.click(screen.getByTestId("new-graph-legend-CPI総合(12MA)"));
    expect(onToggle).toHaveBeenCalledWith("CPI総合(12MA)");
  });

  it("normalizes support and CTI expenses across the series boundary", () => {
    const expense = "食料";
    const unavailableMeta = {
      [expense]: { status: "invalid", reason: "missing" },
      [SUPPORT_SERIES_KEY_NOMINAL]: {
        status: "invalid",
        reason: "official_quarterly_source_unavailable_latest_period_unknown",
      },
    };
    const rows = [
      {
        label: "2017Q1",
        年: 2017,
        quarter: 1,
        年月: "2017Q1",
        [expense]: 10,
        [SUPPORT_SERIES_KEY_NOMINAL]: 20,
        measurements: { [expense]: { key: expense } },
      },
      {
        label: "2017Q2",
        年: 2017,
        quarter: 2,
        年月: "2017Q2",
        [expense]: null,
        [SUPPORT_SERIES_KEY_NOMINAL]: 30,
        measurements: unavailableMeta,
      },
      {
        label: "2018Q1",
        年: 2018,
        quarter: 1,
        年月: "2018Q1",
        [expense]: 40,
        [SUPPORT_SERIES_KEY_NOMINAL]: 50,
        measurements: unavailableMeta,
      },
    ] as any;
    const onToggle = vi.fn();
    const { rerender } = render(
      <SpendingBarChart
        title="spending"
        sectionId="spend"
        data={rows}
        keys={[expense, SUPPORT_SERIES_KEY_NOMINAL]}
        colors={["red", "blue"]}
        hiddenKeys={[]}
        onToggle={onToggle}
        chartColors={chartColors}
        tooltipProps={tooltipProps}
        hiddenQuarters={[4]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        legendMode="collapsible"
        linkedSectionId="nominal"
        infoKey="cpi-major"
        isMobile
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("最新対象期は不明です");
    const normalized = JSON.parse(screen.getByTestId("chart").getAttribute("data-rows")!);
    expect(normalized[0][SUPPORT_SERIES_KEY_NOMINAL]).toBeNull();
    expect(normalized[1][expense]).toBeNull();
    expect(normalized[2][SUPPORT_SERIES_KEY_NOMINAL]).toBeNull();
    expect(screen.getByText(/消費支出（名目）/)).toBeTruthy();
    expect(screen.getByTestId("chart-info")).toBeTruthy();
    fireEvent.click(screen.getByText(/費目・四半期を変更/));
    fireEvent.click(screen.getByText("Q1"));
    expect(screen.getByText("全選択解除")).toBeTruthy();

    rerender(
      <SpendingBarChart
        title="derived real"
        data={[{ ...rows[0], [CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]: 35 }] as any}
        keys={[expense, CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]}
        colors={["red", "green", "blue"]}
        hiddenKeys={[expense, CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY, SUPPORT_SERIES_KEY_REAL]}
        onToggle={onToggle}
        chartColors={chartColors}
        tooltipProps={tooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        testId="spending-chart-real"
        isMobile={false}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("表示する系列がありません");
    expect(screen.queryByTestId(`legend-${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}`)).toBeNull();
  });

  it("keeps sparse non-support data usable and does not infer a missing official-support warning", () => {
    render(
      <SpendingBarChart
        title="sparse spending"
        data={
          [
            { label: "2009Q1", 年: 2009, quarter: 1, 年月: "2009Q1", 食料: 2 },
            { label: "2010Q1", 年: 2010, quarter: 1, 年月: "2010Q1", 食料: null },
            { label: "2015Q1", 年: 2015, quarter: 1, 年月: "2015Q1", 食料: Number.NaN },
            { label: "2020Q1", 年: 2020, quarter: 1, 年月: "2020Q1", 食料: 4 },
            { label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", 食料: 5 },
            { label: "not-a-quarter", 年: 2025, quarter: 2, 年月: "2025Q2", 食料: 6 },
          ] as any
        }
        keys={["食料"]}
        colors={["red"]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={{ gridStroke: "#ddd", axisText: "#111" }}
        tooltipProps={tooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("chart-data-contract").getAttribute("data-points")).toBe("6");
    expect(screen.getByTestId("chart").getAttribute("data-rows")).toContain("not-a-quarter");
  });

  it("keeps a nominal support key in expense rendering when real support is the selected total", () => {
    const keys = ["食料（実質）", SUPPORT_SERIES_KEY_NOMINAL, SUPPORT_SERIES_KEY_REAL];
    const data = [
      {
        年: 2017,
        quarter: 1,
        label: "2017Q1",
        年月: "2017Q1",
        "食料（実質）": 2,
        [SUPPORT_SERIES_KEY_NOMINAL]: 10,
        [SUPPORT_SERIES_KEY_REAL]: 9,
      },
    ] as any;
    const props = {
      title: "dual support",
      data,
      keys,
      colors: ["red", "blue", "green"],
      hiddenKeys: [],
      onToggle: vi.fn(),
      chartColors,
      tooltipProps,
      hiddenQuarters: [],
      onToggleQuarter: vi.fn(),
      onReset: vi.fn(),
      isMobile: false,
    };
    const { rerender } = render(<SpendingBarChart {...props} />);
    expect(
      screen.getByTestId(`spending-series-${SUPPORT_SERIES_KEY_NOMINAL}`).getAttribute("data-fill"),
    ).toBe(chartColors.barFill);

    rerender(<SpendingBarChart {...props} chartColors={{ ...chartColors, barFill: "" }} />);
    expect(
      screen.getByTestId(`spending-series-${SUPPORT_SERIES_KEY_NOMINAL}`).getAttribute("data-fill"),
    ).toBe("#94a3b8");
  });
});
