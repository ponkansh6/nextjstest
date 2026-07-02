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
});
