import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { DataTablesSection } from "../../src/app/components/DataTablesSection";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock("../../src/app/components/charts/YearReferenceLines", () => ({
  YearReferenceLines: () => <div />,
}));

vi.mock("../../src/app/components/charts/XAxisEdgeTick", () => ({
  XAxisEdgeTick: () => <div />,
}));

vi.mock("../../src/app/components/ChartInfoContentRenderer", () => ({
  default: () => <div />,
}));

const keys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
const measurementFor = (
  key: string,
  index: number,
  seriesType: "estimated_adjusted" | "official_adjusted",
) => ({
  key,
  color: "#2563eb",
  label: key,
  unit: "万円",
  source:
    seriesType === "estimated_adjusted"
      ? "Plan39-v2 bottom-up connection estimate"
      : "公式CTIミクロ調整系列",
  valueType: "raw" as const,
  value: 10 + index,
  status: "available" as const,
  reason: null,
  frequency: "quarterly" as const,
  aggregation: seriesType === "estimated_adjusted" ? "quarterly_bottom_up" : "quarterly_mean",
  seriesType,
  official: seriesType === "official_adjusted",
});

const makeRow = (
  label: string,
  year: number,
  seriesType: "estimated_adjusted" | "official_adjusted",
) => ({
  label,
  年: year,
  quarter: year === 2016 ? 4 : 1,
  年月: label,
  ...Object.fromEntries(keys.map((key, index) => [key, 10 + index])),
  measurements: Object.fromEntries(
    keys.map((key, index) => [key, measurementFor(key, index, seriesType)]),
  ),
});

describe("Plan39 quarterly nominal UI", () => {
  it("publishes ten expense keys and carries estimated/official measurements into the table", () => {
    const rows = [
      makeRow("2016Q4", 2016, "estimated_adjusted"),
      makeRow("2017Q1", 2017, "official_adjusted"),
    ];
    render(
      <>
        <SpendingBarChart
          title="消費支出（名目）"
          data={rows as any}
          keys={keys}
          colors={keys.map(() => "#2563eb")}
          hiddenKeys={[]}
          onToggle={vi.fn()}
          chartColors={{ gridStroke: "#ddd", axisText: "#333" }}
          tooltipProps={{
            content: <div />,
            trigger: "hover",
            cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
          }}
          hiddenQuarters={[]}
          onToggleQuarter={vi.fn()}
          onReset={vi.fn()}
        />
        <DataTablesSection
          tables={[
            {
              chartSectionId: "section-consumption-nominal",
              title: "消費支出（名目）",
              keys,
              data: rows as any,
              metadata: keys.map((key, index) => measurementFor(key, index, "estimated_adjusted")),
            },
          ]}
        />
      </>,
    );

    const contract = screen.getByTestId("chart-data-contract");
    expect(JSON.parse(contract.getAttribute("data-series") ?? "[]")).toEqual(keys);
    const chartRows = [...contract.querySelectorAll("[data-chart-data-row]")];
    expect(chartRows.map((row) => row.getAttribute("data-period"))).toEqual(["2016Q4", "2017Q1"]);
    for (const [index, row] of chartRows.entries()) {
      const cells = [...row.querySelectorAll("[data-series-key]")];
      expect(cells).toHaveLength(10);
      expect(cells.map((cell) => cell.getAttribute("data-series-key"))).toEqual(keys);
      expect(cells.every((cell) => cell.getAttribute("data-value-type") === "number")).toBe(true);
      expect(
        cells.every(
          (cell) =>
            cell.getAttribute("data-series-type") ===
            (index === 0 ? "estimated_adjusted" : "official_adjusted"),
        ),
      ).toBe(true);
    }

    const table = screen.getByTestId("data-table-section-consumption-nominal");
    const estimatedCells = [
      ...table.querySelectorAll('[data-measurement-series-type="estimated_adjusted"]'),
    ];
    const officialCells = [
      ...table.querySelectorAll('[data-measurement-series-type="official_adjusted"]'),
    ];
    expect(estimatedCells).toHaveLength(10);
    expect(officialCells).toHaveLength(10);
    expect(
      estimatedCells.every((cell) => cell.getAttribute("data-measurement-official") === "false"),
    ).toBe(true);
    expect(
      officialCells.every((cell) => cell.getAttribute("data-measurement-official") === "true"),
    ).toBe(true);
  });
});
