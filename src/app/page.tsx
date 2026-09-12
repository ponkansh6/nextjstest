import { Suspense } from "react";
import { loadCpiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import {
  getCpiDataStatus,
  getCtiDataStatus,
  getGdpSupportStatus,
  getQuarterlyGdpSupportStatus,
} from "../../server/lib/data-loader/cpi";
import { toCpiView, toEarningsView } from "../../server/lib/view-models/dashboard";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";
import { targetKeys, stackedKeys } from "@/lib/chartConstants";

export const revalidate = false;

function getGdpInfoReason(reason: string | undefined): string {
  // Validation reasons are deliberately precise for server diagnostics. Keep
  // implementation terms out of the information panel.
  return reason
    ? "GDP比較に必要な2025年の四半期値または確認情報がそろっていません。"
    : "GDP比較に必要なデータを確認中です。";
}

export default async function Page() {
  const [
    cleanData,
    totalEarningData,
    cpiDataStatus,
    ctiDataStatus,
    gdpSupportStatus,
    quarterlyGdpSupportStatus,
  ] = await Promise.all([
    loadCpiData(),
    loadTotalEarningData(),
    getCpiDataStatus(),
    getCtiDataStatus(),
    getGdpSupportStatus(),
    getQuarterlyGdpSupportStatus(),
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
      : `CPIは${cpiInfoState.label}を使用しています。`;
  const ctiInfoState =
    ctiDataStatus.valid && ctiDataStatus.baseYear === 2025
      ? {
          baseYear: 2025 as const,
          sourceMode: "official-connected" as const,
        }
      : ctiDataStatus.valid && ctiDataStatus.baseYear === 2020
        ? {
            baseYear: 2020 as const,
            sourceMode: "rollback" as const,
          }
        : {
            baseYear: null,
            sourceMode: "unavailable" as const,
          };
  const gdpInfoState = gdpSupportStatus.valid
    ? {
        availability: "available" as const,
        displayNormalizationYear: 2025 as const,
        quarterlyStatus: {
          availability: quarterlyGdpSupportStatus.valid
            ? quarterlyGdpSupportStatus.comparisonReady
              ? ("available" as const)
              : ("pending" as const)
            : ("unavailable" as const),
          comparisonReady: quarterlyGdpSupportStatus.comparisonReady,
          granularity: "quarterly" as const,
          independentConfirmation: quarterlyGdpSupportStatus.independentConfirmation,
          reason: quarterlyGdpSupportStatus.reason,
        },
      }
    : {
        availability: "unavailable" as const,
        reason: getGdpInfoReason(gdpSupportStatus.reason),
        quarterlyStatus: {
          availability: quarterlyGdpSupportStatus.valid
            ? quarterlyGdpSupportStatus.comparisonReady
              ? ("available" as const)
              : ("pending" as const)
            : ("unavailable" as const),
          comparisonReady: quarterlyGdpSupportStatus.comparisonReady,
          granularity: "quarterly" as const,
          independentConfirmation: quarterlyGdpSupportStatus.independentConfirmation,
          reason: quarterlyGdpSupportStatus.reason,
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
    "消費支出（参考）",
    "民間最終消費支出（参考）",
    "民間最終消費支出（参考・延長）",
    "CTI消費支出（参考）",
  ];

  const projectedCpiData = toCpiView(cleanData, cpiKeys);
  const projectedEarningsData = toEarningsView(totalEarningData, earningsKeys);

  return (
    <div className={`container ${styles.pageWrapper}`}>
      <header className={styles.header}>
        <div className={styles.badge}>経済指標ダッシュボード</div>
        <h1 className={styles.title}>物価・賃金・消費の推移</h1>
        <p className={styles.description}>{cpiSummary} 凡例クリックで系列を切替可能。</p>
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
            ctiInfoState={{ ...ctiInfoState, gdp: gdpInfoState }}
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
