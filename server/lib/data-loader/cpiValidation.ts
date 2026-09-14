import * as fs from "node:fs";
import Papa from "papaparse";
import type { CpiData } from "@/types";
import { parseYearMonth } from "@/lib/yearMonth";
import { parseContributionWeights } from "../dataIo";

const CPI_DATE_HEADER = "年月";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export type CpiPair = {
  baseYear: 2020 | 2025;
  pair: "2020" | "2025";
  mainPath: string;
  contributionPath: string;
};

export type ValidatedCpiPair = {
  weights: Record<string, number>;
  data: CpiData[];
};

export function validateContribution(
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

/** Validates the CSV pair without checking 2025 metadata or its file hashes. */
export function validateCpiFiles(pair: CpiPair): ValidatedCpiPair | string {
  if (!fs.existsSync(pair.mainPath) || !fs.existsSync(pair.contributionPath)) {
    return "missing index or contribution file";
  }
  const contribution = validateContribution(fs.readFileSync(pair.contributionPath, "utf8"));
  if (typeof contribution === "string") return contribution;
  const { data, meta } = Papa.parse<CpiData>(fs.readFileSync(pair.mainPath, "utf8"), {
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  });
  const headers = (meta.fields ?? []).map((header) => header.trim());
  if (!headers.includes(CPI_DATE_HEADER))
    return `missing required index header: ${CPI_DATE_HEADER}`;
  if (new Set(headers).size !== headers.length) return "duplicate index headers";
  if (
    !(data as CpiData[]).some((row) => {
      const parsed = parseYearMonth(row[CPI_DATE_HEADER] as string);
      return parsed ? parsed.year >= 2004 : false;
    })
  )
    return "index contains no valid 年月 rows";
  const missingIndexHeaders = contribution.headers.filter((header) => !headers.includes(header));
  if (missingIndexHeaders.length > 0)
    return `missing required index headers: ${missingIndexHeaders.join(", ")}`;
  return { weights: contribution.weights, data: data as CpiData[] };
}
