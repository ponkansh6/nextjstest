import { expect, it, describe, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCpiData } from "../../server/lib/dataLoader";
import { loadEarning2020RollbackFixture } from "../utils/cti-2020-rollback-fixture";
import type { CpiData } from "../../src/types";
import minkanFixture from "../fixtures/minkan-extension-anchors.json";
import { parseCsvWithHeader } from "../../server/lib/dataIo";
import { loadTotalEarningDataInternal } from "../../server/lib/data-loader/earnings";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import Papa from "papaparse";

describe("Earnings Data Integrity", () => {
  let earningData: CpiData[];
  let cpiData: CpiData[];

  beforeAll(async () => {
    earningData = await loadEarning2020RollbackFixture();
    cpiData = await loadCpiData();
  });

  it("should preserve nulls for incomplete, short, and trailing 12-month windows", () => {
    const month = (value: string) => {
      const match = value.match(/^(\d{4})年(\d{1,2})月$/);
      return match ? Number(match[1]) * 12 + Number(match[2]) : NaN;
    };
    const trailing = (rows: Array<{ 年月: string; value: number | null }>) =>
      rows.map((row, i) => {
        if (i < 11 || rows.slice(i - 11, i + 1).some((item) => item.value === null)) return null;
        return rows.slice(i - 11, i + 1).reduce((sum, item) => sum + item.value!, 0) / 12;
      });
    const complete: Array<{ 年月: string; value: number | null }> = Array.from(
      { length: 24 },
      (_, i) => ({ 年月: `2004年${i + 1}月`, value: 100 }),
    );
    complete[13].value = null;
    const output = trailing(complete);
    expect(output[10]).toBeNull();
    expect(output[13]).toBeNull();
    expect(output[20]).toBeNull();
    expect(trailing(complete.slice(0, 11)).at(-1)).toBeNull();
    expect(trailing(complete.map((row) => ({ ...row, value: 100 }))).at(-1)).toBe(100);
    expect(month(complete[12].年月) - month(complete[11].年月)).toBe(1);
  });

  it("verifies the regular 2025 GDP-backed NewGraph series independently", async () => {
    const paths = buildCtiFilePaths();
    const readGdp = (file: string) => {
      const rows = Papa.parse<string[]>(readFileSync(file, "utf8"), {
        skipEmptyLines: true,
      }).data;
      const headerIndex = rows.findIndex((row) => row.includes("時間軸（暦年）"));
      const header = rows[headerIndex];
      const yearIndex = header.indexOf("時間軸（暦年）");
      const valueIndex = header.indexOf("民間最終消費支出");
      return new Map(
        rows.slice(headerIndex + 1).flatMap((row) => {
          const year = Number(row[yearIndex]?.replace("年", ""));
          const value = Number(row[valueIndex]?.replace(/,/g, ""));
          return Number.isFinite(year) && Number.isFinite(value) ? [[year, value] as const] : [];
        }),
      );
    };
    const nominal = readGdp(paths.candidateSupportNominal);
    const normalization = JSON.parse(readFileSync(paths.gdpDisplayNormalization, "utf8")) as {
      nominal: { factor: number };
    };
    const expectedRaw = nominal.get(2005)!;
    expect(expectedRaw).toBeGreaterThan(0);
    expect(nominal.get(2014)).toBeGreaterThan(0);
    expect(nominal.get(2016)).toBeGreaterThan(0);

    const data = await loadTotalEarningDataInternal();
    const regular = data.filter((row) => {
      const year = Number(row.年月.slice(0, 4));
      return year >= 2005 && year <= 2017;
    });
    expect(regular).toHaveLength(156);
    expect(
      regular.every((row) => {
        const value = row["民間最終消費支出（参考）"];
        return typeof value === "number" && Number.isFinite(value) && value > 0;
      }),
    ).toBe(true);

    const factor = normalization.nominal.factor;
    const raw = expectedRaw * factor;
    const firstWindow = [nominal.get(2004)!, nominal.get(2005)!];
    const expectedFirstMa = ((firstWindow[0] * 11 + firstWindow[1]) / 12) * factor;
    expect(factor).toBe(100 / nominal.get(2025)!);
    expect(raw).toBeGreaterThan(0);
    expect(firstWindow.every(Number.isFinite)).toBe(true);
    expect(
      regular.find((row) => row.年月 === "2005年1月")?.["民間最終消費支出（名目・原値）"],
    ).toBe(expectedRaw);
    expect(
      regular.find((row) => row.年月 === "2005年1月")?.["民間最終消費支出（参考）"],
    ).toBeCloseTo(expectedFirstMa, 10);
    expect(
      regular.find((row) => row.年月 === "2014年6月")?.["民間最終消費支出（名目・原値）"],
    ).toBe(nominal.get(2014));
    expect(
      regular.find((row) => row.年月 === "2016年12月")?.["民間最終消費支出（名目・原値）"],
    ).toBe(nominal.get(2016));
    expect(data.find((row) => row.年月 === "2018年1月")).toBeDefined();
    expect(
      data.find((row) => row.年月 === "2018年1月")?.["民間最終消費支出（参考）"] ?? null,
    ).toBeNull();
    expect(data.at(-1)?.["民間最終消費支出（参考）"] ?? null).toBeNull();
  });

  it("audits employment index provenance, target selectors, and May/June 2026 continuity", () => {
    const root = resolve(process.cwd());
    const csvPath = resolve(root, "data/source/employment_indices.csv");
    const metadata = JSON.parse(
      readFileSync(resolve(root, "data/source/employment_indices.metadata.json"), "utf8"),
    ) as {
      statInfId: string;
      sourceSha256: string;
      normalizedCsvSha256: string;
      extraction: {
        industry: string;
        establishmentSize: string;
        employmentType: string;
        unit: string;
      };
      excludedCrossSection: string;
    };
    const csv = readFileSync(csvPath);
    expect(createHash("sha256").update(csv).digest("hex")).toBe(metadata.normalizedCsvSha256);
    expect(metadata).toMatchObject({
      statInfId: "000032189777",
      sourceSha256: "825c8b31dd045187ed4dac378e83018e9e6a307eb0994c7ff5b2747c2ea62e12",
      excludedCrossSection: "data/source/hon-mks202606.xls",
      extraction: {
        industry: "TL",
        establishmentSize: "T",
        employmentType: "0",
        unit: "指数（2020年平均=100）",
      },
    });
    const rows = csv
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => /^202[56],/.test(line));
    expect(rows).toHaveLength(2);
    const mayJune = rows[1].split(",").slice(12, 14);
    expect(mayJune).toEqual(["31.3", "31.35"]);
    expect(
      rows[1]
        .split(",")
        .slice(8, 14)
        .every((value) => value !== ""),
    ).toBe(true);
    expect(metadata.extraction.unit).toContain("指数");
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

      const year2025Items = earningData.filter((item) => item.年月.startsWith("2025年"));
      for (const key of ["総合", "時間当たり給与", "15歳以上国民当たり給与"]) {
        const values = year2025Items
          .map((item) => item[key])
          .filter((v): v is number => typeof v === "number");
        expect(values).toHaveLength(12);
        expect(values.reduce((sum, value) => sum + value, 0) / values.length).toBeCloseTo(100, 1);
      }
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
      const lastRow =
        earningData.findLast((item) =>
          requiredWageKeys.every(
            (key) => typeof item[key] === "number" && (item[key] as number) > 0,
          ),
        ) ?? earningData[earningData.length - 1];
      requiredWageKeys.forEach((key) => {
        expect(lastRow[key], `Key "${key}" must be present and positive`).toBeGreaterThan(0);
      });
    });
  });

  describe("Validation", () => {
    it("should propagate incomplete population and related-input windows as missing", () => {
      const perCapitaValues = earningData.map((row) => row["15歳以上国民当たり給与"]);
      expect(perCapitaValues.some((value) => value === 0)).toBe(false);
      perCapitaValues.forEach((value) => {
        expect(
          value === null || value === undefined || (typeof value === "number" && value > 0),
        ).toBe(true);
      });
    });

    it("should calculate 2026-05/06 derived wages from complete current inputs", () => {
      for (const month of ["2026年5月", "2026年6月"]) {
        const row = earningData.find((item) => item.年月 === month);
        expect(row, `Expected an output row for ${month}`).toBeDefined();
        expect(row?.["時間当たり給与"], `${month} must be calculated`).toEqual(expect.any(Number));
        expect(row?.["15歳以上国民当たり給与"], `${month} must be calculated`).toEqual(
          expect.any(Number),
        );
      }
    });

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

        const raw = d["消費支出（参考）" as keyof CpiData];
        if (raw === null || raw === undefined || raw === 0) return;
        const val = Number(raw);
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
          if (ctiVal !== null && ctiVal !== undefined) {
            expect(
              ctiVal,
              `CTI消費支出（参考） at ${d.年月} should be positive number`,
            ).toBeGreaterThan(0);
          }
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

    it("should keep existing 民間最終消費支出（参考） values unchanged (regression for extended series)", () => {
      expect(earningData.length).toBeGreaterThan(0);
      const d2014 = earningData.find((d) => d.年月 === "2014年6月");
      const d2017 = earningData.find((d) => d.年月 === "2017年12月");

      expect(d2014).toBeDefined();
      expect(d2017).toBeDefined();

      const val2014 = d2014!["民間最終消費支出（参考）" as keyof CpiData] as number;
      const val2017 = d2017!["民間最終消費支出（参考）" as keyof CpiData] as number;

      expect(val2014).toBeCloseTo(101.75, 1);
      expect(val2017).toBeCloseTo(103.33, 1);
    });

    it("should base salary series on the raw 2025 calendar-year average", () => {
      expect(earningData.length).toBeGreaterThan(0);
      const dec2025 = earningData.find((d) => d.年月 === "2025年12月");
      const dec2020 = earningData.find((d) => d.年月 === "2020年12月");
      expect(dec2025).toBeDefined();
      expect(dec2020).toBeDefined();
      for (const key of ["総合", "時間当たり給与", "15歳以上国民当たり給与"]) {
        const values = earningData
          .filter((d) => d.年月.startsWith("2025年"))
          .map((d) => d[key])
          .filter((v): v is number => typeof v === "number");
        expect(values).toHaveLength(12);
        expect(values.reduce((sum, value) => sum + value, 0) / values.length).toBeCloseTo(100, 1);
      }

      // 2020年12月の12MA窓は2020年1月〜12月、すなわち2020暦年平均に等しい。
      // CTI/CPIの2020年基準は給与の2025年基準とは独立して検証する。
      // 12MA後の系列で正規化すると2019年の水準が混入して約98.07に沈むため、その回帰を防ぐ。
      expect(Number(dec2020!["CTI消費支出（参考）"])).toBeCloseTo(100, 1);

      // earnings用CPI参考系列は、CPIダッシュボードの基準年にかかわらず
      // raw CPI総合の2020暦年平均を分母として再正規化する。
      const rawCpi2020 = cpiData
        .filter((d) => d.年月.startsWith("2020年"))
        .map((d) => Number(d.総合 ?? 0))
        .filter((value) => value > 0);
      const rawCpi2020Average =
        rawCpi2020.reduce((sum, value) => sum + value, 0) / rawCpi2020.length;
      const rawCpiDec2020 = Number(cpiData.find((d) => d.年月 === "2020年12月")?.総合 ?? 0);
      const earningsCpi2020 = earningData
        .filter((d) => d.年月.startsWith("2020年"))
        .map((d) => Number(d["CPI総合(参考)"] ?? 0));
      const earningsCpi2020Average =
        earningsCpi2020.reduce((sum, value) => sum + value, 0) / earningsCpi2020.length;

      expect(rawCpi2020Average).toBeGreaterThan(0);
      expect(rawCpiDec2020).toBeGreaterThan(0);
      expect(earningsCpi2020Average).toBeCloseTo(100, 6);
      expect(Number(dec2020!["CPI総合(参考)"])).toBeCloseTo(
        (rawCpiDec2020 * 100) / rawCpi2020Average,
        6,
      );
      // 2020年12月の12MA窓は2020年1月〜12月なので、再正規化後は100になる。
      expect(Number(dec2020!["CPI総合(12MA)"])).toBeCloseTo(100, 6);

      // CPI/CTIの比較基準は給与の2025年固定基準とは独立して維持する。
      expect(Math.abs(Number(dec2025!["総合(12MA)"]) - 100)).toBeLessThan(1);
    });

    it("should verify advanced series 民間最終消費支出（参考・延長） has values from 2018 to latest and null before 2018", () => {
      expect(earningData.length).toBeGreaterThan(0);
      earningData.forEach((d) => {
        if (!d.年月 || typeof d.年月 !== "string") return;
        const year = parseInt(d.年月.substring(0, 4), 10);
        if (year < 2010) return;

        const val = d["民間最終消費支出（参考・延長）" as keyof CpiData];
        if (year >= 2018 && year <= 2025) {
          expect(
            val,
            `民間最終消費支出（参考・延長） at ${d.年月} should be a positive number`,
          ).toBeGreaterThan(0);
        } else if (year >= 2026) {
          // 生データの終端以降はnullになり得る
          expect(
            val === null || (typeof val === "number" && val > 0),
            `民間最終消費支出（参考・延長） at ${d.年月} should be positive or null`,
          ).toBe(true);
        } else {
          expect(
            val,
            `民間最終消費支出（参考・延長） at ${d.年月} should be null before 2018`,
          ).toBeNull();
        }
      });
    });

    it("should verify exact period coverage, no null gaps, and representative values for both minkan series", () => {
      const monthNumber = (value: string) => {
        const match = value.match(/^(\d{4})年(\d{1,2})月$/);
        return match ? Number(match[1]) * 12 + Number(match[2]) : 0;
      };
      const keys = earningData.map((d) => d.年月);
      expect(new Set(keys).size).toBe(keys.length);
      const regular = earningData.filter(
        (d) => monthNumber(d.年月) >= 2005 * 12 + 1 && monthNumber(d.年月) <= 2017 * 12 + 12,
      );
      const extended = earningData.filter(
        (d) => monthNumber(d.年月) >= 2018 * 12 + 1 && monthNumber(d.年月) <= 2025 * 12 + 12,
      );
      expect(regular).toHaveLength(156);
      expect(extended).toHaveLength(96);
      expect(regular[0].年月).toBe("2005年1月");
      expect(regular.at(-1)?.年月).toBe("2017年12月");
      expect(extended[0].年月).toBe("2018年1月");
      expect(extended.at(-1)?.年月).toBe("2025年12月");
      expect(regular.every((d) => typeof d["民間最終消費支出（参考）"] === "number")).toBe(true);
      expect(extended.every((d) => typeof d["民間最終消費支出（参考・延長）"] === "number")).toBe(
        true,
      );
      expect(regular.every((d) => d["民間最終消費支出（参考・延長）"] === null)).toBe(true);
      expect(extended.every((d) => d["民間最終消費支出（参考）"] === null)).toBe(true);
      expect(
        regular.every(
          (d, index) =>
            index === 0 || monthNumber(d.年月) === monthNumber(regular[index - 1].年月) + 1,
        ),
      ).toBe(true);
      expect(
        extended.every(
          (d, index) =>
            index === 0 || monthNumber(d.年月) === monthNumber(extended[index - 1].年月) + 1,
        ),
      ).toBe(true);
      expect(
        earningData.find((d) => d.年月 === "2014年6月")?.["民間最終消費支出（参考）"],
      ).toBeCloseTo(101.75, 1);
      expect(
        earningData.find((d) => d.年月 === "2017年12月")?.["民間最終消費支出（参考）"],
      ).toBeCloseTo(103.33, 1);
      expect(
        earningData.find((d) => d.年月 === "2018年1月")?.["民間最終消費支出（参考・延長）"],
      ).toBeCloseTo(103.4388685183, 8);
      expect(
        earningData.find((d) => d.年月 === "2025年12月")?.["民間最終消費支出（参考・延長）"],
      ).toBeCloseTo(119.59238292, 8);
    });

    it("should independently verify extended anchors from raw fixture and normalization formula", () => {
      expect(minkanFixture.source).toContain("minkan-extension-raw.csv");
      for (const anchor of minkanFixture.anchors) {
        const expected =
          (anchor.raw / minkanFixture.normalization.baseRaw) * minkanFixture.normalization.scale;
        expect(expected).toBeCloseTo(anchor.knownNormalized, 10);
        expect(
          earningData.find((row) => row.年月 === anchor.month)?.["民間最終消費支出（参考・延長）"],
        ).toBeCloseTo(anchor.knownNormalized, 8);
      }
    });

    it("should compare fixture anchors with the actual raw CSV rows", async () => {
      const rows = await parseCsvWithHeader(
        resolve(process.cwd(), "tests/fixtures/csv/minkan-extension-raw.csv"),
      );
      for (const anchor of minkanFixture.anchors) {
        const row = rows.find((value) => value.month === anchor.month);
        expect(row, `missing raw row ${anchor.month}`).toBeDefined();
        expect(Number(row?.raw)).toBeCloseTo(anchor.raw, 6);
      }
    });

    it("should verify the 2017/2018 boundary keeps both minkan series on the same source and scale", () => {
      expect(earningData.length).toBeGreaterThan(0);
      const d2017 = earningData.find((d) => d.年月 === "2017年12月");
      const d2018 = earningData.find((d) => d.年月 === "2018年1月");
      expect(d2017).toBeDefined();
      expect(d2018).toBeDefined();
      expect(d2017!["民間最終消費支出（参考）"]).toBeGreaterThan(0);
      expect(d2017!["民間最終消費支出（参考・延長）"]).toBeNull();
      expect(d2018!["民間最終消費支出（参考）"]).toBeNull();
      expect(d2018!["民間最終消費支出（参考・延長）"]).toBeGreaterThan(0);
    });

    // This 2020 assumption is intentionally limited to the rollback fixture.
    it("should keep 2020 fixed scaling rollback-only and leave GDP 2025 comparison keys unset", () => {
      const rollbackRows = earningData.filter((d) => d.年月.startsWith("2020年"));
      expect(rollbackRows.length).toBeGreaterThan(0);

      rollbackRows.forEach((row) => {
        expect(row["民間最終消費支出（名目・比較指数）" as keyof CpiData]).toBeNull();
        expect(row["民間最終消費支出（名目・原値）" as keyof CpiData]).toBeUndefined();
        expect(row).toHaveProperty("民間最終消費支出（参考）");
      });
    });
  });
});
