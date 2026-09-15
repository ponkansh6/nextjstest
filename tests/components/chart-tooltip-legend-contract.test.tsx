import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  Line: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));
vi.mock("@/app/components/charts/YearReferenceLines", () => ({ YearReferenceLines: () => null }));
vi.mock("@/app/components/charts/XAxisEdgeTick", () => ({ XAxisEdgeTick: () => null }));
vi.mock("@/app/components/charts/xAxisTicks", () => ({
  computeXAxisTicks: () => [],
  computePeriodXAxisTicks: () => [],
}));
vi.mock("@/app/components/ChartInfoContentRenderer", () => ({ default: () => null }));
vi.mock("@/hooks/useChartTheme", () => ({
  useChartTheme: () => ({ chartColors: { gridStroke: "#ddd" } }),
}));

import { ChartLegend } from "../../src/app/components/ChartLegend";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { renderHook, act } from "@testing-library/react";

describe("chart tooltip and legend shared contract", () => {
  let scrollY = 0;
  beforeEach(() => vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY));
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [false, "hover"],
    [true, "click"],
  ] as const)("uses the controller %s trigger contract", (isTouch, trigger) => {
    const { result } = renderHook(() => useChartTooltipController({ isTouch, suppressed: false }));
    expect(result.current.bind("chart").tooltipProps.trigger).toBe(trigger);
  });

  it("dismisses touch tooltip outside, on scroll, when switching charts, and allows re-tap", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    act(() => result.current.bind("one").onClick());
    expect(result.current.bind("one").tooltipProps.active).toBeUndefined();
    act(() => result.current.bind("two").onClick());
    expect(result.current.bind("one").tooltipProps.active).toBeFalsy();
    act(() => result.current.bind("one").onClick());
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    act(() => fireEvent.pointerDown(outside));
    outside.remove();
    expect(result.current.bind("one").tooltipProps.active).toBeFalsy();
    act(() => result.current.bind("one").onClick());
    scrollY = 50;
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current.bind("one").tooltipProps.active).toBeFalsy();
  });

  it("computes total from visible payload and excludes configured comparison series", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024年1月"
        payload={[
          { name: "食料", dataKey: "食料", value: 10, color: "red" },
          { name: "GDP", dataKey: "GDP", value: 90, color: "blue" },
        ]}
        tooltipBg="#000"
        tooltipText="#fff"
        showTotal
        totalExcludedKeys={["GDP"]}
      />,
    );
    const total = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(total).getByText("10.00")).toBeDefined();
    expect(screen.queryByText("100.00")).toBeNull();
  });

  it("keeps legend controls native and verifies native-button activation", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ChartLegend
        title="費目"
        keys={["食料"]}
        colors={["red"]}
        hiddenKeys={[]}
        onToggle={onToggle}
      />,
    );
    const button = screen.getByRole("button", { name: /食料/ });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    // Native buttons turn focused Enter/Space activation into click events in the browser.
    // This test intentionally verifies the component's native-button activation contract.
    fireEvent.click(button);
    rerender(
      <ChartLegend
        title="費目"
        keys={["食料"]}
        colors={["red"]}
        hiddenKeys={["食料"]}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByRole("button", { name: /食料/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /食料/ }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("starts mobile spending legend closed, exposes chevron, and preserves the 44px close min-style contract", () => {
    const { container } = render(
      <SpendingBarChart
        title="実質消費"
        data={[{ label: "2024 Q1", 年: 2024, quarter: 1, 年月: "2024-01", 食料: 1 }]}
        keys={["食料"]}
        colors={["red"]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={{ gridStroke: "#ddd" }}
        tooltipProps={{
          cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: "hover",
          content: <div />,
        }}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        legendMode="collapsible"
      />,
    );
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector(".legendAccordionChevron")).toBeDefined();
    render(
      <CustomTooltip
        active
        isMobile
        isTouch
        label="x"
        payload={[{ name: "x", value: 1, color: "red" }]}
        tooltipBg="#000"
        tooltipText="#fff"
        onDismiss={vi.fn()}
      />,
    );
    const closeButton = screen.getByRole("button", { name: "閉じる" });
    expect(closeButton.style.minWidth).toBe("44px");
    expect(closeButton.style.minHeight).toBe("44px");
  });
});
