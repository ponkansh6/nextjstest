import { loadCpiData } from "../lib/cpiData";
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
  const cleanData = await loadCpiData();

  return (
    <div className={`container ${styles.pageWrapper}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>CPI推移</h1>
        <p className={styles.description}>
          2020年平均を100とした日本のCPI推移。項目積み上げは2020ウェイト基準のラスパイレス指数となります。
        </p>
      </div>

      {cleanData.length > 0 ? (
        <CpiChart data={cleanData} />
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
