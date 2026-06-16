import * as fs from "node:fs";
import path from "path";
import Papa from "papaparse";

export async function parseCsvFile<T = string[][]>(
  filePath: string,
  options: { header?: boolean } = {},
): Promise<T> {
  if (!fs.existsSync(filePath)) {
    return [] as T;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse<T>(content, { header: options.header ?? false, skipEmptyLines: false });
  return parsed.data as T;
}

export async function parseCsvWithHeader(
  filePath: string,
): Promise<Record<string, string | number>[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse<Record<string, string | number>>(content, {
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data as Record<string, string | number>[];
}

export function findHeaderRow(rows: string[][], patterns: RegExp[]): number {
  return rows.findIndex((row) =>
    row.some((cell) => typeof cell === "string" && patterns.some((p) => p.test(cell.trim()))),
  );
}

export function buildCpiFilePath(filename: string): string {
  return path.join(process.cwd(), "public", filename);
}

export function buildPopulationFilePath(): string {
  return path.join(process.cwd(), "public", "population_statistics.csv");
}

export function buildEarningsFilePaths() {
  return {
    contractual: path.join(process.cwd(), "public", "contractual_earnings.csv"),
    scheduled: path.join(process.cwd(), "public", "scheduled_earnings.csv"),
    total: path.join(process.cwd(), "public", "total_earning.csv"),
    hours: path.join(process.cwd(), "public", "total_worked_hours.csv"),
    employment: path.join(process.cwd(), "public", "employment_indices.csv"),
    honMks: path.join(process.cwd(), "public", "hon-mks202512.csv"),
  };
}

export function buildCtiFilePaths() {
  return {
    main: path.join(process.cwd(), "public", "cti_data.csv"),
    supportNominal: path.join(process.cwd(), "public", "cti_support_nominal.csv"),
    supportReal: path.join(process.cwd(), "public", "cti_support_real.csv"),
  };
}

export function buildCpiFilePaths() {
  return {
    main: path.join(process.cwd(), "public", "cpi_data.csv"),
    contribution: path.join(process.cwd(), "public", "contribution.csv"),
  };
}

export function parseContributionWeights(contributionContent: string): Record<string, number> {
  const weights: Record<string, number> = {};
  const contributionLines = contributionContent.split("\n");
  const categoryLine = contributionLines.find((line) => line.startsWith("類・品目"));
  const weightLine = contributionLines.find((line) => line.startsWith("ウエイト"));
  if (categoryLine && weightLine) {
    const categories = categoryLine.split(",");
    const weightValues = weightLine.split(",");
    categories.forEach((cat, i) => {
      const trimmedCat = cat.trim();
      const weight = parseFloat(weightValues[i]);
      if (trimmedCat && !isNaN(weight)) weights[trimmedCat] = weight;
    });
  }
  return weights;
}

export function parseIndexSection(content: string): Map<string, number> {
  const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false });
  const rows = parsed.data;
  const startIndex = rows.findIndex(
    (row) => (row[0]?.trim() === "年" || row[0]?.trim() === "year") && row[8]?.trim() === "１月",
  );
  if (startIndex === -1) return new Map<string, number>();
  const map = new Map<string, number>();
  for (let i = startIndex + 2; i < rows.length; i++) {
    const row = rows[i];
    const year = row[0]?.trim();
    if (year && year.includes("毎月勤労統計調査")) break;
    if (!year || !/^\d{4}$/.test(year)) continue;
    const yearNum = parseInt(year, 10);
    if (yearNum < 2004) continue;
    for (let m = 1; m <= 12; m++) {
      const val = row[m + 7];
      if (val && val !== "-" && val.trim() !== "") {
        const num = parseFloat(val.trim().replace(/,/g, ""));
        if (!isNaN(num)) map.set(`${year}年${m}月`, num);
      }
    }
  }
  return map;
}
