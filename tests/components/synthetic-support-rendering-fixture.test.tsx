import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SpendingBarChart } from "@/app/components/SpendingBarChart";

import type { SeriesMeasurement } from "@/types/chart";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "@/lib/quarterlyPublicProjection";

const TEST_SYNTHETIC_KEY = "Synthetic normalized value";
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="barchart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="bar-mock" data-key={dataKey} />,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid="line-mock" data-key={dataKey} />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock("@/app/components/charts/YearReferenceLines", () => ({
  YearReferenceLines: () => <div />,
}));
vi.mock("@/app/components/charts/XAxisEdgeTick", () => ({ XAxisEdgeTick: () => <div /> }));
vi.mock("@/app/components/charts/xAxisTicks", () => ({
  computeXAxisTicks: () => [],
  computePeriodXAxisTicks: () => [],
}));
vi.mock("@/app/components/ChartInfoContentRenderer", () => ({ default: () => <div /> }));

const nominalFactor = 0.0011398911460950036;
const realFactor = 0.001298186239096047;
const chartProps = {
  title: "消費支出",
  colors: ["#ff0000"],
  hiddenKeys: [],
  onToggle: vi.fn(),
  chartColors: { barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" },
  tooltipProps: {
    cursor: { stroke: "#e2e8f0", strokeWidth: 1, strokeOpacity: 0.6 },
    trigger: "hover" as const,
    content: <div />,
  },
  hiddenQuarters: [],
  onToggleQuarter: vi.fn(),
  onReset: vi.fn(),
};

type FixtureRow = {
  [key: string]: string | number | null | Record<string, SeriesMeasurement> | undefined;
  label: string;
  年: number;
  quarter: number;
  年月: string;
  食料?: number | null;
  [TEST_SYNTHETIC_KEY]?: number | null;
  measurements?: Record<string, SeriesMeasurement>;
};

const renderFixture = (
  data: FixtureRow[],
  keys: string[] = ["食料", TEST_SYNTHETIC_KEY],
  testId?: string,
) =>
  render(
    <SpendingBarChart
      {...chartProps}
      data={data}
      keys={keys}
      colors={keys.map(() => "#ff0000")}
      testId={testId}
    />,
  );

const renderedRows = () =>
  JSON.parse(screen.getByTestId("barchart").getAttribute("data-rows") ?? "[]") as FixtureRow[];

describe("synthetic support series renderer fixtures", () => {
  it("renders a generic synthetic key when its normalized value is present", () => {
    renderFixture([
      {
        label: "2018Q1",
        年: 2018,
        quarter: 1,
        年月: "2018Q1",
        食料: 30,
        [TEST_SYNTHETIC_KEY]: 200,
      },
    ]);

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      "食料",
      TEST_SYNTHETIC_KEY,
    ]);
    expect(screen.queryAllByTestId("line-mock")).toHaveLength(0);
    expect(renderedRows()).toEqual([
      expect.objectContaining({ [TEST_SYNTHETIC_KEY]: 200, 食料: 30 }),
    ]);
  });

  it("keeps an interior generic missing value null without affecting neighboring values", () => {
    renderFixture([
      {
        label: "2018 Q1",
        年: 2018,
        quarter: 1,
        年月: "2018-01",
        食料: 10,
        [TEST_SYNTHETIC_KEY]: 150,
      },
      {
        label: "2018 Q2",
        年: 2018,
        quarter: 2,
        年月: "2018-04",
        食料: 20,
        [TEST_SYNTHETIC_KEY]: null,
      },
      {
        label: "2018 Q3",
        年: 2018,
        quarter: 3,
        年月: "2018-07",
        食料: 30,
        [TEST_SYNTHETIC_KEY]: 180,
      },
    ]);

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      "食料",
      TEST_SYNTHETIC_KEY,
    ]);
    expect(renderedRows().map((row) => row[TEST_SYNTHETIC_KEY])).toEqual([150, null, 180]);
    expect(renderedRows()[1].食料).toBe(20);
  });

  it("publishes the ten Plan40 expense keys with estimated and official boundary measurements", () => {
    const keys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
    const data: FixtureRow[] = [
      { label: "2016Q4", 年: 2016, quarter: 4, 年月: "2016Q4" },
      { label: "2017Q1", 年: 2017, quarter: 1, 年月: "2017Q1" },
    ].map((row, rowIndex) => ({
      ...row,
      ...Object.fromEntries(keys.map((key) => [key, 100 + rowIndex])),
      measurements: Object.fromEntries(
        keys.map((key) => [
          key,
          {
            key,
            label: key,
            unit: "円",
            source: "Plan40 quarterly public projection",
            valueType: "comparison" as const,
            value: 100 + rowIndex,
            status: "available" as const,
            reason: null,
            frequency: "quarterly" as const,
            aggregation: "derived",
            seriesType:
              rowIndex === 0 ? ("estimated_adjusted" as const) : ("official_adjusted" as const),
            official: rowIndex === 1,
            annualAnchorType: rowIndex === 0 ? ("estimated" as const) : ("official" as const),
            quarterlyDerived: rowIndex === 0,
          },
        ]),
      ) as Record<string, SeriesMeasurement>,
    }));
    renderFixture(data, keys, "plan40-fixture");

    const contract = screen.getByTestId("chart-data-contract");
    expect(JSON.parse(contract.getAttribute("data-series") ?? "[]")).toEqual(keys);
    const periods = Array.from(contract.querySelectorAll("[data-chart-data-row]"), (row) =>
      row.getAttribute("data-period"),
    );
    expect(periods).toEqual(["2016Q4", "2017Q1"]);
    expect(screen.getAllByTestId("bar-mock")).toHaveLength(10);
    for (const [index, row] of renderedRows().entries()) {
      expect(row[keys[0]]).toBe(100 + index);
      expect(row.measurements?.[keys[0]]?.seriesType).toBe(
        index === 0 ? "estimated_adjusted" : "official_adjusted",
      );
    }
  });

  it("normalizes a synthetic unavailable value to null while retaining current expense values", () => {
    renderFixture([
      {
        label: "2017Q4",
        年: 2017,
        quarter: 4,
        年月: "2017Q4",
        食料: null,
        [TEST_SYNTHETIC_KEY]: null,
      },
      {
        label: "2018Q1",
        年: 2018,
        quarter: 1,
        年月: "2018Q1",
        食料: 40,
        [TEST_SYNTHETIC_KEY]: null,
      },
    ]);

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      "食料",
      TEST_SYNTHETIC_KEY,
    ]);
    expect(screen.queryAllByTestId("line-mock")).toHaveLength(0);
    expect(renderedRows().map((row) => row[TEST_SYNTHETIC_KEY])).toEqual([null, null]);
    expect(renderedRows()[1].食料).toBe(40);
  });
});
