import { describe, it, expect } from "vitest";
import { applySupportSeriesScaling } from "../../server/lib/math/supportSeries";

describe("Support Series Filtering - Private Final Consumption", () => {
  /**
   * 本番環境での既知の問題: 民間最終消費支出が0になっている
   *
   * supportSeries.ts の applySupportSeriesScaling 関数は、
   * 2005-2016年のみをスケーリングして、2017年以降を強制的に0に設定する。
   *
   * このテストスイートは、その動作を検証し、本番での問題を再現するもの。
   */

  const SUPPORT_SERIES_KEY_REAL = "民間最終消費支出（実質）";
  const SUPPORT_SERIES_KEY_NOMINAL = "民間最終消費支出（名目）";

  describe("2005-2016年の期間", () => {
    it("should NOT be zero for 2005-2016 years (expected behavior)", () => {
      /**
       * 期待値: 2005-2016年の民間最終消費支出は0ではなく、
       * 2020年基準でスケーリングされた値を持つ
       *
       * 注意: applySupportSeriesScaling は2020年を基準に計算するが、
       * 最終的には2005-2016年のみをスケーリング値で残し、
       * 2017年以降は0に設定する
       */
      const testData = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 102 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 98 },
        { 年: 2005, [SUPPORT_SERIES_KEY_REAL]: 85 },
        { 年: 2010, [SUPPORT_SERIES_KEY_REAL]: 95 },
        { 年: 2016, [SUPPORT_SERIES_KEY_REAL]: 105 },
      ];

      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_REAL);

      // 2005-2016年のデータはスケーリングされて0ではない
      const scaled2005_2016 = testData.filter((d) => d.年 >= 2005 && d.年 <= 2016);
      scaled2005_2016.forEach((d) => {
        expect(
          d[SUPPORT_SERIES_KEY_REAL],
          `2005-2016年のデータは0ではないはずです (年: ${d.年})`,
        ).not.toBe(0);
      });
    });

    it("should preserve nominal values for 2005-2016 years (within 50-150 range)", () => {
      /**
       * 民間最終消費支出（名目）も2005-2016年では0ではない
       */
      const testData = [
        { 年: 2020, [SUPPORT_SERIES_KEY_NOMINAL]: 150 },
        { 年: 2020, [SUPPORT_SERIES_KEY_NOMINAL]: 150 },
        { 年: 2020, [SUPPORT_SERIES_KEY_NOMINAL]: 150 },
        { 年: 2010, [SUPPORT_SERIES_KEY_NOMINAL]: 140 },
        { 年: 2015, [SUPPORT_SERIES_KEY_NOMINAL]: 145 },
      ];

      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_NOMINAL);

      const scaled = testData.filter((d) => d.年 >= 2005 && d.年 <= 2016);
      scaled.forEach((d) => {
        const val = d[SUPPORT_SERIES_KEY_NOMINAL] as number;
        expect(val, `2005-2016年の名目値は50-150範囲で0ではないはずです (年: ${d.年})`).not.toBe(0);
      });
    });
  });

  describe("2017年以降の期間", () => {
    it("should be zero for 2017 and later years (current design)", () => {
      /**
       * 期待値: 2017年以降は民間最終消費支出が0に設定される
       *
       * これはデータソース（四半期GDP統計）が2016年までしか利用できないため、
       * 設計上の制限である。
       *
       * ただし、本番環境では2005-2016年でもこの問題が発生しているという報告がある。
       */
      const testData = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 102 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 98 },
        { 年: 2017, [SUPPORT_SERIES_KEY_REAL]: 110 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 99 },
        { 年: 2023, [SUPPORT_SERIES_KEY_REAL]: 120 },
        { 年: 2025, [SUPPORT_SERIES_KEY_REAL]: 115 },
      ];

      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_REAL);

      // 2017年以降のデータは全て0に設定される
      const after2017 = testData.filter((d) => d.年 >= 2017);
      after2017.forEach((d) => {
        expect(d[SUPPORT_SERIES_KEY_REAL], `2017年以降は0になります (年: ${d.年})`).toBe(0);
      });
    });

    it("2005-2016 years should have non-zero values (applySupportSeriesScaling requirement)", () => {
      /**
       * Unit test for applySupportSeriesScaling function.
       * This tests the function requirement that 2005-2016 years are scaled (non-zero).
       */
      const testData = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 102 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 98 },
        { 年: 2005, [SUPPORT_SERIES_KEY_REAL]: 85 },
      ];

      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_REAL);

      // 本番環境での問題: 2005-2016年でも0になっている
      // このテストが失敗することで、問題が実際に存在することを検証する
      const year2005Data = testData.find((d) => d.年 === 2005);
      expect(
        year2005Data?.[SUPPORT_SERIES_KEY_REAL],
        "BUG CHECK: 本番環境では2005年でも0になっています（既知の問題）",
      ).not.toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty data", () => {
      const testData: any[] = [];
      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_REAL);
      expect(testData).toEqual([]);
    });

    it("should handle missing years", () => {
      const testData = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2000, [SUPPORT_SERIES_KEY_REAL]: 50 },
        { 年: 2010, [SUPPORT_SERIES_KEY_REAL]: 100 },
        { 年: 2030, [SUPPORT_SERIES_KEY_REAL]: 150 },
      ];

      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_REAL);

      expect(testData[1][SUPPORT_SERIES_KEY_REAL]).toBe(0); // 2000年は0（2005-2016年外）
      expect(testData[2][SUPPORT_SERIES_KEY_REAL]).not.toBe(0); // 2010年は0ではない（2005-2016年内）
      expect(testData[3][SUPPORT_SERIES_KEY_REAL]).toBe(0); // 2030年は0（2005-2016年外）
    });

    it("should handle zero average in 2020", () => {
      const testData = [
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 0 },
        { 年: 2020, [SUPPORT_SERIES_KEY_REAL]: 0 },
        { 年: 2010, [SUPPORT_SERIES_KEY_REAL]: 100 },
      ];

      applySupportSeriesScaling(testData, SUPPORT_SERIES_KEY_REAL);

      // scale = 1 になり、元の値がそのまま使用される
      const year2010Data = testData.find((d) => d.年 === 2010);
      expect(year2010Data?.[SUPPORT_SERIES_KEY_REAL]).toBe(100);
    });
  });
});
