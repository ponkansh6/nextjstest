import { expect, it, describe, beforeAll } from "vitest";
import { CONSUMPTION_NOMINAL_KEYS, CONSUMPTION_REAL_KEYS } from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import { loadCtiData } from "../../server/lib/dataLoader";

describe("CTI Data Integrity", () => {
  let ctiData: CpiData[];

  beforeAll(async () => {
    ctiData = await loadCtiData();
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
      const firstRow = ctiData.find((row) => parseInt(String(row.年月).slice(0, 4), 10) >= 2017);
      expect(firstRow).toBeDefined();
      const dataKeys = Object.keys(firstRow!);

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

      const targetKeys = [...CONSUMPTION_NOMINAL_KEYS, ...CONSUMPTION_REAL_KEYS];

      recentCtiRows.forEach((row) => {
        targetKeys.forEach((key) => {
          const val = Number(row[key]);
          expect(val, `${key} in ${row.年月} should be > 0 (2017 onwards)`).toBeGreaterThan(0);
        });
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
  });
});
