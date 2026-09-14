import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildCpiFilePaths } from "../dataIo";
import { validateCpiFiles, type CpiPair, type ValidatedCpiPair } from "./cpiValidation";
import { parseYearMonth } from "@/lib/yearMonth";

export { validateContribution, validateCpiFiles } from "./cpiValidation";
export type { CpiPair, ValidatedCpiPair } from "./cpiValidation";

export type CpiDataStatus = {
  baseYear: 2020 | 2025 | null;
  pair: "2020" | "2025" | null;
  valid: boolean;
  reason?: string;
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

export function buildCpiSourceCandidates(): { metadata: string; pairs: CpiPair[] } {
  const paths = buildCpiFilePaths();
  return {
    metadata: paths.metadata,
    pairs: [
      {
        baseYear: 2025,
        pair: "2025",
        mainPath: paths.main,
        contributionPath: paths.contribution,
      },
      {
        baseYear: 2020,
        pair: "2020",
        mainPath: paths.fallbackMain,
        contributionPath: paths.fallbackContribution,
      },
    ],
  };
}

export function validate2025Metadata(metadataPath: string): Cpi2025Metadata | string {
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

export function validateCpiPair(pair: CpiPair, metadataPath: string): ValidatedCpiPair | string {
  const baseValidation = validateCpiFiles(pair);
  if (typeof baseValidation === "string") return baseValidation;
  if (pair.baseYear !== 2025) return baseValidation;
  const cpiContent = fs.readFileSync(pair.mainPath, "utf8");
  const metadata = validate2025Metadata(metadataPath);
  if (typeof metadata === "string") return metadata;
  if (
    path.basename(pair.mainPath) !== metadata.indexFile ||
    path.basename(pair.contributionPath) !== metadata.contributionFile
  )
    return "2025 metadata file pairing mismatch";
  if (createHash("sha256").update(cpiContent).digest("hex") !== metadata.csvSha256)
    return "2025 CSV SHA-256 mismatch";
  const rows = baseValidation.data;
  const headers = Object.keys(rows[0] ?? {});
  const months = rows
    .map((row) => row["年月"])
    .filter((month): month is string => typeof month === "string");
  if (rows.length !== metadata.period.monthlyRows || months.length !== rows.length)
    return "2025 CSV monthly row count mismatch";
  if (headers.length !== metadata.seriesCount + 1) return "2025 CSV series count mismatch";
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
    )
      return "2025 CSV monthly series is not continuous";
  }
  const baseYearValues = rows
    .filter((row) => parseYearMonth(row["年月"] as string)?.year === 2025)
    .map((row) => row.総合)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const average = baseYearValues.reduce((sum, value) => sum + value, 0) / baseYearValues.length;
  if (baseYearValues.length !== 12 || average < 99.9 || average > 100.1)
    return "2025 CSV general-index average mismatch";
  return baseValidation;
}

export function selectCpiPair(): { pair: CpiPair; validated: ValidatedCpiPair } | CpiDataStatus {
  const candidates = buildCpiSourceCandidates();
  let lastReason = "no complete CPI pair";
  for (const pair of candidates.pairs) {
    const validation = validateCpiPair(pair, candidates.metadata);
    if (typeof validation !== "string") return { pair, validated: validation };
    lastReason = `${pair.pair} pair: ${validation}`;
    console.error(`CPI data pair validation failed (${lastReason})`);
  }
  return { baseYear: null, pair: null, valid: false, reason: lastReason };
}
