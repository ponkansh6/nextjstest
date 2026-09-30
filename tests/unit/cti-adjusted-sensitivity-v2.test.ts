import { buildCtiAdjustedSensitivityAnalysis } from "@server/lib/ctiAdjustedSensitivity";
import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";
import type { CtiAdjustedV2HouseholdComposition } from "@server/lib/ctiAdjustedConnectionEstimateV2";

const input = (
  artifact: string,
  value: (year: number, category: string) => number,
  endYear = 2025,
): CtiAdjustedAnnualInput => ({
  metadata: {
    source: "test",
    artifact,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    baseYear: 2025,
    unit: "index",
    valueType: "index",
    householdScope: "test",
    frequency: "annual",
    rawRange: { startYear: 2005, endYear },
    adoptedRange: { startYear: 2005, endYear },
    missingRepresentation: "null",
  },
  categoryOrder: [...CTI_ADJUSTED_INPUT_CATEGORIES],
  rows: Array.from({ length: endYear - 2005 + 1 }, (_, index) => {
    const year = 2005 + index;
    return {
      year,
      values: Object.fromEntries(
        CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, value(year, category)]),
      ),
    };
  }),
});

const householdComposition: CtiAdjustedV2HouseholdComposition = {
  historicalPi2Plus: Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => [2005 + index, 0.65 + index * 0.001]),
  ),
  historicalPiStatusByYear: Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => [
      2005 + index,
      {
        status: index === 6 ? "synthetic_interpolation_unverified" : "observed",
        synthetic: index === 6,
        benchmarkId: "synthetic-unit-test",
        connectionStatus: "centered_at_2017",
        interpolationMethod: index === 6 ? "linear" : null,
      },
    ]),
  ),
  calibrationPi2Plus: { 2017: 0.66, 2025: 0.68 },
  provenance: {
    artifactPath: "test/production-pi2plus.json",
    artifactSha256: "test",
    manifestSha256: "test",
    historicalSource: "synthetic unit fixture",
    calibrationSource: "synthetic unit fixture",
    caveats: ["synthetic test fixture"],
  },
};

describe("Plan39 v2 sensitivity audit", () => {
  it("keeps the gamma sweep comparison-only and records all comparison series", () => {
    const b = input("B", (year, category) => (category === "総合" ? 100 + year - 2005 : 5));
    const a = input("A", (year, category) => (category === "総合" ? 110 + year - 2005 : 5.2));
    const l = input("L", (year) => 100 + (year - 2005) / 2, 2018);
    const result = buildCtiAdjustedSensitivityAnalysis(b, a, l, {
      householdComposition,
    });

    expect(result.gammaScenarios.map((scenario) => scenario.gamma)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    expect(result.gammaScenarios.every((scenario) => scenario.comparisonOnly)).toBe(true);
    expect(result.gammaScenarios.every((scenario) => scenario.evaluated.length > 0)).toBe(true);
    expect(
      result.gammaScenarios.every((scenario) => scenario.annual[2005].status === "evaluated"),
    ).toBe(true);
    expect(
      result.gammaScenarios.every((scenario) => scenario.annual[2019].status === "omitted"),
    ).toBe(true);
    expect(
      result.gammaScenarios.every(
        (scenario) => scenario.annual[2019].reason === "missing_l_benchmark:2019",
      ),
    ).toBe(true);
    expect(result.gammaScenarios[0]).toEqual(
      expect.objectContaining({
        coverage: expect.any(Number),
        evaluated: expect.any(Array),
        omitted: expect.any(Array),
        reasons: expect.any(Array),
        currentV1: expect.any(Object),
        bottomUp: expect.any(Object),
        externalBenchmarkL: expect.any(Object),
        annual: expect.any(Object),
      }),
    );
    expect(result.gammaScenarios[0].annual[2005]).toEqual(
      expect.objectContaining({
        year: 2005,
        status: expect.any(String),
      }),
    );
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("reason");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("currentV1");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("bottomUp");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("bottomUpMajorSum");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("bottomUpOther");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("bottomUpD");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("externalBenchmarkL");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("absoluteDifference");
    expect(result.gammaScenarios[0].annual[2005]).toHaveProperty("relativeDifference");
  });
});
