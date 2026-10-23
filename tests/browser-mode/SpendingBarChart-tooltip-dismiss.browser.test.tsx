import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import {
  createChartTooltipSelectionResolver,
  useChartTooltipController,
} from "../../src/app/components/charts/useChartTooltipProps";
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
      <button
        type="button"
        data-testid="tooltip-leave-target"
        style={{
          position: "fixed",
          right: 8,
          top: 8,
          width: 100,
          height: 32,
          zIndex: 2_000,
        }}
      >
        Outside chart
      </button>
    </div>
  );
}

function NominalTouchScrollDismissFixture() {
  const controller = useChartTooltipController({ suppressed: false, isTouch: true });
  const data = [{ label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", "食料（名目）": 123 }];
  const tooltip = controller.bind("browser-nominal-scroll-dismiss", {
    dataLength: data.length,
    selectionPayloadAtIndex: createChartTooltipSelectionResolver(data, () => [
      { key: "食料（名目）", color: "#be123c" },
    ]),
  });

  return (
    <>
      <div style={{ height: 24 }} />
      <div style={{ width: 1000 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="spending-chart-scroll-dismiss"
          data={data}
          keys={["食料（名目）"]}
          colors={["#be123c"]}
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
          legendMode="expanded"
          isMobile
        />
      </div>
      {controller.drawer}
      <div aria-hidden="true" style={{ height: 1200 }} />
    </>
  );
}

describe("Spending tooltip dismissal", () => {
  it("dismisses on Escape, chart leave, and outside click", async () => {
    await page.viewport(1280, 800);
    expect(window.innerWidth).toBe(1280);
    expect(window.innerHeight).toBe(800);
    renderBrowserComponent(<NominalSpendingFixture />);

    const chart = page.getByTestId("spending-chart-nominal");
    const chartElement = await chart.element();
    const tooltipRoot = () => chartElement.querySelector<HTMLElement>("[data-custom-tooltip]");
    const tooltipWrapperVisibility = () => {
      const wrapper = chartElement.querySelector<HTMLElement>(".recharts-tooltip-wrapper");
      return wrapper ? getComputedStyle(wrapper).visibility : "hidden";
    };
    const barElement = chartElement.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!barElement) throw new Error("Nominal spending bar is missing");
    const bar = page.elementLocator(barElement);
    await expect.element(bar).toBeVisible();
    await bar.hover();

    const tooltipElement = chartElement.querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltipElement) throw new Error("Nominal spending tooltip is missing");
    await expect.poll(tooltipWrapperVisibility).toBe("visible");
    expect(tooltipElement.textContent).toContain("食料（名目）");
    expect(tooltipElement.textContent).toContain("123.00");

    await userEvent.keyboard("{Escape}");

    await expect.poll(tooltipWrapperVisibility).toBe("hidden");
    await expect.poll(tooltipRoot).toBeNull();

    const heading = chartElement.querySelector<HTMLHeadingElement>("h2");
    if (!heading) throw new Error("Nominal spending chart heading is missing");
    await page.elementLocator(heading).hover();
    await bar.hover();
    const tooltipAfterRehoverElement = tooltipRoot();
    if (!tooltipAfterRehoverElement) throw new Error("Nominal spending tooltip did not reappear");
    await expect.poll(tooltipWrapperVisibility).toBe("visible");

    const leaveTarget = page.getByTestId("tooltip-leave-target");
    await expect.element(leaveTarget).toBeVisible();
    const leaveTargetElement = await leaveTarget.element();
    const chartWrapperElement = chartElement.querySelector<HTMLElement>(
      '[class*="spendingChartWrapper"]',
    );
    if (!chartWrapperElement) throw new Error("Nominal spending chart wrapper is missing");
    const wrapperRect = chartWrapperElement.getBoundingClientRect();
    const leaveTargetRect = leaveTargetElement.getBoundingClientRect();
    expect(
      leaveTargetRect.right <= wrapperRect.left ||
        leaveTargetRect.left >= wrapperRect.right ||
        leaveTargetRect.bottom <= wrapperRect.top ||
        leaveTargetRect.top >= wrapperRect.bottom,
    ).toBe(true);
    await userEvent.hover(leaveTarget);
    await expect.poll(tooltipRoot).toBeNull();

    await bar.hover();
    const tooltipBeforeOutsideClick = tooltipRoot();
    if (!tooltipBeforeOutsideClick)
      throw new Error("Nominal spending tooltip did not reappear before outside click");
    await expect.poll(tooltipWrapperVisibility).toBe("visible");
    await userEvent.click(leaveTarget);
    await expect.poll(tooltipRoot).toBeNull();
  });
});

describe("touch Drawer dismissal", () => {
  it("keeps the selected data open while the modal Drawer owns scrolling", async () => {
    await page.viewport(412, 915);
    renderBrowserComponent(<NominalTouchScrollDismissFixture />);

    const chart = await page.getByTestId("spending-chart-scroll-dismiss").element();
    const initialBar = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!initialBar) throw new Error("Scroll dismissal spending bar is missing");
    const initialIndexedShape = initialBar.querySelector<SVGElement>("[data-index]");
    if (!initialIndexedShape) throw new Error("Scroll dismissal bar has no source-row index");
    const initialHitTarget =
      initialIndexedShape.querySelector<SVGElement>("path, rect") ?? initialIndexedShape;
    const bar = page.elementLocator(initialHitTarget);
    await expect.element(bar).toBeVisible();

    const currentBar = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
    if (!currentBar) throw new Error("Scroll dismissal spending bar disappeared");
    const currentIndexedShape = currentBar.querySelector<SVGElement>("[data-index]");
    if (!currentIndexedShape) throw new Error("Scroll dismissal bar lost its source-row index");
    const hitTarget =
      currentIndexedShape.querySelector<SVGElement>("path, rect") ?? currentIndexedShape;
    expect(hitTarget.isConnected).toBe(true);
    const bounds = hitTarget.getBoundingClientRect();
    const pointer = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    hitTarget.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
    hitTarget.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    await expect.element(closeButton).toBeVisible();

    window.scrollTo(0, window.scrollY + 60);

    await expect.element(dialog).toBeVisible();
    await closeButton.click();
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
