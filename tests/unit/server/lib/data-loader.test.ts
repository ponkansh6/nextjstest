import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import {
  loadCpiData,
  loadTotalEarningData,
  loadPopulationData,
  loadCtiData,
  clearTestCache,
} from "../../../../server/lib/dataLoader";
import {
  getCpiDataStatus,
  getCpiMajorWeightTotal,
  getGdpSupportStatus,
} from "../../../../server/lib/data-loader/cpi";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const build2025Fixture = () => {
  const series = ["総合", ...Array.from({ length: 77 }, (_, index) => `系列${index + 1}`)];
  const rows: string[] = ["年月," + series.join(",")];
  for (let offset = 0; offset < 679; offset += 1) {
    const date = new Date(Date.UTC(1970, offset, 1));
    rows.push(
      `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月,${series.map(() => "100").join(",")}`,
    );
  }
  const cpi = rows.join("\n");
  const contribution = `類・品目,${series.join(",")}\nウエイト(2025年指数以降),10000,${series
    .slice(1)
    .map(() => "100")
    .join(",")}`;
  const metadata = JSON.stringify({
    status: "ready",
    baseYear: 2025,
    indexFile: "cpi_data2025_long.csv",
    contributionFile: "contribution2025.csv",
    csvSha256: createHash("sha256").update(cpi).digest("hex"),
    period: { start: "1970年1月", end: "2026年7月", monthlyRows: 679 },
    seriesCount: 78,
  });
  return { cpi, contribution, metadata };
};

describe("server/lib/dataLoader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTestCache();
  });

  describe("getGdpSupportStatus", () => {
    it("reports an unavailable GDP comparison independently when its validated set is absent", async () => {
      (fs.existsSync as any).mockReturnValue(false);

      await expect(getGdpSupportStatus()).resolves.toEqual({
        valid: false,
        reason: "missing GDP display set file",
      });
    });
  });

  describe("loadCpiData", () => {
    it("should return empty array if files do not exist", async () => {
      (fs.existsSync as any).mockReturnValue(false);
      const data = await loadCpiData();
      expect(data).toEqual([]);
    });

    it("should parse valid CSV data", async () => {
      (fs.existsSync as any).mockReturnValue(true);
      const fixture = build2025Fixture();
      (fs.readFileSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cpi_data2025_long.csv")) return fixture.cpi;
        if (typeof path === "string" && path.includes("contribution2025.csv"))
          return fixture.contribution;
        if (typeof path === "string" && path.includes("metadata.json")) return fixture.metadata;
        return "";
      });
      const data = await loadCpiData();
      expect(data.length).toBe(271);
      expect(data[0].年月).toBe("2004年1月");
      expect(data[0].総合).toBe(100);
    });

    it("uses a complete, metadata-validated 2025 pair without reading the 2020 pair", async () => {
      const fixture = build2025Fixture();
      const mockCpiCsv = fixture.cpi;
      const mockContributionCsv = fixture.contribution;
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation((path: string) => {
        if (path.includes("cpi_data2025_long.csv")) return mockCpiCsv;
        if (path.includes("contribution2025.csv")) return mockContributionCsv;
        if (path.includes("metadata.json"))
          return JSON.stringify({
            ...JSON.parse(fixture.metadata),
            csvSha256: createHash("sha256").update(mockCpiCsv).digest("hex"),
          });
        return "";
      });

      const data = await loadCpiData();

      expect(fs.readFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining("cpi_data.csv"),
        "utf8",
      );
      expect(
        getCpiMajorWeightTotal({
          食料: 2754,
          住居: 2182,
          "光熱・水道": 698,
          "家具・家事用品": 372,
          被服及び履物: 299,
          保健医療: 466,
          "交通・通信": 1444,
          教育: 311,
          教養娯楽: 906,
          諸雑費: 570,
        }),
      ).toBe(10002);
      expect(data[0].総合).toBe(100);
    });

    it("falls back only to the complete 2020 pair when the 2025 pair is incomplete", async () => {
      const fallbackCpi = "年月,総合\n2020年1月,100";
      const fallbackWeights = "類・品目,総合\nウエイト(2020年指数以降),10000";
      (fs.existsSync as any).mockImplementation(
        (path: string) => !path.includes("cpi_data2025_long.csv"),
      );
      (fs.readFileSync as any).mockImplementation((path: string) => {
        if (path.includes("cpi_data.csv")) return fallbackCpi;
        if (path.includes("contribution.csv")) return fallbackWeights;
        return "";
      });

      const data = await loadCpiData();

      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ 年月: "2020年1月", 総合: 100 });
      await expect(getCpiDataStatus()).resolves.toMatchObject({
        baseYear: 2020,
        pair: "2020",
        valid: true,
      });
    });

    it.each([
      [
        "a changed CSV hash",
        (metadata: Record<string, unknown>) => ({ ...metadata, csvSha256: "0".repeat(64) }),
      ],
      [
        "an invalid monthly row count",
        (metadata: Record<string, unknown>) => ({
          ...metadata,
          period: { ...(metadata.period as Record<string, unknown>), monthlyRows: 678 },
        }),
      ],
      [
        "an invalid series count",
        (metadata: Record<string, unknown>) => ({ ...metadata, seriesCount: 77 }),
      ],
    ])("falls back to the complete 2020 pair for %s", async (_description, alterMetadata) => {
      const fixture = build2025Fixture();
      const fallbackCpi = "年月,総合\n2020年1月,100";
      const fallbackWeights = "類・品目,総合\nウエイト(2020年指数以降),10000";
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation((filePath: string) => {
        if (filePath.includes("cpi_data2025_long.csv")) return fixture.cpi;
        if (filePath.includes("contribution2025.csv")) return fixture.contribution;
        if (filePath.includes("metadata.json"))
          return JSON.stringify(alterMetadata(JSON.parse(fixture.metadata)));
        if (filePath.includes("cpi_data.csv")) return fallbackCpi;
        if (filePath.includes("contribution.csv")) return fallbackWeights;
        return "";
      });

      await expect(loadCpiData()).resolves.toMatchObject([{ 年月: "2020年1月", 総合: 100 }]);
      await expect(getCpiDataStatus()).resolves.toMatchObject({
        baseYear: 2020,
        pair: "2020",
        valid: true,
      });
    });

    it("rejects a metadata-inconsistent 2025 pair instead of mixing it with 2020 inputs", async () => {
      const cpi = "年月,総合\n2025年1月,100";
      const weights = "類・品目,総合\nウエイト(2025年指数以降),10000";
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation((path: string) => {
        if (path.includes("metadata.json"))
          return JSON.stringify({
            status: "ready",
            baseYear: 2020,
            indexFile: "cpi_data2025_long.csv",
            contributionFile: "contribution2025.csv",
          });
        if (path.includes("cpi_data2025_long.csv") || path.includes("cpi_data.csv")) return cpi;
        if (path.includes("contribution2025.csv") || path.includes("contribution.csv"))
          return weights;
        return "";
      });

      await expect(loadCpiData()).resolves.toHaveLength(1);
      await expect(getCpiDataStatus()).resolves.toMatchObject({
        baseYear: 2020,
        pair: "2020",
        valid: true,
      });
    });

    it("fails closed when neither complete pair has its required headers", async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue("年月,総合\n2020年1月,100");

      await expect(loadCpiData()).resolves.toEqual([]);
      await expect(getCpiDataStatus()).resolves.toMatchObject({
        baseYear: null,
        pair: null,
        valid: false,
      });
    });
  });

  describe("loadTotalEarningData", () => {
    it("should return empty array if files do not exist", async () => {
      (fs.existsSync as any).mockReturnValue(false);
      const data = await loadTotalEarningData();
      expect(data).toEqual([]);
    });
  });

  describe("loadPopulationData", () => {
    it("should return empty map if file does not exist", async () => {
      (fs.existsSync as any).mockReturnValue(false);
      const data = await loadPopulationData();
      expect(data).toBeInstanceOf(Map);
      expect(data.size).toBe(0);
    });

    it("should process population csv correctly for 15+ population", async () => {
      const mockCsv = `年　月,dummy,dummy,dummy,総数
,,,,
2020年,1月,,,100000`;

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(mockCsv as any);

      const result = await loadPopulationData();

      expect(result.size).toBeGreaterThan(0);
      expect(result.get("2020年1月")?.total).toBe(1_000_000_000);
    });

    it("should be robust against different header formats and era names", async () => {
      const robustCsv = `
[基本集計],,,,
,,,,
Year and month ,,,,,,Total aged 15+,,,
(Sub-header row),,,,,,,,
令和 2年,1月,Jan.,,,,11109,,,,
,2月,Feb.,,,,11106,,,,
`;
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(robustCsv as any);

      const result = await loadPopulationData();
      expect(result.has("2020年1月")).toBeTruthy();
      expect(result.get("2020年1月")?.total).toBe(111_090_000);
      expect(result.has("2020年2月")).toBeTruthy();
      expect(result.get("2020年2月")?.total).toBe(111_060_000);
    });

    it("should calculate index and moving average within reasonable range, with 2020 index near 100", async () => {
      const mockCsv = `年,dummy,Month,dummy,総数
2020,,01,,100000
2020,,06,,100000
2021,,01,,110000`;

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(mockCsv as any);

      const result = await loadPopulationData();

      result.forEach((data: any, ym: string) => {
        expect(data.index).toBeGreaterThanOrEqual(0);
        expect(data.ma).toBeGreaterThanOrEqual(0);
        expect(data.ma).toBeLessThan(200);

        if (ym.startsWith("2020年")) {
          expect(data.index).toBeCloseTo(100, 2);
        }
      });
    });

    it("should parse correctly with mock csv content including specific era format", async () => {
      const csvContent = `
年　月,Month,Other,Col3,TotalPop
,,Empty
2026,1月,Jan.,,10953
`;
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(csvContent as any);

      const result = await loadPopulationData();
      expect(result.has("2026年1月")).toBeTruthy();
      expect(result.get("2026年1月")?.total).toBe(109_530_000);
    });
  });

  describe("loadCtiData", () => {
    it("should return empty array if file does not exist", async () => {
      (fs.existsSync as any).mockReturnValue(false);
      const data = await loadCtiData();
      expect(data).toEqual([]);
    });

    it("should ensure民間最終消費支出 is populated when support data exists for the quarter", async () => {
      const mockCtiCsv = `月,消費支出（名目）,消費支出（実質）
2005年1月,1000,1000
2005年2月,1000,1000
2005年3月,1000,1000`;
      const mockSupportCsv = `
時間軸（四半期）,民間最終消費支出
2005年1～3月期,100`;

      (fs.existsSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cti_data.csv")) return true;
        if (typeof path === "string" && path.includes("cti_support_nominal.csv")) return true;
        if (typeof path === "string" && path.includes("cti_support_real.csv")) return true;
        return false;
      });

      (fs.readFileSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cti_data.csv")) return mockCtiCsv;
        if (typeof path === "string" && path.includes("cti_support_nominal.csv"))
          return mockSupportCsv;
        if (typeof path === "string" && path.includes("cti_support_real.csv"))
          return mockSupportCsv;
        return "";
      });

      const data = await loadCtiData();

      data.forEach((row: any) => {
        if (String(row.年月).startsWith("2005年")) {
          const month = parseInt(String(row.年月).match(/(\d+)月/)?.[1] || "0", 10);
          if (month <= 3) {
            expect(
              row["民間最終消費支出（名目）"],
              `Row ${row.年月} should have populated expenditure`,
            ).toBeGreaterThan(0);
          } else expect(row["民間最終消費支出（名目）"]).toBe(0);
        }
      });
    });

    it("should ensure 民間最終消費支出（実質） is populated when real support data exists for the quarter", async () => {
      const mockCtiCsv = `月,消費支出（名目）,消費支出（実質）
2005年1月,1000,1000
2005年2月,1000,1000
2005年3月,1000,1000`;
      const mockSupportNominalCsv = `時間軸（四半期）,民間最終消費支出
2005年1～3月期,100`;
      const mockSupportRealCsv = `時間軸（四半期）,民間最終消費支出
2005年1～3月期,200`;

      (fs.existsSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cti_data.csv")) return true;
        if (typeof path === "string" && path.includes("cti_support_nominal.csv")) return true;
        if (typeof path === "string" && path.includes("cti_support_real.csv")) return true;
        return false;
      });

      (fs.readFileSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cti_data.csv")) return mockCtiCsv;
        if (typeof path === "string" && path.includes("cti_support_nominal.csv"))
          return mockSupportNominalCsv;
        if (typeof path === "string" && path.includes("cti_support_real.csv"))
          return mockSupportRealCsv;
        return "";
      });

      const data = await loadCtiData();

      data.forEach((row: any) => {
        if (String(row.年月).startsWith("2005年")) {
          const month = parseInt(String(row.年月).match(/(\d+)月/)?.[1] || "0", 10);
          if (month <= 3) {
            expect(
              row["民間最終消費支出（名目）"],
              `Row ${row.年月} should have populated nominal expenditure`,
            ).toBe(100);
            expect(
              row["民間最終消費支出（実質）"],
              `Row ${row.年月} should have populated real expenditure`,
            ).toBe(200);
          } else {
            expect(row["民間最終消費支出（名目）"]).toBe(0);
            expect(row["民間最終消費支出（実質）"]).toBe(0);
          }
        }
      });
    });
  });
});
