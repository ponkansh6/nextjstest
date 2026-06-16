import { describe, it, expect, vi, beforeEach } from "bun:test";
import * as fs from "node:fs";
import { loadCpiData, loadTotalEarningData, loadPopulationData, loadCtiData, clearTestCache } from "../../../../server/lib/dataLoader";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe("server/lib/dataLoader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTestCache();
  });

  describe("loadCpiData", () => {
    it("should return empty array if files do not exist", async () => {
      (fs.existsSync as any).mockReturnValue(false);
      const data = await loadCpiData();
      expect(data).toEqual([]);
    });

    it("should parse valid CSV data", async () => {
      (fs.existsSync as any).mockReturnValue(true);
      const mockCpiCsv = "年月,総合\n2020年01月,100";
      const mockContributionCsv = "類・品目,ウエイト\n総合,10000";
      (fs.readFileSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cpi_data.csv")) return mockCpiCsv;
        if (typeof path === "string" && path.includes("contribution.csv")) return mockContributionCsv;
        return "";
      });
      const data = await loadCpiData();
      expect(data.length).toBe(1);
      expect(data[0].年月).toBe("2020年01月");
      expect(data[0].総合).toBe(100);
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

      result.forEach((data, ym) => {
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
      const mockCtiCsv = `月,消費支出（名目）
2005年1月,1000
2005年2月,1000
2005年3月,1000`;
      const mockSupportCsv = `
時間軸（四半期）,民間最終消費支出
2005年1～3月期,100`;

      (fs.existsSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cti_data.csv")) return true;
        if (typeof path === "string" && path.includes("cti_support_nominal.csv")) return true;
        return false;
      });

      (fs.readFileSync as any).mockImplementation((path: any) => {
        if (typeof path === "string" && path.includes("cti_data.csv")) return mockCtiCsv;
        if (typeof path === "string" && path.includes("cti_support_nominal.csv")) return mockSupportCsv;
        return "";
      });

      const data = await loadCtiData();
      
      data.forEach(row => {
        if (String(row.年月).startsWith("2005年")) {
            const month = parseInt(String(row.年月).match(/(\d+)月/)?.[1] || "0", 10);
            if (month <= 3) {
              expect(row["民間最終消費支出（名目）"], `Row ${row.年月} should have populated expenditure`).toBeGreaterThan(0);
            } else {
              expect(row["民間最終消費支出（名目）"]).toBe(0);
            }
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
        if (typeof path === "string" && path.includes("cti_support_nominal.csv")) return mockSupportNominalCsv;
        if (typeof path === "string" && path.includes("cti_support_real.csv")) return mockSupportRealCsv;
        return "";
      });

      const data = await loadCtiData();
      
      data.forEach(row => {
        if (String(row.年月).startsWith("2005年")) {
            const month = parseInt(String(row.年月).match(/(\d+)月/)?.[1] || "0", 10);
            if (month <= 3) {
              expect(row["民間最終消費支出（名目）"], `Row ${row.年月} should have populated nominal expenditure`).toBe(100);
              expect(row["民間最終消費支出（実質）"], `Row ${row.年月} should have populated real expenditure`).toBe(200);
            } else {
              expect(row["民間最終消費支出（名目）"]).toBe(0);
              expect(row["民間最終消費支出（実質）"]).toBe(0);
            }
        }
      });
    });
  });
});
