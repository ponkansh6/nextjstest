import { loadCpiData, loadCtiData, loadTotalEarningData } from "../lib/cpiData";
import CpiChart from "./components/CpiChart";
import styles from "./page.module.css";

export interface CpiData {
  年月: string;
  総合: number;
  生鮮食品を除く総合: number;
  持家の帰属家賃を除く総合: number;
  [key: string]: string | number;
}

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
        <h1 className={styles.title}>CPI推移分析</h1>
        <p className={styles.description}>
          2020年平均を100とした日本の消費者物価指数（CPI）の推移を可視化。
          2020年基準ウェイトを用いたラスパイレス指数に基づき、各項目の寄与度を詳細に分析します。
        </p>
      </header>

      {cleanData.length > 0 ? (
        <CpiChart
          data={cleanData}
          ctiData={ctiData}
          totalEarningData={totalEarningData}
        />
      ) : (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage}>
            データの読み込みに失敗したか、データが空です。
          </p>
          <p className={styles.errorSubMessage}>
            public/cpi_data.csv ファイルを確認してください。
          </p>
        </div>
      )}
    </div>
  );
}
