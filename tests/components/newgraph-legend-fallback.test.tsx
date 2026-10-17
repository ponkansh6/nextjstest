import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  YAxis: () => null,
}));
vi.mock("../../src/app/components/charts/YearReferenceLines", () => ({
  YearReferenceLines: () => null,
}));
vi.mock("../../src/app/components/charts/TimeSeriesXAxis", () => ({
  TimeSeriesXAxis: () => null,
}));
vi.mock("../../src/app/components/ChartDataContract", () => ({
  ChartDataContract: () => null,
}));

import { NewGraph } from "../../src/app/components/NewGraph";
import { createComparisonSeriesRegistry } from "../../src/lib/chartConstants";

describe("NewGraph legend label fallback", () => {
  it("uses displayName when a comparison series has no legendLabel", () => {
    const [firstSeries] = createComparisonSeriesRegistry();
    const registry = [
      { ...firstSeries, legendLabel: undefined, displayName: "Display name fallback" },
    ];

    render(
      <NewGraph
        data={[]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={{ gridStroke: "#ddd", axisText: "#111" }}
        isMobile={false}
        tooltipProps={{} as React.ComponentProps<typeof NewGraph>["tooltipProps"]}
        comparisonSeriesRegistry={registry}
      />,
    );

    expect(screen.getByTestId(`new-graph-legend-${firstSeries.key}`).textContent).toContain(
      "Display name fallback",
    );
  });
});
