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
  const cpiFilePath = path.join(process.cwd(), "public/cpi_data.csv");
  const contributionFilePath = path.join(
    process.cwd(),
    "public/contribution.csv",
  );
  let cleanData: CpiData[] = [];

  try {
    if (fs.existsSync(cpiFilePath) && fs.existsSync(contributionFilePath)) {
      const cpiContent = fs.readFileSync(cpiFilePath, "utf8");
      const contributionContent = fs.readFileSync(contributionFilePath, "utf8");

      // ウエイト情報の取得
      const contributionLines = contributionContent.split("\n");
      const categoryLine = contributionLines.find((line) =>
        line.startsWith("類・品目"),
      );
      const weightLine = contributionLines.find((line) =>
        line.startsWith("ウエイト"),
      );

      const weights: Record<string, number> = {};
      if (categoryLine && weightLine) {
        const categories = categoryLine.split(",");
        const weightValues = weightLine.split(",");
        categories.forEach((cat, i) => {
          const trimmedCat = cat.trim();
          const weight = parseFloat(weightValues[i]);
          if (trimmedCat && !isNaN(weight)) {
            weights[trimmedCat] = weight;
          }
        });
      }

      const { data } = Papa.parse<CpiData>(cpiContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      // データのクリーニングとウエイトの掛け合わせ
      cleanData = (data as CpiData[])
        .filter((row) => row["年月"])
        .map((row) => {
          const newRow: CpiData = { ...row };
          Object.keys(weights).forEach((key) => {
            const value = row[key];
            if (typeof value === "number") {
              // 寄与度 = (指数 * ウエイト) / 10000
              newRow[key] = (value * weights[key]) / 10000;
            }
          });
          return newRow;
        });
    } else {
      console.error("Data files not found");
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
