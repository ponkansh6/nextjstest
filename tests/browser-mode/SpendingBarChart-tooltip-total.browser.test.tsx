import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY } from "../../src/lib/chartConstants";
import { renderBrowserComponent } from "./renderBrowserComponent";

const CHART_COLORS = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};

function NominalTooltipFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("browser-nominal-2022-total", {
    dataLength: 2,
    showTotal: true,
    includeUnmappedPayload: true,
  });

  return (
    <div style={{ width: 1000 }}>
      <SpendingBarChart
        title="消費支出（名目）"
        testId="spending-chart-nominal-2022-total"
        data={[
          {
            label: "2022Q1",
            年: 2022,
            quarter: 1,
            年月: "2022Q1",
            "食料（名目）": 123,
            "住居（名目）": 234,
          },
          {
            label: "2022Q2",
            年: 2022,
            quarter: 2,
            年月: "2022Q2",
            "食料（名目）": 234,
            "住居（名目）": 345,
          },
        ]}
        keys={["食料（名目）", "住居（名目）"]}
        colors={["#be123c", "#1d4ed8"]}
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
        isMobile={false}
      />
    </div>
  );
}

function RealTooltipFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("browser-real-simple-tooltip", {
    dataLength: 1,
    showTotal: false,
    showMeasurementNotes: false,
    allowedKeys: ["食料（実質）", "住居（実質）"],
    seriesMeta: [
      { key: "食料（実質）", label: "食料", color: "#be123c", order: 0 },
      { key: "住居（実質）", label: "住居", color: "#1d4ed8", order: 1 },
      {
        key: CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
        label: "消費支出（実質）",
        color: "#64748b",
        order: 2,
        cpiSeries: "CPI series",
      },
    ],
  });

  return (
    <div style={{ width: 1000 }}>
      <SpendingBarChart
        title="消費支出（実質）"
        testId="spending-chart-real-simple-tooltip"
        data={[
          {
            label: "2025Q1",
            年: 2025,
            quarter: 1,
            年月: "2025Q1",
            "食料（実質）": 123,
            "住居（実質）": 234,
            [CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]: 357,
          },
        ]}
        keys={["食料（実質）", "住居（実質）", CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]}
        colors={["#be123c", "#1d4ed8", "#64748b"]}
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
        isMobile={false}
      />
    </div>
  );
}

describe("SpendingBarChart nominal tooltip total in Chromium", () => {
  it("shows the stacked total after hovering a rendered 2022 bar", async () => {
    renderBrowserComponent(<NominalTooltipFixture />);

    const chart = await page.getByTestId("spending-chart-nominal-2022-total").element();
    const barElement = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!barElement) throw new Error("2022 nominal spending bar is missing");
    const bar = page.elementLocator(barElement);
    await expect.element(bar).toBeVisible();
    await bar.hover();

    const tooltipElement = chart.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
    if (!tooltipElement) throw new Error("Nominal spending tooltip is missing");
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    const totalElement = tooltipElement.querySelector<HTMLElement>('[data-tooltip-total="true"]');
    if (!totalElement) throw new Error("Nominal spending tooltip total is missing");
    const total = page.elementLocator(totalElement);
    await expect.element(total).toBeVisible();
    await expect.element(total).toHaveTextContent("合計");
    await expect.element(total).toHaveTextContent("357.00");
  });

  it("shows only real category rows without the support total or CPI notes", async () => {
    renderBrowserComponent(<RealTooltipFixture />);

    const chart = await page.getByTestId("spending-chart-real-simple-tooltip").element();
    const barElement = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!barElement) throw new Error("2025 real spending bar is missing");
    const bar = page.elementLocator(barElement);
    await expect.element(bar).toBeVisible();
    await bar.hover();

    const tooltipElement = chart.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
    if (!tooltipElement) throw new Error("Real spending tooltip is missing");
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    const tooltipRows = [
      ...tooltipElement.querySelectorAll<HTMLElement>('[data-tooltip-row="true"]'),
    ];
    expect(tooltipRows.map((row) => row.getAttribute("data-tooltip-key"))).toEqual([
      "食料（実質）",
      "住居（実質）",
    ]);
    expect(tooltipElement.querySelector('[data-tooltip-total="true"]')).toBeNull();
    expect(tooltipElement.querySelector('[data-tooltip-measurement-note="true"]')).toBeNull();
    expect(tooltipElement.querySelector('[data-tooltip-cpi-provenance="true"]')).toBeNull();
  });
});
