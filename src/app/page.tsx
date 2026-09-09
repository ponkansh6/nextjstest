import { Suspense } from "react";
import { loadCpiData, loadCtiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { getCpiDataStatus } from "../../server/lib/data-loader/cpi";
import { toCpiView, toEarningsView, toQuarterlyView } from "../../server/lib/view-models/dashboard";
import { computeQuarterlyAggregates } from "../../server/lib/view-models/quarterlyAggregation";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";
import {
  targetKeys,
  stackedKeys,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "@/lib/chartConstants";

export const revalidate = false;

export default async function Page() {
  const [cleanData, ctiData, totalEarningData, cpiDataStatus] = await Promise.all([
    loadCpiData(),
    loadCtiData(),
    loadTotalEarningData(),
    getCpiDataStatus(),
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
            label: "2020年基準のフォールバックCSV",
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

  // Determine maxCpiDate from cleanData
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
  const maxCpiDate = { year: maxCpiYear, month: maxCpiMonth };

  // Compute quarterly aggregates on the server
  const { nominal: quarterlyNominalData, real: quarterlyRealData } = computeQuarterlyAggregates(
    ctiData,
    maxCpiDate,
  );

  const cpiKeys = [...targetKeys, ...stackedKeys];
  const quarterlyKeys = [
    "label",
    "quarter",
    "年",
    ...CONSUMPTION_NOMINAL_KEYS,
    ...CONSUMPTION_REAL_KEYS,
    "民間最終消費支出（名目）",
    "民間最終消費支出（実質）",
  ];
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
  const projectedQuarterlyNominal = toQuarterlyView(quarterlyNominalData, quarterlyKeys);
  const projectedQuarterlyReal = toQuarterlyView(quarterlyRealData, quarterlyKeys);
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
