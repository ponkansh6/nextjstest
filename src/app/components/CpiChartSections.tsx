"use client";

import dynamic from "next/dynamic";
import type { Dispatch, SetStateAction } from "react";
import type { QuarterlyView } from "@/types/chart";
import type { CpiData } from "@/types";
import { createDualResetHandler } from "../../lib/resetLogic";
import {
  colors,
  stackedColors,
  stackedKeys,
  targetKeys,
  buildCpiTooltipMetadata,
  getLegendLabel,
  EARNINGS_SERIES_REGISTRY,
  EARNINGS_TOTAL_KEYS,
  EARNINGS_AUXILIARY_KEYS,
  type SeriesMetadata,
  type TooltipSeriesProjection,
  projectTooltipMetadata,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../lib/chartConstants";
import { formatCpiTooltipTotal, formatCpiTooltipValue } from "./CustomTooltip";
import { useChartTooltipController } from "./charts/useChartTooltipProps";
import { LazyMount } from "./LazyMount";
import { MajorIndicesChart } from "./MajorIndicesChart";
import { StackedAreaChart } from "./StackedAreaChart";
import { CagrPanel } from "./CagrPanel";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import styles from "./CpiChart.module.css";
import type { ChartInfoContent } from "@/lib/chartInfoContent";

const SpendingBarChart = dynamic(
  () => import("./SpendingBarChart").then((m) => m.SpendingBarChart),
  { loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div> },
);
const EarningsBreakdownChart = dynamic(
  () => import("./EarningsBreakdownChart").then((m) => m.EarningsBreakdownChart),
  { loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div> },
);
const ResidualAreaChart = dynamic(
  () => import("./ResidualAreaChart").then((m) => m.ResidualAreaChart),
  { loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div> },
);
const NewGraph = dynamic(() => import("./NewGraph").then((m) => m.NewGraph), {
  loading: () => <div className={styles.chartSkeleton}>グラフを読み込み中…</div>,
});

type ChartTooltipController = ReturnType<typeof useChartTooltipController>;

interface CpiChartSectionsProps {
  allYears: number[];
  filteredData: CpiData[];
  nominalPublicData: QuarterlyView[];
  realPublicData: QuarterlyView[];
  earningsData: CpiData[];
  mergedData: CpiData[];
  chartColors: Record<string, string>;
  isMobile: boolean;
  hiddenKeys: string[];
  stackedHiddenKeys: string[];
  nominalHiddenKeys: string[];
  realHiddenKeys: string[];
  maHiddenKeys: string[];
  nominalColorsWithSupport: string[];
  nominalKeysWithSupport: string[];
  realKeysWithSupport: string[];
  realColors: string[];
  hiddenQuarters: number[];
  showAdvanced: boolean;
  setShowAdvanced: Dispatch<SetStateAction<boolean>>;
  handleLegendClick: (key: string) => void;
  handleStackedLegendClick: (key: string) => void;
  handleLegendToggle: (key: string) => void;
  handleMaLegendClick: (key: string) => void;
  handleQuarterLegendClick: (quarter: number) => void;
  setStackedHiddenKeys: Dispatch<SetStateAction<string[]>>;
  setNominalHiddenKeys: Dispatch<SetStateAction<string[]>>;
  setRealHiddenKeys: Dispatch<SetStateAction<string[]>>;
  cagrStartYear: number;
  cagrEndYear: number;
  cagrMonth: number;
  cagrResult: number | null;
  cagrError: string | null;
  setCagrStartYear: Dispatch<SetStateAction<number>>;
  setCagrEndYear: Dispatch<SetStateAction<number>>;
  setCagrMonth: Dispatch<SetStateAction<number>>;
  calculateCAGR: () => void;
  cpiMajorInfo?: ChartInfoContent;
  stackedAreaInfo?: ChartInfoContent;
  consumptionInfo?: ChartInfoContent;
  newGraphInfo?: ChartInfoContent;
  chartTooltip: ChartTooltipController;
  comparisonSeriesRegistry: readonly SeriesMetadata[];
  ctiMetadata: readonly SeriesMetadata[];
}

export function CpiChartSections({
  allYears,
  filteredData,
  nominalPublicData,
  realPublicData,
  earningsData,
  mergedData,
  chartColors,
  isMobile,
  hiddenKeys,
  stackedHiddenKeys,
  nominalHiddenKeys,
  realHiddenKeys,
  maHiddenKeys,
  nominalColorsWithSupport,
  nominalKeysWithSupport,
  realKeysWithSupport,
  realColors,
  hiddenQuarters,
  showAdvanced,
  setShowAdvanced,
  handleLegendClick,
  handleStackedLegendClick,
  handleLegendToggle,
  handleMaLegendClick,
  handleQuarterLegendClick,
  setStackedHiddenKeys,
  setNominalHiddenKeys,
  setRealHiddenKeys,
  cagrStartYear,
  cagrEndYear,
  cagrMonth,
  cagrResult,
  cagrError,
  setCagrStartYear,
  setCagrEndYear,
  setCagrMonth,
  calculateCAGR,
  cpiMajorInfo,
  stackedAreaInfo,
  consumptionInfo,
  newGraphInfo,
  chartTooltip,
  comparisonSeriesRegistry,
  ctiMetadata,
}: CpiChartSectionsProps) {
  const stackedTooltipMeta = buildCpiTooltipMetadata(
    stackedKeys.filter((key) => !stackedHiddenKeys.includes(key)),
  );
  const earningsTooltipMeta = projectTooltipMetadata(
    EARNINGS_SERIES_REGISTRY,
    EARNINGS_SERIES_REGISTRY.filter(({ key }) => !hiddenKeys.includes(key)).map(({ key }) => key),
  );
  const comparisonVisibleKeys = comparisonSeriesRegistry
    .filter(({ advanced }) => !advanced || showAdvanced)
    .filter(({ key }) => !maHiddenKeys.includes(key))
    .map(({ key }) => key);
  const comparisonProjectedTooltipMeta = projectTooltipMetadata(
    comparisonSeriesRegistry,
    comparisonVisibleKeys,
  );
  const comparisonTooltipAllowedKeys = (label?: string) => {
    const period = typeof label === "string" ? label.match(/^(\d{4})Q([1-4])$/) : null;
    if (!period) return comparisonVisibleKeys;
    return comparisonVisibleKeys.filter((key) => key === "CPI総合(12MA)" || key === "総合(12MA)");
  };
  const spendingTooltipMeta = (keys: string[], chartColorsForSeries: string[]) =>
    keys.map((key, order): TooltipSeriesProjection => ({
      key,
      label: getLegendLabel(key),
      color:
        key === SUPPORT_SERIES_KEY_NOMINAL || key === SUPPORT_SERIES_KEY_REAL
          ? chartColors.barFill
          : chartColorsForSeries[order],
      order,
      ...ctiMetadata.find((metadata) => metadata.key === key),
    }));
  const spendingAllowedKeys = (keys: string[], hidden: string[]) => (label?: string) => {
    const period = typeof label === "string" ? label.match(/^(\d{4})Q[1-4]$/) : null;
    if (!period) return [];
    return keys.filter((key) => !hidden.includes(key));
  };
  return (
    <>
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
            content={cpiMajorInfo}
          />
        </h2>
        <MajorIndicesChart
          data={filteredData}
          keys={targetKeys}
          colors={colors}
          hiddenKeys={hiddenKeys}
          onToggle={handleLegendClick}
          chartColors={chartColors}
          {...chartTooltip.bind("section-cpi-major")}
        />
        <p className={styles.chartNote}>
          <a href="#data-table-section-cpi-major">データテーブルを表示 ▾</a>
        </p>
      </div>

      <StackedAreaChart
        title="物価指数 費目別寄与度"
        sectionId="section-stacked"
        data={filteredData}
        keys={stackedKeys}
        colors={stackedColors}
        hiddenKeys={stackedHiddenKeys}
        onToggle={handleStackedLegendClick}
        chartColors={chartColors}
        chartInfoContent={stackedAreaInfo}
        {...chartTooltip.bind("section-stacked", {
          showTotal: true,
          showAllPayload: true,
          seriesMeta: stackedTooltipMeta,
          valueFormatter: formatCpiTooltipValue,
          totalFormatter: formatCpiTooltipTotal,
        })}
        onReset={() =>
          setStackedHiddenKeys((prev) =>
            prev.length === stackedKeys.length ? [] : [...stackedKeys],
          )
        }
        belowChartSlot={
          <CagrPanel
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
        }
      />

      <LazyMount sectionId="section-consumption-nominal">
        <SpendingBarChart
          title="消費支出（名目）"
          sectionId="section-consumption-nominal"
          infoKey="consumption-expenditure"
          chartInfoContent={consumptionInfo}
          data={nominalPublicData}
          keys={nominalKeysWithSupport}
          colors={nominalColorsWithSupport}
          hiddenKeys={nominalHiddenKeys}
          onToggle={handleLegendToggle}
          chartColors={chartColors}
          {...chartTooltip.bind("section-consumption-nominal", {
            showTotal: true,
            showAllPayload: true,
            seriesMeta: spendingTooltipMeta(nominalKeysWithSupport, nominalColorsWithSupport),
            allowedKeys: spendingAllowedKeys(nominalKeysWithSupport, nominalHiddenKeys),
          })}
          isMobile={isMobile}
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
          legendMode={isMobile ? "collapsible" : "expanded"}
          testId="spending-chart-nominal"
          descriptors={ctiMetadata}
        />
      </LazyMount>
      <LazyMount sectionId="section-consumption-real">
        <SpendingBarChart
          title="消費支出（実質）"
          sectionId="section-consumption-real"
          linkedSectionId="section-consumption-nominal"
          infoKey="consumption-expenditure"
          chartInfoContent={consumptionInfo}
          data={realPublicData}
          keys={realKeysWithSupport}
          colors={[...realColors, "#94a3b8", "#475569", "#0f766e"]}
          hiddenKeys={realHiddenKeys}
          onToggle={handleLegendToggle}
          chartColors={chartColors}
          {...chartTooltip.bind("section-consumption-real", {
            showTotal: true,
            showAllPayload: true,
            seriesMeta: spendingTooltipMeta(realKeysWithSupport, [...realColors, "#94a3b8"]),
            allowedKeys: spendingAllowedKeys(realKeysWithSupport, realHiddenKeys),
          })}
          isMobile={isMobile}
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
          legendMode="collapsible"
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
          {...chartTooltip.bind("section-earnings", {
            showTotal: true,
            totalLabel: "給与区分合計（所定内＋所定外＋特別）",
            totalIncludedKeys: EARNINGS_TOTAL_KEYS,
            separatorBetweenGroups: {
              firstGroupKeys: EARNINGS_TOTAL_KEYS,
              secondGroupKeys: EARNINGS_AUXILIARY_KEYS,
            },
            showAllPayload: true,
            seriesMeta: earningsTooltipMeta,
          })}
        />
      </LazyMount>
      <LazyMount sectionId="section-residual">
        <ResidualAreaChart
          sectionId="section-residual"
          data={mergedData}
          chartColors={chartColors}
          {...chartTooltip.bind("section-residual")}
        />
      </LazyMount>
      <LazyMount sectionId="section-new-graph">
        <NewGraph
          sectionId="section-new-graph"
          comparisonSeriesRegistry={comparisonSeriesRegistry}
          ctiMetadata={ctiMetadata}
          data={mergedData}
          hiddenKeys={maHiddenKeys}
          onToggle={handleMaLegendClick}
          chartColors={chartColors}
          isMobile={isMobile}
          chartKey="new-graph"
          chartInfoContent={newGraphInfo}
          showAdvanced={showAdvanced}
          advancedToggle={
            <div
              style={{
                marginTop: "1rem",
                borderTop: "1px solid var(--border, #e2e8f0)",
                paddingTop: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                参考・延長系列
              </div>
              <label
                htmlFor="adv-toggle"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                <input
                  id="adv-toggle"
                  type="checkbox"
                  checked={showAdvanced}
                  onChange={(e) => setShowAdvanced(e.target.checked)}
                />
                <span>参考・延長系列を表示する</span>
              </label>
            </div>
          }
          {...chartTooltip.bind("section-new-graph", {
            dataLength: mergedData.length,
            seriesMeta: comparisonProjectedTooltipMeta,
            allowedKeys: comparisonTooltipAllowedKeys,
          })}
        />
      </LazyMount>
    </>
  );
}
