import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { CpiData } from "../app/page";

export async function loadCpiData(): Promise<CpiData[]> {
  const cpiFilePath = path.join(process.cwd(), "public/cpi_data.csv");
  const contributionFilePath = path.join(
    process.cwd(),
    "public/contribution.csv",
  );

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

      // データのクリーニング、ウエイトの掛け合わせ、派生データの計算
      const cleanData = (data as CpiData[])
        .filter((row) => {
          if (!row["年月"]) return false;
          const yearMatch = (row["年月"] as string).match(/^(\d{4})年/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
          return year >= 2005;
        })
        .map((row) => {
          const newRow: CpiData = { ...row };
          Object.keys(weights).forEach((key) => {
            const value = row[key];
            if (typeof value === "number") {
              // 寄与度 = (指数 * ウエイト) / 10000
              newRow[key] = (value * weights[key]) / 10000;
            }
          });
          // 外食以外食料 = 食料 - 外食 をサーバー側で計算
          const foodTotal = typeof newRow.食料 === "number" ? newRow.食料 : 0;
          const dinedOut = typeof newRow.外食 === "number" ? newRow.外食 : 0;
          newRow["外食以外食料"] = foodTotal - dinedOut;

          // 交通・自動車等関係費 = 交通 + 自動車等関係費 をサーバー側で計算
          const transport = typeof newRow.交通 === "number" ? newRow.交通 : 0;
          const autoRelated =
            typeof newRow["自動車等関係費"] === "number"
              ? newRow["自動車等関係費"]
              : 0;
          newRow["交通・自動車等関係費"] = transport + autoRelated;

          // 不要な費目を除去
          delete newRow["教養娯楽サービス"];
          delete newRow["教養娯楽用品"];
          delete newRow["交通"];
          delete newRow["自動車等関係費"];

          return newRow;
        });

      return cleanData;
    } else {
      console.error("Data files not found");
      return [];
    }
  } catch (error) {
    console.error("Error loading CPI data:", error);
    return [];
  }
}
