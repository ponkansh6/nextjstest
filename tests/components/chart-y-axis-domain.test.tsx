import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const chart = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: chart,
    AreaChart: chart,
    BarChart: chart,
    LineChart: chart,
    Area: () => null,
    Bar: () => null,
    Line: () => null,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: (props: { domain: [unknown, unknown] }) => (
      <div data-testid="y-axis" data-domain={JSON.stringify(props.domain)} />
    ),
  };
});

vi.mock("@/app/components/ChartInfoContentRenderer", () => ({ default: () => null }));
vi.mock("@/app/components/charts/YearReferenceLines", () => ({ YearReferenceLines: () => null }));
vi.mock("@/app/components/charts/XAxisEdgeTick", () => ({ XAxisEdgeTick: () => null }));

import { MajorIndicesChart } from "@/app/components/MajorIndicesChart";
import { StackedAreaChart } from "@/app/components/StackedAreaChart";
import { SpendingBarChart } from "@/app/components/SpendingBarChart";
import { EarningsBreakdownChart } from "@/app/components/EarningsBreakdownChart";
import { ResidualAreaChart } from "@/app/components/ResidualAreaChart";
import { NewGraph } from "@/app/components/NewGraph";

const common = {
  chartColors: { axisText: "#000", gridStroke: "#000" },
  tooltipProps: {} as any,
  onToggle: vi.fn(),
  onReset: vi.fn(),
  isMobile: false,
};

const data = [
  { 年月: "2025年1月", 年: 2025, A: 10, B: 20, 残差: -4, 総合: 10, 所定内給与: 10 },
  { 年月: "2025年2月", 年: 2025, A: 30, B: 5, 残差: 8, 総合: 30, 所定内給与: 30 },
] as any;

const domain = () => JSON.parse(screen.getByTestId("y-axis").getAttribute("data-domain")!);

describe("chart Y-axis domains", () => {
  beforeEach(() => cleanup());

  it.each([
    [
      "MajorIndicesChart",
      <MajorIndicesChart
        data={data}
        keys={["A", "B"]}
        colors={[]}
        hiddenKeys={["B"]}
        {...common}
      />,
    ],
    [
      "SpendingBarChart",
      <SpendingBarChart
        title="x"
        data={data}
        keys={["A", "B"]}
        colors={[]}
        hiddenKeys={["B"]}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        {...common}
      />,
    ],
    [
      "EarningsBreakdownChart",
      <EarningsBreakdownChart data={data} hiddenKeys={["総合"]} {...common} />,
    ],
  ])("uses visible maximum + 3 for %s", (_name, chart) => {
    render(chart);
    expect(domain()[1]).toBe(33);
  });

  it("uses the largest visible per-time stacked total plus 3", () => {
    render(
      <StackedAreaChart
        title="x"
        data={data}
        keys={["A", "B"]}
        colors={[]}
        hiddenKeys={["B"]}
        {...common}
      />,
    );
    expect(domain()[1]).toBe(33);
  });

  it("uses visible NewGraph series maximum plus 3", () => {
    render(
      <NewGraph
        data={[
          { ...data[0], "CPI総合(12MA)": 10 },
          { ...data[1], "CPI総合(12MA)": 30 },
        ]}
        hiddenKeys={[]}
        {...common}
      />,
    );
    expect(domain()[1]).toBe(33);
  });

  it("keeps ResidualAreaChart lower bound behavior and adds 3 to its upper bound", () => {
    render(<ResidualAreaChart data={data} {...common} />);
    expect(domain()).toEqual(["auto", 11]);
  });
});
