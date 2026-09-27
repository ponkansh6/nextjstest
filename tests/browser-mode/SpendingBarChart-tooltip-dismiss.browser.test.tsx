import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
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

function NominalSpendingFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("browser-nominal-escape", { dataLength: 1, includeUnmappedPayload: true });

  return (
    <div style={{ width: 1000 }}>
      <SpendingBarChart
        title="消費支出（名目）"
        testId="spending-chart-nominal"
        data={[{ label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", "食料（名目）": 123 }]}
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
        legendMode="expanded"
        isMobile={false}
      />
    </div>
  );
}

function NominalTouchScrollDismissFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: true });
  const tooltip = bind("browser-nominal-scroll-dismiss", { dataLength: 1 });

  return (
    <>
      <div style={{ height: 24 }} />
      <div style={{ width: 1000 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="spending-chart-scroll-dismiss"
          data={[{ label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", "食料（名目）": 123 }]}
          keys={["食料（名目）"]}
          colors={["#be123c"]}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onClick={tooltip.onClick}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
          legendMode="expanded"
          isMobile
        />
      </div>
      <div aria-hidden="true" style={{ height: 1200 }} />
    </>
  );
}

describe("Spending tooltip Escape", () => {
  it("hover and Escape dismiss", async () => {
    await page.viewport(1280, 800);
    expect(window.innerWidth).toBe(1280);
    expect(window.innerHeight).toBe(800);
    renderBrowserComponent(<NominalSpendingFixture />);

    const chart = page.getByTestId("spending-chart-nominal");
    const chartElement = await chart.element();
    const barElement = chartElement.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!barElement) throw new Error("Nominal spending bar is missing");
    const bar = page.elementLocator(barElement);
    await expect.element(bar).toBeVisible();
    await bar.hover();

    const tooltipElement = chartElement.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
    if (!tooltipElement) throw new Error("Nominal spending tooltip is missing");
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    await expect.element(tooltip).toHaveTextContent("食料（名目）");
    await expect.element(tooltip).toHaveTextContent("123.00");

    await userEvent.keyboard("{Escape}");

    await expect.element(tooltip).not.toBeInTheDocument();
  });
});

describe("tooltip scroll", () => {
  it("231 P42-538/-539 scroll dismissal", async () => {
    await page.viewport(412, 915);
    renderBrowserComponent(<NominalTouchScrollDismissFixture />);

    const chart = await page.getByTestId("spending-chart-scroll-dismiss").element();
    const barElement = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!barElement) throw new Error("Scroll dismissal spending bar is missing");
    const bar = page.elementLocator(barElement);
    await expect.element(bar).toBeVisible();
    await userEvent.click(await bar.element());

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect.element(closeButton).toBeVisible();
    expect(document.querySelectorAll(".recharts-tooltip-cursor").length).toBe(1);

    window.scrollTo(0, window.scrollY + 60);

    await expect.element(closeButton).not.toBeInTheDocument();
    expect(document.querySelectorAll(".recharts-tooltip-cursor").length).toBe(0);
  });
});
