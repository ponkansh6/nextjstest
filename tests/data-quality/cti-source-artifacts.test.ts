import { createHash } from "node:crypto";
import * as fs from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";

const CTI_CSV_PATH = "data/source/cti_data2025.csv";
const CTI_METADATA_PATH = "data/source/cti_data2025.metadata.json";

type Period = { start: string; end: string; monthlyRows?: number; annualRows?: number };

const toMonthNumber = (value: string) => {
  const match = value.match(/^(\d{4})年(\d{1,2})月$/);
  if (!match) throw new Error(`Invalid Japanese month: ${value}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
};

describe("2025 CTI checked-in source artifacts", () => {
  it("pins the official CTI source identity, column names, hash, and continuous monthly records", () => {
    const metadata = JSON.parse(fs.readFileSync(CTI_METADATA_PATH, "utf8")) as {
      status: string;
      baseYear: number;
      outputFile: string;
      statInfId: string;
      tableTitle: string;
      householdScope: string;
      csvSha256: string;
      period: Period;
    };
    const content = fs.readFileSync(CTI_CSV_PATH, "utf8");
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    const months = parsed.data.map((row) => row.月);

    expect(metadata).toMatchObject({
      status: "ready",
      baseYear: 2025,
      outputFile: "cti_data2025.csv",
      statInfId: "000040499069",
      tableTitle: "10大費目別 世帯消費動向指数（原数値） 総世帯",
      householdScope: "総世帯",
    });
    expect(parsed.meta.fields).toEqual(
      expect.arrayContaining(["時間軸コード", "月", "消費支出（名目）", "消費支出（実質）"]),
    );
    expect(createHash("sha256").update(content).digest("hex")).toBe(metadata.csvSha256);
    expect(months).toHaveLength(metadata.period.monthlyRows!);
    for (let index = 1; index < months.length; index += 1) {
      expect(toMonthNumber(months[index])).toBe(toMonthNumber(months[index - 1]) + 1);
    }
  });
});
