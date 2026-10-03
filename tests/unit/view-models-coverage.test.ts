import { describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import type { ParseResult } from "papaparse";
import type { CpiData } from "../../src/types";
import type { QuarterlyRow } from "../../src/types/chart";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_NOMINAL_DERIVED_TOTAL_KEY,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import {
  toCpiView,
  toCtiView,
  toEarningsView,
  toLegacyEarningsView,
  toQuarterlyView,
  mergeQuarterlyGdpView,
} from "../../server/lib/view-models/dashboard";
import {
  buildPlan39V2CtiNominalRows,
  coalesceQuarterlyRowsByPeriod,
  computeQuarterlyAggregates,
  loadPlan39V2CtiNominalRows,
} from "../../server/lib/view-models/quarterlyAggregation";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import {
  calculateQuarterlyComparisonFactor,
  convertQuarterlyRawRows,
  hasContinuousQuarterlyPeriods,
  joinQuarterlyGdpRows,
} from "../../server/lib/view-models/quarterlyGdpTransform";
import { deriveQuarterlyRealRows } from "../../server/lib/view-models/quarterlyProjection";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";
import type { CtiBasicRecord } from "../../server/lib/ctiBasicSeries2025LongTerm";

const quarterlyLoaderMocks = vi.hoisted(() => ({
  loadCpiData: vi.fn(),
  loadCtiData: vi.fn(),
}));
const filesystemMock = vi.hoisted(() => ({ readFileSync: vi.fn() }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  filesystemMock.readFileSync.mockImplementation(
    (...args) => actual.readFileSync(...(args as Parameters<typeof actual.readFileSync>)) as never,
  );
  return {
    ...actual,
    default: { ...actual, readFileSync: filesystemMock.readFileSync },
    readFileSync: filesystemMock.readFileSync,
  };
});

vi.mock("../../server/lib/dataLoader", () => ({
  loadCpiData: quarterlyLoaderMocks.loadCpiData,
  loadCtiData: quarterlyLoaderMocks.loadCtiData,
}));

const expenseCategories = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
  (category) => category !== "総合",
);
const seriesByCategory = Object.fromEntries(
  expenseCategories.map((category, index) => [category, index + 2]),
);

function makeCpiData(年月: string): CpiData {
  return {
    年月,
    総合: 100,
    生鮮食品を除く総合: 100,
    持家の帰属家賃を除く総合: 100,
    "消費支出（参考）": null,
    "CPI総合(参考)": 100,
  };
}

function makePlan39Result(): CtiAdjustedV2Result {
  const rows: CtiAdjustedV2Row[] = [];
  for (let year = 2005; year <= 2016; year += 1) {
    rows.push({
      year,
      seriesType: "estimated_bottom_up",
      official: false,
      status: "available",
      reason: null,
      values: Object.fromEntries(
        CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => [
          category,
          category === "総合" ? 100 : 10,
        ]),
      ) as CtiAdjustedV2Row["values"],
    });
  }
  return {
    model: "v2-bottom-up",
    estimateVersion: "plan39-v2",
    years: rows.map((row) => row.year),
    rows,
    categories: {} as CtiAdjustedV2Result["categories"],
    householdComposition: {} as CtiAdjustedV2Result["householdComposition"],
    other: {} as CtiAdjustedV2Result["other"],
    residual: {} as CtiAdjustedV2Result["residual"],
    beta: {} as CtiAdjustedV2Result["beta"],
    fitDiagnostics: {} as CtiAdjustedV2Result["fitDiagnostics"],
    benchmarkG: {},
    benchmarkGDiagnostics: {} as CtiAdjustedV2Result["benchmarkGDiagnostics"],
    artifactValidation: {} as CtiAdjustedV2Result["artifactValidation"],
    plan40InputValidation: {
      valid: true,
      status: "available",
      reasonCodes: [],
      diagnostics: [],
      targetYears: [],
      inputCategories: [],
      normalizedBaseYear: 2025,
    },
    publicationGate: {
      accepted: true,
      status: "pass",
      reasonCodes: [],
      blockingReasonCodes: [],
      warningReasonCodes: [],
      diagnostics: [],
    },
  };
}

function makePlan39Records(): CtiBasicRecord[] {
  const records: CtiBasicRecord[] = [];
  for (let year = 2005; year <= 2016; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}` as `${number}-${number}`;
      const component = month <= 3 ? 20 : 10;
      records.push({
        variant: "nominal",
        seriesIndex: 1,
        officialSeriesCode: "1",
        seriesName: "総合（名目）",
        month: monthKey,
        rawValue: component * 9,
        isMissing: false,
      });
      for (const category of expenseCategories) {
        records.push({
          variant: "nominal",
          seriesIndex: seriesByCategory[category]!,
          officialSeriesCode: String(seriesByCategory[category]),
          seriesName: `${category}（名目）`,
          month: monthKey,
          rawValue: component,
          isMissing: false,
        });
      }
    }
  }
  return records;
}

function nominalQuarter(): QuarterlyRow {
  const row: QuarterlyRow = {
    label: "2025Q1",
    quarter: 1,
    年: 2025,
    年月: "2025年1月",
  };
  for (const category of expenseCategories) {
    const key = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category];
    row[key] = 20;
  }
  row[CTI_NOMINAL_DERIVED_TOTAL_KEY] = 100;
  return row;
}

function cpiQuarter(): CpiData[] {
  return [1, 2, 3].map((month) => {
    const row = makeCpiData(`2025年${month}月`);
    for (const category of expenseCategories) row[category] = 100;
    row["持家の帰属家賃を除く住居"] = 110;
    row["持家の帰属家賃を除く総合"] = 120;
    return row;
  });
}

describe("server view-model boundary coverage", () => {
  it("projects finite and missing monthly values while filtering earnings measurements", () => {
    const monthly = Object.assign(makeCpiData("2025年1月"), {
      a: 1.236,
      b: Number.NaN,
      c: "bad",
    });
    Object.defineProperty(monthly, "measurements", {
      value: { a: { value: 1 }, b: { value: 2 } },
      enumerable: true,
    });
    const rows = [monthly];
    expect(toCpiView(rows, ["a", "b", "c", "missing"])).toEqual([
      { 年月: "2025年1月", a: 1.24, b: null, c: null, missing: null },
    ]);
    expect(toCtiView(rows, ["a", "b"])).toEqual([{ 年月: "2025年1月", a: 1.24, b: null }]);
    const earnings = toEarningsView(rows, ["年月", "a", "b"]);
    expect(earnings[0]).toMatchObject({ 年月: "2025年1月", a: 1.24, b: null });
    expect(earnings[0]?.measurements).toEqual({ a: { value: 1 }, b: { value: 2 } });
    expect(Object.keys(earnings[0]!)).toContain("measurements");
    expect(toEarningsView([makeCpiData("2025年2月")], ["a"])[0]?.measurements).toBeUndefined();
    expect(() => toEarningsView(rows, ["民間最終消費支出（名目・原値）"])).toThrow(
      "Plan37 public projection contains legacy keys: 民間最終消費支出（名目・原値）",
    );
    expect(toLegacyEarningsView(rows, ["a", "b"])).toEqual([
      { 年月: "2025年1月", a: 1.24, b: null },
    ]);
    expect(
      toQuarterlyView(
        [{ label: "2025Q1", quarter: 1, 年: 2025, 年月: "2025年1月", n: 2.345, bad: "x" }],
        ["n", "bad"],
      ),
    ).toEqual([{ label: "2025Q1", quarter: 1, 年: 2025, 年月: "2025年1月", n: 2.35 }]);
    const quarterly = [{ label: "2025Q1", quarter: 1, 年: 2025, 年月: "2025年1月" }];
    expect(
      mergeQuarterlyGdpView(quarterly, [{ period: "2025-Q1", nominalRaw: 2, realRaw: 1 }]),
    ).toBe(quarterly);
  });

  it("validates GDP quarters, rejects malformed factors, and joins only matching finite real comparisons", () => {
    expect(hasContinuousQuarterlyPeriods([], "2025-Q1", "2025-Q1")).toBe(false);
    expect(hasContinuousQuarterlyPeriods(["2025-Q1"], "bad", "2025-Q1")).toBe(false);
    expect(calculateQuarterlyComparisonFactor([1, 2, 3, 4])).toBe(40);
    expect(calculateQuarterlyComparisonFactor([1, 2, 3, -6])).toBeUndefined();
    expect(calculateQuarterlyComparisonFactor([1, 2, 3, Number.NaN])).toBeUndefined();
    expect(
      convertQuarterlyRawRows([{ period: "2025-Q1", nominalRaw: 2, realRaw: 3 }], {
        nominal: Number.NaN,
        real: 2,
      }),
    ).toEqual([{ period: "2025-Q1", nominalRaw: 2, realRaw: 3, realComparison: 6 }]);

    const realRows = [
      { label: "2025Q1", quarter: 1, 年: 2025, 年月: "2025年1月", [SUPPORT_SERIES_KEY_REAL]: 9 },
      { label: "bad", quarter: 1, 年: 2025, 年月: "2025年1月", [SUPPORT_SERIES_KEY_REAL]: 8 },
      {
        label: "invalid-year",
        quarter: 1,
        年: 99,
        年月: "0099年1月",
        [SUPPORT_SERIES_KEY_REAL]: 7,
      },
      {
        label: "invalid-quarter",
        quarter: 5,
        年: 2025,
        年月: "2025年13月",
        [SUPPORT_SERIES_KEY_REAL]: 6,
      },
    ];
    const joined = joinQuarterlyGdpRows([], realRows, {
      comparisonReady: true,
      rows: [
        { period: "bad", nominalRaw: 1, realRaw: 1, realComparison: 7 },
        { period: "2025-Q1", nominalRaw: 1, realRaw: 1, realComparison: Number.NaN },
        { period: "2025-Q1", nominalRaw: 1, realRaw: 1, realComparison: 6 },
      ],
    });
    expect(joined.real[0]?.[SUPPORT_SERIES_KEY_REAL]).toBe(6);
    expect(joined.real[1]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
    expect(joined.real[2]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
    expect(joined.real[3]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
    expect(realRows[0]?.[SUPPORT_SERIES_KEY_REAL]).toBe(9);
  });

  it("returns unavailable real series for duplicate, malformed, invalid, and overflow CPI inputs", () => {
    const duplicateMonths = [...cpiQuarter(), { ...cpiQuarter()[0]! }];
    const duplicate = deriveQuarterlyRealRows([nominalQuarter()], duplicateMonths)[0]!;
    expect(duplicate.measurements?.["食料（実質）"]).toMatchObject({
      status: "unavailable",
      reason: "duplicate_cpi_month",
    });

    const malformedMonth = Object.assign(makeCpiData("not-a-month"), { 食料: 1 });
    const missingMonth = { ...makeCpiData("2025年4月"), 年月: undefined } as unknown as CpiData;
    const malformed = deriveQuarterlyRealRows(
      [nominalQuarter()],
      [...cpiQuarter(), malformedMonth, missingMonth],
    )[0]!;
    expect(malformed.measurements?.["食料（実質）"]?.status).toBe("available");

    const invalidCpi = cpiQuarter();
    invalidCpi[1]!["食料"] = 0;
    const invalid = deriveQuarterlyRealRows([nominalQuarter()], invalidCpi)[0]!;
    expect(invalid.measurements?.["食料（実質）"]).toMatchObject({
      status: "unavailable",
      reason: "cpi_value_invalid",
    });

    const overflowNominal = nominalQuarter();
    overflowNominal[CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料] = Number.MAX_VALUE;
    const overflow = deriveQuarterlyRealRows([overflowNominal], cpiQuarter())[0]!;
    expect(overflow.measurements?.["食料（実質）"]).toMatchObject({
      status: "unavailable",
      reason: "real_value_non_finite",
    });

    const invalidMeasurementNominal = nominalQuarter();
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;
    invalidMeasurementNominal.measurements = {
      [foodKey]: {
        key: foodKey,
        label: foodKey,
        unit: "指数",
        source: "test source",
        valueType: "comparison",
        value: 20,
        status: "invalid",
        reason: "invalid_source_measurement",
        frequency: "quarterly",
        aggregation: "quarterly test input",
      },
    };
    const invalidMeasurement = deriveQuarterlyRealRows(
      [invalidMeasurementNominal],
      cpiQuarter(),
    )[0]!;
    expect(invalidMeasurement.measurements?.["食料（実質）"]).toMatchObject({
      status: "unavailable",
      reason: "invalid_source_measurement",
    });
  });

  it("fails closed for invalid Plan39 monthly data, anchors, and official observations", () => {
    const result = makePlan39Result();
    const records = makePlan39Records();
    const duplicated = [...records, { ...records[0]! }];
    const duplicateRows = buildPlan39V2CtiNominalRows({ records: duplicated, result });
    expect(
      duplicateRows.find((row) => row.label === "2005Q1")?.measurements?.[
        CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
      ],
    ).toMatchObject({ status: "unavailable", reason: "duplicate_month" });

    const invalidSeasonality = makePlan39Records();
    invalidSeasonality.find(
      (record) => record.seriesIndex === 2 && record.month === "2005-01",
    )!.rawValue = 0;
    const invalidRows = buildPlan39V2CtiNominalRows({ records: invalidSeasonality, result });
    expect(
      invalidRows.find((row) => row.label === "2005Q1")?.measurements?.[
        CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
      ],
    ).toMatchObject({ status: "unavailable", reason: "invalid_seasonal_input" });

    const rejectedInputResult = makePlan39Result();
    rejectedInputResult.plan40InputValidation!.valid = false;
    const rejectedInputRows = buildPlan39V2CtiNominalRows({ records, result: rejectedInputResult });
    expect(
      rejectedInputRows.find((row) => row.label === "2005Q1")?.measurements?.[
        CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
      ],
    ).toMatchObject({ status: "unavailable", reason: "v2_annual_anchor_unavailable" });

    const rejectedResult = makePlan39Result();
    rejectedResult.publicationGate.accepted = false;
    const rejectedRows = buildPlan39V2CtiNominalRows({ records, result: rejectedResult });
    expect(
      rejectedRows.find((row) => row.label === "2005Q1")?.measurements?.[
        CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
      ],
    ).toMatchObject({ status: "unavailable", reason: "v2_annual_anchor_unavailable" });

    const unavailableOfficial = buildPlan39V2CtiNominalRows({
      records,
      result,
      officialQuarterly: null,
    });
    expect(
      unavailableOfficial.find((row) => row.label === "2017Q1")?.measurements?.[
        CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
      ],
    ).toMatchObject({
      status: "unavailable",
      reason: "official_quarterly_source_unavailable_latest_period_unknown",
    });

    const officialQuarterly = [
      {
        label: "2017Q1",
        year: 2017,
        quarter: 1,
        values: Object.fromEntries([
          ["総合", 0],
          ...expenseCategories.map((category) => [category, category === "食料" ? 0 : 1]),
        ]),
      },
    ];
    const officialRows = buildPlan39V2CtiNominalRows({ records, result, officialQuarterly });
    const official = officialRows.find((row) => row.label === "2017Q1")!;
    expect(official[CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料]).toBeNull();
    expect(official[CTI_NOMINAL_DERIVED_TOTAL_KEY]).toBe(0);

    const missingOfficialValues = [
      {
        label: "2017Q1",
        year: 2017,
        quarter: 1,
        values: Object.fromEntries([
          ["総合", null],
          ...expenseCategories.map((category) => [category, null]),
        ]),
      },
    ];
    const missingOfficial = buildPlan39V2CtiNominalRows({
      records,
      result,
      officialQuarterly: missingOfficialValues,
    }).find((row) => row.label === "2017Q1")!;
    expect(missingOfficial[CTI_NOMINAL_DERIVED_TOTAL_KEY]).toBeNull();
    expect(missingOfficial.measurements?.[CTI_NOMINAL_DERIVED_TOTAL_KEY]).toMatchObject({
      status: "unavailable",
      reason: "official_quarterly_value_unavailable",
    });
    expect(missingOfficial[CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出]).toBeNull();

    for (const mutation of ["is-missing", "non-finite"] as const) {
      const brokenRecords = makePlan39Records();
      const foodMonth = brokenRecords.find(
        (record) => record.seriesIndex === 2 && record.month === "2005-01",
      )!;
      if (mutation === "is-missing") foodMonth.isMissing = true;
      else foodMonth.rawValue = Number.NaN;
      const unavailable = buildPlan39V2CtiNominalRows({ records: brokenRecords, result });
      expect(
        unavailable.find((row) => row.label === "2005Q1")?.measurements?.[
          CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
        ],
      ).toMatchObject({ status: "unavailable", reason: "insufficient_months" });
    }
  });

  it("fails closed when the verified official quarter file cannot be read or parsed", () => {
    const paths = buildCtiFilePaths();
    const originalReadFileSync = filesystemMock.readFileSync.getMockImplementation()!;
    filesystemMock.readFileSync.mockImplementation((path, options) => {
      if (String(path) === paths.candidateDistributionAdjustedQuarterlyMetadata) {
        throw new Error("simulated missing quarterly metadata");
      }
      return originalReadFileSync(path, options as never);
    });
    try {
      const fallback = loadPlan39V2CtiNominalRows(makePlan39Result());
      expect(
        fallback.find((row) => row.label === "2017Q1")?.measurements?.[
          CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
        ],
      ).toMatchObject({
        status: "unavailable",
        reason: "official_quarterly_source_unavailable_latest_period_unknown",
      });
    } finally {
      filesystemMock.readFileSync.mockImplementation(originalReadFileSync);
    }
  });

  it("rejects a metadata contract mismatch before accepting the official source", () => {
    const paths = buildCtiFilePaths();
    const originalReadFileSync = filesystemMock.readFileSync.getMockImplementation()!;
    filesystemMock.readFileSync.mockImplementation((path, options) => {
      if (String(path) === paths.candidateDistributionAdjustedQuarterlyMetadata) {
        return Buffer.from(JSON.stringify({ schemaVersion: "wrong-contract" }));
      }
      return originalReadFileSync(path, options as never);
    });
    try {
      const fallback = loadPlan39V2CtiNominalRows(makePlan39Result());
      expect(
        fallback.find((row) => row.label === "2017Q1")?.measurements?.[
          CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
        ],
      ).toMatchObject({
        status: "unavailable",
        reason: "official_quarterly_source_unavailable_latest_period_unknown",
      });
    } finally {
      filesystemMock.readFileSync.mockImplementation(originalReadFileSync);
    }
  });

  it("rejects parser errors, wrong schemas, malformed periods, and missing required values", () => {
    const fields = ["period", ...CTI_ADJUSTED_V2_PUBLIC_CATEGORIES];
    const validRow = Object.fromEntries([
      ["period", "2017Q1"],
      ...CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => [category, 1]),
    ]);
    const cases: Array<ParseResult<Record<string, string | number>>> = [
      {
        data: [],
        errors: [
          { type: "Delimiter", code: "UndetectableDelimiter", message: "fixture parse error" },
        ],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0,
          fields,
        },
      },
      {
        data: [],
        errors: [],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0,
          fields: ["wrong"],
        },
      },
      {
        data: [{ ...validRow, period: "invalid" }],
        errors: [],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0,
          fields,
        },
      },
      {
        data: [{ ...validRow, period: 2017 }],
        errors: [],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0,
          fields,
        },
      },
      {
        data: [{ period: "2017Q1" }],
        errors: [],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0,
          fields,
        },
      },
      {
        data: [validRow],
        errors: [],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0,
          fields,
        },
      },
    ];
    for (const parsed of cases) {
      const parseSpy = vi.spyOn(Papa, "parse").mockReturnValue(parsed as never);
      try {
        const fallback = loadPlan39V2CtiNominalRows(makePlan39Result());
        expect(
          fallback.find((row) => row.label === "2017Q1")?.measurements?.[
            CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料
          ],
        ).toMatchObject({
          status: "unavailable",
          reason: "official_quarterly_source_unavailable_latest_period_unknown",
        });
      } finally {
        parseSpy.mockRestore();
      }
    }
  });

  it("coalesces both source precedence orders and rejects labels duplicated across periods", () => {
    const legacy: QuarterlyRow = {
      label: "2018Q1",
      quarter: 1,
      年: 2018,
      年月: "2018年1月",
      kind: "legacy-cti",
      legacyValue: 10,
    };
    const official: QuarterlyRow = {
      label: "2018Q1",
      quarter: 1,
      年: 2018,
      年月: "2018年1月",
      kind: "plan40-official-quarterly",
      officialValue: 20,
    };
    expect(coalesceQuarterlyRowsByPeriod([legacy, official])[0]).toMatchObject({
      kind: "plan40-official-quarterly",
      legacyValue: 10,
      officialValue: 20,
    });
    expect(coalesceQuarterlyRowsByPeriod([official, legacy])[0]).toMatchObject({
      kind: "plan40-official-quarterly",
      legacyValue: 10,
      officialValue: 20,
    });
    expect(coalesceQuarterlyRowsByPeriod([legacy, { ...legacy, kind: undefined }])[0]?.kind).toBe(
      "legacy-cti",
    );
    expect(() => coalesceQuarterlyRowsByPeriod([legacy, { ...legacy, 年: 2019 }])).toThrow(
      "Duplicate quarterly label after merge: 2018Q1",
    );
  });

  it("preserves unavailable totals and official residuals when finite inputs overflow or are missing", () => {
    const overflowResult = makePlan39Result();
    overflowResult.rows[0]!.values.総合 = Number.MAX_VALUE;
    const overflowRecords = makePlan39Records().map((record) =>
      record.seriesIndex === 1 && record.month.startsWith("2005-")
        ? { ...record, rawValue: Number.MAX_VALUE }
        : record,
    );
    const overflowTotal = buildPlan39V2CtiNominalRows({
      records: overflowRecords,
      result: overflowResult,
    }).find((row) => row.label === "2005Q1")!;
    expect(overflowTotal.measurements?.[CTI_NOMINAL_DERIVED_TOTAL_KEY]).toMatchObject({
      status: "unavailable",
      reason: "non_finite_seasonal_projection",
    });

    const officialWithMissingComponent = [
      {
        label: "2017Q1",
        year: 2017,
        quarter: 1,
        values: Object.fromEntries([
          ["総合", 100],
          ...expenseCategories.map((category) => [category, category === "食料" ? null : 1]),
        ]),
      },
    ];
    const officialResidual = buildPlan39V2CtiNominalRows({
      records: makePlan39Records(),
      result: makePlan39Result(),
      officialQuarterly: officialWithMissingComponent,
    }).find((row) => row.label === "2017Q1")!;
    expect(officialResidual[CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出]).toBeNull();
  });

  it("keeps monthly aggregation limited to complete quarters before the CPI cutoff", () => {
    const rowForMonth = (month: number): CpiData => {
      const row = makeCpiData(`2018年${month}月`);
      for (const key of CONSUMPTION_NOMINAL_KEYS) row[key] = month;
      for (const key of CONSUMPTION_REAL_KEYS) row[key] = month * 2;
      return row;
    };
    const complete = computeQuarterlyAggregates([rowForMonth(1), rowForMonth(2), rowForMonth(3)], {
      year: 2018,
      month: 3,
    });
    expect(complete.real.find((row) => row.label === "2018Q1")?.[CONSUMPTION_REAL_KEYS[0]!]).toBe(
      4,
    );

    const incomplete = computeQuarterlyAggregates([rowForMonth(1), rowForMonth(3)], {
      year: 2018,
      month: 2,
    });
    expect(incomplete.real.some((row) => row.label === "2018Q1")).toBe(false);

    const beforeSupportedPeriod = computeQuarterlyAggregates(
      [makeCpiData("") as CpiData, makeCpiData("not-a-month")],
      { year: 1993, month: 1 },
    );
    expect(beforeSupportedPeriod.real).toEqual([]);
  });

  it("ignores malformed CPI dates and advances the reported latest month only when newer", async () => {
    quarterlyLoaderMocks.loadCpiData.mockResolvedValue([
      makeCpiData("not-a-month"),
      makeCpiData("1990年12月"),
      makeCpiData("1994年1月"),
      makeCpiData("2020年2月"),
      makeCpiData("2020年1月"),
    ]);
    quarterlyLoaderMocks.loadCtiData.mockResolvedValue([]);
    const result = await loadQuarterlyPublicData();
    expect(result.maxCpiDate).toEqual({ year: 2020, month: 2 });
    expect(quarterlyLoaderMocks.loadCpiData).toHaveBeenCalledWith({ rawIndex: true });
    expect(quarterlyLoaderMocks.loadCtiData).toHaveBeenCalledWith();
  });
});
