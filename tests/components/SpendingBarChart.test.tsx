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
    data: unknown[];
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

vi.mock("@/app/components/ChartInfoContentRenderer", () => ({
  default: () => <div data-testid="chart-info-renderer" />,
}));

describe("SpendingBarChart component legendMode tests", () => {
  const mockData = [
    { label: "2005Q1", 年: 2005, quarter: 1, 年月: "2005Q1", 食料: 100, 住居: 50 },
    { label: "2005Q2", 年: 2005, quarter: 2, 年月: "2005Q2", 食料: 110, 住居: 55 },
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
          label: "2017Q4",
          年: 2017,
          quarter: 4,
          年月: "2017Q4",
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

  it("annotates the Plan39 quarterly nominal series boundary", () => {
    renderChart({
      data: [
        {
          label: "2017Q4",
          年: 2017,
          quarter: 4,
          年月: "2017Q4",
          [SUPPORT_SERIES_KEY_NOMINAL]: 100,
        },
        {
          label: "2018Q1",
          年: 2018,
          quarter: 1,
          年月: "2018Q1",
          食料: 30,
        },
      ],
    });

    const note = screen.getByTestId("spending-series-switch-note");
    expect(note.getAttribute("data-series-switch")).toBe("plan39-v2-bottom-up-to-cti-categories");
    expect(note.textContent).toContain("2005Q1〜2016Q4：接続推計の年次値を月次系列から四半期化。");
    expect(note.textContent).toContain("2017Q1〜2017Q4：公式年次値を月次系列から四半期化。");
    expect(note.textContent).toContain("2018Q1以降");
    expect(note.textContent).toContain("既存CTI名目費目系列");
  });

  it("does not show the legacy missing-support message when Plan39 measurements exist", () => {
    renderChart({
      data: [
        {
          label: "2005Q1",
          年: 2005,
          quarter: 1,
          年月: "2005Q1",
          食料: 30,
          measurements: {
            食料: {
              key: "食料",
              label: "食料",
              unit: "指数",
              source: "Plan39-v2",
              valueType: "comparison",
              value: 30,
              status: "available",
              reason: null,
              frequency: "quarterly",
              aggregation: "derived",
              seriesType: "estimated_adjusted",
              official: false,
              annualAnchorType: "estimated",
              quarterlyDerived: true,
            },
          },
        },
      ],
    });

    expect(screen.queryByText(/CTIミクロ名目四半期系列は利用できません/)).toBeNull();
  });

  it("keeps the regular GDP series public contract unchanged with or without the advanced flag", () => {
    const data = [
      {
        label: "2017Q4",
        年: 2017,
        quarter: 4,
        年月: "2017Q4",
        [SUPPORT_SERIES_KEY_NOMINAL]: 100,
      },
      {
        label: "2018Q1",
        年: 2018,
        quarter: 1,
        年月: "2018Q1",
        [SUPPORT_SERIES_KEY_NOMINAL]: 200,
      },
    ];
    const baseProps = {
      title: "消費支出",
      data,
      keys: [SUPPORT_SERIES_KEY_NOMINAL],
      colors: mockColors,
      hiddenKeys: [],
      onToggle: vi.fn(),
      chartColors: mockChartColors,
      tooltipProps: mockTooltipProps,
      hiddenQuarters: [],
      onToggleQuarter: vi.fn(),
      onReset: vi.fn(),
    } satisfies React.ComponentProps<typeof SpendingBarChart>;
    const readContract = (container: HTMLElement) => ({
      keys: container
        .querySelector("[data-testid='chart-data-contract']")
        ?.getAttribute("data-series"),
      rows: Array.from(container.querySelectorAll("[data-chart-data-row]")).map((row) => ({
        period: row.getAttribute("data-period"),
        values: Array.from(row.querySelectorAll("[data-series-key]")).map((value) => [
          value.getAttribute("data-series-key"),
          value.getAttribute("data-value"),
        ]),
      })),
    });
    const renderWithFlag = (showAdvanced: boolean) =>
      render(
        <SpendingBarChart
          {...({ ...baseProps, showAdvanced } as React.ComponentProps<typeof SpendingBarChart>)}
        />,
      );

    const regular = renderWithFlag(false);
    const regularContract = readContract(regular.container);
    const regularRows = JSON.parse(
      regular.container.querySelector("[data-testid='barchart']")?.getAttribute("data-rows") ||
        "[]",
    );
    regular.unmount();

    const advanced = renderWithFlag(true);
    expect(readContract(advanced.container)).toEqual(regularContract);
    const advancedRows = JSON.parse(
      advanced.container.querySelector("[data-testid='barchart']")?.getAttribute("data-rows") ||
        "[]",
    );
    expect(advancedRows).toEqual(regularRows);
    expect(JSON.stringify(advancedRows)).not.toContain("（延長）");
    expect(advanced.container.querySelectorAll("[data-testid='line-mock']")).toHaveLength(0);
  });

  it("Plan24: switches at 2018Q1 without filling, copying, or interpolating the boundary", () => {
    renderChart({
      data: [
        {
          label: "2017Q4",
          年: 2017,
          quarter: 4,
          年月: "2017Q4",
          [SUPPORT_SERIES_KEY_NOMINAL]: 100,
          食料: 20,
        },
        {
          label: "2018Q1",
          年: 2018,
          quarter: 1,
          年月: "2018Q1",
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

  it("shows the nominal legend link only for a linked collapsible chart", () => {
    const { rerender } = renderChart({
      legendMode: "collapsible",
      linkedSectionId: "section-consumption-nominal",
    });

    expect(screen.getByRole("link", { name: "消費支出（名目）" }).getAttribute("href")).toBe(
      "#section-consumption-nominal",
    );

    rerender(
      <SpendingBarChart
        title="消費支出（名目）"
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
      />,
    );

    expect(screen.queryByRole("link", { name: "消費支出（名目）" })).toBeNull();
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
      />,
    );

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
  });

  // U3: <details> を開くと四半期ボタン（Q1〜Q4）と費目ボタンが操作可能になり、onToggle が呼ばれる
  it("U3: opening details reveals interactive legend items and triggers onToggle", () => {
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

  // U4: legendMode="collapsible" の <summary> に費目・四半期の変更方法と状態要約が出る
  it("U4: summary element describes category and quarter selection state", () => {
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
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toBe("費目・四半期を変更（費目 2/2・四半期 4/4）・全選択");
  });

  // U5: <summary> にトナルピルヘッダー用の className が適用され、矢印SVGが含まれる
  it("U5: summary has tonal pill header class and chevron SVG", () => {
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

  // U6: details の open 属性のトグルに応じ凡例コンテンツの表示状態が変わる
  it("U6: details open attribute toggles legend visibility state", () => {
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

  it("採用: X axis uses fixed-calendar-year Q1 ticks and limits dense ticks by width", () => {
    const data = Array.from({ length: 64 }, (_, index) => {
      const year = 2010 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      return {
        label: `${year}Q${quarter}`,
        年: year,
        quarter,
        年月: `${year}Q${quarter}`,
        食料: index,
      };
    });
    renderChart({ data });
    const ticks = JSON.parse(screen.getByTestId("xaxis").dataset.ticks!) as string[];
    expect(ticks).toEqual(["2010Q1", "2015Q1", "2020Q1", "2025Q4"]);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(screen.getByTestId("xaxis").dataset.interval).toBe("0");
  });

  it("採用: excludes fixed-year Q1 candidates outside the data range and avoids endpoint overlap", () => {
    const data = Array.from({ length: 56 }, (_, index) => {
      const year = 2012 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      return {
        label: `${year}Q${quarter}`,
        年: year,
        quarter,
        年月: `${year}Q${quarter}`,
        食料: index,
      };
    });
    renderChart({ data });

    const ticks = JSON.parse(screen.getByTestId("xaxis").dataset.ticks!) as string[];
    expect(ticks).toEqual(["2012Q1", "2015Q1", "2020Q1", "2025Q4"]);
    expect(ticks).not.toContain("2010Q1");
    expect(ticks).not.toContain("2025Q1");
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("採用: skips a missing fixed-calendar year candidate", () => {
    const data = [
      ...Array.from({ length: 20 }, (_, index) => {
        const year = 2010 + Math.floor(index / 4);
        const quarter = (index % 4) + 1;
        return {
          label: `${year}Q${quarter}`,
          年: year,
          quarter,
          年月: `${year}Q${quarter}`,
          食料: index,
        };
      }),
      ...Array.from({ length: 40 }, (_, index) => {
        const year = 2016 + Math.floor(index / 4);
        const quarter = (index % 4) + 1;
        return {
          label: `${year}Q${quarter}`,
          年: year,
          quarter,
          年月: `${year}Q${quarter}`,
          食料: index + 20,
        };
      }),
    ];
    renderChart({ data });

    expect(JSON.parse(screen.getByTestId("xaxis").dataset.ticks!)).toEqual([
      "2010Q1",
      "2020Q1",
      "2025Q4",
    ]);
  });

  it("採用: preserves a single row as one endpoint tick", () => {
    renderChart({
      data: [{ label: "2020Q1", 年: 2020, quarter: 1, 年月: "2020Q1", 食料: 1 }],
    });

    expect(JSON.parse(screen.getByTestId("xaxis").dataset.ticks!)).toEqual(["2020Q1"]);
  });

  it("採用: preserves a non-Q1 starting endpoint", () => {
    const data = [
      { label: "2010Q2", 年: 2010, quarter: 2, 年月: "2010Q2", 食料: 1 },
      { label: "2015Q1", 年: 2015, quarter: 1, 年月: "2015Q1", 食料: 2 },
      { label: "2020Q4", 年: 2020, quarter: 4, 年月: "2020Q4", 食料: 3 },
    ];
    renderChart({ data });

    expect(JSON.parse(screen.getByTestId("xaxis").dataset.ticks!)).toEqual([
      "2010Q2",
      "2015Q1",
      "2020Q4",
    ]);
  });

  it("採用: does not duplicate a last row with the same label as another object", () => {
    const data = [
      { label: "2020Q1", 年: 2020, quarter: 1, 年月: "2020Q1", 食料: 1 },
      { label: "2022Q1", 年: 2022, quarter: 1, 年月: "2022Q1", 食料: 2 },
      { label: "2020Q1", 年: 2020, quarter: 1, 年月: "2020Q1", 食料: 3 },
    ];
    renderChart({ data });

    const ticks = JSON.parse(screen.getByTestId("xaxis").dataset.ticks!) as string[];
    expect(ticks).toEqual(["2020Q1"]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("採用: emits a shared label only once across distinct candidates and endpoints", () => {
    const data = [
      { label: "2010Q1", 年: 2010, quarter: 1, 年月: "2010Q1", 食料: 1 },
      { label: "2010Q1", 年: 2010, quarter: 1, 年月: "2010Q1", 食料: 2 },
      { label: "2015Q1", 年: 2015, quarter: 1, 年月: "2015Q1", 食料: 3 },
      { label: "2025Q4", 年: 2025, quarter: 4, 年月: "2025Q4", 食料: 4 },
      { label: "2025Q4", 年: 2025, quarter: 4, 年月: "2025Q4", 食料: 5 },
    ];
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    renderChart({ data });

    const ticks = JSON.parse(screen.getByTestId("xaxis").dataset.ticks!) as string[];
    expect(ticks).toEqual(["2010Q1", "2015Q1", "2025Q4"]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("採用: uses period-based endpoint protection regardless of viewport width", () => {
    const data = Array.from({ length: 64 }, (_, index) => {
      const year = 2010 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      return {
        label: `${year}Q${quarter}`,
        年: year,
        quarter,
        年月: `${year}Q${quarter}`,
        食料: index,
      };
    });
    renderChart({ data });

    expect(JSON.parse(screen.getByTestId("xaxis").dataset.ticks!)).toEqual([
      "2010Q1",
      "2015Q1",
      "2020Q1",
      "2025Q4",
    ]);
  });

  it("採用: mobile spending ticks retain eligible endpoints and milestones without a fixed cap", () => {
    const data = Array.from({ length: 88 }, (_, index) => {
      const year = 2005 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      return {
        label: `${year}Q${quarter}`,
        年: year,
        quarter,
        年月: `${year}Q${quarter}`,
        食料: index,
      };
    });
    renderChart({ data, isMobile: true });

    expect(JSON.parse(screen.getByTestId("xaxis").dataset.ticks!)).toEqual([
      "2005Q1",
      "2010Q1",
      "2015Q1",
      "2020Q1",
      "2026Q4",
    ]);
  });
});
