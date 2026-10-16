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
  EARNINGS_SOURCE_URL,
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

function sourceRow(period, index, valueOverrides = {}) {
  const cells = Array(21).fill("");
  const values = { ...sourceValues(index), ...valueOverrides };
  ["指数", period.slice(0, 4), String(Number(period.slice(4))), "TL", "T", "0"].forEach(
    (value, column) => {
      cells[column] = value;
    },
  );
  for (const [series, column] of Object.entries(EARNINGS_VALUE_COLUMNS))
    cells[column] = String(values[series]);
  return cells;
}

function annualSourceRow(year, valueOverrides = {}) {
  const cells = sourceRow(`${year}01`, 0);
  cells[2] = "CY";
  const values = { ...annualValuesFor(Number(year)), ...valueOverrides };
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

function canonicalCsv(
  series,
  periods,
  {
    monthlyOverrides = {},
    annualOverrides = {},
    includeGrowthTable = false,
    includeLatestPeriod = false,
  } = {},
) {
  const monthlyByYear = new Map();
  periods.forEach((period, index) => {
    if (period >= "202607" && !includeLatestPeriod) return;
    const year = period.slice(0, 4);
    const values = monthlyByYear.get(year) ?? Array(12).fill("-");
    values[Number(period.slice(4)) - 1] = String(sourceValues(index)[series]);
    values[Number(period.slice(4)) - 1] = String(
      monthlyOverrides[period] ?? sourceValues(index)[series],
    );
    monthlyByYear.set(year, values);
  });
  const rows = [canonicalHeaders, canonicalEnglish, canonicalEnglishAbbr];
  for (let year = 1952; year <= 2026; year += 1) {
    const annual =
      year >= 1990 && year <= 2025
        ? String(annualOverrides[year]?.[series] ?? annualValuesFor(year)[series])
        : "-";
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
  if (includeGrowthTable) {
    rows.push(canonicalHeaders);
    for (let year = 1952; year <= 2026; year += 1)
      rows.push([
        String(year),
        "999",
        "999",
        "999",
        "999",
        "999",
        "999",
        "999",
        ...Array(12).fill("999"),
        "999",
      ]);
  }
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

function estatPreambleCsv(csv) {
  const rows = Papa.parse(csv, { skipEmptyLines: false }).data;
  const blank = Array(21).fill("");
  return [
    ["毎月勤労統計調査(MONTHLY LABOUR SURVEY)", ...Array(20).fill("")],
    ["事業所規模(Size of establishments)："],
    ["就業形態(Type of Employment):"],
    ["産業(Industry):"],
    blank,
    ["指数(Indices)"],
    ...rows,
  ]
    .map((row) => row.join(","))
    .join("\n");
}

async function expectCanonicalLayoutRejected(csv, message) {
  const root = await mkdtemp(path.join(os.tmpdir(), "earnings-canonical-layout-"));
  tempRoots.push(root);
  const sourceDir = path.join(root, "data/source");
  await mkdir(sourceDir, { recursive: true });
  for (const [series, filename] of Object.entries(canonicalFiles)) {
    await writeFile(
      path.join(sourceDir, filename),
      series === "total_earning" ? csv : canonicalCsv(series, ["202606"]),
    );
  }
  const bytes = encodedSource([sourceRow("202606", 0)]);
  await expect(
    earningsAdapter({
      source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
      root,
      fetchFile: async () => ({ bytes }),
    }),
  ).rejects.toThrow(message);
}

describe("earnings source contract parser", () => {
  it("uses the official CSV download action for Monthly Labour Survey table 2", () => {
    expect(EARNINGS_SOURCE_URL).toBe(
      "https://www.e-stat.go.jp/stat-search/file-download?fileKind=1&statInfId=000032189777",
    );
  });

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

  it.each([
    { name: "normalized one-header canonicals", includeGrowthTable: false },
    { name: "legacy repeated-header canonicals", includeGrowthTable: true },
  ])("accepts $name and ignores a trailing growth table", async ({ includeGrowthTable }) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "earnings-canonical-growth-"));
    tempRoots.push(root);
    const sourceDir = path.join(root, "data/source");
    await mkdir(sourceDir, { recursive: true });
    const history = periodList(1990, 1, 2026, 7);
    for (const [series, filename] of Object.entries(canonicalFiles))
      await writeFile(
        path.join(sourceDir, filename),
        canonicalCsv(series, history, { includeGrowthTable }),
      );
    const bytes = encodedSource([
      ...history.map((period, index) => sourceRow(period, index)),
      ...Array.from({ length: 36 }, (_, offset) => annualSourceRow(String(1990 + offset))),
    ]);
    const result = await earningsAdapter({
      source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
      root,
      fetchFile: async () => ({ bytes }),
    });
    expect(result.artifacts).toHaveLength(8);
    const total = result.artifacts.find(({ path: outputPath }) =>
      outputPath.endsWith("total_earning.csv"),
    );
    expect(total.bytes.toString("utf8")).toContain("1990,700,");
    expect(total.bytes.toString("utf8")).not.toContain("1990,999,");
  });

  it("fails closed when canonical monthly headers are absent, malformed, inconsistent, or extra", async () => {
    const normalized = canonicalCsv("total_earning", ["202606"], { includeGrowthTable: true });
    const rows = Papa.parse(normalized, { skipEmptyLines: false }).data;
    const firstHeaderIndex = rows.findIndex((row) => row[0] === "年");
    const secondHeaderIndex = rows.findIndex(
      (row, index) => index > firstHeaderIndex && row[0] === "年",
    );
    const missingHeaders = rows
      .filter((row) => row[0] !== "年")
      .map((row) => row.join(","))
      .join("\n");
    await expectCanonicalLayoutRejected(missingHeaders, /one valid monthly earnings header/i);

    const extraHeader = `${normalized}${canonicalHeaders.join(",")}\n`;
    await expectCanonicalLayoutRejected(extraHeader, /one valid monthly earnings header/i);

    const malformedRows = [...rows];
    malformedRows[firstHeaderIndex] = [
      "年",
      ...canonicalHeaders.slice(1, 8),
      "01",
      ...canonicalHeaders.slice(9),
    ];
    await expectCanonicalLayoutRejected(
      malformedRows.map((row) => row.join(",")).join("\n"),
      /one valid monthly earnings header/i,
    );

    const inconsistentRows = [...rows];
    inconsistentRows[secondHeaderIndex] = [
      "年",
      ...canonicalHeaders.slice(1, 7),
      "changed",
      ...canonicalHeaders.slice(8),
    ];
    await expectCanonicalLayoutRejected(
      inconsistentRows.map((row) => row.join(",")).join("\n"),
      /one valid monthly earnings header/i,
    );
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
      const csv = canonicalCsv(series, history);
      await writeFile(
        path.join(sourceDir, filename),
        series === "contractual_earnings" ? estatPreambleCsv(csv) : csv,
      );
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

    const total = result.artifacts.find(
      ({ path: output }) => output === "data/source/total_earning.csv",
    );
    const generatedRows = Papa.parse(total.bytes.toString("utf8"), { skipEmptyLines: true }).data;
    expect(generatedRows[0]).toEqual(canonicalHeaders);
    expect(generatedRows[1][0]).toBe("year");
    expect(generatedRows[1].slice(8, 20)).toEqual([
      "１月",
      "２月",
      "３月",
      "４月",
      "５月",
      "６月",
      "７月",
      "８月",
      "９月",
      "１０月",
      "１１月",
      "１２月",
    ]);

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

  it("keeps the semantic fingerprint stable across canonical-baseline audit changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "earnings-fingerprint-stability-"));
    tempRoots.push(root);
    const sourceDir = path.join(root, "data/source");
    await mkdir(sourceDir, { recursive: true });
    const sourceHistory = periodList(1990, 1, 2026, 7);
    const annualRows = Array.from({ length: 36 }, (_, offset) =>
      annualSourceRow(String(1990 + offset)),
    );
    const bytes = encodedSource([
      ...sourceHistory.map((period, index) => sourceRow(period, index)),
      ...annualRows,
    ]);
    const runAdapter = async (
      canonicalHistory,
      sourceBytes = bytes,
      url = undefined,
      includeLatestPeriod = false,
    ) => {
      for (const [series, filename] of Object.entries(canonicalFiles))
        await writeFile(
          path.join(sourceDir, filename),
          canonicalCsv(series, canonicalHistory, { includeLatestPeriod }),
        );
      return earningsAdapter({
        source: {
          identity: {
            kind: "file",
            statInfId: EARNINGS_SOURCE_ID,
            format: "csv",
            ...(url ? { url } : {}),
          },
        },
        root,
        fetchFile: async () => ({ bytes: sourceBytes }),
      });
    };

    const beforePublish = await runAdapter(sourceHistory.slice(0, -1));
    const afterPublish = await runAdapter(sourceHistory, bytes, undefined, true);
    expect(afterPublish.revisionAudit.total_earning.overlapCount).toBe(
      beforePublish.revisionAudit.total_earning.overlapCount + 1,
    );
    expect(beforePublish.semanticValue).toEqual(afterPublish.semanticValue);

    const withChangedIdentity = await runAdapter(
      sourceHistory,
      bytes,
      "https://www.e-stat.go.jp/stat-search/file-download?statInfId=other",
      true,
    );
    expect(withChangedIdentity.semanticValue).not.toEqual(afterPublish.semanticValue);

    const extendedHistory = periodList(1990, 1, 2026, 8);
    const extendedBytes = encodedSource([
      ...extendedHistory.map((period, index) => sourceRow(period, index)),
      ...annualRows,
    ]);
    const changedContent = await runAdapter(sourceHistory, extendedBytes, undefined, true);
    expect(changedContent.semanticValue.sourceSha256).not.toBe(
      afterPublish.semanticValue.sourceSha256,
    );
    expect(changedContent.semanticValue.coverage).not.toEqual(afterPublish.semanticValue.coverage);
    expect(changedContent.semanticValue.normalizedOutputSha256).not.toEqual(
      afterPublish.semanticValue.normalizedOutputSha256,
    );
  });

  it("accepts only the two verified total-earnings annual midpoint cases", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "earnings-annual-rounding-"));
    tempRoots.push(root);
    const sourceDir = path.join(root, "data/source");
    await mkdir(sourceDir, { recursive: true });
    const history = periodList(1990, 1, 2026, 7);
    const monthlyOverrides = {};
    for (const year of [1991, 2010]) {
      for (let month = 1; month <= 12; month += 1) {
        monthlyOverrides[`${year}${String(month).padStart(2, "0")}`] =
          (year === 1991 ? 104.7 : 99.8) + (month > 6 ? 0.1 : 0);
      }
    }
    const annualOverrides = {
      1991: { total_earning: 104.7 },
      2010: { total_earning: 99.8 },
    };
    for (const [series, filename] of Object.entries(canonicalFiles)) {
      await writeFile(
        path.join(sourceDir, filename),
        canonicalCsv(
          series,
          history,
          series === "total_earning" ? { monthlyOverrides, annualOverrides } : {},
        ),
      );
    }
    const annualRows = Array.from({ length: 36 }, (_, offset) => {
      const year = 1990 + offset;
      const value = year === 1991 ? 104.8 : year === 2010 ? 99.9 : undefined;
      return annualSourceRow(String(year), value === undefined ? {} : { total_earning: value });
    });
    const bytes = encodedSource([
      ...history.map((period, index) =>
        sourceRow(
          period,
          index,
          monthlyOverrides[period] === undefined ? {} : { total_earning: monthlyOverrides[period] },
        ),
      ),
      ...annualRows,
    ]);
    const result = await earningsAdapter({
      source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
      root,
      fetchFile: async () => ({ bytes }),
    });
    expect(result.revisionAudit.total_earning).toMatchObject({
      annualOverlapCount: 36,
      acceptedAnnualRoundingAdjustmentCount: 2,
      acceptedAnnualRoundingAdjustmentSample: [
        {
          series: "total_earning",
          year: "1991",
          oldValue: 104.7,
          newValue: 104.8,
          reason: "official-cy-upper-rounding-at-monthly-midpoint",
        },
        {
          series: "total_earning",
          year: "2010",
          oldValue: 99.8,
          newValue: 99.9,
          reason: "official-cy-upper-rounding-at-monthly-midpoint",
        },
      ],
    });
  });

  it("accepts part-time CY precision only when both annual values are exact monthly means", async () => {
    const runCase = async ({
      oldAnnual = 20,
      officialAnnual = 20.04,
      monthOverrides = {},
      otherSeriesAnnual,
    } = {}) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "earnings-part-time-precision-"));
      tempRoots.push(root);
      const sourceDir = path.join(root, "data/source");
      await mkdir(sourceDir, { recursive: true });
      const history = periodList(1990, 1, 2026, 7);
      const canonicalMonthly = {};
      const sourceMonthly = {};
      for (let month = 1; month <= 12; month += 1) {
        const period = `1990${String(month).padStart(2, "0")}`;
        canonicalMonthly[period] = monthOverrides[period] ?? (month === 12 ? 20.48 : 20);
        sourceMonthly[period] = monthOverrides[period] ?? (month === 12 ? 20.48 : 20);
      }
      if (monthOverrides.changedSourcePeriod)
        sourceMonthly[monthOverrides.changedSourcePeriod] += 0.01;
      const annualOverrides = { 1990: { part_time_worker_ratio: oldAnnual } };
      if (otherSeriesAnnual !== undefined) annualOverrides[1990].total_earning = 700;
      for (const [series, filename] of Object.entries(canonicalFiles)) {
        await writeFile(
          path.join(sourceDir, filename),
          canonicalCsv(series, history, {
            monthlyOverrides: series === "part_time_worker_ratio" ? canonicalMonthly : {},
            annualOverrides: series === "part_time_worker_ratio" ? annualOverrides : {},
          }),
        );
      }
      const bytes = encodedSource([
        ...history.map((period, index) =>
          sourceRow(
            period,
            index,
            sourceMonthly[period] === undefined
              ? {}
              : { part_time_worker_ratio: sourceMonthly[period] },
          ),
        ),
        ...Array.from({ length: 36 }, (_, offset) => {
          const year = String(1990 + offset);
          return annualSourceRow(
            year,
            year === "1990"
              ? {
                  part_time_worker_ratio: officialAnnual,
                  ...(otherSeriesAnnual === undefined ? {} : { total_earning: otherSeriesAnnual }),
                }
              : {},
          );
        }),
      ]);
      return earningsAdapter({
        source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
        root,
        fetchFile: async () => ({ bytes }),
      });
    };

    const result = await runCase();
    expect(result.revisionAudit.part_time_worker_ratio).toMatchObject({
      acceptedAnnualRoundingAdjustmentCount: 1,
      acceptedAnnualRoundingAdjustmentSample: [
        {
          series: "part_time_worker_ratio",
          year: "1990",
          oldValue: 20,
          newValue: 20.04,
          reason: "official-cy-matches-monthly-mean-at-higher-precision",
        },
      ],
    });
    const csv = result.artifacts
      .find(({ path: output }) => output === "data/source/part_time_worker_ratio.csv")
      .bytes.toString("utf8");
    expect(Papa.parse(csv, { skipEmptyLines: true }).data.find((row) => row[0] === "1990")[1]).toBe(
      "20.04",
    );

    await expect(runCase({ officialAnnual: 20.05 })).rejects.toMatchObject({
      code: "earnings-annual-overlap-revision-unverified",
    });
    await expect(runCase({ oldAnnual: 20.1 })).rejects.toMatchObject({
      code: "earnings-annual-overlap-revision-unverified",
    });
    await expect(runCase({ monthOverrides: { 199001: "" } })).rejects.toMatchObject({
      code: "earnings-annual-overlap-revision-unverified",
    });
    await expect(
      runCase({ monthOverrides: { changedSourcePeriod: "199001" } }),
    ).rejects.toMatchObject({
      code: "earnings-overlap-revision-unverified",
    });
    await expect(runCase({ otherSeriesAnnual: 701 })).rejects.toMatchObject({
      code: "earnings-annual-overlap-revision-unverified",
      earningsAnnualOverlapDiagnostics: { series: "total_earning" },
    });
  });

  it("keeps non-ties, unlisted years, and changed monthly overlaps fail-closed", async () => {
    const scenarios = [
      {
        name: "non-tie",
        year: 1991,
        expected: "earnings-annual-overlap-revision-unverified",
        nonTie: true,
      },
      {
        name: "unlisted-year",
        year: 1992,
        expected: "earnings-annual-overlap-revision-unverified",
      },
      {
        name: "changed-month",
        year: 1991,
        expected: "earnings-overlap-revision-unverified",
        changedMonth: true,
      },
    ];
    for (const scenario of scenarios) {
      const root = await mkdtemp(path.join(os.tmpdir(), `earnings-${scenario.name}-`));
      tempRoots.push(root);
      const sourceDir = path.join(root, "data/source");
      await mkdir(sourceDir, { recursive: true });
      const history = periodList(1990, 1, 2026, 7);
      const year = scenario.year;
      const lower = year === 1991 ? 104.7 : 100;
      const upper = lower + 0.1;
      const canonicalMonthly = {};
      const sourceMonthly = {};
      for (let month = 1; month <= 12; month += 1) {
        const value = month > 6 || (scenario.nonTie && month === 1) ? upper : lower;
        const period = `${year}${String(month).padStart(2, "0")}`;
        canonicalMonthly[period] = value;
        sourceMonthly[period] = value;
      }
      if (scenario.changedMonth) sourceMonthly[`${year}01`] = upper;
      const annual = { [year]: { total_earning: lower } };
      const sourceAnnual = { [year]: { total_earning: upper } };
      for (const [series, filename] of Object.entries(canonicalFiles)) {
        await writeFile(
          path.join(sourceDir, filename),
          canonicalCsv(
            series,
            history,
            series === "total_earning"
              ? { monthlyOverrides: canonicalMonthly, annualOverrides: annual }
              : {},
          ),
        );
      }
      const annualRows = Array.from({ length: 36 }, (_, offset) => {
        const annualYear = 1990 + offset;
        return annualSourceRow(String(annualYear), sourceAnnual[annualYear] ?? {});
      });
      const bytes = encodedSource([
        ...history.map((period, index) =>
          sourceRow(
            period,
            index,
            sourceMonthly[period] === undefined ? {} : { total_earning: sourceMonthly[period] },
          ),
        ),
        ...annualRows,
      ]);
      await expect(
        earningsAdapter({
          source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
          root,
          fetchFile: async () => ({ bytes }),
        }),
      ).rejects.toMatchObject({ code: scenario.expected });
    }
  });

  it("reports bounded, redaction-safe annual revision diagnostics while keeping the gate closed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "earnings-annual-revision-"));
    tempRoots.push(root);
    const sourceDir = path.join(root, "data/source");
    await mkdir(sourceDir, { recursive: true });
    const history = periodList(1990, 1, 2026, 7);
    for (const [series, filename] of Object.entries(canonicalFiles)) {
      let csv = canonicalCsv(series, history);
      if (series === "total_earning") csv = csv.replace("\n1990,700,", "\n1990,701,");
      await writeFile(path.join(sourceDir, filename), csv);
    }
    const annualRows = Array.from({ length: 36 }, (_, offset) =>
      annualSourceRow(String(1990 + offset)),
    );
    const bytes = encodedSource([
      ...history.map((period, index) => sourceRow(period, index)),
      ...annualRows,
    ]);

    const result = earningsAdapter({
      source: { identity: { kind: "file", statInfId: EARNINGS_SOURCE_ID, format: "csv" } },
      root,
      fetchFile: async () => ({ bytes }),
    });
    await expect(result).rejects.toMatchObject({
      code: "earnings-annual-overlap-revision-unverified",
      earningsAnnualOverlapDiagnostics: {
        series: "total_earning",
        mismatchCount: 1,
        sample: [{ year: "1990", oldValue: 701, newValue: 700 }],
      },
    });
    const error = await result.catch((caught) => caught);
    const diagnostics = error.earningsAnnualOverlapDiagnostics;
    expect(Object.keys(diagnostics).sort()).toEqual(["mismatchCount", "sample", "series"]);
    expect(Object.keys(diagnostics.sample[0]).sort()).toEqual(["newValue", "oldValue", "year"]);
    expect(diagnostics.sample[0].year).toMatch(/^\d{4}$/);
    expect(Number.isFinite(diagnostics.sample[0].oldValue)).toBe(true);
    expect(Number.isFinite(diagnostics.sample[0].newValue)).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toContain(EARNINGS_SOURCE_URL);
  });
});
