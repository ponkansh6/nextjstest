import { describe, expect, it } from "vitest";
import {
  getCpiMajorWeightTotal,
  transformCpiData,
} from "../../../../server/lib/data-loader/cpiLoader";
import type { CpiData } from "@/types";

const row = (values: Record<string, string | number | undefined>) => values as CpiData;

describe("cpiLoader", () => {
  it("converts weights, excludes 2003, propagates missing values, and derives series", () => {
    const result = transformCpiData({
      weights: {
        総合: 10_000,
        食料: 2_000,
        外食: 500,
        交通: 1_000,
        自動車等関係費: 500,
        住居: 1_000,
        "光熱・水道": 1_000,
        "家具・家事用品": 1_000,
        被服及び履物: 1_000,
        保健医療: 1_000,
        教育: 1_000,
        教養娯楽: 1_000,
        諸雑費: 1_000,
        "交通・通信": 1_000,
      },
      data: [
        row({ 年月: "2003年12月", 総合: 100 }),
        row({
          年月: "2004年1月",
          総合: 100,
          食料: 200,
          外食: 50,
          交通: 100,
          自動車等関係費: 20,
          教養娯楽サービス: 1,
          教養娯楽用品: 2,
        }),
        row({
          年月: "2004年2月",
          総合: 100,
          食料: 200,
          外食: undefined,
          交通: 100,
          自動車等関係費: 20,
        }),
      ],
    });
    expect(result).toHaveLength(2);
    // Comparison components use the ten-major-category weight total (11,000), excluding 総合.
    expect(result[0]).toMatchObject({ 総合: 100 });
    expect(result[0].食料).toBeCloseTo(36.3636363636);
    expect(result[0].外食).toBeCloseTo(2.2727272727);
    expect(result[0]["外食以外食料"]).toBeCloseTo(34.0909090909);
    expect(result[0]["交通・自動車等関係費"]).toBeCloseTo(10);
    expect(result[0]).not.toHaveProperty("交通");
    expect(result[0]).not.toHaveProperty("教養娯楽サービス");
    expect(result[1]["外食以外食料"]).toBeUndefined();
  });

  it("uses the major-category denominator for comparison components", () => {
    expect(
      getCpiMajorWeightTotal({
        食料: 2_000,
        住居: 2_000,
        "光熱・水道": 1_000,
        "家具・家事用品": 1_000,
        被服及び履物: 1_000,
        保健医療: 1_000,
        "交通・通信": 1_000,
        教育: 1_000,
        教養娯楽: 1_000,
        諸雑費: 1_000,
      }),
    ).toBe(12_000);
  });

  it.each([
    ["missing", {}],
    [
      "zero",
      {
        食料: 0,
        住居: 0,
        "光熱・水道": 0,
        "家具・家事用品": 0,
        被服及び履物: 0,
        保健医療: 0,
        "交通・通信": 0,
        教育: 0,
        教養娯楽: 0,
        諸雑費: 0,
      },
    ],
    [
      "negative",
      {
        食料: -1,
        住居: -1,
        "光熱・水道": -1,
        "家具・家事用品": -1,
        被服及び履物: -1,
        保健医療: -1,
        "交通・通信": -1,
        教育: -1,
        教養娯楽: -1,
        諸雑費: -1,
      },
    ],
  ])("falls back to 10000 for a %s major-category total", (_description, weights) => {
    expect(getCpiMajorWeightTotal(weights)).toBe(10_000);
  });

  it("converts non-finite values to missing values", () => {
    const result = transformCpiData({
      weights: { 総合: 10_000, 食料: 2_000 },
      data: [row({ 年月: "2004年1月", 総合: Number.NaN, 食料: Number.POSITIVE_INFINITY })],
    });

    expect(result[0]).toMatchObject({ 年月: "2004年1月", 総合: undefined, 食料: undefined });
  });

  it.each([
    ["交通", { 年月: "2004年1月", 総合: 100, 交通: undefined, 自動車等関係費: 20 }],
    ["自動車等関係費", { 年月: "2004年1月", 総合: 100, 交通: 100, 自動車等関係費: undefined }],
  ])(
    "propagates a missing %s value to the combined transportation series",
    (_description, input) => {
      const result = transformCpiData({
        weights: { 総合: 10_000, 交通: 1_000, 自動車等関係費: 500 },
        data: [row(input)],
      });

      expect(result[0]["交通・自動車等関係費"]).toBeUndefined();
      expect(result[0]).not.toHaveProperty("交通");
      expect(result[0]).not.toHaveProperty("自動車等関係費");
    },
  );

  it("does not mutate validated input", () => {
    const validated = {
      weights: { 総合: 10_000, 食料: 2_000, 外食: 500 },
      data: [row({ 年月: "2004年1月", 総合: 100, 食料: 200, 外食: 50 })],
    };
    const before = structuredClone(validated);

    transformCpiData(validated);

    expect(validated).toEqual(before);
  });
});
