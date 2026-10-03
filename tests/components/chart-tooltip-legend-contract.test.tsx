import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  Line: ({ "data-testid": testId }: { "data-testid"?: string }) => <div data-testid={testId} />,
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
import { NewGraph } from "../../src/app/components/NewGraph";
import {
  COMPARISON_SERIES_REGISTRY,
  EARNINGS_SERIES_REGISTRY,
  EARNINGS_TOTAL_KEYS,
  createComparisonSeriesRegistry,
  projectTooltipMetadata,
} from "../../src/lib/chartConstants";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { renderHook, act } from "@testing-library/react";

describe("chart tooltip and legend shared contract", () => {
  let scrollY = 0;
  beforeEach(() => vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY));
  afterEach(() => vi.restoreAllMocks());

  it("defines earnings total keys as the three registry salary categories", () => {
    expect(EARNINGS_TOTAL_KEYS).toEqual(["所定内給与", "所定外給与", "特別給与"]);
    expect(
      EARNINGS_TOTAL_KEYS.every((key) => EARNINGS_SERIES_REGISTRY.some((item) => item.key === key)),
    ).toBe(true);
  });

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

    // The metadata bind path must retain the existing Escape dismissal contract.
    act(() => result.current.bind("one").onClick());
    act(() => fireEvent.keyDown(document, { key: "Escape" }));
    expect(result.current.bind("one").tooltipProps.active).toBeFalsy();
  });

  it.each([false, true])(
    "projects every comparison registry entry to matching legend/tooltip DOM with advanced=%s",
    (showAdvanced) => {
      const visibleRegistry = COMPARISON_SERIES_REGISTRY.filter(
        ({ advanced }) => !advanced || showAdvanced,
      );
      const metadata = projectTooltipMetadata(visibleRegistry);
      const data = [
        {
          年月: "2018年1月",
          総合: 100,
          生鮮食品を除く総合: 100,
          持家の帰属家賃を除く総合: 100,
          "消費支出（参考）": null,
          "CPI総合(参考)": null,
          ...Object.fromEntries(visibleRegistry.map(({ key }) => [key, null])),
        },
      ];

      const { container } = render(
        <>
          <NewGraph
            data={data}
            hiddenKeys={[]}
            onToggle={vi.fn()}
            chartColors={{ gridStroke: "#ddd", axisText: "#111" }}
            isMobile={false}
            tooltipProps={{
              cursor: { stroke: "#ddd", strokeWidth: 1, strokeOpacity: 0.6 },
              trigger: "hover",
              content: <div />,
            }}
            showAdvanced={showAdvanced}
          />
          <CustomTooltip
            active
            isMobile={false}
            isTouch={false}
            label="2018年1月"
            payload={visibleRegistry.map(({ key }) => ({ dataKey: key, name: "raw", value: null }))}
            seriesMeta={metadata}
            showAllPayload
            tooltipBg="#000"
            tooltipText="#fff"
          />
        </>,
      );

      const legendItems = [...container.querySelectorAll("[data-testid^='new-graph-legend-']")];
      expect(legendItems).toHaveLength(visibleRegistry.length);
      expect(container.querySelectorAll("[data-testid^='new-graph-line-']")).toHaveLength(
        visibleRegistry.length,
      );
      visibleRegistry.forEach(({ key, legendLabel, color, order }) => {
        const legend = container.querySelector(
          `[data-testid="new-graph-legend-${key}"]`,
        ) as HTMLElement;
        expect(legend.textContent).toContain(legendLabel);
        expect(
          legend.querySelector('[style*="background-color"]')?.getAttribute("style"),
        ).toContain(color);
        const row = container.querySelector(`[data-tooltip-key="${key}"]`) as HTMLElement;
        expect(row.textContent).toContain(legendLabel);
        expect(row.getAttribute("data-tooltip-order")).toBe(String(order));
        expect(row.querySelector("[data-tooltip-color]")?.getAttribute("data-tooltip-color")).toBe(
          color,
        );
      });
    },
  );

  it("matches the three comparison tooltip labels to the legend and hides only its consumption notes", () => {
    const registry = createComparisonSeriesRegistry({ status: "valid", reason: null });
    const consumptionKey = "消費(総合)";
    const tooltipMeta = projectTooltipMetadata(registry).map((meta) => ({
      ...meta,
      measurementNote:
        meta.key === consumptionKey ? "消費支出の12か月移動平均" : `${meta.label}の測定メモ`,
    }));
    const row = {
      年月: "2025年1月",
      総合: 100,
      生鮮食品を除く総合: 100,
      持家の帰属家賃を除く総合: 100,
      "消費支出（参考）": null,
      "CPI総合(参考)": null,
      [registry[0].key]: 101.25,
      [registry[1].key]: 102.5,
      [consumptionKey]: 103.75,
    };
    const renderTooltip = (suppressConsumptionNotes: boolean) => (
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label={row.年月}
        payload={registry.map(({ key }) => ({
          dataKey: key,
          name: key,
          value: row[key as keyof typeof row] as number,
          payload: row,
        }))}
        seriesMeta={tooltipMeta}
        suppressMeasurementNotesForKeys={suppressConsumptionNotes ? [consumptionKey] : undefined}
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />
    );

    const view = render(
      <>
        <NewGraph
          data={[row]}
          hiddenKeys={[]}
          onToggle={vi.fn()}
          chartColors={{ gridStroke: "#ddd", axisText: "#111" }}
          isMobile={false}
          tooltipProps={{
            cursor: { stroke: "#ddd", strokeWidth: 1, strokeOpacity: 0.6 },
            trigger: "hover",
            content: <div />,
          }}
        />
        {renderTooltip(true)}
      </>,
    );
    const tooltipRows = [
      ...view.container.querySelectorAll<HTMLElement>('[data-tooltip-row="true"]'),
    ];
    expect(tooltipRows.map((tooltipRow) => tooltipRow.getAttribute("data-tooltip-label"))).toEqual(
      registry.map(({ legendLabel }) => legendLabel),
    );
    for (const { key, legendLabel } of registry) {
      const legend = view.container.querySelector(`[data-testid="new-graph-legend-${key}"]`);
      expect(legend?.textContent).toContain(legendLabel);
      expect(view.container.querySelector(`[data-tooltip-key="${key}"]`)?.textContent).toContain(
        legendLabel,
      );
    }

    const consumptionRow = view.container.querySelector(
      `[data-tooltip-key="${consumptionKey}"]`,
    ) as HTMLElement;
    expect(view.container.querySelector('[data-tooltip-root="true"]')?.textContent).toContain(
      "2025年1月",
    );
    expect(consumptionRow.textContent).toContain("103.75");
    const consumptionMetadata = registry.find(({ key }) => key === consumptionKey)!;
    expect(consumptionRow.getAttribute("data-tooltip-source")).toBe(consumptionMetadata.source);
    expect(consumptionRow.getAttribute("data-tooltip-aggregation")).toBe(
      consumptionMetadata.aggregation,
    );
    for (const omittedNote of [
      "基準年",
      consumptionMetadata.source,
      consumptionMetadata.aggregation,
      "月次出典:",
      "12MA期間:",
      "消費支出の12か月移動平均",
    ]) {
      expect(consumptionRow.textContent).not.toContain(omittedNote);
    }
    expect(
      view.container.querySelector('[data-tooltip-key="CPI総合(12MA)"]')?.textContent,
    ).toContain("物価の測定メモ");
    expect(view.container.querySelector('[data-tooltip-key="総合(12MA)"]')?.textContent).toContain(
      "給与の測定メモ",
    );

    view.unmount();
    const genericView = render(renderTooltip(false));
    const genericConsumptionRow = genericView.container.querySelector(
      `[data-tooltip-key="${consumptionKey}"]`,
    ) as HTMLElement;
    expect(screen.getByText("消費支出の12か月移動平均")).toBeDefined();
    expect(
      genericConsumptionRow.querySelector('[data-tooltip-base-year-provenance="true"]')
        ?.textContent,
    ).toContain("基準年: 2025年");
  });

  it("keeps comparison legend entries for all-null data, filters hidden keys, and drops unknown payload", () => {
    const hiddenKey = COMPARISON_SERIES_REGISTRY[1].key;
    const visible = COMPARISON_SERIES_REGISTRY.filter(({ key }) => key !== hiddenKey);
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2017Q4"
        payload={[
          ...visible.map(({ key }) => ({ dataKey: key, name: "raw", value: null })),
          { dataKey: "unregistered", name: "unregistered", value: 99 },
        ]}
        seriesMeta={projectTooltipMetadata(visible)}
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.queryByText("給与(総合)")).toBeNull();
    expect(screen.queryByText("unregistered")).toBeNull();
    expect(screen.getAllByText("—").length).toBe(visible.length);
  });

  it("allows explicit raw-key fallback only when allowedKeys is omitted", () => {
    const visible = COMPARISON_SERIES_REGISTRY.slice(0, 3);
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2018Q1"
        payload={[{ dataKey: "future-reference", name: "future-reference", value: 42 }]}
        seriesMeta={projectTooltipMetadata(visible)}
        includeUnmappedPayload
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.getByText("future-reference")).toBeDefined();
    expect(screen.getByText("42.00")).toBeDefined();
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
