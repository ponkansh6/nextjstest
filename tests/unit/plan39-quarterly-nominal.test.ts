import { describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_KEYS,
} from "../../src/lib/chartConstants";
import { buildPlan39V2CtiNominalRows } from "../../server/lib/view-models/quarterlyAggregation";
import type { CtiBasicRecord } from "../../server/lib/ctiBasicSeries2025LongTerm";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";
import { buildCsv } from "../../src/lib/csvExport";
import { getMeasurementNote } from "../../src/types/chart";
import type { CpiData } from "../../src/types/data";

const seriesIndexByCategory = Object.fromEntries(
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter((category) => category !== "総合").map(
    (category, index) => [category, index + 2],
  ),
);
const expenseKeys = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter((category) => category !== "総合").map(
  (category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
);
const foodKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.食料;

function makeResult(): CtiAdjustedV2Result {
  const rows: CtiAdjustedV2Row[] = [];
  for (let year = 2005; year <= 2017; year += 1) {
    const values = Object.fromEntries(
      CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => [
        category,
        category === "総合" ? 100 : 10,
      ]),
    ) as CtiAdjustedV2Row["values"];
    rows.push({
      year,
      seriesType: year === 2017 ? "official_adjusted" : "estimated_bottom_up",
      official: year === 2017,
      status: "available",
      reason: null,
      values,
    });
  }
  return {
    model: "v2-bottom-up",
    estimateVersion: "plan39-v2",
    years: rows.map((row) => row.year),
    rows,
    categories: {} as CtiAdjustedV2Result["categories"],
    other: {} as CtiAdjustedV2Result["other"],
    residual: {} as CtiAdjustedV2Result["residual"],
    beta: {} as CtiAdjustedV2Result["beta"],
    fitDiagnostics: {} as CtiAdjustedV2Result["fitDiagnostics"],
    benchmarkG: {},
    benchmarkGDiagnostics: {} as CtiAdjustedV2Result["benchmarkGDiagnostics"],
    artifactValidation: {} as CtiAdjustedV2Result["artifactValidation"],
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

function makeRecords(missing?: string): CtiBasicRecord[] {
  const records: CtiBasicRecord[] = [];
  for (let year = 2005; year <= 2017; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const componentValue = month <= 3 ? 20 : 10;
      const otherValue = month <= 3 ? 5 : 2.5;
      records.push({
        variant: "nominal",
        seriesIndex: 1,
        officialSeriesCode: "1",
        seriesName: "総合（名目）",
        month: `${year}-${String(month).padStart(2, "0")}` as `${number}-${number}`,
        rawValue: componentValue * 9 + otherValue,
        isMissing: false,
      });
      for (const category of CTI_ADJUSTED_V2_PUBLIC_CATEGORIES) {
        if (category === "総合") continue;
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        if (monthKey === missing && category === "食料") continue;
        records.push({
          variant: "nominal",
          seriesIndex: seriesIndexByCategory[category]!,
          officialSeriesCode: String(seriesIndexByCategory[category]),
          seriesName: `${category}（名目）`,
          month: monthKey as `${number}-${number}`,
          rawValue: componentValue,
          isMissing: false,
        });
      }
    }
  }
  return records;
}

function makeRuntimeBridgeData(): CpiData[] {
  const keys = [
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
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const value = month <= 3 ? 180 : 90;
    return {
      年月: `2017年${month}月`,
      ["消費支出（名目）"]: month <= 3 ? 1750 : 925,
      ...Object.fromEntries(keys.map((key) => [key, value])),
    } as unknown as CpiData;
  });
}

function makeDistinctRuntimeBridgeData(): CpiData[] {
  const keys = [
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
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const values = Object.fromEntries(
      keys.map((key, categoryIndex) => [key, (categoryIndex + 2) * (month <= 3 ? 10 : 5)]),
    );
    const total =
      Object.values(values).reduce((sum, value) => sum + Number(value), 0) +
      (month <= 3 ? 110 : 55);
    return {
      年月: `2017年${month}月`,
      ["消費支出（名目）"]: total,
      ...values,
    } as unknown as CpiData;
  });
}

const runtimeMetadata = {
  statInfId: "000040499069",
  baseYear: 2025,
  householdScope: "総世帯",
  unit: "指数",
  frequency: "monthly",
  sourceFile: "cti_data2025.csv",
  rawRange: { startYear: 2017, endYear: 2026 },
  adoptedRange: { startYear: 2017, endYear: 2026 },
};

describe("Plan39-v2 quarterly nominal projection", () => {
  it("preserves monthly seasonality while anchoring each category to v2 annual values", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    expect(rows).toHaveLength(52);
    const q1 = rows.find((row) => row.label === "2005Q1")!;
    const q2 = rows.find((row) => row.label === "2005Q2")!;
    expect(q1.kind).toBe("plan40-v2-cost-stack");
    expect(Object.keys(q1.measurements ?? {})).toEqual(expenseKeys);
    expect(
      Object.keys(q1).filter(
        (key) =>
          key !== "label" &&
          key !== "quarter" &&
          key !== "年" &&
          key !== "年月" &&
          key !== "kind" &&
          key !== "measurements",
      ),
    ).toEqual(expenseKeys);
    const sFood = 112.5 / 10;
    expect(q1[foodKey]).toBeCloseTo(10 * sFood * (20 / 12.5));
    expect(q2[foodKey]).toBeCloseTo(10 * sFood * (10 / 12.5));
    expect(q1.measurements?.[foodKey]).toMatchObject({
      frequency: "quarterly",
      aggregation: "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_plan41_bridge",
      seriesType: "estimated_adjusted",
      official: false,
      annualAnchorType: "estimated",
      quarterlyDerived: true,
    });
    expect(rows.find((row) => row.label === "2017Q4")?.measurements?.[foodKey]).toMatchObject({
      seriesType: "official_adjusted",
      official: false,
      annualAnchorType: "official",
      quarterlyDerived: true,
    });
    const officialQuarter = rows.find((row) => row.label === "2017Q4")?.measurements?.[foodKey];
    expect(getMeasurementNote(officialQuarter ?? {})).toBe(
      "公式Tへ接続補正した年次値を月次系列から四半期化（公式四半期値ではない）",
    );
  });

  it("marks invalid derived quarterly measurements as unavailable", () => {
    expect(
      getMeasurementNote({
        status: "invalid",
        reason: "insufficient_months",
        annualAnchorType: "official",
        quarterlyDerived: true,
      }),
    ).toBe("利用不可: insufficient_months");
  });

  it("uses the injected runtime T for 2017 level and seasonality", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    const q1 = rows.find((row) => row.label === "2017Q1")!;
    const q2 = rows.find((row) => row.label === "2017Q2")!;
    expect(q1[foodKey]).toBeCloseTo(180);
    expect(q2[foodKey]).toBeCloseTo(90);
    expect(q1.measurements?.[foodKey]).toMatchObject({
      source: "e-Stat 公式CTI runtime T 000040499069 / Plan41 bridge",
      statInfId: "000040499069",
      householdScope: "総世帯",
      baseYear: 2025,
      rawRange: { startYear: 2017, endYear: 2026 },
    });
  });

  it("matches all ten 2017 expense categories to raw T quarter means and sums them", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      runtimeCtiData: makeDistinctRuntimeBridgeData(),
      runtimeMetadata,
    });
    const q1 = rows.find((row) => row.label === "2017Q1")!;
    const q2 = rows.find((row) => row.label === "2017Q2")!;
    const q3 = rows.find((row) => row.label === "2017Q3")!;
    const q4 = rows.find((row) => row.label === "2017Q4")!;
    const expectedQ1 = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    const expectedQ2 = expectedQ1.map((value) => value / 2);
    const expectedQ3 = expectedQ2;
    const expectedQ4 = expectedQ2;
    for (const [index, key] of expenseKeys.entries()) {
      expect(q1[key]).toBeCloseTo(expectedQ1[index]!);
      expect(q2[key]).toBeCloseTo(expectedQ2[index]!);
      expect(q3[key]).toBeCloseTo(expectedQ3[index]!);
      expect(q4[key]).toBeCloseTo(expectedQ4[index]!);
      expect(q1.measurements?.[key]).toMatchObject({
        official: false,
        status: "available",
        source: "e-Stat 公式CTI runtime T 000040499069 / Plan41 bridge",
        baseYear: 2025,
      });
    }
    expect(expenseKeys.reduce((sum, key) => sum + Number(q1[key]), 0)).toBeCloseTo(650);
    expect(expenseKeys.reduce((sum, key) => sum + Number(q2[key]), 0)).toBeCloseTo(325);
  });

  it("keeps the fixed s_i annual level and original annual growth through 2005-2016", () => {
    const result = makeResult();
    for (const row of result.rows) {
      row.values.食料 = row.year - 2000;
    }
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result,
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    for (const year of [2005, 2010, 2016]) {
      const quarters = rows.filter((row) => row.年 === year);
      const mean = quarters.reduce((sum, row) => sum + Number(row[foodKey]), 0) / 4;
      expect(mean).toBeCloseTo((year - 2000) * (112.5 / 17));
    }
    const mean2010 =
      rows.filter((row) => row.年 === 2010).reduce((sum, row) => sum + Number(row[foodKey]), 0) / 4;
    const mean2011 =
      rows.filter((row) => row.年 === 2011).reduce((sum, row) => sum + Number(row[foodKey]), 0) / 4;
    expect(mean2011 / mean2010).toBeCloseTo(11 / 10);
  });

  it("fails closed for a negative Other residual instead of using direct series 11", () => {
    const records = [
      ...makeRecords(),
      ...Array.from({ length: 12 }, (_, index) => ({
        variant: "nominal" as const,
        seriesIndex: 11,
        officialSeriesCode: "11",
        seriesName: "その他（直接値）",
        month: `2005-${String(index + 1).padStart(2, "0")}` as `${number}-${number}`,
        rawValue: 999,
        isMissing: false,
      })),
    ];
    for (const record of records) {
      if (record.seriesIndex === 1 && /^2005-0[1-3]$/.test(record.month)) {
        record.rawValue = 179;
      }
    }
    const rows = buildPlan39V2CtiNominalRows({
      records,
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    const q1 = rows.find((row) => row.label === "2005Q1")!;
    const otherKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出;
    // T's Other residual is 130 in Q1 and 115 in the other quarters, so
    // T̄2017=118.75. The historical M residual is -1 in Q1 and 2.5
    // otherwise, giving an annual residual mean of 1.625.
    expect(q1[otherKey]).toBeNull();
    expect(q1.measurements?.[otherKey]).toMatchObject({
      status: "unavailable",
      reason: "invalid_seasonal_input",
      value: null,
    });
    for (const month of ["2005-01", "2005-02", "2005-03"] as const) {
      const total = records.find((record) => record.seriesIndex === 1 && record.month === month);
      const majorRecords = records.filter(
        (record) => record.month === month && record.seriesIndex >= 2 && record.seriesIndex <= 10,
      );
      const majorSum = majorRecords.reduce((sum, record) => {
        if (typeof record.rawValue !== "number") throw new Error("fixture major value is missing");
        return sum + record.rawValue;
      }, 0);
      const totalValue = total?.rawValue;
      expect(totalValue).toBe(179);
      if (typeof totalValue !== "number") throw new Error("fixture total value is missing");
      expect(totalValue - majorSum).toBe(-1);
    }
  });

  it.each([
    ["missing", (data: CpiData[]) => data.splice(0, 1)],
    ["duplicate", (data: CpiData[]) => data.push(data[0]!)],
    [
      "non-positive",
      (data: CpiData[]) => ((data[0] as Record<string, unknown>)["食料（名目）"] = 0),
    ],
  ])("fails closed for a runtime T %s across the bridged period", (_label, mutate) => {
    const runtime = makeDistinctRuntimeBridgeData();
    mutate(runtime);
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      runtimeCtiData: runtime,
      runtimeMetadata,
    });
    for (const row of rows) {
      expect(row.measurements?.[foodKey]?.status).toBe("unavailable");
      expect(row[foodKey]).toBeNull();
    }
  });

  it.each([
    ["missing metadata", undefined],
    ["wrong source id", { ...runtimeMetadata, statInfId: "000040499070" }],
    ["wrong household scope", { ...runtimeMetadata, householdScope: "二人以上の世帯" }],
    [
      "non-finite raw range",
      { ...runtimeMetadata, rawRange: { startYear: Number.NaN, endYear: 2026 } },
    ],
  ])("fails closed for runtime T %s metadata", (_label, metadata) => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    if (metadata === undefined) {
      // A selected T without metadata must not silently fall back to a legacy source.
      const unavailableRows = buildPlan39V2CtiNominalRows({
        records: makeRecords(),
        result: makeResult(),
        runtimeCtiData: makeRuntimeBridgeData(),
      });
      expect(unavailableRows.every((row) => row[foodKey] === null)).toBe(true);
      return;
    }
    const invalidRows = buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata: metadata,
    });
    expect(invalidRows.every((row) => row[foodKey] === null)).toBe(true);
    expect(rows.some((row) => row[foodKey] !== null)).toBe(true);
  });

  it("ignores historical M duplication in 2017 when injected T is valid", () => {
    const records = makeRecords();
    records.push({
      ...records.find((record) => record.month === "2017-01" && record.seriesIndex === 1)!,
    });
    const rows = buildPlan39V2CtiNominalRows({
      records,
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    expect(rows.find((row) => row.label === "2017Q1")?.[foodKey]).toBeCloseTo(180);
  });

  it("does not mutate the Plan39 annual result while injecting runtime T", () => {
    const result = makeResult();
    const before = result.rows.map((row) => ({ year: row.year, food: row.values.食料 }));
    buildPlan39V2CtiNominalRows({
      records: makeRecords(),
      result,
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    expect(result.rows.map((row) => ({ year: row.year, food: row.values.食料 }))).toEqual(before);
  });

  it("fails closed for a missing month and keeps graph/table/CSV measurement metadata identical", () => {
    const rows = buildPlan39V2CtiNominalRows({
      records: makeRecords("2005-02"),
      result: makeResult(),
      runtimeCtiData: makeRuntimeBridgeData(),
      runtimeMetadata,
    });
    const invalid = rows.find((row) => row.label === "2005Q1")!;
    expect(invalid[foodKey]).toBeNull();
    for (const key of expenseKeys) {
      expect(invalid[key]).toBeNull();
      expect(invalid.measurements?.[key]).toMatchObject({
        status: "unavailable",
        value: null,
        reason: "insufficient_months",
      });
    }
    expect(invalid.measurements?.[foodKey]).toMatchObject({
      status: "unavailable",
      reason: "insufficient_months",
      value: null,
    });
    const key = CTI_ADJUSTED_V2_PUBLIC_KEYS.find((candidate) => candidate === foodKey)!;
    const measurement = rows.find((row) => row.measurements?.[key])!.measurements![key]!;
    const csv = buildCsv(rows as unknown as Record<string, unknown>[], [key], [key], {
      metadata: [measurement],
    });
    expect(csv).toContain(`${key}__frequency`);
    expect(csv).toContain("quarterly");
    expect(csv).toContain(measurement.aggregation);
  });
});
