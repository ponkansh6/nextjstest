import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildCpiFilePaths, buildCtiFilePaths, parseContributionWeights } from "../dataIo";
import { parseYearMonth, compareYearMonth } from "@/lib/yearMonth";
import { calculateQuarter, calculateQuarterLabel } from "@/lib/math/quarter";

const CPI_MAJOR_CATEGORIES = [
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
  "諸雑費",
] as const;

// These are the mutually exclusive source series behind the stacked display.
// Their parent 10-major-category weights sum to 10002 in the published 2025
// table because of rounding, so normalize only this comparison set by its
// actual total rather than altering the published weights.
const CPI_COMPARISON_COMPONENTS = new Set([
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "光熱・水道",
  "教養娯楽",
  "交通",
  "自動車等関係費",
  "通信",
  "食料",
  "外食",
  "諸雑費",
]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export type CpiDataStatus = {
  baseYear: 2020 | 2025 | null;
  pair: "2020" | "2025" | null;
  valid: boolean;
  reason?: string;
};

type CpiPair = {
  baseYear: 2020 | 2025;
  pair: "2020" | "2025";
  mainPath: string;
  contributionPath: string;
};

type Cpi2025Metadata = {
  status: string;
  baseYear: number;
  indexFile: string;
  contributionFile: string;
  csvSha256: string;
  period: { start: string; end: string; monthlyRows: number };
  seriesCount: number;
};

type ValidatedCpiPair = {
  weights: Record<string, number>;
  data: CpiData[];
};

const CPI_DATE_HEADER = "年月";

function validateContribution(
  content: string,
): { weights: Record<string, number>; headers: string[] } | string {
  const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false }).data;
  const categories = rows.find((row) => row[0]?.trim() === "類・品目");
  const weightRow = rows.find((row) => row[0]?.trim().startsWith("ウエイト"));
  if (!categories || !weightRow) return "missing 類・品目 or ウエイト header";

  const headers = categories
    .slice(1)
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  if (!headers.includes("総合")) return "missing required contribution header: 総合";
  if (new Set(headers).size !== headers.length) return "duplicate contribution headers";

  const weights = parseContributionWeights(content);
  const missingWeights = headers.filter((header) => !isFiniteNumber(weights[header]));
  if (missingWeights.length > 0) return `missing or invalid weights: ${missingWeights.join(", ")}`;
  return { weights, headers };
}

function validate2025Metadata(metadataPath: string): Cpi2025Metadata | string {
  if (!fs.existsSync(metadataPath)) return "missing 2025 metadata";
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Cpi2025Metadata;
    if (metadata.status !== "ready") return "2025 metadata is not ready";
    if (metadata.baseYear !== 2025) return "2025 metadata baseYear mismatch";
    if (metadata.indexFile !== "cpi_data2025_long.csv") return "2025 metadata indexFile mismatch";
    if (metadata.contributionFile !== "contribution2025.csv")
      return "2025 metadata contributionFile mismatch";
    if (metadata.period?.monthlyRows !== 679) return "2025 metadata monthlyRows mismatch";
    if (metadata.period?.start !== "1970年1月" || metadata.period?.end !== "2026年7月") {
      return "2025 metadata period mismatch";
    }
    if (metadata.seriesCount !== 78) return "2025 metadata seriesCount mismatch";
    if (!/^[a-f0-9]{64}$/.test(metadata.csvSha256 ?? ""))
      return "2025 metadata CSV SHA-256 mismatch";
    return metadata;
  } catch {
    return "invalid 2025 metadata";
  }
}

function validateCpiPair(pair: CpiPair, metadataPath: string): ValidatedCpiPair | string {
  if (!fs.existsSync(pair.mainPath) || !fs.existsSync(pair.contributionPath)) {
    return "missing index or contribution file";
  }
  const contribution = validateContribution(fs.readFileSync(pair.contributionPath, "utf8"));
  if (typeof contribution === "string") return contribution;
  const cpiContent = fs.readFileSync(pair.mainPath, "utf8");
  const { data, meta } = Papa.parse<CpiData>(cpiContent, {
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  });
  const headers = (meta.fields ?? []).map((header) => header.trim());
  if (!headers.includes(CPI_DATE_HEADER))
    return `missing required index header: ${CPI_DATE_HEADER}`;
  if (
    !(data as CpiData[]).some((row) => {
      if (!row[CPI_DATE_HEADER]) return false;
      const parsed = parseYearMonth(row[CPI_DATE_HEADER] as string);
      return parsed ? parsed.year >= 2004 : false;
    })
  ) {
    return "index contains no valid 年月 rows";
  }
  const missingIndexHeaders = contribution.headers.filter((header) => !headers.includes(header));
  if (missingIndexHeaders.length > 0) {
    return `missing required index headers: ${missingIndexHeaders.join(", ")}`;
  }
  if (pair.baseYear === 2025) {
    const metadata = validate2025Metadata(metadataPath);
    if (typeof metadata === "string") return metadata;
    if (
      path.basename(pair.mainPath) !== metadata.indexFile ||
      path.basename(pair.contributionPath) !== metadata.contributionFile
    ) {
      return "2025 metadata file pairing mismatch";
    }
    if (createHash("sha256").update(cpiContent).digest("hex") !== metadata.csvSha256) {
      return "2025 CSV SHA-256 mismatch";
    }
    const rows = data as CpiData[];
    const months = rows
      .map((row) => row[CPI_DATE_HEADER])
      .filter((month): month is string => typeof month === "string");
    if (rows.length !== metadata.period.monthlyRows || months.length !== rows.length)
      return "2025 CSV monthly row count mismatch";
    if ((meta.fields?.length ?? 0) !== metadata.seriesCount + 1)
      return "2025 CSV series count mismatch";
    if (months[0] !== metadata.period.start || months.at(-1) !== metadata.period.end)
      return "2025 CSV period mismatch";
    if (new Set(months).size !== months.length) return "2025 CSV contains duplicate months";
    for (let index = 1; index < months.length; index += 1) {
      const previous = parseYearMonth(months[index - 1]);
      const current = parseYearMonth(months[index]);
      if (
        !previous ||
        !current ||
        current.year * 12 + current.month !== previous.year * 12 + previous.month + 1
      ) {
        return "2025 CSV monthly series is not continuous";
      }
    }
    const baseYearValues = rows
      .filter((row) => parseYearMonth(row[CPI_DATE_HEADER] as string)?.year === 2025)
      .map((row) => row.総合)
      .filter(isFiniteNumber);
    const average = baseYearValues.reduce((sum, value) => sum + value, 0) / baseYearValues.length;
    // Official monthly values are rounded; accept the documented 99.9–100.1 range.
    if (baseYearValues.length !== 12 || average < 99.9 || average > 100.1)
      return "2025 CSV general-index average mismatch";
  }
  return { weights: contribution.weights, data: data as CpiData[] };
}

function selectCpiPair(): { pair: CpiPair; validated: ValidatedCpiPair } | CpiDataStatus {
  const paths = buildCpiFilePaths();
  const pairs: CpiPair[] = [
    { baseYear: 2025, pair: "2025", mainPath: paths.main, contributionPath: paths.contribution },
    {
      baseYear: 2020,
      pair: "2020",
      mainPath: paths.fallbackMain,
      contributionPath: paths.fallbackContribution,
    },
  ];
  let lastReason = "no complete CPI pair";
  for (const pair of pairs) {
    const validation = validateCpiPair(pair, paths.metadata);
    if (typeof validation !== "string") return { pair, validated: validation };
    lastReason = `${pair.pair} pair: ${validation}`;
    console.error(`CPI data pair validation failed (${lastReason})`);
  }
  return { baseYear: null, pair: null, valid: false, reason: lastReason };
}

export async function getCpiDataStatus(): Promise<CpiDataStatus> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) return selected;
  return { baseYear: selected.pair.baseYear, pair: selected.pair.pair, valid: true };
}

export function getCpiMajorWeightTotal(weights: Record<string, number>): number {
  const total = CPI_MAJOR_CATEGORIES.reduce((sum, key) => sum + weights[key], 0);
  return Number.isFinite(total) && total > 0 ? total : 10_000;
}

export async function loadCpiDataInternal(): Promise<CpiData[]> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) {
    console.error(`CPI data unavailable: ${selected.reason}`);
    return [];
  }
  const weights = selected.validated.weights;
  const comparisonWeightTotal = getCpiMajorWeightTotal(weights);
  return selected.validated.data
    .filter((row) => {
      if (!row["年月"]) return false;
      const parsed = parseYearMonth(row["年月"] as string);
      return parsed ? parsed.year >= 2004 : false;
    })
    .map((row) => {
      const newRow: CpiData = { ...row };
      Object.keys(weights).forEach((key) => {
        const value = row[key];
        if (isFiniteNumber(value)) {
          const denominator = CPI_COMPARISON_COMPONENTS.has(key) ? comparisonWeightTotal : 10_000;
          newRow[key] = (value * weights[key]) / denominator;
        } else {
          // A missing official series must remain missing; zero would fabricate
          // a contribution and corrupt dependent derived values.
          newRow[key] = undefined;
        }
      });
      const foodTotal = newRow.食料;
      const dinedOut = newRow.外食;
      newRow["外食以外食料"] =
        isFiniteNumber(foodTotal) && isFiniteNumber(dinedOut) ? foodTotal - dinedOut : undefined;
      const transport = newRow.交通;
      const autoRelated = newRow["自動車等関係費"];
      newRow["交通・自動車等関係費"] =
        isFiniteNumber(transport) && isFiniteNumber(autoRelated)
          ? transport + autoRelated
          : undefined;
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
    (row: (string | undefined)[]) =>
      Array.isArray(row) &&
      row.some(
        (c: string | undefined) =>
          typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
      ),
  );
  if (headerIndex === -1) return [];
  const header = rows[headerIndex].map((c: string | undefined) => (c ?? "").trim());
  const dataRows = rows.slice(headerIndex + 1);
  const mapped = dataRows
    .map((row: (string | undefined)[]) => {
      const obj: Record<string, string | number> = {};
      header.forEach((h: string, i: number) => {
        let val: string | number = row[i] ?? "";
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
