import { describe, it, expect } from "vitest";
import {
  stackedKeys,
  nominalColorMap,
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION,
  CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
} from "../../src/lib/chartConstants";

describe("Chart Constants Integrity", () => {
  it("should ensure all values in nominalColorMap exist in stackedKeys", () => {
    Object.values(nominalColorMap).forEach((category) => {
      expect(
        stackedKeys,
        `Category "${category}" in nominalColorMap must exist in stackedKeys`,
      ).toContain(category);
    });
  });

  it("keeps Plan39 v1 residual mapping separate from the v2 Other mapping", () => {
    expect(CTI_ADJUSTED_PUBLIC_CATEGORIES).toEqual([
      "総合",
      "食料",
      "住居",
      "光熱・水道",
      "家具・家事用品",
      "被服及び履物",
      "保健医療",
      "交通・通信",
      "教育",
      "教養娯楽",
      "残差",
    ]);
    expect(Object.keys(CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION.v1)).toEqual([
      ...CTI_ADJUSTED_PUBLIC_CATEGORIES,
    ]);
    expect(Object.entries(CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION.v1)).toEqual([
      ["総合", "CTIミクロ調整系列（総合）"],
      ["食料", "CTIミクロ調整系列（食料）"],
      ["住居", "CTIミクロ調整系列（住居）"],
      ["光熱・水道", "CTIミクロ調整系列（光熱・水道）"],
      ["家具・家事用品", "CTIミクロ調整系列（家具・家事用品）"],
      ["被服及び履物", "CTIミクロ調整系列（被服及び履物）"],
      ["保健医療", "CTIミクロ調整系列（保健医療）"],
      ["交通・通信", "CTIミクロ調整系列（交通・通信）"],
      ["教育", "CTIミクロ調整系列（教育）"],
      ["教養娯楽", "CTIミクロ調整系列（教養娯楽）"],
      ["残差", "CTIミクロ調整系列（残差）"],
    ]);
    expect(CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY.残差).toBe("CTIミクロ調整系列（残差）");
    expect(CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["その他の消費支出"]).toBe(
      "CTIミクロ調整系列（その他の消費支出）",
    );
    expect(CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION.v1.残差).not.toBe(
      CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION.v2["その他の消費支出"],
    );
    expect(Object.values(CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION.v2)).not.toContain(
      CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION.v1.残差,
    );
  });
});
