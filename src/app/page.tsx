import { loadCpiData, loadCtiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import { toCpiView, toCtiView, toEarningsView } from "../../server/lib/view-models/dashboard";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";
import {
  targetKeys,
  stackedKeys,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "@/lib/chartConstants";

export default async function Page() {
  const [cleanData, ctiData, totalEarningData] = await Promise.all([
    loadCpiData(),
    loadCtiData(),
    loadTotalEarningData(),
  ]);

  const cpiKeys = [...targetKeys, ...stackedKeys];
  const ctiKeys = [
    "年月",
    ...CONSUMPTION_NOMINAL_KEYS,
    ...CONSUMPTION_REAL_KEYS,
    "民間最終消費支出（名目）",
    "消費支出（名目）",
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
  ];

  const projectedCpiData = toCpiView(cleanData, cpiKeys);
  const projectedCtiData = toCtiView(ctiData, ctiKeys);
  const projectedEarningsData = toEarningsView(totalEarningData, earningsKeys);

  return (
    <div className={`container ${styles.pageWrapper}`}>
      <header className={styles.header}>
        <div className={styles.badge}>経済指標ダッシュボード</div>
        <h1 className={styles.title}>物価・賃金・消費の長期推移</h1>
        <p className={styles.description}>
          2020年基準でスケール統一した主要指標を一覧。各グラフは凡例クリックで系列の表示/非表示を切替可能。
        </p>
      </header>

      {projectedCpiData.length > 0 ? (
        <CpiChart
          data={projectedCpiData as any}
          ctiData={projectedCtiData as any}
          totalEarningData={projectedEarningsData as any}
        />
      ) : (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage}>データの読み込みに失敗したか、データが空です。</p>
          <p className={styles.errorSubMessage}>public/cpi_data.csv ファイルを確認してください。</p>
        </div>
      )}
    </div>
  );
}
