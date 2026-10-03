import { describe, expect, it, vi } from "vitest";
import {
  calculateRawCalendarYearFactor,
  calculateSupportScale,
  filterDataByYear,
  mergeChartData,
  replaceWithAnnualAverage,
} from "../../src/lib/chartUtils";
import {
  compareYearMonth,
  extractYear,
  normalizeYearMonth,
  parseYearMonth,
  toCanonicalYearMonth,
} from "../../src/lib/yearMonth";
import { createDualResetHandler, createResetHandler } from "../../src/lib/resetLogic";
import {
  calculateCAGRValue,
  calculateCategorySum,
  computeChartData,
  sumCategoryValues,
} from "../../src/lib/math/clientCalculations";
import {
  calculateQuarter,
  calculateQuarterLabel,
  getQuarterMonths,
} from "../../src/lib/math/quarter";
import {
  CTI_COMPLETENESS_START_YEAR,
  isCompleteCtiQuarter,
} from "../../src/lib/math/quarterlyCompleteness";
import { trailingMovingAverage } from "../../server/lib/math/movingAverage";
import { createMissingSeriesMeasurement, getMeasurementNote } from "../../src/types/chart";
import type { CpiData } from "../../src/types";

const makeCpiRow = (年月: string, overrides: Partial<CpiData> = {}): CpiData => ({
  年月,
  総合: 100,
  生鮮食品を除く総合: 100,
  持家の帰属家賃を除く総合: 100,
  "消費支出（参考）": null,
  "CPI総合(参考)": null,
  ...overrides,
});

describe("core utility boundary contracts", () => {
  it("normalizes only valid month spellings and keeps invalid comparisons neutral", () => {
    expect(toCanonicalYearMonth(" 2024年01月 ")).toBe("2024-01");
    expect(toCanonicalYearMonth(null as unknown as string)).toBeNull();
    expect(toCanonicalYearMonth("2024/9")).toBe("2024-09");
    expect(parseYearMonth("2024-12")).toEqual({ year: 2024, month: 12 });
    expect(toCanonicalYearMonth("2024年0月")).toBeNull();
    expect(toCanonicalYearMonth("2024-13")).toBeNull();
    expect(toCanonicalYearMonth("2024Q1")).toBeNull();
    expect(compareYearMonth("2023年12月", "2024年1月")).toBe(-1);
    expect(compareYearMonth("2024年1月", "2024/01")).toBe(0);
    expect(compareYearMonth("bad", "2024年1月")).toBe(0);
    expect(normalizeYearMonth("2024/01")).toBe("2024年1月");
    expect(normalizeYearMonth("bad")).toBe("bad");
    expect(extractYear(null as unknown as string)).toBeNull();
    expect(extractYear("2024Q4")).toBe(2024);
    expect(extractYear("2024Q5")).toBeNull();
    expect(extractYear("bad")).toBeNull();
  });

  it("covers 2020 scaling, raw annual completeness, date filtering and merged row boundaries", () => {
    const scaleRows = [
      makeCpiRow("2020年1月", { CPI: 10 }),
      makeCpiRow("2020年2月", { CPI: 0 }),
      makeCpiRow("2020年3月", { CPI: -10 }),
      makeCpiRow("2020年4月"),
      makeCpiRow("2019年12月", { CPI: 500 }),
    ];
    expect(calculateSupportScale(scaleRows, "CPI")).toBe(10);
    expect(calculateSupportScale([makeCpiRow("2020年1月", { CPI: 0 })], "CPI")).toBe(1);
    expect(calculateSupportScale([], "CPI")).toBe(1);

    expect(
      calculateRawCalendarYearFactor(
        [
          { year: 2024, value: 10 },
          { year: 2024, value: 30 },
          { year: 2023, value: 999 },
        ],
        2024,
        2,
      ),
    ).toBe(5);
    expect(calculateRawCalendarYearFactor([{ year: 2024, value: 10 }], 2024, 2)).toBeUndefined();
    expect(calculateRawCalendarYearFactor([{ year: 2024, value: 0 }], 2024, 1)).toBeUndefined();
    expect(
      calculateRawCalendarYearFactor([{ year: 2024, value: Number.NaN }], 2024, 1),
    ).toBeUndefined();
    expect(calculateRawCalendarYearFactor([{ year: 2024, value: -10 }], 2024, 1)).toBeUndefined();

    const dated = [{ 年月: "2023Q4" }, { 年月: "2024年01月" }, { 年月: "bad" }, { 年月: "2025/1" }];
    expect(filterDataByYear(dated, 2024, 2024)).toEqual([{ 年月: "2024年01月" }]);

    const wages = [
      makeCpiRow("2024年2月", { 賃金: 20, 既存: "keep" }),
      makeCpiRow("2024年1月", { 賃金: 19 }),
    ];
    const cpi = [
      makeCpiRow("2024年2月", { 総合: 105, 比較系列: 77, 既存: undefined }),
      makeCpiRow("2024年1月", { 総合: 104 }),
      makeCpiRow("2024年3月", { 総合: 103 }),
      makeCpiRow("2025年1月", { 総合: 106 }),
      makeCpiRow("bad", { 総合: 999 }),
    ];
    const merged = mergeChartData(wages, cpi, 2024, 2024);
    expect(merged.map((row) => row.年月)).toEqual(["2024年1月", "2024年2月"]);
    expect(merged[1]).toMatchObject({ 賃金: 20, 総合: 105, 比較系列: 77, 既存: "keep" });
  });

  it("averages exactly twelve positive monthly observations and nulls incomplete or invalid years", () => {
    const fullYear = Array.from({ length: 12 }, (_, index) => ({
      年月: `2022年${index + 1}月`,
      指数: index + 1,
    }));
    const output = replaceWithAnnualAverage(
      [
        ...fullYear,
        { 年月: "2023年1月", 指数: 9 },
        { 年月: "invalid", 指数: 8 },
        { 年月: "2024年1月", 指数: 0 },
        { 指数: 4 },
      ],
      "指数",
    );
    expect(output.slice(0, 12).map((row) => row.指数)).toEqual(Array(12).fill(6.5));
    expect(output.slice(12).map((row) => row.指数)).toEqual([null, null, null, null]);
    expect(replaceWithAnnualAverage([], "指数")).toEqual([]);

    const overfullYear = [...fullYear, { 年月: "2022年12月", 指数: 20 }];
    expect(replaceWithAnnualAverage(overfullYear, "指数")[0]?.指数).toBeNull();
  });

  it("toggles reset sets from the current state and independently for paired charts", () => {
    const set = vi.fn();
    createResetHandler({ hiddenKeys: ["stale"], allKeys: ["a", "b"], setHiddenKeys: set })();
    const updater = set.mock.calls[0]?.[0] as (prev: string[]) => string[];
    expect(updater(["a"])).toEqual([]);
    expect(updater([])).toEqual(["a", "b"]);

    const setNominal = vi.fn();
    const setReal = vi.fn();
    createDualResetHandler(
      { hiddenKeys: [], allKeys: ["n1"], setHiddenKeys: setNominal },
      { hiddenKeys: [], allKeys: ["r1", "r2"], setHiddenKeys: setReal },
    )();
    const nominalUpdater = setNominal.mock.calls[0]?.[0] as (prev: string[]) => string[];
    const realUpdater = setReal.mock.calls[0]?.[0] as (prev: string[]) => string[];
    expect(nominalUpdater([])).toEqual(["n1"]);
    expect(nominalUpdater(["n1"])).toEqual([]);
    expect(realUpdater([])).toEqual(["r1", "r2"]);
    expect(realUpdater(["r2"])).toEqual([]);
  });

  it("sums visible numeric categories, finds exact months, and filters server quarterly projections", () => {
    const row = {
      年月: "2024年3月",
      food: 12,
      rent: 8,
      absent: undefined,
      label: "not numeric",
    } as unknown as CpiData;
    expect(sumCategoryValues(row, ["food", "rent", "absent", "label"])).toBe(20);
    expect(sumCategoryValues(row, ["food", "rent"], ["rent"])).toBe(12);
    expect(
      calculateCategorySum(
        [{ 年月: null } as unknown as CpiData, row],
        2024,
        3,
        [],
        ["food", "rent"],
      ),
    ).toBe(20);
    expect(() => calculateCategorySum([row], 2024, 4, [], ["food"])).toThrow("2024年04月");
    expect(calculateCAGRValue(100, 121, 2)).toBeCloseTo(0.1);
    expect(calculateCAGRValue(0, 121, 2)).toBe(0);
    expect(calculateCAGRValue(100, 121, 0)).toBe(0);

    const nominal = [1, 2, 3, 4].map((quarter) => ({ label: `2024Q${quarter}`, quarter }));
    const real = [
      { label: "2024Q1", quarter: 1 },
      { label: "2024Q4", quarter: 4 },
    ];
    const result = computeChartData(
      {
        nominalData: [],
        startYear: 2024,
        endYear: 2024,
        maxCpiDate: { year: 2024, month: 12 },
        quarterlyNominalData: nominal,
        quarterlyRealData: real,
      },
      [2, 4],
    );
    expect(result.quarterlyNominalData.map((entry) => entry.quarter)).toEqual([1, 3]);
    expect(result.quarterlyRealData.map((entry) => entry.quarter)).toEqual([1]);
    expect(
      computeChartData(
        { nominalData: [], startYear: 0, endYear: 0, maxCpiDate: { year: 0, month: 1 } },
        [],
      ).quarterlyNominalData,
    ).toEqual([]);
  });

  it("maps months to quarter labels and month ranges at every quarter boundary", () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12].map(calculateQuarter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(calculateQuarterLabel(2024, 4)).toBe("2024年10～12月期");
    expect([1, 2, 3, 4].map(getQuarterMonths)).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 12],
    ]);
  });

  it("requires finite measurements for each month from the official completeness start", () => {
    const keys = ["a", "b"];
    const q1 = new Map<string, Record<string, unknown>>();
    [1, 2, 3].forEach((month) => q1.set(`2024年${month}月`, { a: 0, b: 10 }));
    expect(CTI_COMPLETENESS_START_YEAR).toBe(2018);
    expect(isCompleteCtiQuarter(q1, 2017, 4, keys)).toBe(true);
    expect(isCompleteCtiQuarter(q1, 2024, 1, keys)).toBe(true);
    expect(isCompleteCtiQuarter(q1, 2024, 0, keys)).toBe(false);
    expect(isCompleteCtiQuarter(q1, 2024, 5, keys)).toBe(false);
    expect(isCompleteCtiQuarter(q1, 2024, 1, [])).toBe(true);

    for (const invalid of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, "10"]) {
      const incomplete = new Map(q1);
      incomplete.set("2024年2月", { a: invalid, b: 10 });
      expect(isCompleteCtiQuarter(incomplete, 2024, 1, keys)).toBe(false);
    }
    const missingMonth = new Map(q1);
    missingMonth.delete("2024年3月");
    expect(isCompleteCtiQuarter(missingMonth, 2024, 1, keys)).toBe(false);
  });

  it("averages available finite trailing values and honors nonpositive skipping", () => {
    expect(trailingMovingAverage([1, 2, 3, 4], 3)).toEqual([1, 1.5, 2, 3]);
    expect(trailingMovingAverage([1, Number.NaN, Number.POSITIVE_INFINITY, 5], 4)).toEqual([
      1, 1, 1, 3,
    ]);
    expect(trailingMovingAverage([-2, 0, 6], 3, { skipNonPositive: true })).toEqual([0, 0, 6]);
    expect(trailingMovingAverage([1, 2, 3], 0)).toEqual([0, 0, 0]);
    expect(trailingMovingAverage([], 3)).toEqual([]);
  });

  it("keeps missing series metadata consistent and returns the appropriate measurement note", () => {
    expect(createMissingSeriesMeasurement("legacy")).toMatchObject({
      label: "legacy",
      unit: "",
      source: "",
      valueType: "raw",
      value: null,
      status: "invalid",
      reason: "unavailable",
      frequency: "quarterly",
      seriesType: "unavailable",
    });
    expect(
      createMissingSeriesMeasurement("CTIミクロ調整系列（住居）", { estimateVersion: "plan39-v2" }),
    ).toMatchObject({ unit: "" });
    expect(
      createMissingSeriesMeasurement("CTIミクロ調整系列（食料）", {
        label: "missing food",
        unit: "億円",
        estimateVersion: "plan39-v2",
        valueType: "comparison",
        frequency: "annual",
        aggregation: "annual-anchor",
        baseYear: 2020,
      }),
    ).toMatchObject({
      label: "missing food",
      unit: "億円",
      valueType: "comparison",
      value: null,
      status: "unavailable",
      reason: "outside_period",
      frequency: "annual",
      aggregation: "annual-anchor",
      baseYear: 2020,
    });
    expect(
      getMeasurementNote({
        status: "unavailable",
        reason: "official_quarterly_source_unavailable_latest_period_unknown",
      }),
    ).toBe("公式四半期値を確認できず、最新対象期は不明");
    expect(getMeasurementNote({ status: "unavailable", reason: "outside_period" })).toBe(
      "対象期間外",
    );
    expect(getMeasurementNote({ status: "invalid", reason: "missing_raw" })).toBe(
      "利用不可: missing_raw",
    );
    expect(getMeasurementNote({ status: "unavailable" })).toBe("利用不可");
    expect(getMeasurementNote({ measurementNote: "provided" })).toBe("provided");
    expect(
      getMeasurementNote({
        aggregation: "derived_quarterly_residual_from_official_nominal_total_minus_nine_categories",
      }),
    ).toContain("残差");
    expect(
      getMeasurementNote({
        quarterlyDerived: true,
        bridgeCoefficient: 1.1,
        annualAnchorType: "official",
      }),
    ).toContain("公式Tへ接続補正");
    expect(getMeasurementNote({ quarterlyDerived: true, bridgeCoefficient: 1.1 })).toContain(
      "接続補正済み年次値",
    );
    expect(getMeasurementNote({ quarterlyDerived: true, bridgeCoefficient: Number.NaN })).toContain(
      "接続推計の年次値",
    );
    expect(getMeasurementNote({ quarterlyDerived: true, annualAnchorType: "official" })).toContain(
      "公式年次値",
    );
    expect(getMeasurementNote({ quarterlyDerived: true })).toContain("接続推計の年次値");
    expect(getMeasurementNote({ seriesType: "estimated_adjusted" })).toContain("接続推計");
    expect(getMeasurementNote({ seriesType: "official_adjusted" })).toBe("公式調整値");
    expect(getMeasurementNote({ official: true })).toBe("公式調整値");
    expect(getMeasurementNote({})).toBeNull();
  });
});
