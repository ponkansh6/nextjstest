import fs from "fs";
import path from "path";
import Papa from "papaparse";
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
  const filePath = path.join(process.cwd(), "public/cpi_data.csv");
  let cleanData: CpiData[] = [];

  try {
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");

      const { data } = Papa.parse<CpiData>(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      // 必要に応じてデータのクリーニング（例：年月が空のものを除外）
      cleanData = data.filter((row: Record<string, unknown>) => row["年月"]);
    } else {
      console.error("Data file not found at:", filePath);
    }
  } catch (error) {
    console.error("Error reading or parsing CSV:", error);
  }

  return (
    <div className={`container ${styles.pageWrapper}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>消費者物価指数 (CPI) グラフ可視化</h1>
        <p className={styles.description}>
          日本の消費者物価指数の推移を表示します。
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
