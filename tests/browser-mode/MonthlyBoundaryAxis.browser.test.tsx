import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { EarningsBreakdownChart } from "../../src/app/components/EarningsBreakdownChart";
import { StackedAreaChart } from "../../src/app/components/StackedAreaChart";
import type { CpiData } from "../../src/types";
import { renderBrowserComponent } from "./renderBrowserComponent";

const CHART_COLORS = {
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};

const TOOLTIP_PROPS = {
  cursor: { stroke: "#000000", strokeWidth: 1, strokeOpacity: 0.6 },
  trigger: "hover" as const,
  content: <div />,
};

function createMonthlyData(): CpiData[] {
  return Array.from({ length: 24 }, (_, index) => {
    const year = 2017 + Math.floor(index / 12);
    const month = (index % 12) + 1;
    const value = 100 + index;
    return {
      年月: `${year}年${month}月`,
      総合: value,
      生鮮食品を除く総合: value - 1,
      持家の帰属家賃を除く総合: value - 2,
      "消費支出（参考）": null,
      "CPI総合(参考)": value,
      住居: value + 10,
      所定内給与: 250 + index,
      所定外給与: 45 + index,
      特別給与: 80 + index,
      時間当たり給与: 280 + index,
      "15歳以上国民当たり給与": 210 + index,
    };
  });
}

async function expectMonthlyBoundaryTicksOmitted(chartId: string) {
  const chart = await page.getByTestId(chartId).element();
  const ticks = chart.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text");
  const firstTick = ticks.item(0);
  if (!firstTick) throw new Error(`No x-axis tick labels found in ${chartId}`);
  await expect.element(page.elementLocator(firstTick)).toBeVisible();
  const labels = Array.from(ticks, (tick) => tick.textContent);
  expect(labels).not.toContain("2017年12月");
  expect(labels).not.toContain("2018年1月");
}

describe("Monthly chart boundary labels in Chromium", () => {
  it("p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg — omits both boundary labels", async () => {
    await page.viewport(1280, 800);
    renderBrowserComponent(
      <div style={{ width: 1000 }}>
        <div data-testid="cpi-boundary-chart">
          <StackedAreaChart
            title="物価指数 費目別寄与度"
            data={createMonthlyData()}
            keys={["住居"]}
            colors={["#be123c"]}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={CHART_COLORS}
            tooltipProps={TOOLTIP_PROPS}
            onReset={() => {}}
          />
        </div>
      </div>,
    );

    await expectMonthlyBoundaryTicksOmitted("cpi-boundary-chart");
  });

  it("p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg — omits both earnings boundary labels", async () => {
    await page.viewport(1280, 800);
    renderBrowserComponent(
      <div style={{ width: 1000 }}>
        <div data-testid="earnings-boundary-chart">
          <EarningsBreakdownChart
            data={createMonthlyData()}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={CHART_COLORS}
            isMobile={false}
            tooltipProps={TOOLTIP_PROPS}
          />
        </div>
      </div>,
    );

    await expectMonthlyBoundaryTicksOmitted("earnings-boundary-chart");
  });
});
