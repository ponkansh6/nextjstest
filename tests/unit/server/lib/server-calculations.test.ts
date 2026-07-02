import { describe, it, expect } from "vitest";
import {
  calculateSmoothedTotal,
  calculateRawResidual,
  applyResidualMovingAverage,
  applyMovingAverage,
} from "../../../../server/lib/serverCalculations";
import type { CpiData } from "../../../../src/types";

describe("calculations.ts", () => {
  describe("calculateSmoothedTotal", () => {
    it("should sum scheduled, unscheduled, and special earnings", () => {
      const item = {
        所定内給与: 100,
        所定外給与: 50,
        特別給与: 20,
      } as unknown as CpiData;
      expect(calculateSmoothedTotal(item)).toBe(170);
    });

    it("should handle missing or non-numeric values", () => {
      const item = {
        所定内給与: 100,
        // 所定外給与 is missing
        特別給与: "invalid",
      } as unknown as CpiData;
      expect(calculateSmoothedTotal(item)).toBe(100);
    });
  });

  describe("calculateRawResidual", () => {
    it("should return (smoothedTotal - cpiVal) if cpiVal > 0", () => {
      expect(calculateRawResidual(150, 100)).toBe(50);
    });

    it("should return 0 if cpiVal <= 0", () => {
      expect(calculateRawResidual(150, 0)).toBe(0);
      expect(calculateRawResidual(150, -10)).toBe(0);
    });
  });

  describe("applyMovingAverage", () => {
    it("should calculate a simple moving average", () => {
      const data = [{ val: 10 }, { val: 20 }, { val: 30 }, { val: 40 }];
      // windowSize = 2
      applyMovingAverage(data, "val", 2);

      // index 0: (10)/1 = 10
      // index 1: (10+20)/2 = 15
      // index 2: (20+30)/2 = 25
      // index 3: (30+40)/2 = 35
      expect(data[0].val).toBe(10);
      expect(data[1].val).toBe(15);
      expect(data[2].val).toBe(25);
      expect(data[3].val).toBe(35);
    });
  });

  describe("applyResidualMovingAverage", () => {
    it("should apply 2-month moving average to residual", () => {
      const data: any[] = [
        { 年月: "2005年1月", 残差: 10 }, // skip
        { 年月: "2005年2月", 残差: 20 }, // index 1: (10+20)/2 = 15? No, wait.
      ];
      // In actual implementation:
      // index 0: 2005年1月 -> skip
      // index 1: 2005年2月 -> (data[0].残差 + data[1].残差)/2 = (10+20)/2 = 15

      applyResidualMovingAverage(data);
      expect(data[0].残差).toBe(10);
      expect(data[1].残差).toBe(15);
    });

    it("should skip 2004 and 2005年1月", () => {
      const data: any[] = [
        { 年月: "2004年12月", 残差: 10 },
        { 年月: "2005年1月", 残差: 20 },
        { 年月: "2005年2月", 残差: 30 },
      ];
      applyResidualMovingAverage(data);
      expect(data[0].残差).toBe(10);
      expect(data[1].残差).toBe(20);
      expect(data[2].残差).toBe(25); // (20+30)/2
    });
  });
});
