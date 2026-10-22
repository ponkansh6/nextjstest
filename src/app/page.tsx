import { Suspense } from "react";
import { getCpiDataStatus, loadCpiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { toCpiView, toEarningsView } from "../../server/lib/view-models/dashboard";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";
import { getCpiUnavailableLabel } from "@/lib/chartInfoContent";
import {
  targetKeys,
  stackedKeys,
  CTI_BASIC_RAW_KEY,
  CONSUMPTION_TOTAL_12MA_KEY,
} from "@/lib/chartConstants";

export const revalidate = false;

export default async function Page() {
  const [cleanData, totalEarningData, cpiDataStatus] = await Promise.all([
    loadCpiData(),
    loadTotalEarningData(),
    getCpiDataStatus(),
  ]);
  const consumptionMeasurement = totalEarningData
    .map(
      (row) =>
        (
          row as typeof row & {
            measurements?: Record<
              string,
              {
                source?: string;
                seriesStatus?: "valid" | "invalid";
                seriesReason?: string | null;
              }
            >;
          }
        ).measurements?.[CONSUMPTION_TOTAL_12MA_KEY],
    )
    .find((measurement) => measurement !== undefined);
  const consumptionSeriesState = {
    status: consumptionMeasurement?.seriesStatus ?? "invalid",
    reason: consumptionMeasurement?.seriesReason ?? null,
  } as const;
  const cpiInfoState =
    cpiDataStatus.baseYear === 2025
      ? {
          baseYear: 2025 as const,
          sourceMode: "official-long" as const,
          label: "2025年基準の公式接続指数",
        }
      : {
          baseYear: null,
          sourceMode: "unavailable" as const,
          label: getCpiUnavailableLabel(cpiDataStatus.reason),
          reason: cpiDataStatus.reason ?? null,
        };
  const cpiSummary =
    cpiInfoState.baseYear === null
      ? (cpiInfoState.label ?? "CPIデータは現在利用できません。")
      : "CPIは2025年基準の公式接続指数です。賃金・消費などは各系列の公表基準または比較用の正規化契約に基づいています。凡例から表示系列を切り替えられます。";
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
    CONSUMPTION_TOTAL_12MA_KEY,
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
            consumptionSeriesState={consumptionSeriesState}
          />
        </Suspense>
      ) : (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage}>
            {cpiInfoState.baseYear === null
              ? (cpiInfoState.label ?? "CPIデータは現在利用できません。")
              : "データの読み込みに失敗したか、データが空です。"}
          </p>
          <p className={styles.errorSubMessage}>
            {cpiInfoState.baseYear === null
              ? "CPIデータを確認中です。時間をおいて再度お試しください。"
              : "データを読み込めませんでした。時間をおいて再度お試しください。"}
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className={styles.errorSubMessage}>
              data/source/cpi_data2025_long.csv と data/source/cpi_data2025_long.metadata.json
              を確認してください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
