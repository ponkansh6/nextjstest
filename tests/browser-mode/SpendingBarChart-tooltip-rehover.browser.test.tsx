import { useState } from "react";
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

const data = [1, 2, 3].map((quarter) => ({
  label: `2022Q${quarter}`,
  年: 2022,
  quarter,
  年月: `2022Q${quarter}`,
  "食料（名目）": 120 + quarter,
  "住居（名目）": 80 + quarter,
}));

function TooltipRehoverFixture() {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("browser-spending-tooltip-rehover", {
    dataLength: data.length,
    showTotal: true,
    showAllPayload: true,
    includeUnmappedPayload: true,
  });

  return (
    <div style={{ width: 1000 }}>
      <SpendingBarChart
        title="消費支出（名目）"
        testId="spending-chart-tooltip-rehover"
        data={data}
        keys={["食料（名目）", "住居（名目）"]}
        colors={["#be123c", "#1d4ed8"]}
        hiddenKeys={hiddenKeys}
        onToggle={(key) =>
          setHiddenKeys((current) =>
            current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
          )
        }
        chartColors={CHART_COLORS}
        tooltipProps={tooltip.tooltipProps}
        onPointerDown={tooltip.onPointerDown}
        onPointerMove={tooltip.onPointerMove}
        onMouseMove={tooltip.onMouseMove}
        onPointerLeave={tooltip.onPointerLeave}
        onMouseLeave={tooltip.onMouseLeave}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => setHiddenKeys([])}
        isMobile={false}
      />
    </div>
  );
}

describe("Spending tooltip", () => {
  it("P42-588/-591 rehover visibility", async () => {
    renderBrowserComponent(<TooltipRehoverFixture />);

    const chart = page.getByTestId("spending-chart-tooltip-rehover");
    const chartElement = await chart.element();
    const initialBarElement = chartElement.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!initialBarElement) throw new Error("Initial tooltip rehover bar is missing");
    const initialBar = page.elementLocator(initialBarElement);
    await expect.element(initialBar).toBeVisible();
    await initialBar.hover();

    const tooltipElement = chartElement.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
    if (!tooltipElement) throw new Error("Tooltip rehover tooltip is missing");
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();

    const foodButton = chart.getByRole("button", { name: "食料", exact: true });
    await expect.element(foodButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(await foodButton.element());
    await expect.element(foodButton).toHaveAttribute("aria-pressed", "false");

    // Clear the prior Recharts hover payload before targeting a different rendered bar.
    const heading = chartElement.querySelector<HTMLHeadingElement>("h2");
    if (!heading) throw new Error("Tooltip rehover chart heading is missing");
    await page.elementLocator(heading).hover();
    const freshBarElement = chartElement.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!freshBarElement) throw new Error("Fresh tooltip rehover bar is missing");
    const freshBar = page.elementLocator(freshBarElement);
    await expect.element(freshBar).toBeVisible();
    await freshBar.hover();
    await expect.element(tooltip).toBeVisible();
  });
});
