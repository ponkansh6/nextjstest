import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CpiChart from "../../src/app/components/CpiChart";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import {
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  SUPPORT_SERIES_KEY_NOMINAL,
  stackedKeys,
} from "../../src/lib/chartConstants";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";

const mocks = vi.hoisted(() => ({
  sectionsProps: null as Record<string, any> | null,
  displayData: null as Record<string, any> | null,
}));

vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_: unknown, key: string) => key }),
}));
vi.mock("../../src/hooks/useChartTheme", () => ({
  useChartTheme: () => ({ isMobile: false, isTouch: false, chartColors: { barFill: "#789" } }),
}));
vi.mock("../../src/hooks/useUrlState", () => ({
  useUrlState: () => ({ from: 2020, to: 2021, hiddenKeys: [], adv: false, updateUrl: vi.fn() }),
}));
vi.mock("../../src/hooks/useCpiChartData", () => ({
  useCpiChartData: () => ({ hiddenQuarters: [], toggleQuarter: vi.fn() }),
}));
vi.mock("../../src/hooks/useCpiChartDisplayData", () => ({
  useCpiChartDisplayData: () => mocks.displayData,
}));
vi.mock("../../src/hooks/useSectionNavigation", () => ({
  useSectionNavigation: () => ({
    activeId: "section-stacked",
    handleSelectSection: vi.fn(),
    isProgrammaticScroll: false,
  }),
}));
vi.mock("../../src/app/components/charts/useChartTooltipProps", () => ({
  useChartTooltipController: () => ({ bind: () => ({}) }),
}));
vi.mock("../../src/app/components/SpendingBarChart", () => ({
  normalizeSpendingChartData: (rows: unknown[]) => rows,
}));
vi.mock("../../src/hooks/useAdvancedPreference", () => ({ useAdvancedPreference: vi.fn() }));
vi.mock("../../src/app/components/CpiChartSections", () => ({
  CpiChartSections: (props: Record<string, any>) => {
    mocks.sectionsProps = props;
    return (
      <div>
        <button onClick={() => props.handleLegendToggle(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)}>
          derived
        </button>
        <button onClick={() => props.handleLegendToggle("unknown-series")}>unknown</button>
        <button onClick={() => props.handleLegendToggle("食料（名目）")}>legacy</button>
        <button onClick={() => props.handleLegendToggle("CTIミクロ調整系列（住居）")}>
          adjusted
        </button>
        <button onClick={() => props.handleLegendToggle(SUPPORT_SERIES_KEY_NOMINAL)}>
          support
        </button>
        <button onClick={() => props.setShowAdvanced(true)}>enable-advanced</button>
      </div>
    );
  },
}));
vi.mock("../../src/app/components/SectionTabs", () => ({
  SectionTabs: ({ onRangeClick }: { onRangeClick: () => void }) => (
    <button onClick={onRangeClick}>range</button>
  ),
}));
vi.mock("../../src/app/components/ChartFilters", () => ({
  ChartFilters: ({
    setStartYear,
    setEndYear,
  }: {
    setStartYear: (year: number) => void;
    setEndYear: (year: number) => void;
  }) => (
    <>
      <button onClick={() => setStartYear(2020)}>start-year</button>
      <button onClick={() => setEndYear(2021)}>end-year</button>
    </>
  ),
}));
vi.mock("../../src/app/components/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
vi.mock("../../src/app/components/DataTablesSection", () => ({ DataTablesSection: () => null }));
vi.mock("next/dynamic", () => ({
  default: () => (props: Record<string, unknown>) =>
    "advancedToggle" in props ? <>{props.advancedToggle as React.ReactNode}</> : null,
}));
vi.mock("../../src/app/components/LazyMount", () => ({
  LazyMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../src/app/components/MajorIndicesChart", () => ({ MajorIndicesChart: () => null }));
vi.mock("../../src/app/components/StackedAreaChart", () => ({
  StackedAreaChart: ({ onReset }: { onReset: () => void }) => (
    <button onClick={onReset}>reset-stacked</button>
  ),
}));
vi.mock("../../src/app/components/CagrPanel", () => ({ CagrPanel: () => null }));
vi.mock("../../src/app/components/ChartInfoContentRenderer", () => ({
  default: ({ footer }: { footer?: React.ReactNode }) => <>{footer}</>,
}));
vi.mock("../../src/app/components/EarningsBreakdownChart", () => ({
  EarningsBreakdownChart: () => null,
}));
vi.mock("../../src/app/components/ResidualAreaChart", () => ({ ResidualAreaChart: () => null }));
vi.mock("../../src/app/components/NewGraph", () => ({
  NewGraph: ({ advancedToggle }: { advancedToggle: React.ReactNode }) => <>{advancedToggle}</>,
}));

const measurement = (key: string) => ({
  key,
  label: key,
  unit: "万円",
  source: "fixture",
  value: 10,
  status: "valid",
});
const nominalRows = [
  {
    label: "2020Q1",
    年月: "2020Q1",
    measurements: Object.fromEntries(
      QUARTERLY_PUBLIC_NOMINAL_KEYS.map((key) => [key, measurement(key)]),
    ),
  },
];

function renderCpiChart(options: { data?: any[]; ctiInfoState?: any } = {}) {
  mocks.displayData = {
    chartData: [],
    filteredData: [],
    filteredQuarterlyNominalData: nominalRows,
    filteredQuarterlyRealData: [],
    mergedData: [],
    earningsData: [],
  };
  mocks.sectionsProps = null;
  return render(
    <CpiChart
      data={options.data ?? [{ 年月: "2020年1月", 総合: 100 } as any]}
      quarterlyNominalData={[]}
      quarterlyRealData={[]}
      totalEarningData={[]}
      maxCpiDate={{ year: 2021, month: 12 }}
      ctiInfoState={options.ctiInfoState}
    />,
  );
}

describe("CPI chart component callback contracts", () => {
  it("pairs canonical, legacy, adjusted, and support legends and ignores unknown keys", () => {
    renderCpiChart();
    const props = () => mocks.sectionsProps!;
    fireEvent.click(screen.getByRole("button", { name: "derived" }));
    expect(props().realHiddenKeys).toContain(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);
    fireEvent.click(screen.getByRole("button", { name: "derived" }));
    expect(props().realHiddenKeys).not.toContain(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);

    const initialNominal = props().nominalHiddenKeys;
    fireEvent.click(screen.getByRole("button", { name: "unknown" }));
    expect(props().nominalHiddenKeys).toEqual(initialNominal);

    fireEvent.click(screen.getByRole("button", { name: "legacy" }));
    expect(props().nominalHiddenKeys).toContain("食料（名目）");
    expect(props().realHiddenKeys).toContain("食料（実質）");
    fireEvent.click(screen.getByRole("button", { name: "legacy" }));
    expect(props().nominalHiddenKeys).not.toContain("食料（名目）");
    expect(props().realHiddenKeys).not.toContain("食料（実質）");

    fireEvent.click(screen.getByRole("button", { name: "adjusted" }));
    expect(props().nominalHiddenKeys).toContain("CTIミクロ調整系列（住居）");
    expect(props().realHiddenKeys).toContain("住居（実質）");
    fireEvent.click(screen.getByRole("button", { name: "support" }));
    expect(props().nominalHiddenKeys).toContain(SUPPORT_SERIES_KEY_NOMINAL);
    fireEvent.click(screen.getByRole("button", { name: "enable-advanced" }));
    expect(props().showAdvanced).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "range" }));
    fireEvent.click(screen.getByRole("button", { name: "start-year" }));
    expect(screen.queryByRole("button", { name: "start-year" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "range" }));
    fireEvent.click(screen.getByRole("button", { name: "end-year" }));
    expect(screen.queryByRole("button", { name: "end-year" })).toBeNull();
  });

  it("uses safe default ranges for empty and malformed date inputs and retains CTI source metadata", () => {
    const ctiInfoState = {
      baseYear: 2025,
      sourceMode: "official-connected",
      status: "invalid",
      reason: "fixture invalid",
      series: {
        raw: {
          key: SUPPORT_SERIES_KEY_NOMINAL,
          valueType: "raw",
          unit: "万円",
          source: "source",
          status: "invalid",
          reason: "fixture invalid",
        },
        comparison: {
          key: "comparison",
          valueType: "comparison",
          unit: "index",
          source: "source",
          status: "valid",
          reason: null,
        },
      },
    };
    renderCpiChart({ data: [], ctiInfoState });
    expect(mocks.sectionsProps?.ctiMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: SUPPORT_SERIES_KEY_NOMINAL,
          reason: "fixture invalid",
          color: "#789",
        }),
      ]),
    );
    renderCpiChart({ data: [{ 年月: "not a date", 総合: 100 }], ctiInfoState });
    expect(
      mocks.sectionsProps?.ctiMetadata.find(
        (item: { key: string }) => item.key === SUPPORT_SERIES_KEY_NOMINAL,
      ).reason,
    ).toBe("fixture invalid");
    renderCpiChart({
      data: [],
      ctiInfoState: {
        ...ctiInfoState,
        series: { ...ctiInfoState.series, raw: { ...ctiInfoState.series.raw, reason: null } },
      },
    });
    expect(
      mocks.sectionsProps?.ctiMetadata.find(
        (item: { key: string }) => item.key === SUPPORT_SERIES_KEY_NOMINAL,
      ).reason,
    ).toBeNull();
  });

  it("keeps unmapped payload opt-in, limits default rows, and formats finite/non-finite values", () => {
    const payload = Array.from({ length: 7 }, (_, i) => ({
      name: `series-${i}`,
      value: i === 6 ? Infinity : i,
    }));
    const { rerender } = render(
      <CustomTooltip
        active
        isMobile
        isTouch={false}
        payload={payload}
        label="2020"
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    expect(screen.getByText("他 2 件")).toBeDefined();
    rerender(
      <CustomTooltip
        active
        isMobile
        isTouch={false}
        payload={payload}
        label="2020"
        includeUnmappedPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    expect(screen.getByText("他 2 件")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    rerender(
      <CustomTooltip
        active
        isMobile
        isTouch={false}
        payload={payload}
        label="2020"
        includeUnmappedPayload
        allowedKeys={[]}
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    expect(document.querySelectorAll('[data-tooltip-row="true"]')).toHaveLength(0);
  });

  it("renders explicit unmapped fallback rows and monthly, moving-average, and CPI provenance", () => {
    const { rerender } = render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024Q1"
        payload={[
          { name: "registered", value: 1 },
          { name: "second", value: 1.5 },
          { dataKey: "extra", name: "extra", value: 2 },
        ]}
        seriesMeta={[
          { key: "registered", label: "Registered" },
          { key: "second", label: "Second" },
        ]}
        includeUnmappedPayload
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    expect(screen.getByText("Registered")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
    expect(screen.getByText("extra")).toBeDefined();

    const provenancePayload = [
      {
        dataKey: "消費(総合)",
        name: "総合消費",
        value: 1,
        monthlyProvenance: {
          sourceId: "monthly-a",
          householdScope: "総世帯",
          seriesType: "official_monthly_observed",
          description: "observed",
        },
        ma12Provenance: {
          windowStart: "2023年4月",
          windowEnd: "2024年3月",
          sources: ["monthly-a"],
          statuses: ["official"],
        },
      },
      {
        dataKey: "消費(内訳)",
        name: "内訳",
        value: 2,
        monthlyProvenance: {
          sourceId: "monthly-b",
          householdScope: "二人以上の世帯",
          seriesType: "historical_estimate",
          description: "estimated",
        },
        ma12Provenance: {
          windowStart: "2023Q2",
          windowEnd: "2024Q1",
          sources: ["monthly-b"],
          statuses: ["valid"],
        },
      },
      {
        dataKey: "CPI総合",
        name: "CPI",
        value: 3,
        cpiSeries: "総合",
        sourceId: "cpi-source",
        cpiPeriod: "2024Q1",
        cpiAggregation: "mean",
        baseYear: 2020,
        nominalSource: "nominal-source",
      },
    ] as any;
    rerender(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2024Q1"
        payload={provenancePayload}
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    expect(screen.getByText("消費支出の12か月移動平均")).toBeDefined();
    expect(screen.getByText(/月次出典: monthly-b/)).toBeDefined();
    const totalConsumptionRow = document.querySelector('[data-tooltip-key="消費(総合)"]');
    expect(totalConsumptionRow?.getAttribute("data-tooltip-ma12-window-start")).toBe("2023年4月");
    expect(totalConsumptionRow?.getAttribute("data-tooltip-ma12-window-end")).toBe("2024年3月");
    expect(screen.getByText(/CPI: 総合（e-Stat cpi-source/)).toBeDefined();
  });

  it("covers missing row measurements, optional CPI provenance, bridge metadata, and sparse numeric display", () => {
    render(
      <CustomTooltip
        active
        isMobile
        isTouch={false}
        label="2024Q1"
        payload={
          [
            { dataKey: "estimated", name: "Estimated", value: 5, payload: {} },
            { dataKey: "infinite", name: "Infinite", value: Number.POSITIVE_INFINITY, payload: {} },
            {
              dataKey: "official",
              name: "Official",
              value: 6,
              payload: {
                measurements: {
                  official: {
                    official: true,
                    seriesType: "official_adjusted",
                    bridgeAppliedRange: { startYear: 2020, endYear: 2024 },
                    bridgeCoefficient: 1.02,
                    cpiSeries: "CPI",
                    cpiPeriod: "2024Q1",
                    cpiAggregation: "mean",
                  },
                },
              },
            },
            { dataKey: "missing", name: "Missing", value: null, payload: { 年月: "2024Q1" } },
            { dataKey: "raw-string", name: "Raw string", value: "raw" },
            {
              dataKey: "moving-only",
              name: "Moving only",
              value: 3,
              ma12Provenance: {
                windowStart: "2023Q2",
                windowEnd: "2024Q1",
                sources: ["fixture"],
                statuses: ["valid"],
              },
            },
          ] as any
        }
        seriesMeta={[
          { key: "estimated", label: "Estimated", baseYear: 2020 },
          { key: "infinite", label: "Infinite" },
          { key: "official", label: "Official" },
          { key: "missing", label: "Missing", estimateVersion: "plan39-v2" },
        ]}
        includeUnmappedPayload
        showAllPayload
        showMeasurementNotes
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    const officialRow = document.querySelector('[data-tooltip-key="official"]');
    expect(officialRow?.getAttribute("data-tooltip-bridge-applied-range")).toBe("2020-2024");
    expect(officialRow?.getAttribute("data-tooltip-bridge-coefficient")).toBe("1.02");
    expect(screen.getByText(/e-Stat \?/)).toBeDefined();
    expect(screen.getByText(/基準年不明/)).toBeDefined();
    expect(screen.getByText(/名目出典: 不明/)).toBeDefined();
    expect(screen.getByText("raw")).toBeDefined();
    expect(screen.getByText(/12MA期間: 2023Q2〜2024Q1/)).toBeDefined();

    render(
      <CustomTooltip
        active
        isMobile
        isTouch={false}
        label="2024Q1"
        payload={
          [
            { name: "top", value: 5 },
            { name: "aux", value: 2 },
            { name: "missing", value: null },
            { name: "string", value: "raw" },
          ] as any
        }
        separatorBetweenGroups={{ firstGroupKeys: ["top"], secondGroupKeys: ["aux"] }}
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    expect(
      document
        .querySelector('[data-tooltip-group-separator="true"]')
        ?.getAttribute("data-tooltip-label"),
    ).toBe("aux");
  });
});

describe("CPI chart sections tooltip contracts", () => {
  it("projects seasonal and spending metadata across valid, invalid, visible, and hidden periods", async () => {
    const { CpiChartSections } = await vi.importActual<
      typeof import("../../src/app/components/CpiChartSections")
    >("../../src/app/components/CpiChartSections");
    const ActualSections = CpiChartSections;
    const { CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY } = await import("../../src/lib/chartConstants");
    const expenseKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.住居;
    const supportKey = SUPPORT_SERIES_KEY_NOMINAL;
    const captured = new Map<string, Record<string, any>>();
    const noop = vi.fn();
    const comparisonSeriesRegistry = [
      { key: "CPI総合(12MA)", label: "CPI", displayName: "CPI display", order: 0 },
      { key: "総合(12MA)", label: "総合", order: 1, advanced: true },
      { key: "消費(総合)", label: "消費", order: 2 },
    ];
    const meta = { key: expenseKey, label: "住居", color: "#abc", unit: "万円", status: "valid" };
    const props = {
      allYears: [2016, 2018],
      filteredData: [],
      nominalPublicData: [{ 年月: "2018Q1", measurements: { [expenseKey]: meta } }],
      realPublicData: [],
      earningsData: [],
      mergedData: [],
      chartColors: { barFill: "#bar" },
      isMobile: false,
      hiddenKeys: [],
      stackedHiddenKeys: [],
      nominalHiddenKeys: [expenseKey],
      realHiddenKeys: [],
      maHiddenKeys: [],
      nominalColorsWithSupport: ["#nominal", "#fallback", "#support"],
      nominalKeysWithSupport: [expenseKey, "食料（名目）", supportKey],
      realKeysWithSupport: ["住居（実質）", CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY],
      realColors: ["#real"],
      hiddenQuarters: [],
      showAdvanced: false,
      setShowAdvanced: noop,
      handleLegendClick: noop,
      handleStackedLegendClick: noop,
      handleLegendToggle: noop,
      handleMaLegendClick: noop,
      handleQuarterLegendClick: noop,
      setStackedHiddenKeys: noop,
      setNominalHiddenKeys: noop,
      setRealHiddenKeys: noop,
      cagrStartYear: 2016,
      cagrEndYear: 2018,
      cagrMonth: 1,
      cagrResult: null,
      cagrError: null,
      setCagrStartYear: noop,
      setCagrEndYear: noop,
      setCagrMonth: noop,
      calculateCAGR: noop,
      chartTooltip: {
        bind: (id: string, options?: Record<string, any>) => {
          captured.set(id, options ?? {});
          return {};
        },
      },
      comparisonSeriesRegistry,
      ctiMetadata: [meta],
    } as any;
    const view = render(<ActualSections {...props} />);

    const comparison = captured.get("section-new-graph")!;
    const comparisonAllowed = comparison.allowedKeys as (label?: string) => string[];
    expect(comparisonAllowed("not-quarterly")).toEqual(["CPI総合(12MA)", "消費(総合)"]);
    expect(comparisonAllowed()).toEqual(["CPI総合(12MA)", "消費(総合)"]);
    expect(comparisonAllowed("2020Q1")).toEqual(["CPI総合(12MA)"]);

    const nominal = captured.get("section-consumption-nominal")!;
    const nominalAllowed = nominal.allowedKeys as (label?: string) => string[];
    expect(nominalAllowed("not-quarterly")).toEqual([]);
    expect(nominalAllowed()).toEqual([]);
    expect(nominalAllowed("2018Q1")).toEqual(["食料（名目）", supportKey]);
    const nominalMeta = nominal.seriesMeta as Array<Record<string, any>>;
    expect(nominalMeta.map(({ key }) => key)).toEqual([expenseKey, "食料（名目）", supportKey]);
    expect(nominalMeta[0]).toMatchObject({ label: "住居", color: "#abc", order: 0 });
    expect(nominalMeta.find(({ key }) => key === "食料（名目）")).toMatchObject({
      color: "#fallback",
    });
    expect(nominalMeta.find(({ key }) => key === supportKey)).toMatchObject({
      color: "#bar",
      order: 2,
    });
    expect(
      (captured.get("section-consumption-real")!.seriesMeta as Array<Record<string, any>>).map(
        ({ key }) => key,
      ),
    ).not.toContain(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);

    fireEvent.click(screen.getByRole("button", { name: "reset-stacked" }));
    const setter = props.setStackedHiddenKeys as ReturnType<typeof vi.fn>;
    const resetUpdater = setter.mock.calls.at(-1)?.[0] as (previous: string[]) => string[];
    expect(resetUpdater([]).length).toBeGreaterThan(0);
    expect(resetUpdater([...stackedKeys])).toEqual([]);

    const advancedInfoButton = screen.queryByRole("button", {
      name: "給与・消費・物価の推移比較のデータソースを表示",
    });
    if (advancedInfoButton) fireEvent.click(advancedInfoButton);
    fireEvent.click(screen.getByRole("checkbox", { name: "参考・延長系列を表示する" }));
    expect(noop).toHaveBeenCalledWith(true);

    view.rerender(<ActualSections {...props} showAdvanced />);
    expect(
      (captured.get("section-new-graph")!.allowedKeys as (label?: string) => string[])("2020Q1"),
    ).toEqual(["CPI総合(12MA)", "総合(12MA)"]);
    view.rerender(<ActualSections {...props} showAdvanced isMobile />);
  });
});
