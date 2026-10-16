import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import Papa from "papaparse";
import { afterEach, describe, expect, it } from "vitest";
import {
  EARNINGS_CLASSIFICATIONS,
  EARNINGS_HEADERS,
  EARNINGS_SOURCE_ID,
  EARNINGS_VALUE_COLUMNS,
  earningsAdapter,
  parseEarningsIndexCsv,
} from "../../../scripts/data-refresh/adapters/earnings.mjs";

const canonicalFiles = {
  total_earning: "total_earning.csv",
  contractual_earnings: "contractual_earnings.csv",
  scheduled_earnings: "scheduled_earnings.csv",
  total_worked_hours: "total_worked_hours.csv",
  employment_indices: "employment_indices.csv",
  part_time_worker_ratio: "part_time_worker_ratio.csv",
};
const canonicalHeaders = [
  "年",
  "1-12",
  "1-6",
  "7-12",
  "1-3",
  "4-6",
  "7-9",
  "10-12",
  ...Array.from({ length: 12 }, (_, i) => String(i + 1)),
  "4-3",
];
const canonicalEnglish = [
  "year",
  "年平均",
  "上半期",
  "下半期",
  "第１四半期",
  "第２四半期",
  "第３四半期",
  "第４四半期",
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  "年度平均",
];
const canonicalEnglishAbbr = [
  "",
  "year av.",
  "1st Half",
  "2nd Half",
  "1st Qr.",
  "2nd Qr.",
  "3rd Qr.",
  "4th Qr.",
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec.",
  "fiscal y. av.",
];
const tempRoots = [];
afterEach(async () =>
  Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

function periodList(fromYear, fromMonth, toYear, toMonth) {
  const periods = [];
  for (
    let year = fromYear, month = fromMonth;
    year < toYear || (year === toYear && month <= toMonth);
  ) {
    periods.push(`${year}${String(month).padStart(2, "0")}`);
    if (month === 12) {
      year += 1;
      month = 1;
    } else month += 1;
  }
  return periods;
}

function sourceValues(index) {
  return {
    total_earning: 130 + index / 10,
    contractual_earnings: 110 + index / 10,
    scheduled_earnings: 120 + index / 10,
    total_worked_hours: 90 + index / 10,
    employment_indices: 100 + index / 10,
    part_time_worker_ratio: 31 + index / 1000,
  };
}
function annualValuesFor(year) {
  const offset = year - 1990;
  return {
    total_earning: 700 + offset / 10,
    contractual_earnings: 600 + offset / 10,
    scheduled_earnings: 500 + offset / 10,
    total_worked_hours: 400 + offset / 10,
    employment_indices: 100 + offset / 10,
    part_time_worker_ratio: 31 + offset / 100,
  };
}

function sourceRow(period, index) {
  const cells = Array(21).fill("");
  const values = sourceValues(index);
  ["指数", period.slice(0, 4), String(Number(period.slice(4))), "TL", "T", "0"].forEach(
    (value, column) => {
      cells[column] = value;
    },
  );
  for (const [series, column] of Object.entries(EARNINGS_VALUE_COLUMNS))
    cells[column] = String(values[series]);
  return cells;
}

function annualSourceRow(year) {
  const cells = sourceRow(`${year}01`, 0);
  cells[2] = "CY";
  const values = annualValuesFor(Number(year));
  for (const [series, column] of Object.entries(EARNINGS_VALUE_COLUMNS))
    cells[column] = String(values[series]);
  return cells;
}

function encodedSource(rows) {
  return iconv.encode(
    `${[EARNINGS_HEADERS, ...rows].map((row) => row.join(",")).join("\r\n")}\r\n`,
    "windows-31j",
  );
}

function canonicalCsv(series, periods) {
  const monthlyByYear = new Map();
  periods.forEach((period, index) => {
    if (period >= "202607") return;
    const year = period.slice(0, 4);
    const values = monthlyByYear.get(year) ?? Array(12).fill("-");
    values[Number(period.slice(4)) - 1] = String(sourceValues(index)[series]);
    monthlyByYear.set(year, values);
  });
  const rows = [canonicalHeaders, canonicalEnglish, canonicalEnglishAbbr];
  for (let year = 1952; year <= 2026; year += 1) {
    const annual = year >= 1990 && year <= 2025 ? String(annualValuesFor(year)[series]) : "-";
    rows.push([
      String(year),
      annual,
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
      ...(monthlyByYear.get(String(year)) ?? Array(12).fill("-")),
      "-",
    ]);
  }
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

describe("earnings source contract parser", () => {
  it("decodes Windows-31J and maps all six official series by semantic header", () => {
    const period = "202606";
    const parsed = parseEarningsIndexCsv(encodedSource([sourceRow(period, 0)]));
    expect(parsed.statInfId).toBe(EARNINGS_SOURCE_ID);
    expect(parsed.coverage).toEqual({ start: period, end: period, monthlyRows: 1 });
    expect(parsed.observations[0].values).toEqual(sourceValues(0));
    expect(EARNINGS_VALUE_COLUMNS).toMatchObject({
      total_earning: 6,
      contractual_earnings: 7,
      scheduled_earnings: 8,
      total_worked_hours: 13,
      employment_indices: 17,
      part_time_worker_ratio: 18,
    });
    expect(parsed.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("selects only the exact index, industry, size, and employment classifications before validating the month", () => {
    const ignored = sourceRow("not-a-month", 0);
    ignored[3] = "OTHER";
    const parsed = parseEarningsIndexCsv(encodedSource([ignored, sourceRow("202606", 1)]));
    expect(parsed.observations).toHaveLength(1);
    expect(EARNINGS_CLASSIFICATIONS).toEqual({
      type: "指数",
      industry: "TL",
      establishmentSize: "T",
      employmentType: "0",
    });
  });

  it("fails closed on unknown semantic headers and malformed record width", () => {
    const changedHeader = [...EARNINGS_HEADERS];
    changedHeader[17] = "雇用数";
    const decoded = iconv.decode(encodedSource([sourceRow("202606", 0)]), "windows-31j");
    const renamed = decoded.replace(EARNINGS_HEADERS.join(","), changedHeader.join(","));
    expect(() => parseEarningsIndexCsv(iconv.encode(renamed, "windows-31j"))).toThrow(
      /headers do not match/i,
    );
    expect(() =>
      parseEarningsIndexCsv(encodedSource([sourceRow("202606", 0).slice(0, -1)])),
    ).toThrow(/exactly 21 columns/i);
  });

  it("rejects duplicate and missing matching months", () => {
    expect(() =>
      parseEarningsIndexCsv(encodedSource([sourceRow("202601", 0), sourceRow("202601", 1)])),
    ).toThrow(/duplicate observations/i);
    expect(() =>
      parseEarningsIndexCsv(encodedSource([sourceRow("202601", 0), sourceRow("202603", 1)])),
    ).toThrow(/missing monthly observation 202602/i);
  });

  it("rejects invalid periods, values, and unit-incompatible ratios", () => {
    expect(() => parseEarningsIndexCsv(encodedSource([sourceRow("202613", 0)]))).toThrow(
      /invalid monthly period/i,
    );
    const badNumber = sourceRow("202606", 0);
    badNumber[EARNINGS_VALUE_COLUMNS.total_worked_hours] = "NaN";
    expect(() => parseEarningsIndexCsv(encodedSource([badNumber]))).toThrow(/invalid value/i);
    const badRatio = sourceRow("202606", 0);
    badRatio[EARNINGS_VALUE_COLUMNS.part_time_worker_ratio] = "100.1";
    expect(() => parseEarningsIndexCsv(encodedSource([badRatio]))).toThrow(/percentage/i);
  });

  it("requires every output series to be present in the latest month", () => {
    const latest = sourceRow("202606", 0);
    latest[EARNINGS_VALUE_COLUMNS.employment_indices] = "";
    expect(() => parseEarningsIndexCsv(encodedSource([latest]))).toThrow(
      /latest source month is missing employment_indices/i,
    );
  });

  it("integrates all six series, preserves exact 438-month overlap, and records the intentional identity migration", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "earnings-adapter-"));
    tempRoots.push(root);
    const sourceDir = path.join(root, "data/source");
    await mkdir(sourceDir, { recursive: true });
    const history = periodList(1990, 1, 2026, 7);
    for (const [series, filename] of Object.entries(canonicalFiles)) {
      await writeFile(path.join(sourceDir, filename), canonicalCsv(series, history));
    }
    const annualRows = Array.from({ length: 36 }, (_, offset) =>
      annualSourceRow(String(1990 + offset)),
    );
    const rows = [...history.map((period, index) => sourceRow(period, index)), ...annualRows];
    const bytes = encodedSource(rows);
    const result = await earningsAdapter({
      source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
      root,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
      fetchFile: async () => ({ bytes }),
    });
    expect(result.coverage).toEqual({ start: "199001", end: "202607", monthlyRows: 439 });

    for (const [series, filename] of Object.entries(canonicalFiles)) {
      const artifact = result.artifacts.find(
        ({ path: output }) => output === `data/source/${filename}`,
      );
      expect(artifact).toBeDefined();
      const rowsOut = Papa.parse(artifact.bytes.toString("utf8"), { skipEmptyLines: true }).data;
      const july = rowsOut.find((row) => row[0] === "2026");
      expect(Number(july[14])).toBe(sourceValues(history.length - 1)[series]);
      expect(result.revisionAudit[series]).toMatchObject({
        overlapCount: 438,
        annualOverlapCount: 36,
        changedValueCount: 0,
      });
      for (const period of history.slice(0, -1)) {
        const yearRow = rowsOut.find((row) => row[0] === period.slice(0, 4));
        expect(Number(yearRow[7 + Number(period.slice(4))])).toBe(
          sourceValues(history.indexOf(period))[series],
        );
      }
      for (let year = 1990; year <= 2025; year += 1) {
        expect(Number(rowsOut.find((row) => row[0] === String(year))[1])).toBe(
          annualValuesFor(year)[series],
        );
      }
      expect(july[1]).toBe("-");
      expect(july[3]).toBe("-");
      expect(july[6]).toBe("-");
      expect(july[7]).toBe("-");
      expect(july[20]).toBe("-");
    }
    const employmentMetadata = JSON.parse(
      result.artifacts
        .find(({ path: output }) => output.endsWith("employment_indices.metadata.json"))
        .bytes.toString("utf8"),
    );
    expect(employmentMetadata).toMatchObject({
      normalizedCsvSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      extraction: {
        sourceType: "指数",
        industry: "TL",
        establishmentSize: "T",
        employmentType: "0",
      },
      semanticMigration: {
        intentional: true,
        preservedPreMigrationMonthlyRows: 438,
        verifiedPartTimeOverlapRows: 438,
        verifiedEmploymentOverlapRows: 438,
      },
    });
    expect(result.validationSummary.migration.intentional).toBe(true);
  });
});
