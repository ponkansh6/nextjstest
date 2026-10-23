import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import {
  createChartTooltipSelectionResolver,
  useChartTooltipController,
} from "../../src/app/components/charts/useChartTooltipProps";
import { getLegendLabel } from "../../src/lib/chartConstants";
import {
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import { renderBrowserComponent } from "./renderBrowserComponent";

const TEST_SUPPORT_NOMINAL_KEY = "民間最終消費支出（名目）";
const TEST_SUPPORT_REAL_KEY = "民間最終消費支出（実質）";
type ChartKind = "nominal" | "real";
type Viewport = { width: number; height: number };

const CHART_KEYS: Record<ChartKind, string[]> = {
  nominal: [...QUARTERLY_PUBLIC_NOMINAL_KEYS],
  real: [...QUARTERLY_PUBLIC_REAL_KEYS],
};
const SUPPORT_KEYS: Record<ChartKind, string> = {
  nominal: TEST_SUPPORT_NOMINAL_KEY,
  real: TEST_SUPPORT_REAL_KEY,
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
  const controller = useChartTooltipController({ suppressed: false, isTouch: true });
  const tooltip = controller.bind(`scroll-${kind}`, {
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
    selectionPayloadAtIndex: createChartTooltipSelectionResolver(data, () =>
      keys.map((key, index) => ({ key, name: getLegendLabel(key), color: colors[index] })),
    ),
  });

  return (
    <>
      <style>{FIXTURE_GLOBAL_CSS}</style>
      {/* Match the route's outer .container and mobile .chartContainer padding/border. */}
      <main style={{ width: "100%", paddingLeft: "1rem", paddingRight: "1rem" }}>
        <div
          style={{
            width: "100%",
            height: 420,
            minHeight: 420,
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
            onPointerUp={tooltip.onPointerUp}
            onPointerCancel={tooltip.onPointerCancel}
            onKeyDown={tooltip.onKeyDown}
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
      {controller.drawer}
    </>
  );
}

async function assertTooltipScrollBehavior(kind: ChartKind, viewport: Viewport) {
  await page.viewport(viewport.width, viewport.height);
  expect(window.innerWidth).toBe(viewport.width);
  expect(window.innerHeight).toBe(viewport.height);
  renderBrowserComponent(<SpendingTooltipFixture kind={kind} />);

  const chart = await page.getByTestId(`scroll-${kind}`).element();
  const chartSurface = chart.querySelector<HTMLElement>('[role="img"]');
  if (!chartSurface) throw new Error(`Chart surface is missing for ${kind}`);
  chartSurface.style.width = "100%";
  chartSurface.style.height = "420px";
  chartSurface.style.minHeight = "420px";
  await expect
    .poll(() =>
      [...chart.querySelectorAll<SVGPathElement>("[data-index] path")].some((shape) => {
        const bounds = shape.getBoundingClientRect();
        return shape.isConnected && bounds.width > 0 && bounds.height > 0;
      }),
    )
    .toBe(true);
  const currentHitTarget = chart.querySelector<SVGPathElement>(
    ".recharts-bar-rectangle [data-index] path",
  );
  if (!currentHitTarget) {
    throw new Error(
      `Spending bar lost its source-row index for ${kind}; bars=${chart.querySelectorAll(".recharts-bar-rectangle").length}; indexed=${chart.querySelectorAll(".recharts-bar-rectangle [data-index]").length}; paths=${chart.querySelectorAll(".recharts-bar-rectangle path").length}; firstBar=${chart.querySelector(".recharts-bar-rectangle")?.outerHTML.slice(0, 600) ?? "<none>"}; firstIndexed=${chart.querySelector(".recharts-bar-rectangle [data-index]")?.outerHTML.slice(0, 400) ?? "<none>"}`,
    );
  }
  expect(currentHitTarget.isConnected).toBe(true);
  const currentBounds = currentHitTarget.getBoundingClientRect();
  const pointer = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 12,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: currentBounds.left + currentBounds.width / 2,
    clientY: currentBounds.top + currentBounds.height / 2,
  };
  currentHitTarget.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
  currentHitTarget.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));

  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  const popup = await dialog.element();
  const tooltipElement = popup.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
  if (!tooltipElement) throw new Error(`Drawer tooltip is missing for ${kind}`);
  const scrollArea = tooltipElement.parentElement;
  if (!scrollArea) throw new Error(`Drawer scroll area is missing for ${kind}`);
  const computedStyle = window.getComputedStyle(scrollArea);
  expect(computedStyle.overflowY).toBe("auto");
  const scrollHeight = scrollArea.scrollHeight;
  const clientHeight = scrollArea.clientHeight;
  if (scrollHeight > clientHeight) {
    scrollArea.scrollTop = scrollHeight;
    expect(scrollArea.scrollTop + clientHeight).toBeGreaterThanOrEqual(scrollHeight - 1);
  }
  const closeButton = dialog.getByRole("button", { name: "閉じる" });
  await expect.element(closeButton).toBeVisible();
}

describe("SpendingBarChart mobile tooltip scroll in Chromium", () => {
  it("375x667 nominal Drawer content scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("nominal", { width: 375, height: 667 });
  });

  it("375x667 real Drawer content scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("real", { width: 375, height: 667 });
  });

  it("320x480 nominal Drawer content scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("nominal", { width: 320, height: 480 });
  });

  it("320x480 real Drawer content scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("real", { width: 320, height: 480 });
  });

  it("667x375 landscape nominal Drawer content scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("nominal", { width: 667, height: 375 });
  });

  it("667x375 landscape real Drawer content scrolls to the close control", async () => {
    await assertTooltipScrollBehavior("real", { width: 667, height: 375 });
  });
});
