"use client";

import React, { useMemo, useState, useEffect } from "react";
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
import { useAdvancedPreference } from "../../hooks/useAdvancedPreference";
import { CpiChartSections } from "./CpiChartSections";
import { BottomSheet } from "./BottomSheet";
import {
  getChartInfoContent,
  type CpiChartInfoState,
  type CtiChartInfoState,
} from "@/lib/chartInfoContent";

import {
  keyPairs,
  getColorForNominalKey,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  stackedKeys,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  targetKeys,
  MIN_DISPLAY_YEAR,
  getLegendLabel,
  EARNINGS_SERIES_REGISTRY,
  createComparisonSeriesRegistry,
  ctiBasicDescriptors,
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
  ctiInfoState?: CtiChartInfoState;
}

export default function CpiChart({
  data,
  quarterlyNominalData,
  quarterlyRealData,
  totalEarningData,
  maxCpiDate: _maxCpiDate,
  cpiInfoState,
  ctiInfoState,
}: CpiChartProps) {
  const { isMobile, chartColors } = useChartTheme();
  const cpiMajorInfo = getChartInfoContent("cpi-major", cpiInfoState);
  const stackedAreaInfo = getChartInfoContent("stacked-area", cpiInfoState);
  const consumptionInfo = getChartInfoContent("consumption-expenditure", undefined, ctiInfoState);
  const newGraphInfo = getChartInfoContent("new-graph", undefined, ctiInfoState);

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
  const initialEndYear = (allYears.length > 0 ? allYears[allYears.length - 1] : 2025) ?? 2025;

  const {
    from,
    to,
    hiddenKeys: urlHiddenKeys,
    adv,
    updateUrl,
  } = useUrlState(initialStartYear, initialEndYear);

  const [startYear, setStartYear] = useState(from);
  const [endYear, setEndYear] = useState(to);
  // 初期表示は URL の ?adv=1 のみで判定する（R11c）。
  // localStorage は過去のセッションの値を保持しているだけなので、
  // ここで読み込むと ?adv=1 の付かない通常アクセス時にも
  // 前回 ON にした状態が復元され、adv=1 が勝手に URL へ書き戻されてしまう。
  const [showAdvanced, setShowAdvanced] = useState<boolean>(adv);

  // 表示・非表示を管理するステート。積み上げ系列だけがURLの hiddenを
  // 初期値として受け取り、変更後はURLへ返す。その他の凡例stateはReactのみ。
  const [hiddenKeys, handleLegendClick] = useToggleSet<string>();
  const [stackedHiddenKeys, handleStackedLegendClick, setStackedHiddenKeys] =
    useToggleSet<string>(urlHiddenKeys);
  const [maHiddenKeys, handleMaLegendClick] = useToggleSet<string>();

  useAdvancedPreference(showAdvanced, startYear, endYear, stackedHiddenKeys);

  // URL sync when state changes
  useEffect(() => {
    updateUrl(startYear, endYear, stackedHiddenKeys, showAdvanced);
  }, [startYear, endYear, stackedHiddenKeys, showAdvanced, updateUrl]);

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

  const nominalKeys = CONSUMPTION_NOMINAL_KEYS;
  const realKeys = CONSUMPTION_REAL_KEYS;
  const nominalColors = nominalKeys.map(getColorForNominalKey);
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
  const nominalColorsWithSupport = [...nominalColors, "#94a3b8", "#475569", "#0f766e"];
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

  const comparisonSeriesRegistry = useMemo(
    () =>
      createComparisonSeriesRegistry({
        status: ctiInfoState?.series?.comparison?.status ?? ctiInfoState?.status ?? "invalid",
        reason:
          ctiInfoState?.series?.comparison?.reason ??
          ctiInfoState?.reason ??
          ctiInfoState?.unavailableReason ??
          "CTI基本系列の状態が未提供です",
      }),
    [ctiInfoState],
  );
  const ctiMetadata = useMemo(() => {
    const fallbackMeasurement = mergedData.find((row) => {
      const measurements = (
        row as unknown as {
          measurements?: Record<string, { status?: "valid" | "invalid"; reason?: string | null }>;
        }
      ).measurements;
      return measurements?.["CTIミクロ基本系列（名目・原数値）"];
    }) as unknown as
      | { measurements?: Record<string, { status?: "valid" | "invalid"; reason?: string | null }> }
      | undefined;
    const fallback = fallbackMeasurement?.measurements?.["CTIミクロ基本系列（名目・原数値）"];
    const status = ctiInfoState?.status ?? fallback?.status ?? "invalid";
    const reason =
      status === "valid"
        ? null
        : (ctiInfoState?.reason ??
          fallback?.reason ??
          ctiInfoState?.unavailableReason ??
          "CTI基本系列の状態が未提供です");
    return ctiBasicDescriptors(status, reason).map((descriptor, index) => ({
      ...descriptor,
      color: index === 0 ? "#0f766e" : index === 1 ? "#2563eb" : "#7dd3fc",
      displayName: descriptor.label,
    }));
  }, [ctiInfoState, mergedData]);

  const visibleLineConfigs = useMemo(
    () => comparisonSeriesRegistry.filter((c) => !c.advanced || showAdvanced),
    [comparisonSeriesRegistry, showAdvanced],
  );

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
      headers: EARNINGS_SERIES_REGISTRY.map((c) => c.displayName ?? c.label ?? c.key),
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
      headers: visibleLineConfigs.map((c) => c.displayName),
      metadata: ctiMetadata,
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
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
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
      <DataTablesSection tables={dataTables} />
    </div>
  );
}
