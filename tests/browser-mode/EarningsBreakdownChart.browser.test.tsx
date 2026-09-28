import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { EarningsBreakdownChart } from "../../src/app/components/EarningsBreakdownChart";
import type { CustomTooltipProps } from "../../src/types/chart";
import type { CpiData } from "../../src/types";
import { renderBrowserComponent } from "./renderBrowserComponent";

const CHART_COLORS = {
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};

const hourlyPay = 280;

function EarningsHoverTooltip({ active, payload, label }: CustomTooltipProps) {
  const hourlyEntry = payload?.find((entry) => entry.dataKey === "時間当たり給与");
  if (!active || !hourlyEntry) return null;

  return (
    <div data-testid="earnings-hover-tooltip">
      {label}: {hourlyEntry.value}
    </div>
  );
}

const tooltipProps = {
  cursor: { stroke: "#000000", strokeWidth: 1, strokeOpacity: 0.6 },
  trigger: "hover" as const,
  content: (
    <EarningsHoverTooltip isMobile={false} isTouch={false} tooltipBg="#fff" tooltipText="#111" />
  ),
};

const data: CpiData[] = ["2025年1月", "2025年2月"].map((年月) => ({
  年月,
  総合: 100,
  生鮮食品を除く総合: 99,
  持家の帰属家賃を除く総合: 98,
  "消費支出（参考）": null,
  "CPI総合(参考)": 100,
  所定内給与: 250,
  所定外給与: 45,
  特別給与: 80,
  時間当たり給与: hourlyPay,
  "15歳以上国民当たり給与": 210,
}));

describe("EarningsBreakdownChart tooltip in Chromium", () => {
  it("real earnings plot hover activates visible tooltip content", async () => {
    await page.viewport(1280, 800);
    renderBrowserComponent(
      <div style={{ width: 1000 }}>
        <div data-testid="earnings-hover-chart">
          <EarningsBreakdownChart
            data={data}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={CHART_COLORS}
            isMobile={false}
            tooltipProps={tooltipProps}
          />
        </div>
      </div>,
    );

    const chartElement = await page.getByTestId("earnings-hover-chart").element();
    const area = chartElement.querySelector<SVGPathElement>("path.recharts-area-area");
    if (!area) throw new Error("Earnings chart area path is missing");
    await page.elementLocator(area).hover();

    const tooltip = page.getByTestId("earnings-hover-tooltip");
    await expect.element(tooltip).toBeVisible();
    await expect.element(tooltip).toHaveTextContent(String(hourlyPay));
  });
});
