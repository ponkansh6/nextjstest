import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildCtiFilePaths } from "../dataIo";
import { parseYearMonth, compareYearMonth } from "@/lib/yearMonth";
import { calculateQuarter, calculateQuarterLabel } from "@/lib/math/quarter";
import { selectCpiPair, type CpiDataStatus } from "./cpiSource";
import { transformCpiData } from "./cpiLoader";
import {
  getGdpSupportStatus as getGdpSupportStatusInternal,
  loadQuarterlyGdpData as loadQuarterlyGdpDataInternal,
  validateQuarterlyGdpSupport as validateQuarterlyGdpSupportInternal,
} from "./gdpSupport";
import { selectCtiPair, type CtiDataStatus, type CtiLoadOptions } from "./ctiValidation";

export type { CpiDataStatus } from "./cpiSource";
export type { CtiDataStatus, CtiLoadOptions } from "./ctiValidation";
export type CtiRuntimeMetadata = {
  statInfId: string;
  baseYear: number;
  householdScope: string;
  unit?: string;
  frequency?: string;
  sourceFile?: string;
  rawRange?: { startYear: number; endYear: number };
  adoptedRange?: { startYear: number; endYear: number };
  valueType?: string;
};
export type CtiDataWithMetadata = CpiData[] & { ctiMetadata?: CtiRuntimeMetadata };
export type {
  GdpMetadata,
  GdpSupportStatus,
  QuarterlyGdpData,
  QuarterlyGdpRow,
  QuarterlyGdpSupportStatus,
} from "./gdpSupport";

export async function getCpiDataStatus(): Promise<CpiDataStatus> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) return selected;
  return {
    baseYear: selected.pair.baseYear,
    pair: selected.pair.pair,
    valid: true,
  };
}

export { getCpiMajorWeightTotal } from "./cpiLoader";

export async function getGdpSupportStatus(): Promise<import("./gdpSupport").GdpSupportStatus> {
  return getGdpSupportStatusInternal();
}

export function validateQuarterlyGdpSupport(): import("./gdpSupport").QuarterlyGdpSupportStatus {
  return validateQuarterlyGdpSupportInternal();
}

export async function getQuarterlyGdpSupportStatus(): Promise<
  import("./gdpSupport").QuarterlyGdpSupportStatus
> {
  return validateQuarterlyGdpSupportInternal();
}

export function loadQuarterlyGdpData(): import("./gdpSupport").QuarterlyGdpData {
  return loadQuarterlyGdpDataInternal();
}

export async function getCtiDataStatus(options: CtiLoadOptions = {}): Promise<CtiDataStatus> {
  const selected = selectCtiPair(options);
  if ("baseYear" in selected) return selected;
  return { baseYear: selected.pair.baseYear, pair: selected.pair.pair, valid: true };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export async function loadCpiDataInternal(): Promise<CpiData[]> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) {
    console.error(`CPI data unavailable: ${selected.reason}`);
    return [];
  }
  return transformCpiData(selected.validated);
}

export async function loadCtiDataInternal(
  options: CtiLoadOptions = {},
): Promise<CtiDataWithMetadata> {
  const paths = buildCtiFilePaths();
  const selected = selectCtiPair(options);
  if ("baseYear" in selected) {
    console.error(`CTI data unavailable: ${selected.reason}`);
    return [];
  }
  const { pair } = selected;
  const isLegacy2020 = pair.baseYear === 2020;
  const ctiContent = fs.readFileSync(pair.mainPath, "utf8");
  const nominalSupportContent = isLegacy2020
    ? fs.readFileSync(pair.supportNominalPath, "utf8")
    : "";
  const realSupportContent = isLegacy2020 ? fs.readFileSync(pair.supportRealPath, "utf8") : "";

  const supportMap = new Map<string, number>();
  const supportMapReal = new Map<string, number>();

  const loadSupportMap = (content: string, targetMap: Map<string, number>) => {
    const rows = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: false,
    }).data;
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

  if (isLegacy2020) {
    loadSupportMap(nominalSupportContent, supportMap);
    loadSupportMap(realSupportContent, supportMapReal);
  }

  const rows = Papa.parse<string[]>(ctiContent, {
    header: false,
    skipEmptyLines: false,
  }).data;
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
        let val: string | number | undefined = row[i]?.trim();
        if (typeof val === "string") {
          if (h !== "月" && h !== "年月") {
            const numValue = val.replace(/,/g, "");
            if (isLegacy2020) {
              val = numValue === "" || numValue === "-" ? 0 : Number(numValue);
              if (!Number.isFinite(val)) val = 0;
            } else {
              val = numValue === "" || numValue === "-" ? undefined : Number(numValue);
              if (!Number.isFinite(val)) val = undefined;
            }
          }
        }
        if (val !== undefined) obj[h] = val;
      });
      if (typeof obj["月"] === "string" && !obj.年月) obj.年月 = obj["月"];
      const nominalTotal = obj["消費支出（名目）"];
      const realTotal = obj["消費支出（実質）"];
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
      const deriveResidual = (total: unknown, keys: string[]) =>
        typeof total === "number" &&
        Number.isFinite(total) &&
        keys.every((key) => isFiniteNumber(obj[key]))
          ? total - keys.reduce((sum, key) => sum + (obj[key] as number), 0)
          : undefined;
      if (isLegacy2020) {
        const sum = (keys: string[]) =>
          keys.reduce((total, key) => total + (Number(obj[key]) || 0), 0);
        obj["その他の消費支出（名目）"] = Math.max(
          0,
          (Number(nominalTotal) || 0) - sum(nominalKeysList),
        );
        obj["その他の消費支出（実質）"] = Math.max(0, (Number(realTotal) || 0) - sum(realKeysList));
      } else {
        const nominalResidual = deriveResidual(nominalTotal, nominalKeysList);
        const realResidual = deriveResidual(realTotal, realKeysList);
        if (nominalResidual !== undefined) obj["その他の消費支出（名目）"] = nominalResidual;
        if (realResidual !== undefined) obj["その他の消費支出（実質）"] = realResidual;
      }
      const parsed = parseYearMonth(String(obj.年月));
      if (parsed) {
        const q = calculateQuarter(parsed.month);
        const normYm = calculateQuarterLabel(parsed.year, q);
        const nominalSupport = supportMap.get(normYm);
        const realSupport = supportMapReal.get(normYm);
        if (
          obj["民間最終消費支出（名目）"] === undefined &&
          (nominalSupport !== undefined || isLegacy2020)
        ) {
          obj["民間最終消費支出（名目）"] = nominalSupport ?? 0;
        }
        if (
          obj["民間最終消費支出（実質）"] === undefined &&
          (realSupport !== undefined || isLegacy2020)
        ) {
          obj["民間最終消費支出（実質）"] = realSupport ?? 0;
        }
      }
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
        if (isLegacy2020) {
          header.forEach((h) => {
            if (h !== "年月" && h !== "月") dummyRow[h] = 0;
          });
        }
        const nominalSupport = supportMap.get(normYm);
        const realSupport = supportMapReal.get(normYm);
        if (isLegacy2020) {
          dummyRow["消費支出（名目）"] = nominalSupport ?? 0;
          dummyRow["消費支出（実質）"] = realSupport ?? 0;
          dummyRow["民間最終消費支出（名目）"] = nominalSupport ?? 0;
          dummyRow["民間最終消費支出（実質）"] = realSupport ?? 0;
          dummyRow["その他の消費支出（名目）"] = 0;
          dummyRow["その他の消費支出（実質）"] = 0;
        }
        mapped.push(dummyRow as unknown as CpiData);
      }
    }
  }

  // Apply validated annual GDP values after recovery rows are present.
  if (!isLegacy2020) {
    const gdpStatus = await getGdpSupportStatus();
    if (gdpStatus.valid && gdpStatus.normalizationFactors) {
      const loadAnnual = (filePath: string) => {
        const rows = Papa.parse<string[]>(fs.readFileSync(filePath, "utf8"), {
          header: false,
          skipEmptyLines: true,
        }).data;
        const header = rows[0] ?? [];
        const yearIndex = header.indexOf("時間軸（暦年）");
        const valueIndex = header.indexOf("民間最終消費支出");
        return new Map(
          rows
            .slice(1)
            .map((row) => [row[yearIndex], Number(row[valueIndex]?.replace(/,/g, ""))] as const)
            .filter(([year, value]) => /^\d{4}$/.test(year ?? "") && Number.isFinite(value)),
        );
      };
      const nominal = loadAnnual(paths.candidateSupportNominal);
      const real = loadAnnual(paths.candidateSupportReal);
      const factors = gdpStatus.normalizationFactors;
      for (const row of mapped) {
        const year = String(parseYearMonth(String(row.年月))?.year ?? "");
        const nominalRaw = nominal.get(year);
        const realRaw = real.get(year);
        if (nominalRaw !== undefined && realRaw !== undefined) {
          row["民間最終消費支出（名目・原値）"] = nominalRaw;
          row["民間最終消費支出（実質・原値）"] = realRaw;
          row["民間最終消費支出（名目・比較指数）"] = nominalRaw * factors.nominal;
          row["民間最終消費支出（実質・比較指数）"] = realRaw * factors.real;
          row["民間最終消費支出（名目）"] = nominalRaw * factors.nominal;
          row["民間最終消費支出（実質）"] = realRaw * factors.real;
        }
      }
    }
  }
  mapped.sort((a, b) => compareYearMonth(String(a.年月), String(b.年月)));
  let ctiMetadata: CtiRuntimeMetadata | undefined;
  if (pair.baseYear === 2025 && fs.existsSync(paths.metadata)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(paths.metadata, "utf8")) as Record<
        string,
        unknown
      >;
      const period = metadata.period as Record<string, unknown> | undefined;
      const sourceStart =
        typeof period?.start === "string" ? Number(period.start.slice(0, 4)) : undefined;
      const sourceEnd =
        typeof period?.end === "string" ? Number(period.end.slice(0, 4)) : undefined;
      ctiMetadata = {
        statInfId: typeof metadata.statInfId === "string" ? metadata.statInfId : "",
        baseYear: pair.baseYear,
        householdScope: typeof metadata.householdScope === "string" ? metadata.householdScope : "",
        unit:
          typeof metadata.unit === "string"
            ? metadata.unit
            : typeof metadata.valueType === "string"
              ? metadata.valueType
              : undefined,
        frequency: typeof metadata.frequency === "string" ? metadata.frequency : undefined,
        sourceFile: typeof metadata.sourceFile === "string" ? metadata.sourceFile : undefined,
        valueType: typeof metadata.valueType === "string" ? metadata.valueType : undefined,
        rawRange:
          sourceStart && sourceEnd ? { startYear: sourceStart, endYear: sourceEnd } : undefined,
        adoptedRange:
          sourceStart && sourceEnd ? { startYear: sourceStart, endYear: sourceEnd } : undefined,
      };
    } catch {
      ctiMetadata = undefined;
    }
  }
  Object.defineProperty(mapped, "ctiMetadata", { value: ctiMetadata, enumerable: false });
  return mapped as CtiDataWithMetadata;
}
