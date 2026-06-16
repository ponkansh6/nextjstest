import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildCpiFilePaths, buildCtiFilePaths } from "../dataIo";

export async function loadCpiDataInternal(): Promise<CpiData[]> {
  const paths = buildCpiFilePaths();
  if (!fs.existsSync(paths.main) || !fs.existsSync(paths.contribution)) {
    console.error("Data files not found");
    return [];
  }
  const cpiContent = fs.readFileSync(paths.main, "utf8");
  const contributionContent = fs.readFileSync(paths.contribution, "utf8");
  const contributionLines = contributionContent.split("\n");
  const categoryLine = contributionLines.find((line) => line.startsWith("類・品目"));
  const weightLine = contributionLines.find((line) => line.startsWith("ウエイト"));
  const weights: Record<string, number> = {};
  if (categoryLine && weightLine) {
    const categories = categoryLine.split(",");
    const weightValues = weightLine.split(",");
    categories.forEach((cat, i) => {
      const trimmedCat = cat.trim();
      const weight = parseFloat(weightValues[i]);
      if (trimmedCat && !isNaN(weight)) weights[trimmedCat] = weight;
    });
  }
  const { data } = Papa.parse<CpiData>(cpiContent, {
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  });
  return (data as CpiData[])
    .filter((row) => {
      if (!row["年月"]) return false;
      const yearMatch = (row["年月"] as string).match(/^(\d{4})年/);
      return yearMatch ? parseInt(yearMatch[1], 10) >= 2004 : false;
    })
    .map((row) => {
      const newRow: CpiData = { ...row };
      Object.keys(weights).forEach((key) => {
        const value = row[key];
        if (typeof value === "number") newRow[key] = (value * weights[key]) / 10_000;
      });
      const foodTotal = typeof newRow.食料 === "number" ? newRow.食料 : 0;
      const dinedOut = typeof newRow.外食 === "number" ? newRow.外食 : 0;
      newRow["外食以外食料"] = foodTotal - dinedOut;
      newRow["諸雑費"] = typeof newRow["諸雑費"] === "number" ? newRow["諸雑費"] : 0;
      const transport = typeof newRow.交通 === "number" ? newRow.交通 : 0;
      const autoRelated =
        typeof newRow["自動車等関係費"] === "number" ? newRow["自動車等関係費"] : 0;
      newRow["交通・自動車等関係費"] = transport + autoRelated;
      delete newRow["教養娯楽サービス"];
      delete newRow["教養娯楽用品"];
      delete newRow["交通"];
      delete newRow["自動車等関係費"];
      return newRow;
    });
}

export async function loadCtiDataInternal(): Promise<CpiData[]> {
  const paths = buildCtiFilePaths();
  const ctiContent = fs.readFileSync(paths.main, "utf8");
  const nominalSupportContent = fs.readFileSync(paths.supportNominal, "utf8");
  const realSupportContent = fs.readFileSync(paths.supportReal, "utf8");

  const supportMap = new Map<string, number>();
  const supportMapReal = new Map<string, number>();

  const loadSupportMap = (content: string, targetMap: Map<string, number>) => {
    const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false }).data;
    const headerIndex = rows.findIndex(
      (row: any) =>
        Array.isArray(row) &&
        row.some((c: any) => typeof c === "string" && /民間最終消費支出/.test(c)),
    );
    if (headerIndex === -1) return;
    const header = rows[headerIndex].map((c: any) => (typeof c === "string" ? c.trim() : c));
    const ymIndex = header.indexOf("時間軸（四半期）");
    const valueIndex = header.findIndex((h: any) => h === "民間最終消費支出");
    rows.slice(headerIndex + 1).forEach((row: any) => {
      const ym = row[ymIndex];
      const valStr =
        typeof row[valueIndex] === "string"
          ? row[valueIndex].trim().replace(/,/g, "")
          : String(row[valueIndex]);
      const num = parseFloat(valStr);
      if (ym && !isNaN(num)) targetMap.set(ym, num);
    });
  };

  loadSupportMap(nominalSupportContent, supportMap);
  loadSupportMap(realSupportContent, supportMapReal);

  const rows = Papa.parse<string[]>(ctiContent, { header: false, skipEmptyLines: false }).data;
  const headerIndex = rows.findIndex(
    (row: any) =>
      Array.isArray(row) &&
      row.some(
        (c: any) =>
          typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
      ),
  );
  if (headerIndex === -1) return [];
  const header = rows[headerIndex].map((c: any) => c.trim());
  const dataRows = rows.slice(headerIndex + 1);
  const mapped = dataRows
    .map((row: any) => {
      const obj: Record<string, string | number> = {};
      header.forEach((h: any, i: any) => {
        let val: string | number = row[i];
        if (typeof val === "string") {
          const trimmedVal = val.trim();
          if (h !== "月" && h !== "年月") {
            const numValue = trimmedVal.replace(/,/g, "");
            val = numValue === "-" ? 0 : isNaN(parseFloat(numValue)) ? 0 : parseFloat(numValue);
          } else val = trimmedVal;
        }
        obj[h] = val;
      });
      if (typeof obj["月"] === "string" && !obj.年月) obj.年月 = obj["月"];
      const ymStr = String(obj.年月 || "").trim();
      const m = ymStr.match(/^(\d{4})年0?(\d{1,2})月/);
      if (m) {
        const year = m[1];
        const month = parseInt(m[2], 10);
        const q = Math.ceil(month / 3);
        const normYm = `${year}年${(q - 1) * 3 + 1}～${q * 3}月期`;
        obj["民間最終消費支出（名目）"] = supportMap.get(normYm) ?? 0;
        obj["民間最終消費支出（実質）"] = supportMapReal.get(normYm) ?? 0;
      } else {
        obj["民間最終消費支出（名目）"] = 0;
        obj["民間最終消費支出（実質）"] = 0;
      }
      const nominalTotal = (obj["消費支出（名目）"] as number) || 0;
      const realTotal = (obj["消費支出（実質）"] as number) || 0;
      const nominalKeysList = [
        "食料（名目）",
        "住居（名目）",
        "光熱・水道（名目）",
        "家具・家事用品（名目）",
        "被服及び履物（名目）",
        "保健医療（名目）",
        "交通・通信（名目）",
        "教育（名目）",
        "教養娯楽（名目）",
      ];
      const realKeysList = [
        "食料（実質）",
        "住居（実質）",
        "光熱・水道（実質）",
        "家具・家事用品（実質）",
        "被服及び履物（実質）",
        "保健医療（実質）",
        "交通・通信（実質）",
        "教育（実質）",
        "教養娯楽（実質）",
      ];
      let nominalSum = 0;
      nominalKeysList.forEach((k) => (nominalSum += (obj[k] as number) || 0));
      obj["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);
      let realSum = 0;
      realKeysList.forEach((k) => (realSum += (obj[k] as number) || 0));
      obj["その他の消費支出（実質）"] = Math.max(0, realTotal - realSum);
      return obj as unknown as CpiData;
    })
    .filter((row) => {
      if (!row.年月) return false;
      const m = String(row.年月).match(/^(\d{4})年/);
      return m ? parseInt(m[1], 10) >= 2005 : false;
    });

  const existingMonths = new Set(mapped.map((r) => r.年月));
  for (let y = 2005; y <= 2016; y++) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}年${m}月`;
      if (!existingMonths.has(ym)) {
        const q = Math.ceil(m / 3);
        const normYm = `${y}年${(q - 1) * 3 + 1}～${q * 3}月期`;
        const dummyRow: any = { 年月: ym };
        header.forEach((h: any) => {
          if (h !== "年月" && h !== "月") dummyRow[h] = 0;
        });
        dummyRow["民間最終消費支出（名目）"] = supportMap.get(normYm) ?? 0;
        dummyRow["民間最終消費支出（実質）"] = supportMapReal.get(normYm) ?? 0;
        const nominalTotal = dummyRow["消費支出（名目）"] || 0;
        const realTotal = dummyRow["消費支出（実質）"] || 0;
        const nominalKeysList = [
          "食料（名目）",
          "住居（名目）",
          "光熱・水道（名目）",
          "家具・家事用品（名目）",
          "被服及び履物（名目）",
          "保健医療（名目）",
          "交通・通信（名目）",
          "教育（名目）",
          "教養娯楽（名目）",
        ];
        const realKeysList = [
          "食料（実質）",
          "住居（実質）",
          "光熱・水道（実質）",
          "家具・家事用品（実質）",
          "被服及び履物（実質）",
          "保健医療（実質）",
          "交通・通信（実質）",
          "教育（実質）",
          "教養娯楽（実質）",
        ];
        let nominalSum = 0;
        nominalKeysList.forEach((k) => (nominalSum += dummyRow[k] || 0));
        dummyRow["その他の消費支出（名目）"] = Math.max(0, nominalTotal - nominalSum);
        let realSum = 0;
        realKeysList.forEach((k) => (realSum += dummyRow[k] || 0));
        dummyRow["その他の消費支出（実質）"] = Math.max(0, realTotal - realSum);
        mapped.push(dummyRow as any);
      }
    }
  }
  mapped.sort((a, b) => {
    const ma = String(a.年月).match(/^(\d{4})年(\d{1,2})月/);
    const mb = String(b.年月).match(/^(\d{4})年(\d{1,2})月/);
    if (!ma || !mb) return 0;
    const ay = parseInt(ma[1], 10);
    const am = parseInt(ma[2], 10);
    const by = parseInt(mb[1], 10);
    const bm = parseInt(mb[2], 10);
    return ay !== by ? ay - by : am - bm;
  });
  return mapped;
}
