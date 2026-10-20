import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { buildCtiFilePaths } from "../dataIo";
import { parseYearMonth, compareYearMonth } from "@/lib/yearMonth";
import { selectCpiPair, type CpiDataStatus } from "./cpiSource";
import { transformCpiData } from "./cpiLoader";
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

function toCtiDataStatus(selected: ReturnType<typeof selectCtiPair>): CtiDataStatus {
  if ("baseYear" in selected) return selected;
  return { baseYear: selected.pair.baseYear, pair: selected.pair.pair, valid: true };
}

export async function getCtiDataStatus(options: CtiLoadOptions = {}): Promise<CtiDataStatus> {
  return toCtiDataStatus(selectCtiPair(options));
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

/** Load raw 2025-base CPI index rows for server-side real CTI derivation. */
export async function loadCpiIndexDataInternal(): Promise<CpiData[]> {
  const selected = selectCpiPair();
  if ("baseYear" in selected) {
    console.error(`CPI data unavailable: ${selected.reason}`);
    return [];
  }
  return selected.validated.data.filter((row) => {
    const parsed = parseYearMonth(String(row.年月));
    return parsed!.year >= 2004;
  });
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
  const ctiContent = fs.readFileSync(pair.mainPath, "utf8");

  const rows = Papa.parse<string[]>(ctiContent, {
    header: false,
    skipEmptyLines: false,
  }).data;
  const headerIndex = rows.findIndex(
    (row: string[]) =>
      Array.isArray(row) &&
      row.some((c) => c.trim() === "月" || c.trim().includes("消費支出（名目）")),
  );
  if (headerIndex === -1) return [];
  const header = rows[headerIndex].map((c) => c.trim());
  const dataRows = rows.slice(headerIndex + 1);
  const mapped = dataRows
    .map((row: (string | undefined)[]) => {
      const obj: Record<string, string | number> = {};
      header.forEach((h: string, i: number) => {
        let val: string | number | undefined = row[i]?.trim();
        if (typeof val === "string") {
          if (h !== "月" && h !== "年月") {
            const numValue = val.replace(/,/g, "");
            val = numValue === "" || numValue === "-" ? undefined : Number(numValue);
            if (!Number.isFinite(val)) val = undefined;
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
      const nominalResidual = deriveResidual(nominalTotal, nominalKeysList);
      const realResidual = deriveResidual(realTotal, realKeysList);
      if (nominalResidual !== undefined) obj["その他の消費支出（名目）"] = nominalResidual;
      if (realResidual !== undefined) obj["その他の消費支出（実質）"] = realResidual;
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
        const dummyRow: Record<string, string | number> = { 年月: ym };
        mapped.push(dummyRow as unknown as CpiData);
      }
    }
  }

  mapped.sort((a, b) => compareYearMonth(String(a.年月), String(b.年月)));
  let ctiMetadata: CtiRuntimeMetadata | undefined;
  if (fs.existsSync(paths.metadata)) {
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
