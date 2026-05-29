import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import { loadCpiData, loadTotalEarningData, loadPopulationData, loadCtiData } from "../../../../../server/lib/dataLoader";

vi.mock("fs");

describe("server/lib/dataLoader", () => {
  describe("loadCpiData", () => {
    it("should return empty array if files do not exist", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const data = await loadCpiData();
      expect(data).toEqual([]);
    });

    it("should parse valid CSV data", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const mockCpiCsv = "年月,総合\n2020年01月,100";
      const mockContributionCsv = "類・品目,ウエイト\n総合,10000";
      vi.spyOn(fs, "readFileSync").mockImplementation((path) => {
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
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const data = await loadTotalEarningData();
      expect(data).toEqual([]);
    });
  });

  describe("loadPopulationData", () => {
    it("should return empty map if file does not exist", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const data = await loadPopulationData();
      expect(data).toBeInstanceOf(Map);
      expect(data.size).toBe(0);
    });
  });

  describe("loadCtiData", () => {
    it("should return empty array if file does not exist", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const data = await loadCtiData();
      expect(data).toEqual([]);
    });
  });
});
