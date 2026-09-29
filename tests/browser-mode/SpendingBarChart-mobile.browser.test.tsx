import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { useState } from "react";
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
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind(`browser-${kind}`, {
    dataLength: 1,
    showTotal: true,
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
      onReset={() => setHiddenKeys(keys)}
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
    <div style={{ width: "100%" }}>
      <SpendingFixture kind={kind} />
    </div>,
  );
}

function readTooltipMetrics(tooltip: HTMLElement) {
  const rect = tooltip.getBoundingClientRect();
  const rows = [...tooltip.querySelectorAll<HTMLElement>('[data-tooltip-row="true"]')];
  const labelSizes = rows.map((row) => {
    const cells = [...row.querySelectorAll<HTMLElement>(":scope > span")];
    const label = cells.find(
      (cell) => cell.textContent?.trim() && getComputedStyle(cell).marginLeft !== "auto",
    );
    return label ? parseFloat(getComputedStyle(label).fontSize) : 0;
  });
  const valueCells = rows.map((row) =>
    row
      .querySelectorAll<HTMLElement>(":scope > span")
      .item(row.querySelectorAll(":scope > span").length - 1),
  );
  const total = tooltip.querySelector<HTMLElement>("[data-tooltip-total='true']");

  return {
    visible: rect.width > 0 && rect.height > 0,
    inViewport:
      rect.left >= 0 &&
      rect.right <= window.innerWidth &&
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight,
    totalFontSize: total ? parseFloat(getComputedStyle(total).fontSize) : 0,
    labelSizes,
    valueRightAligned:
      valueCells.length > 0 &&
      valueCells.every((cell) => cell !== null && getComputedStyle(cell).textAlign === "right"),
  };
}

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"
  );
}

function DarkModeNominalTooltipFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: true });
  const tooltip = bind("browser-dark-nominal-tap", {
    dataLength: 1,
    showTotal: true,
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
  it("dark tooltip shows a visible value and closes from its control", async () => {
    await useMobileViewport();
    const originalTheme = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "dark");
    renderBrowserComponent(<DarkModeNominalTooltipFixture />);

    const chart = page.getByTestId("chart-dark-nominal");
    const chartElement = await chart.element();
    const bar = requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle");
    await expect.element(chart).toBeVisible();
    await userEvent.click(bar);

    const tooltipElement = requireChartElement<HTMLElement>(
      chartElement,
      '[data-custom-tooltip="true"]',
    );
    expect(isVisible(tooltipElement)).toBe(true);
    const firstCategoryRow = requireChartElement<HTMLElement>(
      tooltipElement,
      '[data-tooltip-row="true"]',
    );
    expect(firstCategoryRow.textContent).toMatch(/\S/);
    const valueCell = requireChartElement<HTMLElement>(
      tooltipElement.querySelector('[data-tooltip-row="true"]')!,
      ":scope > span:last-child",
    );
    expect(valueCell.textContent).toMatch(/\d/);
    expect(valueCell.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(getComputedStyle(valueCell).color).toBe("rgb(249, 250, 251)");
    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect.element(closeButton).toBeVisible();
    await userEvent.click(await closeButton.element());
    expect(isVisible(tooltipElement)).toBe(false);
    if (originalTheme === null) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", originalTheme);
  });

  it("nominal legend shows controls with 32px touch targets", async () => {
    await useMobileViewport();
    renderMobileFixture("nominal");

    const chart = page.getByTestId("chart-nominal");
    const chartElement = await chart.element();
    await userEvent.click(requireChartElement<HTMLElement>(chartElement, "details summary"));
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
    await userEvent.click(requireChartElement<HTMLElement>(chartElement, "details summary"));
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
    await userEvent.hover(bar);

    const tooltipElement = requireChartElement<HTMLElement>(
      chartElement,
      '[data-custom-tooltip="true"]',
    );
    expect(isVisible(tooltipElement)).toBe(true);
    const [firstSeries] = SERIES.nominal.entries;
    const payload = requireChartElement<HTMLElement>(
      tooltipElement,
      `[data-tooltip-key="${firstSeries.key}"]`,
    );
    expect(isVisible(payload)).toBe(true);
    expect(payload.textContent).toContain(`${firstSeries.value.toFixed(2)}`);
  });

  it("real Recharts hover shows the real series payload", async () => {
    await useMobileViewport();
    renderMobileFixture("real");

    const chart = page.getByTestId("chart-real");
    const chartElement = await chart.element();
    const bar = requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle");
    await userEvent.hover(bar);

    const tooltipElement = requireChartElement<HTMLElement>(
      chartElement,
      '[data-custom-tooltip="true"]',
    );
    expect(isVisible(tooltipElement)).toBe(true);
    const [firstSeries] = SERIES.real.entries;
    const payload = requireChartElement<HTMLElement>(
      tooltipElement,
      `[data-tooltip-key="${firstSeries.key}"]`,
    );
    expect(isVisible(payload)).toBe(true);
    expect(payload.textContent).toContain(`${firstSeries.value.toFixed(2)}`);
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
    for (const summary of [nominalSummary, realSummary]) {
      const chartId = summary.closest<HTMLElement>("[data-testid^='chart-']")?.dataset.testid;
      if (!chartId) throw new Error("Summary is not inside a chart fixture");
      const chart = page.getByTestId(chartId);
      const details = summary.closest("details") as HTMLDetailsElement;
      await expect.element(chart).toBeVisible();
      await expect.element(chart.getByText("費目・四半期を変更")).toBeVisible();
      expect(details.open).toBe(false);
      expect(summary.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(summary.textContent?.trim()).toMatch(/\S/);
      expect(window.getComputedStyle(summary).whiteSpace).toBe("nowrap");
    }
  });

  it("nominal and real mobile tooltips stay readable inside a 320px viewport", async () => {
    await page.viewport(320, 667);
    expect(window.innerWidth).toBe(320);
    renderBrowserComponent(
      <div style={{ width: "100%", display: "grid", gap: 16 }}>
        <SpendingFixture kind="nominal" />
        <SpendingFixture kind="real" />
      </div>,
    );

    for (const kind of ["nominal", "real"] as const) {
      const chart = page.getByTestId(`chart-${kind}`);
      const chartElement = await chart.element();
      const bar = requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle");
      await userEvent.hover(bar);
      const tooltipElement = requireChartElement<HTMLElement>(
        chartElement,
        '[data-custom-tooltip="true"]',
      );
      expect(isVisible(tooltipElement)).toBe(true);

      const metrics = readTooltipMetrics(tooltipElement);
      expect(metrics.visible).toBe(true);
      expect(metrics.inViewport).toBe(true);
      expect(metrics.totalFontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.labelSizes.length).toBeGreaterThan(0);
      expect(metrics.labelSizes.every((size) => size >= 14)).toBe(true);
      expect(metrics.valueRightAligned).toBe(true);
    }
  });

  it("nominal legend clear hides every series and selecting one restores its bars", async () => {
    await useMobileViewport();
    renderMobileFixture("nominal");

    const chart = page.getByTestId("chart-nominal");
    const chartElement = await chart.element();
    const summary = requireChartElement<HTMLElement>(chartElement, "details summary");
    await userEvent.click(summary);
    const release = chart.getByRole("button", { name: "全選択解除" });
    await userEvent.click(await release.element());

    const seriesButtons = SERIES.nominal.entries.map(({ key }) =>
      chart.getByTestId(`legend-${key}`),
    );
    for (const button of seriesButtons) {
      await expect.element(button).toHaveAttribute("aria-pressed", "false");
    }
    expect(chartElement.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);

    const restoredButton = seriesButtons[0];
    await userEvent.click(await restoredButton.element());
    await expect.element(restoredButton).toHaveAttribute("aria-pressed", "true");
    expect(chartElement.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);
  });
});
