/**
 * @bun-environment happy-dom
 *
 * Real consumption graph "民間最終消費支出（実質）= 0" — パイプライン層の回帰ガード。
 *
 * ⚠️ 位置づけ（重要）:
 * 本テストは商用の不具合を **再現しない**。商用は本リポジトリを push した Vercel 自動デプロイであり、
 * コードも `data/source/*.csv` も同一だが、ローカルのデータ経路では正しい非ゼロ値が得られることが
 * 確認済みのため（`next build` 出力 `.next/server/app/index.rsc` でも同様）。
 *
 * 商用の再現は `tests/production/prod-payload.test.ts`（実デプロイのRSCペイロードを直接検証）が担う。
 * 本テストは「ローカルのパイプラインが健全であること」を固定する回帰ガードとして成功が期待値。
 *
 * 関連:
 *   tests/production/prod-payload.test.ts   … 商用ペイロード直接検証（失敗が期待値）
 *   tests/build/rsc-payload-parity.test.ts  … next build 出力との乖離検出
 *   tests/server/support-map-join.test.ts   … サイレント0経路（cpi.ts:65/67/68）の契約テスト
 *
 * テスト経路の忠実性:
 * 1. CPI データから maxCpiDate を導出（ハードコードなし）
 * 2. toQuarterlyView を import して呼び出す（再実装なし）
 * 3. SpendingBarChart に本番と同一の props を渡す
 * 4. recharts モック経由で「UI が実際に受け取った data」を検証
 */

import { expect, it, describe, beforeAll, vi } from "vitest";
import { render, screen, getAllByTestId } from "@testing-library/react";
import { loadCpiData, loadCtiData } from "../../server/lib/dataLoader";
import { computeQuarterlyAggregates } from "../../server/lib/view-models/quarterlyAggregation";
import { toQuarterlyView } from "../../server/lib/view-models/dashboard";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_REAL,
  SUPPORT_SERIES_KEY_NOMINAL,
} from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import { setupUiMocks } from "../utils/ui-mocks";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ data, children }: any) => (
    <div data-testid="barchart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: (props: any) => <div data-testid="bar-mock" data-key={props.dataKey} />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: () => <div data-testid="xaxis" />,
  YAxis: () => <div data-testid="yaxis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  AreaChart: ({ data, children }: any) => (
    <div data-testid="areachart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: (props: any) => <div data-testid="area-mock" data-key={props.dataKey} />,
  LineChart: ({ data, children }: any) => (
    <div data-testid="linechart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: (props: any) => <div data-testid="line-mock" data-key={props.dataKey} />,
  ReferenceLine: () => <div data-testid="referenceline" />,
}));

describe("Real Consumption Support Series - Local Pipeline Regression Guard", () => {
  let cleanData: CpiData[];
  let ctiData: CpiData[];
  let maxCpiDate: { year: number; month: number };
  let projectedQuarterlyReal: any[];

  beforeAll(async () => {
    setupUiMocks();

    // Load source data (same as page.tsx:16-20)
    [cleanData, ctiData] = await Promise.all([loadCpiData(), loadCtiData()]);

    // Derive maxCpiDate from cleanData (page.tsx:23-36)
    let maxCpiYear = 1994;
    let maxCpiMonth = 1;
    for (const d of cleanData) {
      const m = String(d.年月).match(/^(\d{4})年(\d{1,2})月/);
      if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        if (y > maxCpiYear || (y === maxCpiYear && mo > maxCpiMonth)) {
          maxCpiYear = y;
          maxCpiMonth = mo;
        }
      }
    }
    maxCpiDate = { year: maxCpiYear, month: maxCpiMonth };

    // Compute quarterly aggregates (page.tsx:39-42)
    const { real: quarterlyRealData } = computeQuarterlyAggregates(ctiData, maxCpiDate);

    // Build quarterlyKeys exactly as page.tsx:45-53
    const quarterlyKeys = [
      "label",
      "quarter",
      "年",
      ...CONSUMPTION_NOMINAL_KEYS,
      ...CONSUMPTION_REAL_KEYS,
      "民間最終消費支出（名目）",
      "民間最終消費支出（実質）",
    ];

    // Project using imported toQuarterlyView (page.tsx:73-74)
    projectedQuarterlyReal = toQuarterlyView(quarterlyRealData, quarterlyKeys);
  });

  it("T0: sanity — source data loaded correctly", () => {
    expect(cleanData.length, "cleanData should be non-empty").toBeGreaterThan(0);
    expect(ctiData.length, "ctiData should be non-empty").toBeGreaterThan(0);
    expect(maxCpiDate.year, "maxCpiDate.year should be set").toBeGreaterThan(1994);
    expect(projectedQuarterlyReal.length, "projectedQuarterlyReal should have rows").toBeGreaterThan(0);

    // Verify raw monthly CTI data actually carries support-series values
    // (from cti_support_real.csv, before any quarterly aggregation/scaling).
    const rawSupportRows2005_2016 = ctiData.filter((d) => {
      const m = String(d.年月).match(/^(\d{4})年/);
      if (!m) return false;
      const y = parseInt(m[1], 10);
      return y >= 2005 && y <= 2016 && (d[SUPPORT_SERIES_KEY_REAL] as number) > 0;
    });
    expect(
      rawSupportRows2005_2016.length,
      "raw ctiData should have non-zero 民間最終消費支出（実質） rows for 2005-2016 before aggregation",
    ).toBeGreaterThan(0);

    // Log for reference
    console.log(
      `✓ Data loaded: cleanData=${cleanData.length}, ctiData=${ctiData.length}, maxCpiDate=${maxCpiDate.year}-${maxCpiDate.month}`,
    );
    console.log(`✓ Quarterly rows generated: ${projectedQuarterlyReal.length}`);
    console.log(`✓ Raw 2005-2016 rows with non-zero support value: ${rawSupportRows2005_2016.length}`);
  });

  it("T1: pipeline — 民間最終消費支出（実質） is not zero for 2005-2016 years", () => {
    /**
     * 回帰ガード（成功が期待値）。ローカル経路が壊れたときに赤くなる。商用再現は prod-payload.test.ts。
     * 失敗した場合はローカルのデータ経路が壊れたことを意味する（商用固有の問題ではない）。
     */
    const pre2017Data = projectedQuarterlyReal.filter(
      (d) => (d.年 as number) >= 2005 && (d.年 as number) <= 2016,
    );

    expect(pre2017Data.length, "should have 2005-2016 quarterly data").toBeGreaterThan(0);

    pre2017Data.forEach((d) => {
      const val = d[SUPPORT_SERIES_KEY_REAL] as number;
      expect(
        val,
        `REGRESSION: ${d.label} ${SUPPORT_SERIES_KEY_REAL} = ${val} (expected > 0, but got 0)`,
      ).toBeGreaterThan(0);
      expect(val, `${d.label}: should not be exactly 0`).not.toBe(0);
    });
  });

  it("T2: UI — SpendingBarChart renders with non-zero 民間最終消費支出（実質） for 2005-2016", () => {
    /**
     * 回帰ガード（成功が期待値）。ローカル経路が壊れたときに赤くなる。商用再現は prod-payload.test.ts。
     * Renders SpendingBarChart with the exact same props as CpiChart.tsx:344-370 (real consumption chart).
     * 失敗した場合はローカルの描画経路が壊れたことを意味する（商用固有の問題ではない）。
     */

    const pre2017Data = projectedQuarterlyReal.filter(
      (d) => (d.年 as number) >= 2005 && (d.年 as number) <= 2016,
    );

    // Build props identically to CpiChart.tsx:344-370 (real chart)
    const realColors = CONSUMPTION_REAL_KEYS.map(() => "#64748b");
    const chartColors = {
      barFill: "#94a3b8",
      gridStroke: "#e2e8f0",
      axisText: "#64748b",
      tooltipBg: "#1e293b",
      tooltipText: "#f1f5f9",
    };

    const { container } = render(
      <SpendingBarChart
        title="消費支出（実質）"
        data={pre2017Data}
        keys={[...CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_REAL]}
        colors={[...realColors, "#94a3b8"]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={chartColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        hideLegend
      />,
    );

    // Extract data from the BarChart mock
    const barchartEl = screen.getByTestId("barchart");
    const dataRows = JSON.parse(barchartEl.getAttribute("data-rows") || "[]");

    expect(dataRows.length, "BarChart should receive the filtered data").toBe(pre2017Data.length);

    // Check that each row has non-zero support series value
    dataRows.forEach((d: any) => {
      const val = d[SUPPORT_SERIES_KEY_REAL];
      expect(
        val,
        `REGRESSION UI: ${d.label} ${SUPPORT_SERIES_KEY_REAL} = ${val} (expected > 0 in BarChart data)`,
      ).toBeGreaterThan(0);
      expect(val, `${d.label}: should not be exactly 0 in rendered data`).not.toBe(0);
    });
  });

  it("T3: UI — 民間最終消費支出（実質） Bar series is rendered", () => {
    /**
     * Sanity check: verifies that the Bar component for SUPPORT_SERIES_KEY_REAL is even rendered.
     * (Separates cases where the series is missing entirely vs. has zero value.)
     */
    const pre2017Data = projectedQuarterlyReal.filter(
      (d) => (d.年 as number) >= 2005 && (d.年 as number) <= 2016,
    );

    const chartColors = {
      barFill: "#94a3b8",
      gridStroke: "#e2e8f0",
      axisText: "#64748b",
      tooltipBg: "#1e293b",
      tooltipText: "#f1f5f9",
    };

    render(
      <SpendingBarChart
        title="消費支出（実質）"
        data={pre2017Data}
        keys={[...CONSUMPTION_REAL_KEYS, SUPPORT_SERIES_KEY_REAL]}
        colors={[...CONSUMPTION_REAL_KEYS.map(() => "#64748b"), "#94a3b8"]}
        hiddenKeys={[]}
        onToggle={vi.fn()}
        chartColors={chartColors}
        isMobile={false}
        CustomTooltip={() => <div>Tooltip</div>}
        hiddenQuarters={[]}
        onToggleQuarter={vi.fn()}
        onReset={vi.fn()}
        hideLegend
      />,
    );

    // Check that Bar mock elements include SUPPORT_SERIES_KEY_REAL
    const bars = screen.getAllByTestId("bar-mock");
    const barKeys = bars.map((el) => el.getAttribute("data-key"));

    expect(barKeys, "Bar series list should include SUPPORT_SERIES_KEY_REAL").toContain(
      SUPPORT_SERIES_KEY_REAL,
    );
  });

  it("T4: diagnostic — 2005-2016 data distribution: all quarters must have non-zero values", () => {
    /**
     * 回帰ガード（成功が期待値）。ローカル経路が壊れたときに赤くなる。商用再現は prod-payload.test.ts。
     * Diagnostic: shows which quarters/years have zero values.
     * Used to determine if all 2005-2016 quarters are zero or only some.
     */
    const pre2017Data = projectedQuarterlyReal.filter(
      (d) => (d.年 as number) >= 2005 && (d.年 as number) <= 2016,
    );

    const yearQuarterData: Record<number, Record<number, number>> = {};

    pre2017Data.forEach((d) => {
      const year = d.年 as number;
      const quarter = d.quarter as number;
      const val = d[SUPPORT_SERIES_KEY_REAL] as number;

      if (!yearQuarterData[year]) {
        yearQuarterData[year] = {};
      }
      yearQuarterData[year][quarter] = val;
    });

    // Build diagnostic table
    const diagnosticLines: string[] = [];
    diagnosticLines.push("\n=== 民間最終消費支出（実質） Distribution ===");
    diagnosticLines.push("Year | Q1    | Q2    | Q3    | Q4    | Zero Count");
    diagnosticLines.push("-----|-------|-------|-------|-------|----------");

    let totalZeroCount = 0;

    for (let year = 2005; year <= 2016; year++) {
      const q1 = yearQuarterData[year]?.[1] ?? "-";
      const q2 = yearQuarterData[year]?.[2] ?? "-";
      const q3 = yearQuarterData[year]?.[3] ?? "-";
      const q4 = yearQuarterData[year]?.[4] ?? "-";
      const zeroCount = [q1, q2, q3, q4].filter((v) => v === 0).length;
      totalZeroCount += zeroCount;

      diagnosticLines.push(
        `${year} | ${String(q1).padEnd(5)} | ${String(q2).padEnd(5)} | ${String(q3).padEnd(5)} | ${String(q4).padEnd(5)} | ${zeroCount}`,
      );
    }

    diagnosticLines.push(`\nTotal zero values: ${totalZeroCount} / ${pre2017Data.length}`);
    const diagnosticReport = diagnosticLines.join("\n");

    console.log(diagnosticReport);

    // Assert: all quarters must have non-zero values
    expect(
      totalZeroCount,
      `REGRESSION DIAGNOSTIC: Found ${totalZeroCount} zero values (expected 0). Distribution:\n${diagnosticReport}`,
    ).toBe(0);
  });
});
