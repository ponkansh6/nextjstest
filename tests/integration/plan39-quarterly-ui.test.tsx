import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { DataTablesSection } from "../../src/app/components/DataTablesSection";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { SUPPORT_SERIES_KEY_NOMINAL } from "../../src/lib/chartConstants";

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

const estimatedMeasurement = {
  key: "食料（名目）",
  color: "#2563eb",
  label: "食料（名目）",
  unit: "万円",
  source: "Plan39-v2 bottom-up connection estimate",
  valueType: "raw" as const,
  value: 10,
  status: "available" as const,
  reason: null,
  frequency: "quarterly" as const,
  aggregation: "quarterly_bottom_up",
  seriesType: "estimated_adjusted" as const,
  official: false,
};

const officialMeasurement = {
  ...estimatedMeasurement,
  color: "#16a34a",
  source: "公式CTIミクロ調整系列",
  value: 11,
  seriesType: "official_adjusted" as const,
  official: true,
};

describe("Plan39 quarterly nominal UI", () => {
  it("shows the series switch note and per-row estimated/official table labels", () => {
    render(
      <>
        <SpendingBarChart
          title="消費支出（名目）"
          data={[
            {
              label: "2017Q4",
              年: 2017,
              quarter: 4,
              年月: "2017Q4",
              [SUPPORT_SERIES_KEY_NOMINAL]: 100,
            },
            {
              label: "2018Q1",
              年: 2018,
              quarter: 1,
              年月: "2018Q1",
              "食料（名目）": 11,
            },
          ]}
          keys={["食料（名目）", SUPPORT_SERIES_KEY_NOMINAL]}
          colors={["#111"]}
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
              keys: ["食料（名目）"],
              data: [
                {
                  年月: "2017Q4",
                  "食料（名目）": 10,
                  measurements: { "食料（名目）": estimatedMeasurement },
                },
                {
                  年月: "2018Q1",
                  "食料（名目）": 11,
                  measurements: { "食料（名目）": officialMeasurement },
                },
              ],
              metadata: [estimatedMeasurement, officialMeasurement],
            },
          ]}
        />
      </>,
    );

    expect(
      screen.getByTestId("spending-series-switch-note").getAttribute("data-series-switch"),
    ).toBe("plan39-v2-bottom-up-to-cti-categories");

    const table = screen.getByTestId("data-table-section-consumption-nominal");
    const cells = [...table.querySelectorAll("[data-measurement-metadata]")];
    expect(cells[0]?.getAttribute("data-measurement-series-type")).toBe("estimated_adjusted");
    expect(cells[0]?.getAttribute("data-measurement-official")).toBe("false");
    expect(cells[0]?.textContent).toContain("区分: 2016年以前は接続推計");
    expect(cells[1]?.getAttribute("data-measurement-series-type")).toBe("official_adjusted");
    expect(cells[1]?.getAttribute("data-measurement-official")).toBe("true");
    expect(cells[1]?.textContent).toContain("区分: 公式調整値");
  });
});
