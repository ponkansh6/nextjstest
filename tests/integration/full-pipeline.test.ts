import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { loadCtiData } from "../../server/lib/dataLoader";
import { useCpiChartData } from "../../src/hooks/useCpiChartData";
import { nominalKeys, realKeys } from "../../src/lib/chartConstants";

describe("Full Pipeline Integration (Load -> Compute -> Hook Output)", () => {
  let quarterlyNominalData: any[];
  let quarterlyRealData: any[];

  beforeAll(async () => {
    const realData = await loadCtiData();
    const props = {
      data: realData,
      endYear: 2026,
      maxCpiDate: { month: 12, year: 2026 },
      nominalData: realData,
      nominalKeys: nominalKeys,
      realKeys: realKeys,
      startYear: 2005,
    };

    const { result } = renderHook(() => useCpiChartData(props));
    quarterlyNominalData = result.current.quarterlyNominalData;
    quarterlyRealData = result.current.quarterlyRealData;
  });


  describe("Nominal Keys Verification", () => {
    nominalKeys.forEach(key => {
      it(`should have positive value for nominal key: ${key}`, () => {
        const validQuarter = quarterlyNominalData?.find(q => q["食料（名目）"] > 0);
        expect(validQuarter, "Should find a valid quarter with data").toBeDefined();
        // @ts-ignore
        expect(validQuarter).toHaveProperty(key);
        // @ts-ignore
        expect(typeof validQuarter[key]).toBe("number");
        // @ts-ignore
        expect(validQuarter[key]).toBeGreaterThan(0);
      });
    });
  });

  describe("Real Keys Verification", () => {
    realKeys.forEach(key => {
      it(`should have positive value for real key: ${key}`, () => {
        const validRealQuarter = quarterlyRealData?.find(q => q["食料（実質）"] > 0);
        expect(validRealQuarter, "Should find a valid quarter with data").toBeDefined();
        // @ts-ignore
        expect(validRealQuarter).toHaveProperty(key);
        // @ts-ignore
        expect(typeof validRealQuarter[key]).toBe("number");
        // @ts-ignore
        expect(validRealQuarter[key]).toBeGreaterThan(0);
      });
    });
  });
});
