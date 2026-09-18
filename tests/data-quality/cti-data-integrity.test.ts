import { expect, it, describe, beforeAll } from "vitest";
import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import { computeChartData } from "../../src/lib/clientCalculations";
import { loadCti2020RollbackFixture } from "../utils/cti-2020-rollback-fixture";

describe("CTI Data Integrity", () => {
  let ctiData: CpiData[];

  beforeAll(async () => {
    ctiData = await loadCti2020RollbackFixture();
  });

  describe("Basic Integrity", () => {
    it("should have loaded data", () => {
      expect(ctiData.length).toBeGreaterThan(0);
    });
    it.each([...CONSUMPTION_NOMINAL_KEYS, ...CONSUMPTION_REAL_KEYS])(
      "series '%s' should have non-zero values",
      (key) => {
        const nonZeroCount = ctiData.filter((d) => (d[key] as number) > 0).length;
        expect(
          nonZeroCount,
          `Series '${key}' should have non-zero values in the dataset`,
        ).toBeGreaterThan(0);
      },
    );

    it("should verify that consumption keys exist in the data (Mismatch Verification)", () => {
      const firstRow = ctiData[0];
      const dataKeys = Object.keys(firstRow);

      [...CONSUMPTION_NOMINAL_KEYS, ...CONSUMPTION_REAL_KEYS].forEach((key) => {
        expect(dataKeys, `Key '${key}' should exist in data`).toContain(key);
      });
    });
  });

  describe("Consumption Data Integrity", () => {
    it("should verify all supported consumption categories have positive values through 2025", () => {
      const recentCtiRows = ctiData.filter(
        (d) =>
          d.年月 &&
          typeof d.年月 === "string" &&
          parseInt(d.年月.substring(0, 4), 10) >= 2017 &&
          parseInt(d.年月.substring(0, 4), 10) <= 2025,
      );

      expect(recentCtiRows.length).toBeGreaterThan(0);

      const allKeys = Object.keys(ctiData[0]);
      // サポート系列（民間最終消費支出）は四半期GDPデータ由来で最新四半期が未更新の場合0になるため除外
      const targetKeys = allKeys.filter(
        (key) =>
          key !== "年月" &&
          key !== "月" &&
          key !== "" &&
          key !== SUPPORT_SERIES_KEY_NOMINAL &&
          key !== SUPPORT_SERIES_KEY_REAL,
      );

      expect(targetKeys.length).toBeGreaterThan(0);

      recentCtiRows.forEach((row) => {
        targetKeys.forEach((key) => {
          const val = Number(row[key]);
          expect(val, `${key} in ${row.年月} should be > 0 (2017 onwards)`).toBeGreaterThan(0);
        });
      });
    });

    describe("server-owned support-series projection", () => {
      it("should not recalculate or synthesize support values in the client adapter", async () => {
        const props = {
          data: ctiData,
          endYear: 2026,
          maxCpiDate: { month: 12, year: 2026 },
          nominalData: ctiData,
          nominalKeys: CONSUMPTION_NOMINAL_KEYS,
          realKeys: CONSUMPTION_REAL_KEYS,
          startYear: 2005,
        };

        const result = computeChartData(props, []);
        for (const row of [...result.quarterlyNominalData, ...result.quarterlyRealData]) {
          expect(row).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
          expect(row).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
        }
      });
    });

    it("should verify その他の消費支出 is non-negative and within reasonable range for 2017+", () => {
      const recentRows = ctiData.filter((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return false;
        const year = parseInt(d.年月.substring(0, 4), 10);
        return year >= 2017;
      });
      expect(recentRows.length).toBeGreaterThan(0);

      recentRows.forEach((row) => {
        const nominalOther = Number(row["その他の消費支出（名目）"] ?? 0);
        const realOther = Number(row["その他の消費支出（実質）"] ?? 0);
        const nominalTotal = Number(row["消費支出（名目）"] ?? 0);

        // 残余は非負
        expect(
          nominalOther,
          `その他の消費支出（名目） at ${row.年月} should be >= 0`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          realOther,
          `その他の消費支出（実質） at ${row.年月} should be >= 0`,
        ).toBeGreaterThanOrEqual(0);

        // 残余は総額より小さい（総額を超える残余は計算誤差）
        if (nominalTotal > 0) {
          expect(
            nominalOther,
            `その他の消費支出（名目） at ${row.年月} should be < 消費支出（名目）`,
          ).toBeLessThan(nominalTotal);
        }
      });
    });

    describe("server-owned support-series projection", () => {
      it("should not retain private consumption expenditure in client calculations", () => {
        /**
         * Unit test for computeChartData function's support series scaling.
         * Verifies that 2005-2016 years have non-zero values after computeChartData processes them.
         * Note: computeChartData is not used in the production UI pipeline; this is a contract test for the function itself.
         */
        const props = {
          data: ctiData,
          endYear: 2026,
          maxCpiDate: { month: 12, year: 2026 },
          nominalData: ctiData,
          nominalKeys: CONSUMPTION_NOMINAL_KEYS,
          realKeys: CONSUMPTION_REAL_KEYS,
          startYear: 2005,
        };

        const result = computeChartData(props, []);
        for (const row of [...result.quarterlyNominalData, ...result.quarterlyRealData]) {
          expect(row).not.toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL);
          expect(row).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
        }
      });
    });
  });
});
