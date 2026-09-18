import { Suspense } from "react";
import {
  getCpiDataStatus,
  getCtiBasicConsumptionStatus,
  loadCpiData,
  loadTotalEarningData,
} from "../../server/lib/dataLoader";
import { toCpiView, toEarningsView } from "../../server/lib/view-models/dashboard";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";
import {
  targetKeys,
  stackedKeys,
  CTI_BASIC_RAW_KEY,
  CTI_BASIC_COMPARISON_KEY,
  LEGACY_CTI_COMPARISON_KEY,
} from "@/lib/chartConstants";

export const revalidate = false;

export default async function Page() {
  const [cleanData, totalEarningData, cpiDataStatus, ctiBasicStatus] = await Promise.all([
    loadCpiData(),
    loadTotalEarningData(),
    getCpiDataStatus(),
    getCtiBasicConsumptionStatus(),
  ]);
  const cpiInfoState =
    cpiDataStatus.baseYear === 2025
      ? {
          baseYear: 2025 as const,
          sourceMode: "official-long" as const,
          label: "2025年基準の公式接続指数",
        }
      : cpiDataStatus.baseYear === 2020
        ? {
            baseYear: 2020 as const,
            sourceMode: "fallback" as const,
            // 利用者向けの表示では、ファイル選択の内部用語を出さない。
            label: "2020年基準の互換データ",
          }
        : {
            baseYear: null,
            sourceMode: "unavailable" as const,
            label: "CPIデータは現在利用できません",
          };
  const cpiSummary =
    cpiInfoState.baseYear === null
      ? "CPIデータは現在利用できません。"
      : "各指標は2025年平均=100の指数で表示しています。凡例クリックで系列を切替可能。";
  const ctiInfoState = ctiBasicStatus.valid
    ? {
        baseYear: 2025 as const,
        sourceMode: "official-connected" as const,
        seriesLabel: "二人以上の世帯「消費支出（名目）」原数値",
        comparisonNormalization: "2025-annual-average" as const,
        status: "valid" as const,
        reason: null,
        baseline: ctiBasicStatus.baseline,
        artifactRoot: ctiBasicStatus.artifactRoot,
        artifactStatus: ctiBasicStatus.artifactStatus,
        artifactReason: ctiBasicStatus.artifactReason,
        source: "e-Stat 公式CTI長期artifact 000040499070" as const,
        unit: "指数" as const,
        series: {
          raw: {
            key: CTI_BASIC_RAW_KEY,
            valueType: "raw" as const,
            unit: "指数",
            source: "e-Stat 公式CTI長期artifact 000040499070",
            status: "valid" as const,
            reason: null,
          },
          comparison: {
            key: CTI_BASIC_COMPARISON_KEY,
            valueType: "comparison" as const,
            unit: "指数",
            source: "e-Stat 公式CTI長期artifact 000040499070",
            status: "valid" as const,
            reason: null,
          },
        },
      }
    : {
        baseYear: null,
        sourceMode: "unavailable" as const,
        unavailableReason: ctiBasicStatus.reason ?? "CTI長期系列を利用できません。",
        status: "invalid" as const,
        reason: ctiBasicStatus.reason,
        baseline: ctiBasicStatus.baseline,
        artifactRoot: ctiBasicStatus.artifactRoot,
        artifactStatus: ctiBasicStatus.artifactStatus,
        artifactReason: ctiBasicStatus.artifactReason,
        source: "e-Stat 公式CTI長期artifact 000040499070" as const,
        unit: "指数" as const,
        series: {
          raw: {
            key: CTI_BASIC_RAW_KEY,
            valueType: "raw" as const,
            unit: "指数",
            source: "e-Stat 公式CTI長期artifact 000040499070",
            status: "invalid" as const,
            reason: ctiBasicStatus.reason,
          },
          comparison: {
            key: CTI_BASIC_COMPARISON_KEY,
            valueType: "comparison" as const,
            unit: "指数",
            source: "e-Stat 公式CTI長期artifact 000040499070",
            status: "invalid" as const,
            reason: ctiBasicStatus.reason,
          },
        },
      };

  const {
    nominal: projectedQuarterlyNominal,
    real: projectedQuarterlyReal,
    maxCpiDate,
  } = await loadQuarterlyPublicData();

  const cpiKeys = [...targetKeys, ...stackedKeys];
  const earningsKeys = [
    "年月",
    "所定内給与",
    "所定外給与",
    "特別給与",
    "総合",
    "時間当たり給与",
    "15歳以上国民当たり給与",
    "残差",
    "所定内給与(12MA)",
    "所定外給与(12MA)",
    "特別給与(12MA)",
    "総合(12MA)",
    "CPI総合(参考)",
    "CPI総合(12MA)",
    CTI_BASIC_RAW_KEY,
    CTI_BASIC_COMPARISON_KEY,
    "CTIミクロ基本系列（名目・参考・延長）",
    LEGACY_CTI_COMPARISON_KEY,
  ];

  const projectedCpiData = toCpiView(cleanData, cpiKeys);
  const projectedEarningsData = toEarningsView(totalEarningData, earningsKeys);

  return (
    <div className={`container ${styles.pageWrapper}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>物価・賃金・消費の推移</h1>
        <p className={styles.description}>{cpiSummary}</p>
      </header>

      {projectedCpiData.length > 0 ? (
        <Suspense fallback={null}>
          <CpiChart
            data={projectedCpiData}
            quarterlyNominalData={projectedQuarterlyNominal}
            quarterlyRealData={projectedQuarterlyReal}
            totalEarningData={projectedEarningsData}
            maxCpiDate={maxCpiDate}
            cpiInfoState={cpiInfoState}
            ctiInfoState={ctiInfoState}
          />
        </Suspense>
      ) : (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage}>
            {cpiInfoState.baseYear === null
              ? "CPIデータは現在利用できません。"
              : "データの読み込みに失敗したか、データが空です。"}
          </p>
          <p className={styles.errorSubMessage}>
            {cpiInfoState.baseYear === null
              ? "CPIデータを確認中です。時間をおいて再度お試しください。"
              : "データを読み込めませんでした。時間をおいて再度お試しください。"}
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className={styles.errorSubMessage}>
              data/source/cpi_data2025_long.csv と
              data/source/cpi_data2025_long.metadata.json（利用できない場合は
              data/source/cpi_data.csv）を確認してください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
