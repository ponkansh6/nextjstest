import { expect, it, describe, beforeAll } from "vitest";
import { loadTotalEarningData, loadCpiData } from "../../server/lib/dataLoader";
import type { CpiData } from "../../src/types";

describe("Earnings Data Integrity", () => {
  let earningData: CpiData[];
  let cpiData: CpiData[];

  beforeAll(async () => {
    earningData = await loadTotalEarningData();
    cpiData = await loadCpiData();
  });

  describe("Basic Integrity", () => {
    it("should have non-zero values for key earnings series", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      const keySeries = ["総合", "所定内給与", "所定外給与", "特別給与"];
      keySeries.forEach((key) => {
        const nonZeroCount = earningData.filter((d) => (d[key] as number) > 0).length;
        expect(
          nonZeroCount,
          `Earnings series '${key}' should have non-zero values`,
        ).toBeGreaterThan(0);
      });
    });

    it("should verify all wage series have positive values", () => {
      const wageKeys = [
        "総合",
        "所定内給与",
        "所定外給与",
        "特別給与",
        "時間当たり給与",
        "15歳以上国民当たり給与",
      ];

      wageKeys.forEach((key) => {
        const hasData = earningData.some((d) => typeof d[key] === "number" && d[key] > 0);
        expect(hasData, `Wage Series ${key} should have positive values`).toBe(true);
      });
    });

    it("should verify month continuity and valid ranges", () => {
      const ymToMonths = (ym: string) => {
        const m = ym.match(/^(\d{4})年(\d{1,2})月/);
        return m ? parseInt(m[1], 10) * 12 + parseInt(m[2], 10) : 0;
      };

      for (let i = 1; i < earningData.length; i++) {
        const prev = ymToMonths(earningData[i - 1].年月);
        const curr = ymToMonths(earningData[i].年月);
        expect(
          curr,
          `Data gap found between ${earningData[i - 1].年月} and ${earningData[i].年月}`,
        ).toBe(prev + 1);
      }

      const recentData = earningData.filter((d) => parseInt(d.年月.substring(0, 4), 10) >= 2005);
      expect(recentData.length).toBeGreaterThan(0);

      const year2020Items = earningData.filter((item) => item.年月.startsWith("2020年"));
      const avg2020Total =
        year2020Items.reduce((sum, item) => sum + (item["総合"] || 0), 0) / year2020Items.length;
      expect(avg2020Total).toBeCloseTo(100, 1);
    });

    it("should ensure all required wage keys are present in the merged dataset", () => {
      const requiredWageKeys = [
        "所定内給与",
        "所定外給与",
        "特別給与",
        "時間当たり給与",
        "15歳以上国民当たり給与",
        "総合",
      ];
      const lastRow = earningData[earningData.length - 1];
      requiredWageKeys.forEach((key) => {
        expect(lastRow[key], `Key "${key}" must be present and positive`).toBeGreaterThan(0);
      });
    });
  });

  describe("Validation", () => {
    it("should verify 総合 = 所定内給与 + 所定外給与 + 特別給与 (main fields)", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const scheduled = Number(d["所定内給与"] || 0);
        const unscheduled = Number(d["所定外給与"] || 0);
        const special = Number(d["特別給与"] || 0);
        const sum = scheduled + unscheduled + special;
        const total = Number(d["総合"] || 0);

        if (sum > 0) {
          expect(total).toBeCloseTo(sum, 1);
          expect(total, `総合 at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
          expect(total, `総合 at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
        }
      });
    });

    it("should verify individual key earnings series are within 50-150", async () => {
      expect(earningData.length).toBeGreaterThan(0);

      const individualKeys = ["時間当たり給与", "15歳以上国民当たり給与", "CPI総合(参考)"];

      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        individualKeys.forEach((key) => {
          const val = Number(d[key as keyof CpiData] || 0);
          if (val > 0) {
            expect(val, `${key} at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
            expect(val, `${key} at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
          }
        });
      });

      // 消費支出（参考） は0でもチェックする（TDD red phase）
      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const val = Number(d["消費支出（参考）" as keyof CpiData] || 0);
        expect(val, `消費支出（参考） at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
        expect(val, `消費支出（参考） at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
      });
    });

    it("should verify mathematical integrity of residuals and smoothing", () => {
      const testData = earningData.slice(-24);
      const cpiMap = new Map(cpiData.map((d) => [d.年月, d.総合]));

      testData.forEach((row) => {
        if (row.年月 === "2005年1月" || row.年月.startsWith("2004年")) return;

        expect(row["残差"]).toBeDefined();
        expect(typeof row["残差"]).toBe("number");
      });

      const specialEarnings = earningData.map((d) => d["特別給与"] as number);
      const recentSpecial = specialEarnings.slice(-12);
      const diffs = [];
      for (let i = 1; i < recentSpecial.length; i++) {
        diffs.push(Math.abs(recentSpecial[i] - recentSpecial[i - 1]));
      }
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      expect(meanDiff).toBeLessThan(500);
    });

    it("should verify CPI総合(12MA) has reasonable values", () => {
      expect(earningData.length).toBeGreaterThan(0);
      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const val = Number(d["CPI総合(12MA)" as keyof CpiData] || 0);
        if (val > 0) {
          expect(val, `CPI総合(12MA) at ${d.年月} should be 50-150`).toBeGreaterThanOrEqual(50);
          expect(val, `CPI総合(12MA) at ${d.年月} should be 50-150`).toBeLessThanOrEqual(150);
        }
      });
    });

    it("should have positive CPI総合(12MA) values for most months", () => {
      const years = [
        ...new Set(
          earningData.filter((d) => d.年月).map((d) => parseInt(d.年月.substring(0, 4), 10)),
        ),
      ].filter((y) => y >= 2005);
      years.forEach((year) => {
        const yearData = earningData.filter((d) => d.年月.startsWith(`${year}年`));
        const cpiMaValues = yearData.map((d) => Number(d["CPI総合(12MA)" as keyof CpiData] || 0));
        const positiveCount = cpiMaValues.filter((v) => v > 0).length;
        // Skip incomplete years (current year may have partial data)
        if (yearData.length < 12) return;
        // At least 10 months of the year should have positive CPI総合(12MA) (first 11 months may have partial MA)
        expect(
          positiveCount,
          `CPI総合(12MA) in ${year}: ${positiveCount}/12 months positive`,
        ).toBeGreaterThanOrEqual(10);
      });
    });

    it("should confirm NewGraph series fields exist in merged data", async () => {
      // Verify all fields used by NewGraph are present
      const newGraphKeys = [
        "総合(12MA)",
        "民間最終消費支出（参考）",
        "CTI消費支出（参考）",
        "CPI総合(12MA)",
      ];
      newGraphKeys.forEach((key) => {
        const hasData = earningData.some((d) => {
          const v = d[key as keyof CpiData];
          return typeof v === "number" && v > 0;
        });
        expect(
          hasData,
          `NewGraph series '${key}' should have positive values in earnings data`,
        ).toBe(true);
      });
    });

    it("should verify consumption expenditure continuity across 2016/12-2017/01 boundary", () => {
      expect(earningData.length).toBeGreaterThan(0);

      // 2016年12月と2017年1月のデータを取得
      const dec2016 = earningData.find((d) => d.年月 === "2016年12月");
      const jan2017 = earningData.find((d) => d.年月 === "2017年1月");

      expect(dec2016, "2016年12月 data should exist").toBeDefined();
      expect(jan2017, "2017年1月 data should exist").toBeDefined();

      const valDec = Number(dec2016!["消費支出（参考）"] ?? 0);
      const valJan = Number(jan2017!["消費支出（参考）"] ?? 0);

      expect(valDec, "消費支出（参考） at 2016年12月 should be > 0").toBeGreaterThan(0);
      expect(valJan, "消費支出（参考） at 2017年1月 should be > 0").toBeGreaterThan(0);

      // 12MAの性質上、1ヶ月のデータソース切替で大きなジャンプは発生しないはず
      // 変化率が50%未満であることを確認（通常は数%以内）
      const changeRatio = Math.abs(valJan - valDec) / valDec;
      expect(
        changeRatio,
        `消費支出（参考） change across 2016/12-2017/01 should be < 50% (actual: ${(changeRatio * 100).toFixed(1)}%)`,
      ).toBeLessThan(0.5);
    });

    it("should verify split consumption series (民間最終消費支出（参考） and CTI消費支出（参考） have correct period bounds and nulls)", () => {
      expect(earningData.length).toBeGreaterThan(0);

      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2005) return;

        const minkanVal = d["民間最終消費支出（参考）" as keyof CpiData];
        const ctiVal = d["CTI消費支出（参考）" as keyof CpiData];

        if (year <= 2017) {
          expect(
            minkanVal,
            `民間最終消費支出（参考） at ${d.年月} should be positive number`,
          ).toBeGreaterThan(0);
          expect(
            ctiVal,
            `CTI消費支出（参考） at ${d.年月} should be null outside its period`,
          ).toBeNull();
        } else {
          expect(
            minkanVal,
            `民間最終消費支出（参考） at ${d.年月} should be null outside its period`,
          ).toBeNull();
          expect(
            ctiVal,
            `CTI消費支出（参考） at ${d.年月} should be positive number`,
          ).toBeGreaterThan(0);
        }
      });

      // 2014年と2020年の特定月で確認
      const d2014 = earningData.find((d) => d.年月 === "2014年6月");
      const d2020 = earningData.find((d) => d.年月 === "2020年6月");

      expect(d2014).toBeDefined();
      expect(d2014!["民間最終消費支出（参考）"]).toBeGreaterThan(0);
      expect(d2014!["CTI消費支出（参考）"]).toBeNull();

      expect(d2020).toBeDefined();
      expect(d2020!["民間最終消費支出（参考）"]).toBeNull();
      expect(d2020!["CTI消費支出（参考）"]).toBeGreaterThan(0);
    });

    it("should use 2017 data for CTI 12MA (2018 first months should be smooth, no partial-window dip)", () => {
      expect(earningData.length).toBeGreaterThan(0);
      const jan2018 = earningData.find((d) => d.年月 === "2018年1月");
      const feb2018 = earningData.find((d) => d.年月 === "2018年2月");

      expect(jan2018).toBeDefined();
      expect(feb2018).toBeDefined();

      const valJan = Number(jan2018!["CTI消費支出（参考）"] ?? 0);
      const valFeb = Number(feb2018!["CTI消費支出（参考）"] ?? 0);

      expect(valJan).toBeGreaterThan(0);
      expect(valFeb).toBeGreaterThan(0);

      // 変化率が2%未満であることを検証（不完全窓によるdipがなく滑らか）
      const changeRatio = Math.abs(valFeb - valJan) / valJan;
      expect(
        changeRatio,
        `CTI消費支出（参考） change across 2018/01-2018/02 should be < 2% (actual: ${(changeRatio * 100).toFixed(2)}%)`,
      ).toBeLessThan(0.02);
    });
  });
});
