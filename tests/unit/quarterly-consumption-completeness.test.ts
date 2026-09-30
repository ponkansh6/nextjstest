import { describe, expect, it } from "vitest";
import type { CpiData } from "../../src/types";
import {
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import { computeQuarterlyAggregates } from "../../server/lib/view-models/quarterlyAggregation";
import { buildQuarterlyPublicViews } from "../../server/lib/view-models/quarterlyProjection";

const makeMonth = (month: number, value = 10): CpiData => {
  const row = { 年月: `2018年${month}月` } as CpiData;
  for (const key of CONSUMPTION_NOMINAL_KEYS) row[key] = value;
  for (const key of CONSUMPTION_REAL_KEYS) row[key] = value;
  return row;
};

describe("2018年以降のCTI四半期完全性", () => {
  it("月次集計は3か月が揃った有効値0の四半期を名目・実質に残す", () => {
    const data = [makeMonth(1, 0), makeMonth(2, 0), makeMonth(3, 0)];
    const result = computeQuarterlyAggregates(data, { year: 2018, month: 3 });

    const nominal = result.nominal.filter((row) => row.label === "2018Q1");
    expect(nominal.map((row) => row.label)).toEqual(["2018Q1"]);
    expect(new Set(nominal.map((row) => row.label))).toEqual(new Set(["2018Q1"]));
    expect(result.real.filter((row) => row.年 >= 2018).map((row) => row.label)).toEqual(["2018Q1"]);
    const mergedNominal = nominal[0]!;
    expect(mergedNominal.kind).toBe("plan40-official-quarterly");
    // The monthly legacy result remains available alongside the preferred official series.
    expect(mergedNominal[CONSUMPTION_NOMINAL_KEYS[0]]).toBe(0);
    expect(
      mergedNominal.measurements?.[CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["食料"]],
    ).toMatchObject({
      status: "available",
      value: expect.any(Number),
      sourceRole: "official_nominal_observation",
    });
    expect(result.real.find((row) => row.label === "2018Q1")?.[CONSUMPTION_REAL_KEYS[0]]).toBe(0);
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

    const nominal = result.nominal.filter((row) => row.label === "2018Q1");
    expect(nominal.map((row) => row.label)).toEqual(["2018Q1"]);
    expect(nominal[0]?.kind).toBe("plan40-official-quarterly");
    expect(nominal[0]).not.toHaveProperty(CONSUMPTION_NOMINAL_KEYS[0]);
    expect(result.real.filter((row) => row.年 >= 2018)).toEqual([]);
  });

  it("2017Q4以前の固定CTI行とserver public projection境界を維持する", () => {
    const data = [
      { 年月: "2017年10月", [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      { 年月: "2017年11月", [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      { 年月: "2017年12月", [SUPPORT_SERIES_KEY_NOMINAL]: 100 },
      makeMonth(1),
      makeMonth(2),
      makeMonth(3),
    ] as CpiData[];
    const serverResult = computeQuarterlyAggregates(data, { year: 2018, month: 3 });
    const row2017Q4 = serverResult.nominal.find((row) => row.label === "2017Q4");
    const combined2018Rows = serverResult.nominal.filter((row) => row.label === "2018Q1");
    const combined2018 = combined2018Rows[0];
    expect(row2017Q4).toBeDefined();
    expect(combined2018?.kind).toBe("plan40-official-quarterly");
    expect(combined2018).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
    expect(combined2018Rows).toHaveLength(1);

    const projected = buildQuarterlyPublicViews(serverResult.nominal, serverResult.real, {
      comparisonReady: false,
      rows: [],
    });
    const public2018 = projected.nominal.find((row) => row.label === "2018Q1");
    expect(public2018).toHaveProperty(CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["食料"]);
    expect(public2018).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
  });
});
