import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { renderBrowserComponent } from "./renderBrowserComponent";

type ConsumptionKind = "nominal" | "real";

const SERIES = {
  nominal: {
    title: "消費支出（名目）",
    entries: [
      { key: "食料（名目）", value: 123 },
      { key: "住居（名目）", value: 80 },
    ],
  },
  real: {
    title: "消費支出（実質）",
    entries: [
      { key: "食料（実質）", value: 456 },
      { key: "住居（実質）", value: 260 },
      { key: "光熱・水道（実質）", value: 98 },
    ],
  },
} as const;

function requireChartElement<E extends Element>(root: Element, selector: string): E {
  const element = root.querySelector<E>(selector);
  if (!element) throw new Error(`Missing chart element: ${selector}`);
  return element;
}

const CHART_COLORS = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
};

function SpendingFixture({ kind, isMobile = true }: { kind: ConsumptionKind; isMobile?: boolean }) {
  const series = SERIES[kind];
  const keys = series.entries.map(({ key }) => key);
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind(`browser-${kind}`, {
    dataLength: 1,
    showAllPayload: true,
    includeUnmappedPayload: true,
  });

  return (
    <SpendingBarChart
      title={series.title}
      testId={`chart-${kind}`}
      data={[
        {
          label: "2025Q1",
          年: 2025,
          quarter: 1,
          年月: "2025Q1",
          ...Object.fromEntries(series.entries.map(({ key, value }) => [key, value])),
        },
      ]}
      keys={keys}
      colors={series.entries.map((_, index) => (index % 2 === 0 ? "#be123c" : "#1d4ed8"))}
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
      legendMode="collapsible"
      isMobile={isMobile}
    />
  );
}

async function useMobileViewport() {
  await page.viewport(412, 915);
  expect(window.innerWidth).toBe(412);
  expect(window.innerHeight).toBe(915);
}

function renderMobileFixture(kind: ConsumptionKind) {
  renderBrowserComponent(
    <div style={{ width: 412 }}>
      <SpendingFixture kind={kind} />
    </div>,
  );
}

function DarkModeNominalTapFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: true });
  const tooltip = bind("browser-dark-nominal-tap", {
    dataLength: 1,
    showAllPayload: true,
    includeUnmappedPayload: true,
  });

  return (
    <>
      <style>{`
        html[data-theme="dark"] {
          color-scheme: dark;
          --tooltip-bg: #111827;
          --tooltip-text: #f9fafb;
        }
        html[data-theme="dark"] body { background: #111827; color: #f9fafb; }
      `}</style>
      <div style={{ width: 412 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="chart-dark-nominal"
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
    </>
  );
}

describe("SpendingBarChart mobile legend and tooltip in Chromium", () => {
  it("P42-187/-190 dark tap category", async () => {
    await useMobileViewport();
    const originalTheme = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "dark");
    renderBrowserComponent(<DarkModeNominalTapFixture />);

    const chart = page.getByTestId("chart-dark-nominal");
    const chartElement = await chart.element();
    const bar = page.elementLocator(
      requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle"),
    );
    await expect.element(bar).toBeVisible();
    await bar.click();

    const tooltipElement = requireChartElement<HTMLElement>(
      chartElement,
      '[data-custom-tooltip="true"]',
    );
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    const firstCategoryRow = page.elementLocator(
      requireChartElement<HTMLElement>(tooltipElement, '[data-tooltip-row="true"]'),
    );
    await expect.element(firstCategoryRow).toHaveTextContent(/\S/);
    if (originalTheme === null) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", originalTheme);
  });

  it("nominal legend shows controls with 32px touch targets", async () => {
    await useMobileViewport();
    renderMobileFixture("nominal");

    const chart = page.getByTestId("chart-nominal");
    const chartElement = await chart.element();
    await page
      .elementLocator(requireChartElement<HTMLElement>(chartElement, "details summary"))
      .click();
    await expect.element(chart.getByRole("button", { name: "Q1" })).toBeVisible();
    for (const { key } of SERIES.nominal.entries) {
      await expect.element(chart.getByTestId(`legend-${key}`)).toBeVisible();
    }

    const buttons = Array.from(
      chartElement.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    );
    const sizes = buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every(({ width, height }) => width >= 32 && height >= 32)).toBe(true);
  });

  it("real legend shows controls with 32px touch targets", async () => {
    await useMobileViewport();
    renderMobileFixture("real");

    const chart = page.getByTestId("chart-real");
    const chartElement = await chart.element();
    await page
      .elementLocator(requireChartElement<HTMLElement>(chartElement, "details summary"))
      .click();
    await expect.element(chart.getByRole("button", { name: "Q1" })).toBeVisible();
    for (const { key } of SERIES.real.entries) {
      await expect.element(chart.getByTestId(`legend-${key}`)).toBeVisible();
    }

    const buttons = Array.from(
      chartElement.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    );
    const sizes = buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every(({ width, height }) => width >= 32 && height >= 32)).toBe(true);
  });

  it("nominal Recharts hover shows the nominal series payload", async () => {
    await useMobileViewport();
    renderMobileFixture("nominal");

    const chart = page.getByTestId("chart-nominal");
    const chartElement = await chart.element();
    const bar = requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle");
    await page.elementLocator(bar).hover();

    const tooltipElement = requireChartElement<HTMLElement>(
      chartElement,
      '[data-custom-tooltip="true"]',
    );
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    const [firstSeries] = SERIES.nominal.entries;
    const payload = page.elementLocator(
      requireChartElement<HTMLElement>(tooltipElement, `[data-tooltip-key="${firstSeries.key}"]`),
    );
    await expect.element(payload).toBeVisible();
    await expect.element(payload).toHaveTextContent(`${firstSeries.value.toFixed(2)}`);
  });

  it("real Recharts hover shows the real series payload", async () => {
    await useMobileViewport();
    renderMobileFixture("real");

    const chart = page.getByTestId("chart-real");
    const chartElement = await chart.element();
    const bar = requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle");
    await page.elementLocator(bar).hover();

    const tooltipElement = requireChartElement<HTMLElement>(
      chartElement,
      '[data-custom-tooltip="true"]',
    );
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    const [firstSeries] = SERIES.real.entries;
    const payload = page.elementLocator(
      requireChartElement<HTMLElement>(tooltipElement, `[data-tooltip-key="${firstSeries.key}"]`),
    );
    await expect.element(payload).toBeVisible();
    await expect.element(payload).toHaveTextContent(`${firstSeries.value.toFixed(2)}`);
  });

  it("nominal and real mobile summaries use computed nowrap", async () => {
    await useMobileViewport();
    renderBrowserComponent(
      <div style={{ width: 412, display: "grid", gap: 16 }}>
        <SpendingFixture kind="nominal" />
        <SpendingFixture kind="real" />
      </div>,
    );

    const nominalSummary = requireChartElement<HTMLElement>(
      await page.getByTestId("chart-nominal").element(),
      "details summary",
    );
    const realSummary = requireChartElement<HTMLElement>(
      await page.getByTestId("chart-real").element(),
      "details summary",
    );
    expect(window.getComputedStyle(nominalSummary).whiteSpace).toBe("nowrap");
    expect(window.getComputedStyle(realSummary).whiteSpace).toBe("nowrap");
  });
});
