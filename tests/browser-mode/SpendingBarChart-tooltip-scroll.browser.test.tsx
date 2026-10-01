import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import {
  getLegendLabel,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import {
  QUARTERLY_PLAN40_V2_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import { renderBrowserComponent } from "./renderBrowserComponent";

type ChartKind = "nominal" | "real";
type Viewport = { width: number; height: number };

const CHART_KEYS: Record<ChartKind, string[]> = {
  nominal: [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS],
  real: [...QUARTERLY_PUBLIC_REAL_KEYS],
};
const SUPPORT_KEYS: Record<ChartKind, string> = {
  nominal: SUPPORT_SERIES_KEY_NOMINAL,
  real: SUPPORT_SERIES_KEY_REAL,
};
const TITLES: Record<ChartKind, string> = {
  nominal: "消費支出（名目）",
  real: "消費支出（実質）",
};
const CHART_COLORS = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};
const FIXTURE_GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; min-height: 100%; }
  body { display: flex; flex-direction: column; font-family: system-ui, Arial, sans-serif; }
`;

function createQuarterlyData(kind: ChartKind): ComponentProps<typeof SpendingBarChart>["data"] {
  const keys = CHART_KEYS[kind];
  const supportKey = SUPPORT_KEYS[kind];
  return Array.from({ length: 84 }, (_, index) => {
    const year = 2005 + Math.floor(index / 4);
    const quarter = (index % 4) + 1;
    const row: Record<string, string | number | null> = {
      label: `${year}Q${quarter}`,
      年: year,
      quarter,
      年月: `${year}Q${quarter}`,
    };
    for (const [keyIndex, key] of keys.entries()) {
      if (key === supportKey) {
        row[key] = year < 2018 ? 420 + (index % 4) * 7 : null;
      } else {
        row[key] = year < 2018 ? 140 + keyIndex * 9 : 90 + keyIndex * 9 + (year - 2018) * 2;
      }
    }
    return row;
  }) as ComponentProps<typeof SpendingBarChart>["data"];
}

function SpendingTooltipFixture({ kind }: { kind: ChartKind }) {
  const keys = CHART_KEYS[kind];
  const data = createQuarterlyData(kind);
  const colors = keys.map((key, index) =>
    key === SUPPORT_KEYS[kind] ? CHART_COLORS.barFill : index % 2 ? "#1d4ed8" : "#be123c",
  );
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: true });
  const tooltip = bind(`scroll-${kind}`, {
    dataLength: data.length,
    includeUnmappedPayload: true,
    showAllPayload: true,
    showTotal: true,
    allowedKeys: keys,
    seriesMeta: keys.map((key, order) => ({
      key,
      label: getLegendLabel(key),
      color: colors[order],
      order,
    })),
  });

  return (
    <>
      <style>{FIXTURE_GLOBAL_CSS}</style>
      {/* Match the route's outer .container and mobile .chartContainer padding/border. */}
      <main style={{ width: "100%", paddingLeft: "1rem", paddingRight: "1rem" }}>
        <div
          style={{
            width: "100%",
            padding: "1rem",
            border: "1px solid transparent",
            borderRadius: "0.75rem",
          }}
        >
          <SpendingBarChart
            title={TITLES[kind]}
            testId={`scroll-${kind}`}
            data={data}
            keys={keys}
            colors={colors}
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
            legendMode="collapsible"
            isMobile
          />
        </div>
      </main>
    </>
  );
}

async function assertTooltipScrollBehavior(kind: ChartKind, viewport: Viewport) {
  await page.viewport(viewport.width, viewport.height);
  expect(window.innerWidth).toBe(viewport.width);
  expect(window.innerHeight).toBe(viewport.height);
  renderBrowserComponent(<SpendingTooltipFixture kind={kind} />);

  const chart = await page.getByTestId(`scroll-${kind}`).element();
  const barElement = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
  if (!barElement) throw new Error(`Spending bar is missing for ${kind}`);
  const bar = page.elementLocator(barElement);
  await expect.element(bar).toBeVisible();
  await bar.hover();
  const chartWrapper = chart.querySelector<HTMLElement>('[role="img"]');
  if (!chartWrapper) throw new Error(`Spending chart wrapper is missing for ${kind}`);
  // Dispatch on the chart wrapper after hover so an open tooltip overlay cannot intercept it.
  chartWrapper.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const tooltipElement = chart.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
  if (!tooltipElement) throw new Error(`Spending tooltip is missing for ${kind}`);
  const tooltip = page.elementLocator(tooltipElement);
  await expect.element(tooltip).toBeVisible();
  const renderedTooltip = await tooltip.element();
  const computedStyle = window.getComputedStyle(renderedTooltip);
  const scrollHeight = renderedTooltip.scrollHeight;
  const clientHeight = renderedTooltip.clientHeight;

  expect(computedStyle.overflowY).toBe("auto");
  expect(Number.parseFloat(computedStyle.maxHeight)).toBeGreaterThan(0);
  expect(Number.parseFloat(computedStyle.paddingBottom)).toBeGreaterThanOrEqual(10);
  const closeButton = tooltip.getByRole("button", { name: "閉じる" });
  if (scrollHeight > clientHeight) {
    renderedTooltip.scrollTop = scrollHeight;
    expect(renderedTooltip.scrollTop + clientHeight).toBeGreaterThanOrEqual(scrollHeight - 1);
  }
  await expect.element(closeButton).toBeVisible();
}

describe("SpendingBarChart mobile tooltip scroll in Chromium", () => {
  it("375x667 nominal tooltip scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("nominal", { width: 375, height: 667 });
  });

  it("375x667 real tooltip scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("real", { width: 375, height: 667 });
  });

  it("320x480 nominal tooltip scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("nominal", { width: 320, height: 480 });
  });

  it("320x480 real tooltip scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("real", { width: 320, height: 480 });
  });

  it("667x375 landscape nominal tooltip scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("nominal", { width: 667, height: 375 });
  });

  it("667x375 landscape real tooltip scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("real", { width: 667, height: 375 });
  });
});
