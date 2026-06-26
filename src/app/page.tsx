import { loadCpiData, loadCtiData, loadTotalEarningData } from "../../server/lib/dataLoader";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";
export default async function Page() {
  const [cleanData, ctiData, totalEarningData] = await Promise.all([
    loadCpiData(),
    loadCtiData(),
    loadTotalEarningData(),
  ]);

  return (
    <div className={`container ${styles.pageWrapper}`}>
      <header className={styles.header}>
        <div className={styles.badge}>経済指標ダッシュボード</div>
        <h1 className={styles.title}>物価・賃金・消費の長期推移</h1>
        <p className={styles.description}>
          2020年基準でスケール統一した主要指標を一覧。各グラフは凡例クリックで系列の表示/非表示を切替可能。
        </p>
      </header>

      {cleanData.length > 0 ? (
        <CpiChart data={cleanData} ctiData={ctiData} totalEarningData={totalEarningData} />
      ) : (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage}>データの読み込みに失敗したか、データが空です。</p>
          <p className={styles.errorSubMessage}>public/cpi_data.csv ファイルを確認してください。</p>
        </div>
      )}
    </div>
  );
}
