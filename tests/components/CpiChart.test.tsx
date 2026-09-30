import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CpiChartSections } from "../../src/app/components/CpiChartSections";
import { SectionTabs } from "../../src/app/components/SectionTabs";
import { CPI_CHART_SECTIONS } from "../../src/app/components/cpiChartConfig";
import CpiChart from "../../src/app/components/CpiChart";
import type { CpiView, QuarterlyView } from "../../src/types/chart";
import {
  CONSUMPTION_REAL_KEYS,
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  stackedKeys,
} from "../../src/lib/chartConstants";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";
import { beforeEach } from "vitest";
import { setupUiMocks } from "../utils/ui-mocks";

vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_: unknown, key: string) => key }),
}));
vi.mock("../../src/app/components/StackedAreaChart", async () => {
  const { Area, AreaChart } = await import("recharts");
  return {
    StackedAreaChart: ({
      data,
      belowChartSlot,
    }: {
      data: Array<Record<string, unknown>>;
      belowChartSlot?: React.ReactNode;
    }) => (
      <div data-testid="stacked-composition">
        <AreaChart data={data}>
          <Area dataKey="住居" />
        </AreaChart>
        {belowChartSlot}
      </div>
    ),
  };
});
vi.mock("../../src/app/components/MajorIndicesChart", () => ({
  MajorIndicesChart: () => <div />,
}));
vi.mock("../../src/app/components/LazyMount", () => ({
  LazyMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/dynamic", async () => {
  const ReactModule = await import("react");
  return {
    default: (loader: () => Promise<React.ComponentType<unknown>>) => {
      const Dynamic = ReactModule.lazy(() =>
        loader().then((Component) => ({ default: Component })),
      );
      return (props: Record<string, unknown>) => (
        <ReactModule.Suspense fallback={null}>
          <Dynamic {...props} />
        </ReactModule.Suspense>
      );
    },
  };
});
vi.mock("../../src/app/components/ChartInfoContentRenderer", () => ({
  default: () => <div />,
}));
vi.mock("../../src/app/components/DataTablesSection", () => ({
  DataTablesSection: () => <div />,
}));
vi.mock("../../src/app/components/EarningsBreakdownChart", () => ({
  EarningsBreakdownChart: () => <div />,
}));
vi.mock("../../src/app/components/ResidualAreaChart", () => ({
  ResidualAreaChart: () => <div />,
}));
vi.mock("../../src/app/components/NewGraph", () => ({ NewGraph: () => <div /> }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("recharts", async () => {
  const ReactModule = await import("react");
  const DataContext = ReactModule.createContext<Array<Record<string, unknown>>>([]);
  const Chart = ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data?: Array<Record<string, unknown>>;
  }) => (
    <div>
      <DataContext.Provider value={data ?? []}>{children}</DataContext.Provider>
    </div>
  );
  const AreaChart = ({
    children,
    data = [],
  }: {
    children: React.ReactNode;
    data?: Array<Record<string, unknown>>;
  }) => (
    <div data-testid="cpi-area-chart">
      {children}
      {data.map((row, index) => (
        <span
          key={`${String(row.年月 ?? row.label)}-${index}`}
          data-cpi-period={String(row.年月 ?? row.label ?? "")}
        />
      ))}
    </div>
  );
  const Bar = ({ dataKey }: { dataKey: string }) => {
    const rows = ReactModule.useContext(DataContext);
    return (
      <>
        <span data-testid="rendered-bar-series" data-series-key={dataKey} />
        {rows
          .filter((row) => typeof row[dataKey] === "number" && Number.isFinite(row[dataKey]))
          .map((row, index) => (
            <span
              key={`${dataKey}-${index}`}
              className="recharts-bar-rectangle"
              data-period={row.label}
              data-series={dataKey}
              data-series-key={dataKey}
            />
          ))}
      </>
    );
  };
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: Chart,
    Bar,
    CartesianGrid: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: () => null,
    LineChart: Chart,
    Area: () => null,
    AreaChart,
  };
});

beforeEach(() => setupUiMocks());

const sectionProps: React.ComponentProps<typeof CpiChartSections> = {
  allYears: [2005, 2010, 2015, 2020],
  filteredData: [],
  nominalPublicData: [],
  realPublicData: [],
  earningsData: [],
  mergedData: [],
  chartColors: { gridStroke: "#e2e8f0", axisText: "#64748b", barFill: "#94a3b8" },
  isMobile: false,
  hiddenKeys: [],
  stackedHiddenKeys: [],
  nominalHiddenKeys: [],
  realHiddenKeys: [],
  maHiddenKeys: [],
  nominalColorsWithSupport: [],
  nominalKeysWithSupport: [],
  realKeysWithSupport: [],
  realColors: [],
  hiddenQuarters: [],
  showAdvanced: false,
  setShowAdvanced: vi.fn(),
  handleLegendClick: vi.fn(),
  handleStackedLegendClick: vi.fn(),
  handleLegendToggle: vi.fn(),
  handleMaLegendClick: vi.fn(),
  handleQuarterLegendClick: vi.fn(),
  setStackedHiddenKeys: vi.fn(),
  setNominalHiddenKeys: vi.fn(),
  setRealHiddenKeys: vi.fn(),
  cagrStartYear: 2010,
  cagrEndYear: 2020,
  cagrMonth: 1,
  cagrResult: null,
  cagrError: null,
  setCagrStartYear: vi.fn(),
  setCagrEndYear: vi.fn(),
  setCagrMonth: vi.fn(),
  calculateCAGR: vi.fn(),
  chartTooltip: {
    bind: () => ({
      tooltipProps: {
        cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.2 },
        trigger: "hover",
        content: <div />,
      },
      onClick: vi.fn(),
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onMouseMove: vi.fn(),
      onPointerLeave: vi.fn(),
      onMouseLeave: vi.fn(),
    }),
  },
  comparisonSeriesRegistry: [],
};

describe("CpiChartSections composition", () => {
  it("shows the CAGR trigger while omitting its section and tab", () => {
    render(
      <>
        <SectionTabs
          sections={CPI_CHART_SECTIONS}
          activeId="section-stacked"
          onSelect={vi.fn()}
          rangeLabel="2010–2020"
          onRangeClick={vi.fn()}
        />
        <CpiChartSections {...sectionProps} />
      </>,
    );

    expect(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ })).not.toBeNull();
    expect(document.querySelector("#section-cagr")).toBeNull();
    expect(
      Array.from(document.querySelectorAll("[class*='sectionTabs'] button")).some(
        (button) => button.textContent?.trim() === "CPI年率",
      ),
    ).toBe(false);
  });
});

const rangeYears = [2005, 2010, 2015, 2020, 2025] as const;
const cpiFixture: CpiView[] = rangeYears.flatMap((year) =>
  Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row: Record<string, string | number | null> = {
      年月: `${year}年${month}月`,
      総合: 100 + month / 10,
      生鮮食品を除く総合: 99 + month / 10,
      生鮮食品及びエネルギーを除く総合: 98 + month / 10,
      "食料（酒類を除く）及びエネルギーを除く総合": 97 + month / 10,
      持家の帰属家賃を除く総合: 100 + month / 10,
      "消費支出（参考）": null,
      "CPI総合(参考)": 100 + month / 10,
    };
    for (const [keyIndex, key] of stackedKeys.entries()) row[key] = 90 + keyIndex + month / 10;
    return row as CpiView;
  }),
);

const periodsInYearRange = (from: number, to: number) =>
  cpiFixture
    .filter((row) => {
      const year = Number(row.年月.slice(0, 4));
      return year >= from && year <= to;
    })
    .map((row) => row.年月);

function quarterlyFixture(
  keys: readonly string[],
  options: {
    plan39?: boolean;
    poisonLegacyAlias?: boolean;
    omitCanonicalFood?: boolean;
  } = {},
): QuarterlyView[] {
  return rangeYears.flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => {
      const row: QuarterlyView = {
        年: year,
        quarter,
        label: `${year}Q${quarter}`,
        年月: `${year}Q${quarter}`,
        measurements: {},
      };
      keys.forEach((key, index) => {
        if (options.omitCanonicalFood && key === canonicalFoodKey) return;
        const value = 100 + index + quarter;
        row[key] = value;
        row.measurements![key] = {
          key,
          label: key,
          unit: "指数",
          source: options.plan39 ? "Plan39 quarterly fixture" : "Quarterly fixture",
          valueType: "comparison",
          value,
          status: "available",
          reason: null,
          frequency: "quarterly",
          aggregation: "fixture_quarterly_value",
          ...(options.plan39
            ? {
                seriesType: "estimated_adjusted" as const,
                official: false,
                annualAnchorType: "estimated" as const,
                quarterlyDerived: true,
                model: "v2-bottom-up" as const,
                estimateVersion: "plan39-v2" as const,
                inputFingerprint: "sha256:plan39-cpichart-fixture",
              }
            : {}),
        };
      });
      if (options.poisonLegacyAlias) row["食料（名目）"] = 999_999;
      return row;
    }),
  );
}

const canonicalNominalCategories = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
  (category) => category !== "総合",
);
const canonicalNominalKeys = canonicalNominalCategories.map(
  (category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
);
const canonicalFoodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;

describe("CpiChart maximum range integration", () => {
  it("synchronizes URL, periods, Q1 state, and data-derived nominal/real bars", async () => {
    expect(canonicalNominalKeys).toEqual(QUARTERLY_PUBLIC_NOMINAL_KEYS);
    window.history.replaceState(null, "", `${window.location.pathname}?from=2015&to=2020`);
    render(
      <CpiChart
        data={cpiFixture}
        quarterlyNominalData={quarterlyFixture(canonicalNominalKeys, {
          plan39: true,
          poisonLegacyAlias: true,
        })}
        quarterlyRealData={quarterlyFixture(CONSUMPTION_REAL_KEYS)}
        totalEarningData={[]}
        maxCpiDate={{ year: 2025, month: 12 }}
      />,
    );
    expect(new URL(window.location.href).searchParams.get("from")).toBe("2015");
    expect(new URL(window.location.href).searchParams.get("to")).toBe("2020");
    const cpiChart = screen.getByTestId("cpi-area-chart");
    const customPeriods = Array.from(cpiChart.querySelectorAll("[data-cpi-period]"), (row) =>
      row.getAttribute("data-cpi-period"),
    );
    expect(customPeriods).toEqual(periodsInYearRange(2015, 2020));

    fireEvent.click(screen.getByRole("button", { name: "表示期間を変更" }));
    const sheet = screen.getByRole("dialog", { name: "表示期間の選択" });
    expect(sheet).not.toBeNull();
    const endYear = screen.getByLabelText("終了年:") as HTMLSelectElement;
    expect(endYear.options[endYear.options.length - 1]?.textContent?.trim()).toBe("2025年");
    fireEvent.click(within(sheet).getByRole("button", { name: /^最大期間$/ }));
    expect(screen.queryByRole("dialog", { name: "表示期間の選択" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "表示期間を変更" }));
    const reopenedSheet = screen.getByRole("dialog", { name: "表示期間の選択" });
    expect((within(reopenedSheet).getByLabelText("開始年:") as HTMLSelectElement).value).toBe(
      "2005",
    );
    expect((within(reopenedSheet).getByLabelText("終了年:") as HTMLSelectElement).value).toBe(
      "2025",
    );
    fireEvent.click(within(reopenedSheet).getByRole("button", { name: "閉じる" }));

    const maxUrl = new URL(window.location.href);
    expect(maxUrl.searchParams.has("from")).toBe(false);
    expect(maxUrl.searchParams.has("to")).toBe(false);
    const fullPeriods = Array.from(
      screen.getByTestId("cpi-area-chart").querySelectorAll("[data-cpi-period]"),
      (row) => row.getAttribute("data-cpi-period"),
    );
    expect(fullPeriods).toEqual(periodsInYearRange(2005, 2025));
    expect(fullPeriods).not.toEqual(customPeriods);

    const chartIds = ["spending-chart-nominal", "spending-chart-real"] as const;
    await screen.findByTestId("spending-chart-nominal");
    const nominalChart = screen.getByTestId("spending-chart-nominal");
    expect(
      Array.from(
        nominalChart.querySelectorAll("button[data-testid^='legend-'] .legendLabel"),
        (label) => label.textContent?.trim(),
      ),
    ).toEqual([
      "住居",
      "家具・家事用品",
      "被服履物",
      "保健医療",
      "教育",
      "光熱水道",
      "教養娯楽",
      "交通通信",
      "食料",
      "諸雑費・CPI外",
    ]);
    const fullBarCounts = new Map(
      chartIds.map((id) => [
        id,
        screen.getByTestId(id).querySelectorAll(".recharts-bar-rectangle").length,
      ]),
    );
    for (const id of chartIds) {
      const chart = screen.getByTestId(id);
      const rows = chart.querySelectorAll(
        "[data-testid='chart-data-contract'] [data-chart-data-row]",
      );
      expect(rows).toHaveLength(rangeYears.length * 4);
      expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);
    }
    const nominalContractRows = screen
      .getByTestId("spending-chart-nominal")
      .querySelectorAll("[data-testid='chart-data-contract'] [data-chart-data-row]");
    for (const row of nominalContractRows) {
      const seriesKeys = Array.from(row.querySelectorAll("[data-series-key]"), (series) =>
        series.getAttribute("data-series-key"),
      );
      expect(seriesKeys).toEqual(expect.arrayContaining(canonicalNominalKeys));
      expect(seriesKeys).not.toContain("食料（名目）");
    }
    const expectedPresentationKeys = [
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.住居,
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["家具・家事用品"],
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["被服及び履物"],
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.保健医療,
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.教育,
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["光熱・水道"],
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.教養娯楽,
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["交通・通信"],
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料,
      CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["その他の消費支出"],
    ];
    const renderedNominalBarKeys = Array.from(
      nominalChart.querySelectorAll("[data-testid='rendered-bar-series']"),
      (bar) => bar.getAttribute("data-series-key"),
    );
    expect(renderedNominalBarKeys).toHaveLength(10);
    expect(renderedNominalBarKeys).toEqual(expectedPresentationKeys);
    const q1 = within(screen.getByTestId("spending-chart-nominal")).getByRole("button", {
      name: /^Q1$/,
    });
    expect(q1.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(q1);
    expect(q1.getAttribute("aria-pressed")).toBe("false");
    for (const id of chartIds) {
      const chart = screen.getByTestId(id);
      expect(
        chart.querySelectorAll("[data-testid='chart-data-contract'] [data-chart-data-row]"),
      ).toHaveLength(rangeYears.length * 3);
      expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBeLessThan(
        fullBarCounts.get(id) ?? 0,
      );
    }
    fireEvent.click(q1);
    expect(q1.getAttribute("aria-pressed")).toBe("true");
    for (const id of chartIds) {
      const chart = screen.getByTestId(id);
      expect(
        chart.querySelectorAll("[data-testid='chart-data-contract'] [data-chart-data-row]"),
      ).toHaveLength(rangeYears.length * 4);
      expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBe(fullBarCounts.get(id));
    }
  });

  it("does not promote a poisoned legacy nominal alias into the canonical food series", async () => {
    window.history.replaceState(null, "", window.location.pathname);
    render(
      <CpiChart
        data={cpiFixture}
        quarterlyNominalData={quarterlyFixture(canonicalNominalKeys, {
          plan39: true,
          poisonLegacyAlias: true,
          omitCanonicalFood: true,
        })}
        quarterlyRealData={quarterlyFixture(CONSUMPTION_REAL_KEYS)}
        totalEarningData={[]}
        maxCpiDate={{ year: 2025, month: 12 }}
      />,
    );

    const nominalChart = await screen.findByTestId("spending-chart-nominal");
    expect(
      nominalChart.querySelectorAll(`.recharts-bar-rectangle[data-series="${canonicalFoodKey}"]`),
    ).toHaveLength(0);
  });
});
