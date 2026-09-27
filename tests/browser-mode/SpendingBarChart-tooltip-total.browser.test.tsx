import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
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
          { label: "2022Q1", 年: 2022, quarter: 1, 年月: "2022Q1", "食料（名目）": 123 },
          { label: "2022Q2", 年: 2022, quarter: 2, 年月: "2022Q2", "食料（名目）": 234 },
        ]}
        keys={["食料（名目）"]}
        colors={["#be123c"]}
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
  it("shows the actual total contract after hovering a rendered 2022 bar", async () => {
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
    await expect.element(total).toHaveTextContent("123.00");
  });
});
