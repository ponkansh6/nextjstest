/** @bun-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import {
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import { setupUiMocks } from "../utils/ui-mocks";
import "../utils/recharts-mock";

describe("real consumption public contract", () => {
  it("does not pass nominal Plan38 CTI into the real chart", () => {
    setupUiMocks();
    const data = [
      {
        label: "2017Q4",
        年: 2017,
        quarter: 4,
        年月: "2017Q4",
        [SUPPORT_SERIES_KEY_REAL]: 98,
        [SUPPORT_SERIES_KEY_NOMINAL]: 101,
      },
      {
        label: "2018Q1",
        年: 2018,
        quarter: 1,
        年月: "2018Q1",
        [SUPPORT_SERIES_KEY_REAL]: null,
        [SUPPORT_SERIES_KEY_NOMINAL]: 102,
      },
    ];

    render(
      <SpendingBarChart
        title="消費支出（実質）"
        data={data as any}
        keys={[...CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_REAL]}
        colors={[...CONSUMPTION_REAL_KEYS.map(() => "#64748b"), "#94a3b8"]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={{ barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" }}
        tooltipProps={{
          cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: "hover",
          content: <div />,
        }}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const rows = screen
      .getByTestId("chart-data-contract")
      .querySelectorAll("[data-chart-data-row]");
    const beforeBoundary = rows[0] as HTMLElement;
    const afterBoundary = rows[1] as HTMLElement;
    expect(rows[0]?.getAttribute("data-period")).toBe("2017Q4");
    expect(
      beforeBoundary
        .querySelector(`[data-series-key="${SUPPORT_SERIES_KEY_REAL}"]`)
        ?.getAttribute("data-value"),
    ).toBe("98");
    expect(
      beforeBoundary.querySelector(`[data-series-key="${SUPPORT_SERIES_KEY_NOMINAL}"]`),
    ).toBeNull();
    expect(rows[1]?.getAttribute("data-period")).toBe("2018Q1");
    expect(
      afterBoundary
        .querySelector(`[data-series-key="${SUPPORT_SERIES_KEY_REAL}"]`)
        ?.getAttribute("data-value"),
    ).toBe("null");
    expect(
      afterBoundary.querySelector(`[data-series-key="${SUPPORT_SERIES_KEY_NOMINAL}"]`),
    ).toBeNull();
  });

  it("keeps the legacy real support boundary at 2018Q1", () => {
    setupUiMocks();
    const data = [
      { label: "2018Q1", 年: 2018, quarter: 1, 年月: "2018Q1", [SUPPORT_SERIES_KEY_REAL]: null },
    ];
    render(
      <SpendingBarChart
        title="消費支出（実質）"
        data={data as any}
        keys={[...CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_REAL]}
        colors={[...CONSUMPTION_REAL_KEYS.map(() => "#64748b"), "#94a3b8"]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={{ barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" }}
        tooltipProps={{
          cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: "hover",
          content: <div />,
        }}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    const row = screen
      .getByTestId("chart-data-contract")
      .querySelector('[data-chart-data-row][data-period="2018Q1"]') as HTMLElement;
    expect(
      row
        .querySelector(`[data-series-key="${SUPPORT_SERIES_KEY_REAL}"]`)
        ?.getAttribute("data-value"),
    ).toBe("null");
  });
});
