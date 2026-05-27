import { describe, it, expect } from "vitest";
import { loadCpiData } from "../src/lib/cpiData";

describe("CPI Pipeline Trace", async () => {
  const rawData = await loadCpiData();
  const sample = rawData[rawData.length - 1];
  const keys = Object.keys(sample).filter((key) => key !== "年月" && !key.startsWith("Unnamed"));

  describe("Load Stage", () => {
    keys.forEach((key) => {
      it(`should have valid data for ${key}`, () => {
        const value = sample[key as keyof typeof sample];
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe("Rendering Stage (Post-Processing)", () => {
    keys.forEach((key) => {
      it(`should be ready for rendering for ${key}`, () => {
        const value = sample[key as keyof typeof sample];
        // 処理後の値が有限数かつ正の値であること
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      });
    });
  });
});
