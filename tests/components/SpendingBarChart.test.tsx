import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SpendingBarChart } from "@/app/components/SpendingBarChart";
import { SUPPORT_SERIES_KEY_NOMINAL } from "@/lib/chartConstants";

// Mock Recharts components because JSDOM cannot render SVG / layout
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
      {children}
    </div>
  ),
  BarChart: ({
    children,
    data,
    margin,
    barCategoryGap,
    barSize,
  }: {
    children: React.ReactNode;
    data: any[];
    margin?: Record<string, number>;
    barCategoryGap?: string;
    barSize?: number;
  }) => (
    <div
      data-testid="barchart"
      data-rows={JSON.stringify(data)}
      data-margin={JSON.stringify(margin)}
      data-bar-category-gap={barCategoryGap}
      data-bar-size={barSize}
    >
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="bar-mock" data-key={dataKey} />,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid="line-mock" data-key={dataKey} />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: (props: { ticks?: string[]; interval?: number }) => (
    <div
      data-testid="xaxis"
      data-ticks={JSON.stringify(props.ticks)}
      data-interval={props.interval}
    />
  ),
  YAxis: (props: { width?: number }) => <div data-testid="yaxis" data-width={props.width} />,
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

  const renderChart = (overrides: Partial<React.ComponentProps<typeof SpendingBarChart>> = {}) =>
    render(
      <SpendingBarChart
        title="消費支出"
        data={mockData}
        keys={["食料", SUPPORT_SERIES_KEY_NOMINAL]}
        colors={mockColors}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={mockChartColors}
        tooltipProps={mockTooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        {...overrides}
      />,
    );

  it("Plan24: renders the pre-2018 GDP series as a Bar and never renders a GDP Line", () => {
    renderChart({
      data: [
        {
          label: "2017 Q4",
          年: 2017,
          quarter: 4,
          年月: "2017-10",
          [SUPPORT_SERIES_KEY_NOMINAL]: 100,
        },
      ],
      keys: [SUPPORT_SERIES_KEY_NOMINAL],
    });

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      SUPPORT_SERIES_KEY_NOMINAL,
    ]);
    expect(screen.queryAllByTestId("line-mock")).toHaveLength(0);
  });

  it("Plan24: switches at 2018Q1 without filling, copying, or interpolating the boundary", () => {
    renderChart({
      data: [
        {
          label: "2017 Q4",
          年: 2017,
          quarter: 4,
          年月: "2017-10",
          [SUPPORT_SERIES_KEY_NOMINAL]: 100,
          食料: 20,
        },
        {
          label: "2018 Q1",
          年: 2018,
          quarter: 1,
          年月: "2018-01",
          [SUPPORT_SERIES_KEY_NOMINAL]: 200,
          食料: 30,
          住居: 20,
        },
      ],
      keys: ["食料", "住居", SUPPORT_SERIES_KEY_NOMINAL],
    });

    const rows = JSON.parse(screen.getByTestId("barchart").getAttribute("data-rows") || "[]");
    expect(rows).toHaveLength(2);
    expect(rows[0][SUPPORT_SERIES_KEY_NOMINAL]).toBe(100);
    expect(rows[0].食料).toBeNull();
    expect(rows[1][SUPPORT_SERIES_KEY_NOMINAL]).toBeNull();
    expect(rows[1].食料).toBe(30);
    expect(rows[1].住居).toBe(20);
    expect(rows[1][SUPPORT_SERIES_KEY_NOMINAL]).not.toBe(0);
    expect(screen.queryAllByTestId("line-mock")).toHaveLength(0);
  });

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

  // U5: legendMode="collapsible" の <summary> に費目・四半期の変更方法と状態要約が出る
  it("U5: summary element describes category and quarter selection state", () => {
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
    expect(summary?.textContent).toBe("費目・四半期を変更（費目 2/2・四半期 4/4）・全選択");
  });

  // U6: <summary> にトナルピルヘッダー用の className が適用され、矢印SVGが含まれる
  it("U6: summary has tonal pill header class and chevron SVG", () => {
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
    expect(summary?.getAttribute("class")).toContain("legendAccordionSummary");
    const chevron = summary?.querySelector("svg");
    expect(chevron).not.toBeNull();
    expect(chevron?.getAttribute("class")).toContain("legendAccordionChevron");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
  });

  // U7: details の open 属性のトグルに応じ凡例コンテンツの表示状態が変わる
  it("U7: details open attribute toggles legend visibility state", () => {
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

    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toBeNull();

    // 閉じている状態: open 属性がない
    expect(details.hasAttribute("open")).toBe(false);

    // 開いた状態: open 属性が付き、凡例ボタンが操作可能
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(details.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("button", { name: /Q1/ })).toBeDefined();

    // 再び閉じた状態: open 属性が外れる
    details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("採用: mobile layout uses the dedicated margin, bar width, and category gap", () => {
    renderChart({ isMobile: true });
    const chart = screen.getByTestId("barchart");
    expect(JSON.parse(chart.dataset.margin!)).toMatchObject({ right: 10 });
    expect(screen.getByTestId("yaxis").dataset.width).toBe("46");
    expect(chart.dataset.barSize).toBe("11");
    expect(chart.dataset.barCategoryGap).toBe("22%");
  });

  it("採用: X axis keeps Q1 ticks on five-year boundaries and limits dense ticks by width", () => {
    const data = Array.from({ length: 40 }, (_, index) => {
      const year = 2015 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      return {
        label: `${year} Q${quarter}`,
        年: year,
        quarter,
        年月: `${year}-${quarter}`,
        食料: index,
      };
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    renderChart({ data });
    const ticks = JSON.parse(screen.getByTestId("xaxis").dataset.ticks!) as string[];
    expect(ticks).toEqual(["2015 Q1", "2020 Q1", "2024 Q4"]);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(screen.getByTestId("xaxis").dataset.interval).toBe("0");
  });
});
