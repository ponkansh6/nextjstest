import { createHash } from "node:crypto";
import * as fs from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";

const CTI_CSV_PATH = "data/source/cti_data2025.csv";
const CTI_METADATA_PATH = "data/source/cti_data2025.metadata.json";
const GDP_NOMINAL_CSV_PATH = "data/source/cti_support_nominal2025.csv";
const GDP_NOMINAL_METADATA_PATH = "data/source/cti_support_nominal2025.metadata.json";
const GDP_REAL_CSV_PATH = "data/source/cti_support_real2025.csv";
const GDP_REAL_METADATA_PATH = "data/source/cti_support_real2025.metadata.json";
const GDP_NORMALIZATION_PATH = "data/source/cti-gdp-display-normalization2025.json";

type Period = { start: string; end: string; monthlyRows?: number; annualRows?: number };

const toMonthNumber = (value: string) => {
  const match = value.match(/^(\d{4})年(\d{1,2})月$/);
  if (!match) throw new Error(`Invalid Japanese month: ${value}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
};

const toYearNumber = (value: string) => {
  const match = value.match(/^(\d{4})$/);
  if (!match) throw new Error(`Invalid GDP year: ${value}`);
  return Number(match[1]);
};

describe("2025 CTI and GDP checked-in source artifacts", () => {
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

  it("pins nominal and real annual GDP values, provenance, hashes, and 2025 normalization", () => {
    const read = (csvPath: string, metadataPath: string) => {
      const content = fs.readFileSync(csvPath, "utf8");
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
        status: string;
        seriesCode: string;
        seriesName: string;
        sourceFrequency: string;
        rawValuePreserved: boolean;
        csvSha256: string;
        period: Period;
        normalizationYear: string;
      };
      const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
      });
      return { content, metadata, parsed, years: parsed.data.map((row) => row["時間軸（暦年）"]) };
    };
    const nominal = read(GDP_NOMINAL_CSV_PATH, GDP_NOMINAL_METADATA_PATH);
    const real = read(GDP_REAL_CSV_PATH, GDP_REAL_METADATA_PATH);
    const normalization = JSON.parse(fs.readFileSync(GDP_NORMALIZATION_PATH, "utf8")) as {
      status: string;
      normalizationYear: string;
      nominal: { value2025: number; normalizedValue2025: number };
      real: { value2025: number; normalizedValue2025: number };
      validation: { allSeriesReady: boolean };
    };

    for (const source of [nominal, real]) {
      expect(source.metadata).toMatchObject({
        status: "ready",
        seriesCode: "12",
        seriesName: "民間最終消費支出",
        sourceFrequency: "annual",
        rawValuePreserved: true,
        normalizationYear: "2025",
      });
      expect(source.parsed.meta.fields).toEqual(["時間軸（暦年）", "民間最終消費支出"]);
      expect(createHash("sha256").update(source.content).digest("hex")).toBe(
        source.metadata.csvSha256,
      );
      expect(source.years).toHaveLength(source.metadata.period.annualRows!);
      expect(source.years[0]).toBe("1994");
      expect(source.years.at(-1)).toBe("2025");
      for (let index = 1; index < source.years.length; index += 1) {
        expect(toYearNumber(source.years[index])).toBe(toYearNumber(source.years[index - 1]) + 1);
      }
    }
    expect(nominal.parsed.data.at(-1)).toMatchObject({
      "時間軸（暦年）": "2025",
      民間最終消費支出: "350910.7",
    });
    expect(real.parsed.data.at(-1)).toMatchObject({
      "時間軸（暦年）": "2025",
      民間最終消費支出: "308122.2",
    });
    expect(normalization).toMatchObject({
      status: "ready",
      normalizationYear: "2025",
      nominal: { value2025: 350910.7, normalizedValue2025: 100 },
      real: { value2025: 308122.2, normalizedValue2025: 100 },
      validation: { allSeriesReady: true },
    });
  });
});
