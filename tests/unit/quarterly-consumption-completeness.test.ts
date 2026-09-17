import { describe, expect, it } from "vitest";
import type { CpiData } from "../../src/types";
import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
} from "../../src/lib/chartConstants";
import { computeQuarterlyAggregates } from "../../server/lib/view-models/quarterlyAggregation";
import { computeChartData } from "../../src/lib/clientCalculations";

const makeMonth = (month: number, value = 10): CpiData => {
  const row = { 年月: `2018年${month}月` } as CpiData;
  for (const key of CONSUMPTION_NOMINAL_KEYS) row[key] = value;
  for (const key of CONSUMPTION_REAL_KEYS) row[key] = value;
  return row;
};

describe("2018年以降のCTI四半期完全性", () => {
  it("3か月が揃った有効値0の四半期は名目・実質に残す", () => {
    const data = [makeMonth(1, 0), makeMonth(2, 0), makeMonth(3, 0)];
    const result = computeQuarterlyAggregates(data, { year: 2018, month: 3 });

    expect(result.nominal.filter((row) => row.年 >= 2018).map((row) => row.label)).toEqual([
      "2018Q1",
    ]);
    expect(result.real.filter((row) => row.年 >= 2018).map((row) => row.label)).toEqual(["2018Q1"]);
    expect(
      result.nominal.find((row) => row.label === "2018Q1")?.[CONSUMPTION_NOMINAL_KEYS[0]],
    ).toBe(0);
  });

  const incompleteCases: Array<[string, (data: CpiData[]) => void]> = [
    ["1月の月次行が欠ける", (data: CpiData[]) => data.splice(0, 1)],
    ["2月の月次行が欠ける", (data: CpiData[]) => data.splice(1, 1)],
    [
      "2月の対象値がundefined",
      (data: CpiData[]) => (data[1][CONSUMPTION_REAL_KEYS[0]] = undefined),
    ],
    ["2月の対象値がnull", (data: CpiData[]) => (data[1][CONSUMPTION_REAL_KEYS[0]] = null)],
    ["対象値が非有限", (data: CpiData[]) => (data[1][CONSUMPTION_NOMINAL_KEYS[0]] = Number.NaN)],
  ];

  it.each(incompleteCases)("%s四半期は名目・実質から除外する", (_name, mutate) => {
    const data = [makeMonth(1), makeMonth(2), makeMonth(3)];
    mutate(data);
    const result = computeQuarterlyAggregates(data, { year: 2018, month: 3 });

    expect(result.nominal.filter((row) => row.年 >= 2018)).toEqual([]);
    expect(result.real.filter((row) => row.年 >= 2018)).toEqual([]);

    const legacyResult = computeChartData(
      {
        data,
        nominalData: data,
        nominalKeys: CONSUMPTION_NOMINAL_KEYS,
        realKeys: CONSUMPTION_REAL_KEYS,
        startYear: 2018,
        endYear: 2018,
        maxCpiDate: { year: 2018, month: 3 },
      },
      [],
    );
    expect(legacyResult.quarterlyNominalData).toEqual([]);
    expect(legacyResult.quarterlyRealData).toEqual([]);
  });

  it("2017Q4以前のGDP support行とhiddenQuarters契約を維持する", () => {
    const data = [
      { 年月: "2017年10月", [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      { 年月: "2017年11月", [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      { 年月: "2017年12月", [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      makeMonth(1),
      makeMonth(2),
      makeMonth(3),
    ] as CpiData[];
    const result = computeChartData(
      {
        data,
        nominalData: data,
        nominalKeys: CONSUMPTION_NOMINAL_KEYS,
        realKeys: CONSUMPTION_REAL_KEYS,
        startYear: 2017,
        endYear: 2018,
        maxCpiDate: { year: 2018, month: 3 },
      },
      [1],
    );

    expect(result.quarterlyNominalData.map((row) => row.label)).toContain("2017Q4");
    expect(result.quarterlyNominalData.map((row) => row.label)).not.toContain("2018Q1");

    const serverResult = computeQuarterlyAggregates(data, { year: 2018, month: 3 });
    expect(serverResult.nominal.map((row) => row.label)).toContain("2017Q4");
    expect(serverResult.nominal.filter((row) => row.年 >= 2018).map((row) => row.label)).toEqual([
      "2018Q1",
    ]);
  });
});
