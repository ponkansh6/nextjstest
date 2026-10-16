import { expect, it, describe, beforeAll } from "vitest";
import { loadPopulationData } from "../../server/lib/dataLoader";

describe("Population Data Integrity", () => {
  let populationData: Map<string, { total: number; index: number; ma: number }>;

  beforeAll(async () => {
    populationData = await loadPopulationData();
  });

  it("should have non-zero population totals", async () => {
    expect(populationData.size).toBeGreaterThan(0);
    const positiveTotals = Array.from(populationData.values()).filter((v) => v.total > 0).length;
    expect(positiveTotals, "Population data should have positive total values").toBeGreaterThan(0);
  });

  it("uses the revised 2026 May population observation", () => {
    expect(populationData.get("2026年5月")?.total).toBe(10960 * 10000);
  });

  it("preserves the 2026 June population observation", () => {
    expect(populationData.get("2026年6月")?.total).toBe(10969 * 10000);
  });

  it("preserves the 2026 July population observation", () => {
    expect(populationData.get("2026年7月")?.total).toBe(10950 * 10000);
  });

  it("includes a finite 2026 August population observation", () => {
    const august = populationData.get("2026年8月");
    expect(august).toBeDefined();
    expect(Number.isFinite(august?.total)).toBe(true);
  });
});
