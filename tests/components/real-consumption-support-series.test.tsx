/** @bun-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { CONSUMPTION_REAL_KEYS } from "../../src/lib/chartConstants";
import { setupUiMocks } from "../utils/ui-mocks";
import "../utils/recharts-mock";

const SYNTHETIC_NOMINAL_KEY = "Synthetic nominal support";

describe("real consumption public contract", () => {
  it("renders the ten public real expense keys and omits unrelated synthetic input", () => {
    setupUiMocks();
    const data = [
      {
        label: "2017Q4",
        年: 2017,
        quarter: 4,
        年月: "2017Q4",
        ...Object.fromEntries(CONSUMPTION_REAL_KEYS.map((key, index) => [key, 20 + index])),
        [SYNTHETIC_NOMINAL_KEY]: 101,
      },
    ];

    render(
      <SpendingBarChart
        title="消費支出（実質）"
        data={data as any}
        keys={CONSUMPTION_REAL_KEYS}
        colors={CONSUMPTION_REAL_KEYS.map(() => "#64748b")}
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

    const contract = screen.getByTestId("chart-data-contract");
    expect(JSON.parse(contract.getAttribute("data-series") ?? "[]")).toEqual(CONSUMPTION_REAL_KEYS);
    const row = contract.querySelector('[data-chart-data-row][data-period="2017Q4"]');
    const cells = [...(row?.querySelectorAll("[data-series-key]") ?? [])];
    expect(cells).toHaveLength(10);
    expect(cells.map((cell) => cell.getAttribute("data-series-key"))).toEqual(
      CONSUMPTION_REAL_KEYS,
    );
    expect(cells[0]?.getAttribute("data-value")).toBe("20");
    expect(contract.querySelector(`[data-series-key="${SYNTHETIC_NOMINAL_KEY}"]`)).toBeNull();
  });
});
