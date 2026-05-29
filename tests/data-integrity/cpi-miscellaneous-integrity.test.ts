import { describe, it, expect } from "vitest";
import { loadCpiData } from "../../server/lib/dataLoader";

describe("CPI 諸雑費 Integrity", () => {
  it("should have a valid value for 諸雑費 in the latest entry", async () => {
    const rawData = await loadCpiData();
    const sample = rawData[rawData.length - 1];
    
    expect(sample).toBeDefined();
    expect(typeof sample["諸雑費"]).toBe("number");
    expect(sample["諸雑費"]).toBeGreaterThanOrEqual(0);
  });
});
