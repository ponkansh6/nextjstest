"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CpiView, QuarterlyView, EarningsView } from "@/types/chart";
import { filterDataByYear, mergeChartData } from "../../lib/chartUtils";
import { parseYearMonth } from "../../lib/yearMonth";
import { adaptCpiViewToChartData, adaptEarningsViewToChartData } from "../../lib/chartAdapters";
import styles from "./CpiChart.module.css";
import { ChartFilters } from "./ChartFilters";
import { SectionTabs } from "./SectionTabs";
import { LazyMount } from "./LazyMount";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useChartTooltipProps } from "./charts/useChartTooltipProps";
import { useCpiChartData } from "../../hooks/useCpiChartData";
import { useToggleSet } from "../../hooks/useToggleSet";
import { useUrlState } from "../../hooks/useUrlState";
import { StackedAreaChart } from "./StackedAreaChart";
import { MajorIndicesChart } from "./MajorIndicesChart";
import { CagrPanel } from "./CagrPanel";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";

const SpendingBarChart = dynamic(
  () => import("./SpendingBarChart").then((m) => m.SpendingBarChart),
  {
    loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div>,
  },
);

const EarningsBreakdownChart = dynamic(
  () => import("./EarningsBreakdownChart").then((m) => m.EarningsBreakdownChart),
  {
    loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div>,
  },
);

const ResidualAreaChart = dynamic(
  () => import("./ResidualAreaChart").then((m) => m.ResidualAreaChart),
  {
    loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div>,
  },
);

const NewGraph = dynamic(() => import("./NewGraph").then((m) => m.NewGraph), {
  loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div>,
});
import { calculateCategorySum, calculateCAGRValue } from "../../lib/clientCalculations";
import { createDualResetHandler } from "../../lib/resetLogic";
import {
  colors,
  keyPairs,
  getColorForNominalKey,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  stackedColors,
  stackedKeys,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  targetKeys,
  MIN_DISPLAY_YEAR,
  getLegendLabel,
  EARNINGS_TABLE_CONFIGS,
  LINE_CONFIGS,
} from "../../lib/chartConstants";
import { DataTablesSection, type DataTableSpec } from "./DataTablesSection";

interface CpiChartProps {
  data: CpiView[];
  quarterlyNominalData: QuarterlyView[];
  quarterlyRealData: QuarterlyView[];
  totalEarningData: EarningsView[];
  maxCpiDate: { year: number; month: number };
}

export default function CpiChart({
  data,
  quarterlyNominalData,
  quarterlyRealData,
  totalEarningData,
  maxCpiDate: _maxCpiDate,
}: CpiChartProps) {
  const { isMobile, chartColors } = useChartTheme();

  // 全ての年を抽出
  const allYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach((item) => {
      const parsed = parseYearMonth(item.年月);
      if (parsed) {
        years.add(parsed.year);
      }
    });
    return [...years].toSorted((a, b) => a - b);
  }, [data]);

  // 表示範囲のステート
  // 初期値がNaNやundefinedにならないよう、確実に数値(0含む)を返すように修正
  const initialStartYear = allYears.find((y) => y >= MIN_DISPLAY_YEAR) ?? allYears[0] ?? 2025;
  const initialEndYear = (allYears.length > 0 ? allYears[allYears.length - 1] : 2025) ?? 2025;

  const {
    from,
    to,
    hiddenKeys: urlHiddenKeys,
    updateUrl,
  } = useUrlState(initialStartYear, initialEndYear);

  const [startYear, setStartYear] = useState(from);
  const [endYear, setEndYear] = useState(to);

  // 表示・非表示を管理するステート（初期値は全て表示）
  const [hiddenKeys, handleLegendClick] = useToggleSet<string>();
  const [stackedHiddenKeys, handleStackedLegendClick, setStackedHiddenKeys] =
    useToggleSet<string>(urlHiddenKeys);
  const [maHiddenKeys, handleMaLegendClick] = useToggleSet<string>();

  // URL sync when state changes
  useEffect(() => {
    updateUrl(startYear, endYear, stackedHiddenKeys);
  }, [startYear, endYear, stackedHiddenKeys, updateUrl]);

  // View Model 型をチャート計算用の内部型に統一
  const chartData = useMemo(() => adaptCpiViewToChartData(data), [data]);

  // ステートに基づいてデータをフィルタリング
  const filteredData = useMemo(
    () => filterDataByYear(chartData, startYear, endYear),
    [chartData, startYear, endYear],
  );

  const filteredTotalEarningData = useMemo(
    () => filterDataByYear(adaptEarningsViewToChartData(totalEarningData), startYear, endYear),
    [totalEarningData, startYear, endYear],
  );

  // 四半期の表示/非表示を管理するステート（消費支出グラフの Q1〜Q4 トグル用）
  const { hiddenQuarters, toggleQuarter } = useCpiChartData();

  // 四半期データのフィルタリング（消費支出グラフ用）
  // 年範囲だけでなく、Q1〜Q4 トグルで非表示にされた四半期の行も除外する
  const filteredQuarterlyNominalData = useMemo(
    () =>
      filterDataByYear(quarterlyNominalData, startYear, endYear).filter(
        (row) => !hiddenQuarters.includes(row.quarter),
      ),
    [quarterlyNominalData, startYear, endYear, hiddenQuarters],
  );

  const filteredQuarterlyRealData = useMemo(
    () =>
      filterDataByYear(quarterlyRealData, startYear, endYear).filter(
        (row) => !hiddenQuarters.includes(row.quarter),
      ),
    [quarterlyRealData, startYear, endYear, hiddenQuarters],
  );

  // データマッピングの統合: CPIと賃金データを年月で結合
  const mergedData = useMemo(
    () => mergeChartData(filteredTotalEarningData, chartData, startYear, endYear),
    [filteredTotalEarningData, chartData, startYear, endYear],
  );

  // 表示項目として mergedData を利用するため、明示的に参照を確保
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const displayData = mergedData;

  // 消費支出（参考）はサーバー側で12か月移動平均済みのため、そのまま表示する
  const earningsData = mergedData;

  const nominalKeys = CONSUMPTION_NOMINAL_KEYS;
  const realKeys = CONSUMPTION_REAL_KEYS;

  const nominalColors = nominalKeys.map(getColorForNominalKey);
  const nominalKeysWithSupport = [...nominalKeys, SUPPORT_SERIES_KEY_NOMINAL];
  const realKeysWithSupport = [...realKeys, SUPPORT_SERIES_KEY_REAL];
  const nominalColorsWithSupport = [...nominalColors, "#94a3b8"];
  const realColors = realKeys.map((key) => {
    const nominalKey = key.replace("（実質）", "（名目）");
    return getColorForNominalKey(nominalKey);
  });

  const [nominalHiddenKeys, setNominalHiddenKeys] = useState<string[]>([]);
  const [realHiddenKeys, setRealHiddenKeys] = useState<string[]>([]);

  // CAGR計算用のステート
  const [cagrStartYear, setCagrStartYear] = useState<number>(() => initialStartYear ?? 2025);
  const [cagrEndYear, setCagrEndYear] = useState<number>(() => initialEndYear ?? 2025);
  const [cagrMonth, setCagrMonth] = useState<number>(1);
  const [cagrResult, setCagrResult] = useState<number | null>(null);
  const [cagrError, setCagrError] = useState<string | null>(null);

  // 入力条件が変わったら結果をリセット（stale 防止）
  const [prevCagrDeps, setPrevCagrDeps] = useState({
    cagrStartYear,
    cagrEndYear,
    cagrMonth,
    stackedHiddenKeys,
  });
  if (
    prevCagrDeps.cagrStartYear !== cagrStartYear ||
    prevCagrDeps.cagrEndYear !== cagrEndYear ||
    prevCagrDeps.cagrMonth !== cagrMonth ||
    prevCagrDeps.stackedHiddenKeys !== stackedHiddenKeys
  ) {
    setPrevCagrDeps({ cagrStartYear, cagrEndYear, cagrMonth, stackedHiddenKeys });
    if (cagrResult !== null) {
      setCagrResult(null);
    }
  }

  const handleQuarterLegendClick = (quarter: number) => {
    toggleQuarter(quarter);
  };

  const handleLegendToggle = (dataKey: string) => {
    // ペアを探す
    const supportPair = {
      nominal: SUPPORT_SERIES_KEY_NOMINAL,
      real: SUPPORT_SERIES_KEY_REAL,
      label: "民間最終消費支出",
    };
    const allPairs = [...keyPairs, supportPair];

    const pair = allPairs.find((p) => p.nominal === dataKey || p.real === dataKey);
    if (!pair) return;

    const nominalKey = pair.nominal;
    const realKey = pair.real;

    setNominalHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nominalKey)) {
        next.delete(nominalKey);
      } else {
        next.add(nominalKey);
      }
      return Array.from(next);
    });

    setRealHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(realKey)) {
        next.delete(realKey);
      } else {
        next.add(realKey);
      }
      return Array.from(next);
    });
  };
  const sections = useMemo(
    () => [
      { id: "section-cpi-major", label: "CPI主要" },
      { id: "section-stacked", label: "CPI費目別" },
      { id: "section-cagr", label: "CPI年率" },
      { id: "section-consumption-nominal", label: "消費(名目)" },
      { id: "section-consumption-real", label: "消費(実質)" },
      { id: "section-earnings", label: "給与" },
      { id: "section-residual", label: "給与物価差" },
      { id: "section-new-graph", label: "3種比較" },
    ],
    [],
  );

  const [activeId, setActiveId] = useState(sections[0].id);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  // 開始年・終了年のどちらかを変更するのが主流のユースケースのため、
  // 値が変わった時点でボトムシートを自動的に閉じる
  const handleSetStartYear = (year: number) => {
    setStartYear(year);
    setRangeSheetOpen(false);
  };
  const handleSetEndYear = (year: number) => {
    setEndYear(year);
    setRangeSheetOpen(false);
  };
  // タブクリックで開始したスムーズスクロールの最中は true。アニメーション中も
  // window の scroll イベントは連続して発火し続けるため、この間 handleScroll が
  // 素通しで setActiveId を呼ぶと、SectionTabs 側の横スクロール追従 effect が
  // アニメーション途中で何度も再発火してしまう。WebKit(Safari)ではこれが原因で
  // 進行中の縦方向 smooth スクロールが中断され、目的のセクションまで届かずに
  // 止まってしまう不具合があった(実機のiPhone/Androidで確認)。
  const isProgrammaticScrollRef = useRef(false);
  const [tapNonce, setTapNonce] = useState(0);
  const [isProgrammaticScroll, setIsProgrammaticScroll] = useState(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endProgrammaticScroll = useCallback(() => {
    isProgrammaticScrollRef.current = false;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = setTimeout(() => {
      setIsProgrammaticScroll(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
    };
  }, []);

  const tooltipProps = useChartTooltipProps({
    resetKey: tapNonce,
    suppressed: isProgrammaticScroll,
  });
  const handleChartClick = () => setTapNonce((n) => n + 1);

  useEffect(() => {
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const scrollPos = window.scrollY + window.innerHeight * 0.4;
      for (const sec of sections) {
        const el = document.getElementById(sec.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveId(sec.id);
            break;
          }
        }
      }
    };
    const handleScrollEnd = () => {
      endProgrammaticScroll();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scrollend", handleScrollEnd);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [sections, endProgrammaticScroll]);

  const handleSelectSection = (id: string) => {
    setActiveId(id);
    // LazyMount配下のセクションはまだDOMに存在しない(IntersectionObserverで
    // 交差するまでプレースホルダーのみ)場合があり、その場合は data-lazy-section
    // を持つプレースホルダーへスクロールする。スクロールで近づくにつれて
    // IntersectionObserverが発火し、実コンテンツに差し替わる。
    const getTarget = () =>
      document.getElementById(id) ??
      document.querySelector<HTMLElement>(`[data-lazy-section="${id}"]`);
    const target = getTarget();
    if (!target) return;

    isProgrammaticScrollRef.current = true;
    setIsProgrammaticScroll(true);
    target.scrollIntoView({ behavior: "smooth", block: "start" });

    // 目的セクションより手前に未マウントの LazyMount セクションが挟まっている場合、
    // スクロールで近づくにつれてそれらが順に実コンテンツへ差し替わり、高さが変化する。
    // この高さ変化は scrollIntoView 呼び出し後に起きるため、単発の呼び出しだけでは
    // (特に遠く離れたタブへ直接ジャンプする場合)目的位置からずれてしまう。目的要素の
    // 位置が一定時間(約500ms)連続して安定するまで、現在位置を追跡して補正スクロール
    // する(最大約3秒でタイムアウトし、無限ループを防ぐ)。
    let lastTop = target.getBoundingClientRect().top;
    let stableFrames = 0;
    let framesElapsed = 0;
    const STABLE_FRAMES_THRESHOLD = 30;
    const MAX_FRAMES = 180;
    const chase = () => {
      framesElapsed++;
      const current = getTarget();
      if (!current) {
        requestAnimationFrame(chase);
        return;
      }
      const top = current.getBoundingClientRect().top;
      if (Math.abs(top - lastTop) > 1) {
        lastTop = top;
        stableFrames = 0;
        if (Math.abs(top) > 2) {
          current.scrollIntoView({ behavior: "auto", block: "start" });
        }
      } else {
        stableFrames++;
      }
      if (stableFrames >= STABLE_FRAMES_THRESHOLD || framesElapsed > MAX_FRAMES) {
        endProgrammaticScroll();
        return;
      }
      requestAnimationFrame(chase);
    };
    requestAnimationFrame(chase);
  };

  // CAGR計算関数
  const calculateCAGR = (): void => {
    setCagrError(null);

    // 状態が NaN の場合は初期値を適用する
    const startYear = isNaN(cagrStartYear) ? initialStartYear : cagrStartYear;
    const endYear = isNaN(cagrEndYear) ? initialEndYear : cagrEndYear;

    if (startYear === endYear) {
      setCagrError("異なる年を選択してください（同じ年は指定できません）。");
      return;
    }

    // クライアントライブラリの calculateCategorySum を使用
    let startValue = 0;
    try {
      startValue = calculateCategorySum(
        chartData,
        startYear,
        cagrMonth,
        stackedHiddenKeys,
        stackedKeys,
      );
    } catch {
      const monthStr = String(cagrMonth).padStart(2, "0");
      setCagrError(
        `開始年月のデータが見つかりません: ${startYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    let endValue = 0;
    try {
      endValue = calculateCategorySum(
        chartData,
        endYear,
        cagrMonth,
        stackedHiddenKeys,
        stackedKeys,
      );
    } catch {
      const monthStr = String(cagrMonth).padStart(2, "0");
      setCagrError(
        `終了年月のデータが見つかりません: ${endYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    const years = endYear - startYear;
    const cagr = calculateCAGRValue(startValue, endValue, years);
    setCagrResult(cagr);
  };

  const dataTables: DataTableSpec[] = [
    {
      chartSectionId: "section-cpi-major",
      title: "消費者物価指数（主要指数）",
      data: filteredData as unknown as Record<string, unknown>[],
      keys: targetKeys,
      headers: targetKeys.map(getLegendLabel),
    },
    {
      chartSectionId: "section-stacked",
      title: "物価指数 費目別寄与度",
      data: filteredData as unknown as Record<string, unknown>[],
      keys: stackedKeys,
      headers: stackedKeys.map(getLegendLabel),
    },
    {
      chartSectionId: "section-consumption-nominal",
      title: "消費支出（名目）",
      data: filteredQuarterlyNominalData as unknown as Record<string, unknown>[],
      keys: nominalKeysWithSupport,
      headers: nominalKeysWithSupport.map(getLegendLabel),
    },
    {
      chartSectionId: "section-consumption-real",
      title: "消費支出（実質）",
      data: filteredQuarterlyRealData as unknown as Record<string, unknown>[],
      keys: realKeysWithSupport,
      headers: realKeysWithSupport.map(getLegendLabel),
    },
    {
      chartSectionId: "section-earnings",
      title: "給与指標と関連指標",
      data: earningsData as unknown as Record<string, unknown>[],
      keys: EARNINGS_TABLE_CONFIGS.map((c) => c.key),
      headers: EARNINGS_TABLE_CONFIGS.map((c) => c.displayName ?? c.key),
    },
    {
      chartSectionId: "section-residual",
      title: "給与と物価の差(実質賃金相当)",
      data: mergedData as unknown as Record<string, unknown>[],
      keys: ["残差"],
      headers: ["残差"],
    },
    {
      chartSectionId: "section-new-graph",
      title: "給与・消費・物価の推移比較(12MA)",
      data: mergedData as unknown as Record<string, unknown>[],
      keys: LINE_CONFIGS.map((c) => c.key),
      headers: LINE_CONFIGS.map((c) => c.displayName),
    },
  ];

  return (
    <div className={styles.chartContainer}>
      <SectionTabs
        sections={sections}
        activeId={activeId}
        onSelect={handleSelectSection}
        rangeLabel={`${startYear}–${endYear}`}
        onRangeClick={() => setRangeSheetOpen(true)}
      />

      {rangeSheetOpen && (
        <>
          <div className={styles.rangeSheetBackdrop} onClick={() => setRangeSheetOpen(false)} />
          <div className={styles.rangeSheet}>
            <div className={styles.rangeSheetHeader}>
              <span className={styles.rangeSheetTitle}>表示期間の選択</span>
              <button
                type="button"
                className={styles.rangeSheetClose}
                onClick={() => setRangeSheetOpen(false)}
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            <ChartFilters
              allYears={allYears.filter((y) => y >= MIN_DISPLAY_YEAR)}
              startYear={startYear}
              endYear={endYear}
              setStartYear={handleSetStartYear}
              setEndYear={handleSetEndYear}
            />
          </div>
        </>
      )}

      {/* CPI 主要指数 */}
      <div
        id="section-cpi-major"
        className={styles.chartSection}
        style={{ scrollMarginTop: "5rem" }}
      >
        <h2 className={styles.chartTitle}>
          消費者物価指数（主要指数）
          <ChartInfoContentRenderer
            chartKey="cpi-major"
            ariaLabel="消費者物価指数のデータソースを表示"
          />
        </h2>
        <MajorIndicesChart
          data={filteredData}
          keys={targetKeys}
          colors={colors}
          hiddenKeys={hiddenKeys}
          onToggle={handleLegendClick}
          chartColors={chartColors}
          tooltipProps={tooltipProps}
          onClick={handleChartClick}
        />
        <p className={styles.chartNote}>
          <a href="#data-table-section-cpi-major">データテーブルを表示 ▾</a>
        </p>
      </div>

      {/* CPI 費目別積み上げ */}
      <StackedAreaChart
        title="物価指数 費目別寄与度"
        sectionId="section-stacked"
        data={filteredData}
        keys={stackedKeys}
        colors={stackedColors}
        hiddenKeys={stackedHiddenKeys}
        onToggle={handleStackedLegendClick}
        chartColors={chartColors}
        tooltipProps={tooltipProps}
        onClick={handleChartClick}
        onReset={() =>
          setStackedHiddenKeys((prev) =>
            prev.length === stackedKeys.length ? [] : [...stackedKeys],
          )
        }
      />

      <CagrPanel
        sectionId="section-cagr"
        allYears={allYears}
        cagrStartYear={cagrStartYear}
        cagrEndYear={cagrEndYear}
        cagrMonth={cagrMonth}
        cagrResult={cagrResult}
        cagrError={cagrError}
        setCagrStartYear={setCagrStartYear}
        setCagrEndYear={setCagrEndYear}
        setCagrMonth={setCagrMonth}
        calculateCAGR={calculateCAGR}
      />

      <LazyMount sectionId="section-consumption-nominal">
        <SpendingBarChart
          title="消費支出（名目）"
          sectionId="section-consumption-nominal"
          infoKey="consumption-expenditure"
          data={filteredQuarterlyNominalData}
          keys={nominalKeysWithSupport}
          colors={nominalColorsWithSupport}
          hiddenKeys={nominalHiddenKeys}
          onToggle={handleLegendToggle}
          chartColors={chartColors}
          tooltipProps={tooltipProps}
          onClick={handleChartClick}
          hiddenQuarters={hiddenQuarters}
          onToggleQuarter={handleQuarterLegendClick}
          onReset={createDualResetHandler(
            {
              hiddenKeys: nominalHiddenKeys,
              allKeys: nominalKeysWithSupport,
              setHiddenKeys: setNominalHiddenKeys,
            },
            {
              hiddenKeys: realHiddenKeys,
              allKeys: realKeysWithSupport,
              setHiddenKeys: setRealHiddenKeys,
            },
          )}
          testId="spending-chart-nominal"
        />
      </LazyMount>

      <LazyMount sectionId="section-consumption-real">
        <SpendingBarChart
          title="消費支出（実質）"
          sectionId="section-consumption-real"
          infoKey="consumption-expenditure"
          data={filteredQuarterlyRealData}
          keys={realKeysWithSupport}
          colors={[...realColors, "#94a3b8"]}
          hiddenKeys={realHiddenKeys}
          onToggle={handleLegendToggle}
          chartColors={chartColors}
          tooltipProps={tooltipProps}
          onClick={handleChartClick}
          hiddenQuarters={hiddenQuarters}
          onToggleQuarter={handleQuarterLegendClick}
          onReset={createDualResetHandler(
            {
              hiddenKeys: nominalHiddenKeys,
              allKeys: nominalKeysWithSupport,
              setHiddenKeys: setNominalHiddenKeys,
            },
            {
              hiddenKeys: realHiddenKeys,
              allKeys: realKeysWithSupport,
              setHiddenKeys: setRealHiddenKeys,
            },
          )}
          hideLegend
          linkedSectionId="section-consumption-nominal"
          testId="spending-chart-real"
        />
      </LazyMount>

      <LazyMount sectionId="section-earnings">
        <EarningsBreakdownChart
          sectionId="section-earnings"
          data={earningsData}
          hiddenKeys={hiddenKeys}
          onToggle={handleLegendClick}
          chartColors={chartColors}
          isMobile={isMobile}
          tooltipProps={tooltipProps}
          onClick={handleChartClick}
        />
      </LazyMount>

      <LazyMount sectionId="section-residual">
        <ResidualAreaChart
          sectionId="section-residual"
          data={mergedData}
          chartColors={chartColors}
          tooltipProps={tooltipProps}
          onClick={handleChartClick}
        />
      </LazyMount>

      <LazyMount sectionId="section-new-graph">
        <NewGraph
          sectionId="section-new-graph"
          data={mergedData}
          hiddenKeys={maHiddenKeys}
          onToggle={handleMaLegendClick}
          chartColors={chartColors}
          isMobile={isMobile}
          chartKey="new-graph"
          tooltipProps={tooltipProps}
          onClick={handleChartClick}
        />
      </LazyMount>

      <DataTablesSection tables={dataTables} />
    </div>
  );
}
