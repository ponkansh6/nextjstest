import { describe, expect, it } from "vitest";
import type { CpiData } from "../../src/types";
import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
} from "../../src/lib/chartConstants";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";
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
    // The monthly consumption value remains available alongside Plan40 official measurements.
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

  it("projects a complete Plan40 official quarter through the public boundary", () => {
    const data = [makeMonth(1), makeMonth(2), makeMonth(3)];
    const serverResult = computeQuarterlyAggregates(data, { year: 2018, month: 3 });
    const combined2018Rows = serverResult.nominal.filter((row) => row.label === "2018Q1");
    expect(combined2018Rows).toHaveLength(1);
    expect(combined2018Rows[0]?.kind).toBe("plan40-official-quarterly");

    const projected = buildQuarterlyPublicViews(serverResult.nominal);
    const public2018 = projected.nominal.find((row) => row.label === "2018Q1");
    expect(public2018).toBeDefined();
    const publicKeySet = new Set<string>(QUARTERLY_PUBLIC_NOMINAL_KEYS);
    expect(Object.keys(public2018!).filter((key) => publicKeySet.has(key))).toEqual([
      ...QUARTERLY_PUBLIC_NOMINAL_KEYS,
    ]);
    for (const key of QUARTERLY_PUBLIC_NOMINAL_KEYS) {
      expect(public2018?.[key]).toBe(
        serverResult.nominal.find((row) => row.label === "2018Q1")?.measurements?.[key]?.value,
      );
      expect(public2018?.measurements?.[key]).toMatchObject({
        status: "available",
        frequency: "quarterly",
        seriesType:
          key === CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["その他の消費支出"]
            ? "estimated_adjusted"
            : "official_adjusted",
      });
    }
  });
});
