"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import type { CpiView, QuarterlyView, EarningsView } from "@/types/chart";
import { parseYearMonth } from "../../lib/yearMonth";
import styles from "./CpiChart.module.css";
import { ChartFilters } from "./ChartFilters";
import { SectionTabs } from "./SectionTabs";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useChartTooltipController } from "./charts/useChartTooltipProps";
import { useCpiChartData } from "../../hooks/useCpiChartData";
import { useCpiChartDisplayData } from "../../hooks/useCpiChartDisplayData";
import { useCagrState } from "../../hooks/useCagrState";
import { useToggleSet } from "../../hooks/useToggleSet";
import { useUrlState } from "../../hooks/useUrlState";
import { CpiChartSections } from "./CpiChartSections";
import { BottomSheet } from "./BottomSheet";
import { getChartInfoContent, type CpiChartInfoState } from "@/lib/chartInfoContent";

import {
  keyPairs,
  getColorForNominalKey,
  CONSUMPTION_REAL_KEYS,
  stackedKeys,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  targetKeys,
  MIN_DISPLAY_YEAR,
  getLegendLabel,
  EARNINGS_SERIES_REGISTRY,
  createComparisonSeriesRegistry,
  type SeriesMetadata,
} from "../../lib/chartConstants";
import {
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../lib/quarterlyPublicProjection";
import { DataTablesSection, type DataTableSpec } from "./DataTablesSection";
import { normalizeSpendingChartData } from "./SpendingBarChart";
import { getPublicSpendingKeys, normalizePublicChartData } from "./ChartDataContract";
import { CPI_CHART_SECTIONS } from "./cpiChartConfig";
import { useSectionNavigation } from "../../hooks/useSectionNavigation";

interface CpiChartProps {
  data: CpiView[];
  quarterlyNominalData: QuarterlyView[];
  quarterlyRealData: QuarterlyView[];
  totalEarningData: EarningsView[];
  maxCpiDate: { year: number; month: number };
  cpiInfoState?: CpiChartInfoState;
  consumptionSeriesState?: { status: "valid" | "invalid"; reason: string | null };
}

export default function CpiChart({
  data,
  quarterlyNominalData,
  quarterlyRealData,
  totalEarningData,
  cpiInfoState,
  consumptionSeriesState = { status: "invalid", reason: null },
}: CpiChartProps) {
  const { isMobile, chartColors } = useChartTheme();
  const cpiMajorInfo = getChartInfoContent("cpi-major", cpiInfoState);
  const stackedAreaInfo = getChartInfoContent("stacked-area", cpiInfoState);
  const consumptionInfo = getChartInfoContent("consumption-expenditure");
  const newGraphInfo = getChartInfoContent("new-graph");

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

  // 共有状態の所有者: useUrlState は URL の初期スナップショットを読み、
  // CpiChart はその値を live React state として所有する。同期方向は
  // URL -> 初期化時のReact state、React state -> URL (replaceState) のみ。
  // popstate による再読込や localStorage との競合解決は行わない。
  // 初期値がNaNやundefinedにならないよう、確実に数値(0含む)を返すように修正
  const initialStartYear = allYears.find((y) => y >= MIN_DISPLAY_YEAR) ?? allYears[0] ?? 2025;
  // The empty case is literal 2025 and the non-empty case indexes the final
  // Set entry, so both arms already produce a number.
  const initialEndYear = allYears.length > 0 ? allYears[allYears.length - 1] : 2025;

  const {
    from,
    to,
    hiddenKeys: urlHiddenKeys,
    updateUrl,
  } = useUrlState(initialStartYear, initialEndYear);

  const [startYear, setStartYear] = useState(from);
  const [endYear, setEndYear] = useState(to);

  // 表示・非表示を管理するステート。積み上げ系列だけがURLの hiddenを
  // 初期値として受け取り、変更後はURLへ返す。その他の凡例stateはReactのみ。
  const [hiddenKeys, handleLegendClick] = useToggleSet<string>();
  const [stackedHiddenKeys, handleStackedLegendClick, setStackedHiddenKeys] =
    useToggleSet<string>(urlHiddenKeys);
  const [maHiddenKeys, handleMaLegendClick] = useToggleSet<string>();

  // URL sync when state changes
  useEffect(() => {
    updateUrl(startYear, endYear, stackedHiddenKeys);
  }, [startYear, endYear, stackedHiddenKeys, updateUrl]);

  // 四半期の表示/非表示を管理するステート（消費支出グラフの Q1〜Q4 トグル用）
  const { hiddenQuarters, toggleQuarter } = useCpiChartData();
  const {
    chartData,
    filteredData,
    filteredQuarterlyNominalData,
    filteredQuarterlyRealData,
    mergedData,
    earningsData,
  } = useCpiChartDisplayData({
    data,
    quarterlyNominalData,
    quarterlyRealData,
    totalEarningData,
    startYear,
    endYear,
    hiddenQuarters,
  });

  const realKeys = CONSUMPTION_REAL_KEYS;
  // The quarterly nominal chart, table, tooltip and CSV expose the same ten
  // canonical expense keys for every period. Legacy aliases stay internal.
  const nominalKeysWithSupport = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
  const realKeysWithSupport = [...QUARTERLY_PUBLIC_REAL_KEYS];
  const nominalTableKeys = getPublicSpendingKeys(nominalKeysWithSupport);
  const realTableKeys = getPublicSpendingKeys(realKeysWithSupport);
  const nominalPublicData = normalizePublicChartData(
    normalizeSpendingChartData(
      filteredQuarterlyNominalData,
      nominalKeysWithSupport,
    ) as unknown as Record<string, unknown>[],
    nominalTableKeys,
  ) as unknown as QuarterlyView[];
  const realPublicData = normalizePublicChartData(
    normalizeSpendingChartData(filteredQuarterlyRealData, realKeysWithSupport) as unknown as Record<
      string,
      unknown
    >[],
    realTableKeys,
  ) as unknown as QuarterlyView[];
  // The chart, public contract, data table, and CSV all use the complete
  // selected quarterly projection.
  const nominalTableData = nominalPublicData;
  const realTableData = realPublicData;
  const nominalColorsWithSupport = nominalKeysWithSupport.map(getColorForNominalKey);
  const realColors = realKeys.map((key) => {
    const nominalKey = key.replace("（実質）", "（名目）");
    return getColorForNominalKey(nominalKey);
  });

  const [nominalHiddenKeys, setNominalHiddenKeys] = useState<string[]>([]);
  const [realHiddenKeys, setRealHiddenKeys] = useState<string[]>([]);

  const {
    cagrStartYear,
    cagrEndYear,
    cagrMonth,
    cagrResult,
    cagrError,
    setCagrStartYear,
    setCagrEndYear,
    setCagrMonth,
    calculateCAGR,
  } = useCagrState({
    initialStartYear,
    initialEndYear,
    chartData,
    stackedHiddenKeys,
    stackedKeys,
  });

  const handleQuarterLegendClick = (quarter: number) => {
    toggleQuarter(quarter);
  };

  const handleLegendToggle = (dataKey: string) => {
    if (dataKey === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY) {
      setRealHiddenKeys((prev) =>
        prev.includes(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
          ? prev.filter((key) => key !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
          : [...prev, CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY],
      );
      return;
    }
    // ペアを探す
    // The derived-total key returned above; all remaining CTI-prefixed keys
    // have a category captured by this expression.
    const adjustedCategory = dataKey.match(/^CTIミクロ調整系列（(.+)）$/)?.[1];
    const allPairs = [...keyPairs];

    const pair = adjustedCategory
      ? {
          nominal: dataKey,
          real: `${adjustedCategory}（実質）`,
          label: adjustedCategory,
        }
      : allPairs.find((p) => p.nominal === dataKey || p.real === dataKey);
    if (!pair) return;

    const nominalKey = pair.nominal;
    const realKey = pair.real;

    // adjustedCategory is captured only from the CTI key prefix, so its
    // nominalKey is already the canonical adjusted key and needs no alias.
    const nominalToggleKeys = [nominalKey];
    setNominalHiddenKeys((prev) => {
      const next = new Set(prev);
      const shouldHide = nominalToggleKeys.some((key) => !next.has(key));
      nominalToggleKeys.forEach((key) => (shouldHide ? next.add(key) : next.delete(key)));
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
  const sections = CPI_CHART_SECTIONS;

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
  const { activeId, handleSelectSection, isProgrammaticScroll } = useSectionNavigation({
    sections,
  });

  const { isTouch } = useChartTheme();
  const chartTooltip = useChartTooltipController({ suppressed: isProgrammaticScroll, isTouch });
  const invalidateChartTooltip = chartTooltip.invalidate;
  const tooltipInvalidationInputsRef = useRef<{
    data: CpiView[];
    quarterlyNominalData: QuarterlyView[];
    quarterlyRealData: QuarterlyView[];
    totalEarningData: EarningsView[];
    startYear: number;
    endYear: number;
    hiddenQuarters: number[];
    hiddenKeys: string[];
    stackedHiddenKeys: string[];
    nominalHiddenKeys: string[];
    realHiddenKeys: string[];
    maHiddenKeys: string[];
  } | null>(null);
  useEffect(() => {
    const previous = tooltipInvalidationInputsRef.current;
    const current = {
      data,
      quarterlyNominalData,
      quarterlyRealData,
      totalEarningData,
      startYear,
      endYear,
      hiddenQuarters,
      hiddenKeys,
      stackedHiddenKeys,
      nominalHiddenKeys,
      realHiddenKeys,
      maHiddenKeys,
    };
    tooltipInvalidationInputsRef.current = current;
    // A snapshot cannot exist before this component's first committed render.
    // Skipping the initial pass also makes the effect safe under Strict Mode's
    // repeated setup with unchanged inputs.
    if (!previous) return;
    if (
      previous.data === current.data &&
      previous.quarterlyNominalData === current.quarterlyNominalData &&
      previous.quarterlyRealData === current.quarterlyRealData &&
      previous.totalEarningData === current.totalEarningData &&
      previous.startYear === current.startYear &&
      previous.endYear === current.endYear &&
      previous.hiddenQuarters === current.hiddenQuarters &&
      previous.hiddenKeys === current.hiddenKeys &&
      previous.stackedHiddenKeys === current.stackedHiddenKeys &&
      previous.nominalHiddenKeys === current.nominalHiddenKeys &&
      previous.realHiddenKeys === current.realHiddenKeys &&
      previous.maHiddenKeys === current.maHiddenKeys
    ) {
      return;
    }
    invalidateChartTooltip();
  }, [
    invalidateChartTooltip,
    data,
    quarterlyNominalData,
    quarterlyRealData,
    totalEarningData,
    startYear,
    endYear,
    hiddenQuarters,
    hiddenKeys,
    stackedHiddenKeys,
    nominalHiddenKeys,
    realHiddenKeys,
    maHiddenKeys,
  ]);

  const comparisonSeriesRegistry = useMemo(
    () =>
      createComparisonSeriesRegistry({
        status: consumptionSeriesState.status,
        reason: consumptionSeriesState.reason,
      }),
    [consumptionSeriesState],
  );
  const ctiMetadata: readonly SeriesMetadata[] = (() => {
    const expense = nominalKeysWithSupport.flatMap((key, order) => {
      const row = nominalPublicData.find(
        (candidate) =>
          candidate.measurements !== undefined && candidate.measurements[key] !== undefined,
      );
      const measurement = row && row.measurements ? row.measurements[key] : undefined;
      if (!measurement) return [];
      return [
        {
          ...measurement,
          label: getLegendLabel(key),
          color: getColorForNominalKey(key),
          displayName: getLegendLabel(key),
          tooltipLabel: getLegendLabel(key),
          legendLabel: getLegendLabel(key),
          kind: "line",
          type: "line",
          order,
        } satisfies SeriesMetadata,
      ];
    });
    return expense;
  })();

  // The comparison registry is fixed to the three public comparison series.
  const visibleLineConfigs = comparisonSeriesRegistry;

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
      data: nominalTableData as unknown as Record<string, unknown>[],
      keys: nominalTableKeys,
      headers: nominalTableKeys.map(getLegendLabel),
      metadata: ctiMetadata,
    },
    {
      chartSectionId: "section-consumption-real",
      title: "消費支出（実質）",
      data: realTableData as unknown as Record<string, unknown>[],
      keys: realTableKeys,
      headers: realTableKeys.map(getLegendLabel),
    },
    {
      chartSectionId: "section-earnings",
      title: "給与指標と関連指標",
      data: earningsData as unknown as Record<string, unknown>[],
      keys: EARNINGS_SERIES_REGISTRY.map((c) => c.key),
      // Every entry in the fixed earnings registry declares displayName.
      headers: EARNINGS_SERIES_REGISTRY.map((c) => c.displayName!),
      metadata: EARNINGS_SERIES_REGISTRY,
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
      keys: visibleLineConfigs.map((c) => c.key),
      // createComparisonSeriesRegistry supplies displayName for every row.
      headers: visibleLineConfigs.map((c) => c.displayName!),
      metadata: comparisonSeriesRegistry,
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

      <BottomSheet
        open={rangeSheetOpen}
        title="表示期間の選択"
        onClose={() => setRangeSheetOpen(false)}
      >
        <ChartFilters
          allYears={allYears.filter((y) => y >= MIN_DISPLAY_YEAR)}
          startYear={startYear}
          endYear={endYear}
          setStartYear={handleSetStartYear}
          setEndYear={handleSetEndYear}
        />
      </BottomSheet>

      <CpiChartSections
        allYears={allYears}
        filteredData={filteredData}
        nominalPublicData={nominalPublicData}
        realPublicData={realPublicData}
        earningsData={earningsData}
        mergedData={mergedData}
        chartColors={chartColors}
        isMobile={isMobile}
        hiddenKeys={hiddenKeys}
        stackedHiddenKeys={stackedHiddenKeys}
        nominalHiddenKeys={nominalHiddenKeys}
        realHiddenKeys={realHiddenKeys}
        maHiddenKeys={maHiddenKeys}
        nominalColorsWithSupport={nominalColorsWithSupport}
        nominalKeysWithSupport={nominalKeysWithSupport}
        realKeysWithSupport={realKeysWithSupport}
        realColors={realColors}
        hiddenQuarters={hiddenQuarters}
        handleLegendClick={handleLegendClick}
        handleStackedLegendClick={handleStackedLegendClick}
        handleLegendToggle={handleLegendToggle}
        handleMaLegendClick={handleMaLegendClick}
        handleQuarterLegendClick={handleQuarterLegendClick}
        setStackedHiddenKeys={setStackedHiddenKeys}
        setNominalHiddenKeys={setNominalHiddenKeys}
        setRealHiddenKeys={setRealHiddenKeys}
        cagrStartYear={cagrStartYear}
        cagrEndYear={cagrEndYear}
        cagrMonth={cagrMonth}
        cagrResult={cagrResult}
        cagrError={cagrError}
        setCagrStartYear={setCagrStartYear}
        setCagrEndYear={setCagrEndYear}
        setCagrMonth={setCagrMonth}
        calculateCAGR={calculateCAGR}
        cpiMajorInfo={cpiMajorInfo}
        stackedAreaInfo={stackedAreaInfo}
        consumptionInfo={consumptionInfo}
        newGraphInfo={newGraphInfo}
        chartTooltip={chartTooltip}
        comparisonSeriesRegistry={comparisonSeriesRegistry}
        ctiMetadata={ctiMetadata}
      />
      {chartTooltip.drawer}
      <DataTablesSection tables={dataTables} />
    </div>
  );
}
