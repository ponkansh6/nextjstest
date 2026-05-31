import { loadTotalEarningData } from "../server/lib/dataLoader";
import * as fs from "fs";
import * as path from "path";
import Papa from "papaparse";

async function verify() {
  const data = await loadTotalEarningData();

  // 2024年12月と2025年1月を探す
  const d202412 = data.find((d: any) => d.年月 === "2024年12月");
  const d202501 = data.find((d: any) => d.年月 === "2025年1月");

  console.log(
    "2024年12月:",
    d202412
      ? (d202412["所定内給与"] as number) +
          (d202412["所定外給与"] as number) +
          (d202412["特別給与"] as number)
      : "null",
  );
  console.log(
    "2025年1月:",
    d202501
      ? (d202501["所定内給与"] as number) +
          (d202501["所定外給与"] as number) +
          (d202501["特別給与"] as number)
      : "null",
  );

  // CPIデータのロードロジックを簡易再現
  const cpiPath = path.join(process.cwd(), "public/cpi_data.csv");
  const cpiContent = fs.readFileSync(cpiPath, "utf8");
  const parsed = Papa.parse(cpiContent, { header: true, dynamicTyping: true });
  const cpi202412 = (parsed.data as any[]).find((d) => d["年月"] === "2024年12月")?.総合 || 0;
  const cpi202501 = (parsed.data as any[]).find((d) => d["年月"] === "2025年1月")?.総合 || 0;

  console.log("CPI 2024年12月:", cpi202412);
  console.log("CPI 2025年1月:", cpi202501);

  if (d202412 && d202501) {
    const total202412 =
      (d202412["所定内給与"] as number) +
      (d202412["所定外給与"] as number) +
      (d202412["特別給与"] as number);
    const total202501 =
      (d202501["所定内給与"] as number) +
      (d202501["所定外給与"] as number) +
      (d202501["特別給与"] as number);

    const res202412 = total202412 - cpi202412;
    const res202501 = total202501 - cpi202501;

    console.log("Raw Residual 2024年12月:", res202412);
    console.log("Raw Residual 2025年1月:", res202501);
    console.log("Smoothed 2025年1月 (Avg):", (res202412 + res202501) / 2);
    console.log("Actual Residual 2025年1月:", d202501["残差"]);
  }
}

verify();
