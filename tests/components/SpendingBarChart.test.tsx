import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SpendingBarChart } from "@/app/components/SpendingBarChart";

// Mock Recharts components because JSDOM cannot render SVG / layout
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
      {children}
    </div>
  ),
  BarChart: ({ children, data }: { children: React.ReactNode; data: any[] }) => (
    <div data-testid="barchart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="bar-mock" data-key={dataKey} />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: () => <div data-testid="xaxis" />,
  YAxis: () => <div data-testid="yaxis" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

vi.mock("@/app/components/charts/YearReferenceLines", () => ({
  YearReferenceLines: () => <div data-testid="year-reference-lines" />,
}));

vi.mock("@/app/components/charts/XAxisEdgeTick", () => ({
  XAxisEdgeTick: () => <div data-testid="xaxis-edge-tick" />,
}));

vi.mock("@/app/components/charts/xAxisTicks", () => ({
  computeXAxisTicks: () => [],
}));

vi.mock("@/app/components/ChartInfoContentRenderer", () => ({
  default: () => <div data-testid="chart-info-renderer" />,
}));

describe("SpendingBarChart component legendMode tests", () => {
  const mockData = [
    { label: "2005 Q1", 年: 2005, quarter: 1, 年月: "2005-01", 食料: 100, 住居: 50 },
    { label: "2005 Q2", 年: 2005, quarter: 2, 年月: "2005-04", 食料: 110, 住居: 55 },
  ];
  const mockKeys = ["食料", "住居"];
  const mockColors = ["#ff0000", "#00ff00"];
  const mockChartColors = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
  };
  const mockTooltipProps = {
    cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
    trigger: "hover" as const,
    content: <div />,
  };

  // U1: legendMode 未指定（既定 expanded）で <details> が描画されず、凡例が直接表示される
  it("U1: defaults to expanded mode, rendering legend directly without details", () => {
    const { container } = render(
      <SpendingBarChart
        title="名目消費"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={mockChartColors}
        tooltipProps={mockTooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(container.querySelector("details")).toBeNull();
    const pressedButtons = screen.getAllByRole("button", { name: /Q1|食料|住居/ });
    expect(pressedButtons.length).toBeGreaterThan(0);
  });

  // U2: legendMode="collapsible" で <details> が描画され、open 属性を持たない（既定で閉）
  it("U2: legendMode=collapsible renders details without open attribute by default", () => {
    const { container } = render(
      <SpendingBarChart
        title="実質消費"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={mockChartColors}
        tooltipProps={mockTooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        legendMode="collapsible"
        linkedSectionId="target-section"
      />,
    );

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
  });

  // U3: legendMode="collapsible" でも案内文リンク（消費支出（名目））は <details> の外にある
  it("U3: note link is outside the details element", () => {
    const { container } = render(
      <SpendingBarChart
        title="実質消費"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={mockChartColors}
        tooltipProps={mockTooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        legendMode="collapsible"
        linkedSectionId="target-section"
      />,
    );

    const details = container.querySelector("details");
    const link = screen.getByRole("link", { name: "消費支出（名目）" });

    expect(details).not.toBeNull();
    expect(link).not.toBeNull();
    expect(details?.contains(link)).toBe(false);
  });

  // U4: <details> を開くと四半期ボタン（Q1〜Q4）と費目ボタンが操作可能になり、onToggle が呼ばれる
  it("U4: opening details reveals interactive legend items and triggers onToggle", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SpendingBarChart
        title="実質消費"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={onToggle}
        chartColors={mockChartColors}
        tooltipProps={mockTooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        legendMode="collapsible"
        linkedSectionId="target-section"
      />,
    );

    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toBeNull();

    details.open = true;
    fireEvent(details, new Event("toggle"));

    const foodButton = screen.getByRole("button", { name: /食料/ });
    expect(foodButton).toBeDefined();
    fireEvent.click(foodButton);

    expect(onToggle).toHaveBeenCalledWith("食料");
  });

  // U5: legendMode="collapsible" の <summary> に 凡例 を含む文言が出る
  it("U5: summary element contains 凡例 text", () => {
    const { container } = render(
      <SpendingBarChart
        title="実質消費"
        data={mockData}
        keys={mockKeys}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={mockChartColors}
        tooltipProps={mockTooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        legendMode="collapsible"
        linkedSectionId="target-section"
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("凡例");
  });
});
