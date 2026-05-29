import { it } from "vitest";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

it("debug CTI data", async () => {
  const ctiFilePath = path.join(process.cwd(), "public/cti_data.csv");
  const ctiContent = fs.readFileSync(ctiFilePath, "utf8");

  const parsed = Papa.parse<string[]>(ctiContent, {
    header: false,
    skipEmptyLines: false,
  });

  const rows = (parsed.data || []) as string[][];
  const headerIndex = rows.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some(
        (c) =>
          typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
      ),
  );

  const header = rows[headerIndex].map((c) => c.trim());
  const dataRows = rows.slice(headerIndex + 1);

  // 最初の行（2017年1月）をデバッグ
  const row = dataRows[0];
  const obj: Record<string, string | number> = {};
  header.forEach((h, i) => {
    let val: string | number = row[i];
    if (typeof val === "string") {
      const trimmedVal = val.trim();
      if (h !== "月" && h !== "年月") {
        const numValue = trimmedVal.replace(/,/g, "");
        val = numValue === "-" ? 0 : parseFloat(numValue) || 0;
      } else {
        val = trimmedVal;
      }
    }
    obj[h] = val;
  });

  console.log("--- 読み込み直後の値 (Row[0]) ---");
  console.log("消費支出（名目）:", obj["消費支出（名目）"]);
  console.log("食料（名目）:", obj["食料（名目）"]);

  // 加工処理
  const nominalTotal = (obj["消費支出（名目）"] as number) || 0;
  const nominalKeys = [
    "食料（名目）", "住居（名目）", "光熱・水道（名目）", "家具・家事用品（名目）",
    "被服及び履物（名目）", "保健医療（名目）", "交通・通信（名目）", "教育（名目）", "教養娯楽（名目）"
  ];
  
  let nominalSum = 0;
  nominalKeys.forEach((k) => {
    nominalSum += (obj[k] as number) || 0;
  });

  console.log("--- 加工中 ---");
  console.log("Nominal Total:", nominalTotal);
  console.log("Nominal Sum of keys:", nominalSum);

  if (!obj["その他の消費支出（名目）"] || obj["その他の消費支出（名目）"] === 0) {
    obj["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);
  }

  console.log("--- 最終結果 ---");
  console.log("その他の消費支出（名目）:", obj["その他の消費支出（名目）"]);
});
