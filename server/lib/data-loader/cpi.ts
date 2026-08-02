import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildCpiFilePaths, buildCtiFilePaths, parseContributionWeights } from "../dataIo";
import { parseYearMonth, compareYearMonth } from "@/lib/yearMonth";
import { calculateQuarter, calculateQuarterLabel } from "@/lib/math/quarter";

export async function loadCpiDataInternal(): Promise<CpiData[]> {
  const paths = buildCpiFilePaths();
  if (!fs.existsSync(paths.main) || !fs.existsSync(paths.contribution)) {
    console.error("Data files not found");
    return [];
  }
  const cpiContent = fs.readFileSync(paths.main, "utf8");
  const contributionContent = fs.readFileSync(paths.contribution, "utf8");
  const weights = parseContributionWeights(contributionContent);
  const { data } = Papa.parse<CpiData>(cpiContent, {
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  });
  return (data as CpiData[])
    .filter((row) => {
      if (!row["年月"]) return false;
      const parsed = parseYearMonth(row["年月"] as string);
      return parsed ? parsed.year >= 2004 : false;
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
      (row) =>
        Array.isArray(row) && row.some((c) => typeof c === "string" && /民間最終消費支出/.test(c)),
    );
    if (headerIndex === -1) return;
    const header = rows[headerIndex].map((c) => (typeof c === "string" ? c.trim() : c));
    const ymIndex = header.indexOf("時間軸（四半期）");
    const valueIndex = header.findIndex((h) => h === "民間最終消費支出");
    rows.slice(headerIndex + 1).forEach((row) => {
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
      const parsed = parseYearMonth(ymStr);
      if (parsed) {
        const q = calculateQuarter(parsed.month);
        const normYm = calculateQuarterLabel(parsed.year, q);
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
      const parsed = parseYearMonth(String(row.年月));
      return parsed ? parsed.year >= 1994 : false;
    });

  const existingMonths = new Set(mapped.map((r) => r.年月));
  for (let y = 1994; y <= 2016; y++) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}年${m}月`;
      if (!existingMonths.has(ym)) {
        const q = calculateQuarter(m);
        const normYm = calculateQuarterLabel(y, q);
        const dummyRow: Record<string, string | number> = { 年月: ym };
        header.forEach((h) => {
          if (h !== "年月" && h !== "月") dummyRow[h] = 0;
        });
        const nominalSupport = supportMap.get(normYm) ?? 0;
        const realSupport = supportMapReal.get(normYm) ?? 0;
        dummyRow["民間最終消費支出（名目）"] = nominalSupport;
        dummyRow["民間最終消費支出（実質）"] = realSupport;
        dummyRow["消費支出（名目）"] = nominalSupport;
        dummyRow["消費支出（実質）"] = realSupport;
        // ダミー行は個別カテゴリの内訳データがないため、
        // 「その他の消費支出」を残余（＝総額）として設定しない。
        // これにより1994-2016年のチャートで巨大な値がY軸スケールを独占するのを防ぐ。
        // この期間の総消費支出はサポート系列（民間最終消費支出）で表現される。
        dummyRow["その他の消費支出（名目）"] = 0;
        dummyRow["その他の消費支出（実質）"] = 0;
        mapped.push(dummyRow as unknown as CpiData);
      }
    }
  }
  mapped.sort((a, b) => compareYearMonth(String(a.年月), String(b.年月)));
  return mapped;
}
