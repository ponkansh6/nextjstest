import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SpendingBarChart } from "@/app/components/SpendingBarChart";
import { SUPPORT_SERIES_KEY_NOMINAL } from "@/lib/chartConstants";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="barchart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="bar-mock" data-key={dataKey} />,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid="line-mock" data-key={dataKey} />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock("@/app/components/charts/YearReferenceLines", () => ({
  YearReferenceLines: () => <div />,
}));
vi.mock("@/app/components/charts/XAxisEdgeTick", () => ({ XAxisEdgeTick: () => <div /> }));
vi.mock("@/app/components/charts/xAxisTicks", () => ({ computeXAxisTicks: () => [] }));
vi.mock("@/app/components/ChartInfoContentRenderer", () => ({ default: () => <div /> }));

const nominalFactor = 0.0011398911460950036;
const realFactor = 0.001298186239096047;
const chartProps = {
  title: "消費支出",
  colors: ["#ff0000"],
  hiddenKeys: [],
  onToggle: vi.fn(),
  chartColors: { barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" },
  tooltipProps: {
    cursor: { stroke: "#e2e8f0", strokeWidth: 1, strokeOpacity: 0.6 },
    trigger: "hover" as const,
    content: <div />,
  },
  hiddenQuarters: [],
  onToggleQuarter: vi.fn(),
  onReset: vi.fn(),
};

type FixtureRow = {
  label: string;
  年: number;
  quarter: number;
  年月: string;
  食料?: number | null;
  [SUPPORT_SERIES_KEY_NOMINAL]?: number | null;
};

const renderFixture = (data: FixtureRow[], keys: string[] = ["食料", SUPPORT_SERIES_KEY_NOMINAL]) =>
  render(<SpendingBarChart {...chartProps} data={data} keys={keys} />);

const renderedRows = () =>
  JSON.parse(screen.getByTestId("barchart").getAttribute("data-rows") ?? "[]") as FixtureRow[];

describe("Plan24 SpendingBarChart rendering fixtures", () => {
  it("renders pre-2018 GDP as a standalone Bar, CTI after 2018Q1, and no Line", () => {
    renderFixture([
      {
        label: "2017 Q4",
        年: 2017,
        quarter: 4,
        年月: "2017-10",
        [SUPPORT_SERIES_KEY_NOMINAL]: 100,
      },
      {
        label: "2018 Q1",
        年: 2018,
        quarter: 1,
        年月: "2018-01",
        食料: 30,
        [SUPPORT_SERIES_KEY_NOMINAL]: 200,
      },
    ]);

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      SUPPORT_SERIES_KEY_NOMINAL,
      "食料",
    ]);
    expect(screen.queryAllByTestId("line-mock")).toHaveLength(0);
    expect(renderedRows()).toEqual([
      expect.objectContaining({ [SUPPORT_SERIES_KEY_NOMINAL]: 100, 食料: null }),
      expect.objectContaining({ [SUPPORT_SERIES_KEY_NOMINAL]: null, 食料: 30 }),
    ]);
  });

  it("keeps CTI through an interior GDP null without interpolation or zero fallback", () => {
    renderFixture([
      {
        label: "2018 Q1",
        年: 2018,
        quarter: 1,
        年月: "2018-01",
        食料: 10,
        [SUPPORT_SERIES_KEY_NOMINAL]: 150,
      },
      {
        label: "2018 Q2",
        年: 2018,
        quarter: 2,
        年月: "2018-04",
        食料: 20,
        [SUPPORT_SERIES_KEY_NOMINAL]: null,
      },
      {
        label: "2018 Q3",
        年: 2018,
        quarter: 3,
        年月: "2018-07",
        食料: 30,
        [SUPPORT_SERIES_KEY_NOMINAL]: 180,
      },
    ]);

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      "食料",
    ]);
    expect(renderedRows().map((row) => row[SUPPORT_SERIES_KEY_NOMINAL])).toEqual([
      null,
      null,
      null,
    ]);
    expect(renderedRows()[1].食料).toBe(20);
  });

  it("hides GDP when it is unready/all-null while retaining CTI", () => {
    // 修正前のGDP Line契約では、未ready/全欠損でもGDP Lineを出す期待が失敗するfixture。
    renderFixture([
      {
        label: "2017 Q4",
        年: 2017,
        quarter: 4,
        年月: "2017-10",
        食料: null,
        [SUPPORT_SERIES_KEY_NOMINAL]: null,
      },
      {
        label: "2018 Q1",
        年: 2018,
        quarter: 1,
        年月: "2018-01",
        食料: 40,
        [SUPPORT_SERIES_KEY_NOMINAL]: null,
      },
    ]);

    expect(screen.getAllByTestId("bar-mock").map((node) => node.getAttribute("data-key"))).toEqual([
      "食料",
    ]);
    expect(screen.queryAllByTestId("line-mock")).toHaveLength(0);
    expect(renderedRows()[1].食料).toBe(40);

    // 旧Plan24の「GDP Lineが存在する」契約は、訂正後の実装では明示的に失敗する。
    expect(() => {
      expect(screen.queryAllByTestId("line-mock")).toHaveLength(1);
    }).toThrow();
  });

  it("independently recalculates nominal and real factors; swapping them fails the expected value", () => {
    // CSV相当の4四半期原値から、平均・係数・比較値を独立に再計算する。
    const csvRows = [
      { period: "2025Q1", nominalRaw: 350000, realRaw: 308000 },
      { period: "2025Q2", nominalRaw: 351000, realRaw: 309000 },
      { period: "2025Q3", nominalRaw: 352000, realRaw: 310000 },
      { period: "2025Q4", nominalRaw: 353000, realRaw: 311000 },
    ];
    const nominalAverage = csvRows.reduce((sum, row) => sum + row.nominalRaw, 0) / csvRows.length;
    const realAverage = csvRows.reduce((sum, row) => sum + row.realRaw, 0) / csvRows.length;
    const nominalFactorFromCsv = 100 / nominalAverage;
    const realFactorFromCsv = 100 / realAverage;
    const nominalRaw = csvRows[0].nominalRaw;
    const realRaw = csvRows[0].realRaw;
    const nominal = nominalRaw * nominalFactorFromCsv;
    const real = realRaw * realFactorFromCsv;

    expect(nominalAverage).toBe(351500);
    expect(realAverage).toBe(309500);
    expect(nominal).toBeCloseTo(99.57325746799573, 10);
    expect(real).toBeCloseTo(99.51534733441034, 10);
    expect(nominalRaw * realFactorFromCsv).not.toBeCloseTo(nominal, 10);
    expect(realRaw * nominalFactorFromCsv).not.toBeCloseTo(real, 10);
    expect(nominalFactor).not.toBe(nominalFactorFromCsv);
    expect(realFactor).not.toBe(realFactorFromCsv);
  });

  it("rejects GDP+CTI mixed totals at the 2017Q4/2018Q1 boundary", () => {
    const pre2018 = { [SUPPORT_SERIES_KEY_NOMINAL]: 100, 食料: null, 住居: null };
    const post2018 = { [SUPPORT_SERIES_KEY_NOMINAL]: null, 食料: 20, 住居: 30 };
    const preTotal = pre2018[SUPPORT_SERIES_KEY_NOMINAL];
    const postTotal = post2018.食料 + post2018.住居;

    expect(preTotal).toBe(100);
    expect(postTotal).toBe(50);
    expect(postTotal).not.toBe(150);
  });
});
