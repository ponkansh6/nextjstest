import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";
import { buildCtiAdjustedSensitivityAnalysis } from "@server/lib/ctiAdjustedSensitivity";

const metadata = (artifact: string) => ({
  source: "synthetic-test",
  artifact,
  retrievedAt: "2026-01-01T00:00:00.000Z",
  baseYear: 2025,
  unit: "円",
  valueType: "amount",
  householdScope: "二人以上の世帯",
  frequency: "annual" as const,
  rawRange: { startYear: 2005, endYear: 2025 },
  adoptedRange: { startYear: 2005, endYear: 2025 },
  missingRepresentation: "null",
});

const years = Array.from({ length: 21 }, (_, index) => 2005 + index);
const makeInput = (
  artifact: string,
  value: (year: number, category: string) => number,
): CtiAdjustedAnnualInput => ({
  metadata: metadata(artifact),
  categoryOrder: [...CTI_ADJUSTED_INPUT_CATEGORIES],
  rows: years.map((year) => ({
    year,
    values: Object.fromEntries(
      CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, value(year, category)]),
    ),
  })),
});

const fixture = () => ({
  B: makeInput("B.csv", (year, category) => (category === "総合" ? 100 + year - 2005 : 10)),
  A: makeInput("A.csv", (year, category) =>
    category === "総合" ? 100 + (year - 2005) * 1.5 : 10 + (year - 2005) / 10,
  ),
  L: makeInput("L.csv", (year) => 100 + (year - 2005) * 2),
});

describe("buildCtiAdjustedSensitivityAnalysis", () => {
  it("uses the unified 2018..2025/2018..2024 official annual scenarios", () => {
    const { B, A, L } = fixture();
    const result = buildCtiAdjustedSensitivityAnalysis(B, A, L, {
      maxBetaDifference: 10,
      maxDDifference: 10,
      maxEstimateRelativeDifference: 10,
    });
    expect(result.scenarios.map((scenario) => scenario.calibrationYears)).toEqual([
      [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
      [2018, 2019, 2020, 2021, 2022, 2023, 2024],
    ]);
    expect(
      result.scenarios.every(
        (scenario) =>
          scenario.targetYear === 2017 && scenario.holdoutYears.every((year) => year === 2017),
      ),
    ).toBe(true);
    expect(
      result.scenarios.every((scenario) => scenario.lAnnualizationRule === "official_annual"),
    ).toBe(true);
    expect(
      result.scenarios.every(
        (scenario) => scenario.coverage.startYear === 2005 && scenario.coverage.endYear === 2016,
      ),
    ).toBe(true);
    expect(
      result.scenarios.every((scenario) =>
        scenario.evaluationYears.every((year) => year >= 2005 && year <= 2016),
      ),
    ).toBe(true);
    expect(result.acceptance.accepted).toBe(true);
    expect(result.acceptance.coveragePassed).toBe(true);
    expect(result.acceptance.reasonCodes).toEqual([]);
  });

  it("records residual-gated omissions and fails acceptance closed", () => {
    const { B, A, L } = fixture();
    const result = buildCtiAdjustedSensitivityAnalysis(B, A, L, { residualJumpThreshold: 0 });
    expect(result.scenarios.every((scenario) => scenario.omittedYears.length > 0)).toBe(true);
    expect(
      result.scenarios.every(
        (scenario) => Object.keys(scenario.omittedReasons).length === scenario.omittedYears.length,
      ),
    ).toBe(true);
    expect(result.acceptance).toMatchObject({
      coveragePassed: false,
      accepted: false,
      reasonCodes: ["insufficient_estimate_difference"],
    });
  });

  it("fails closed when any beta/difference is unavailable", () => {
    const { B, A, L } = fixture();
    const result = buildCtiAdjustedSensitivityAnalysis(B, A, L, {
      scenarios: [
        {
          name: "too-short",
          calibrationYears: [2018],
          holdoutYears: [2017],
          targetYear: 2017,
          lAnnualizationRule: "official_annual",
        },
        {
          name: "standard",
          calibrationYears: [2018, 2019, 2020],
          holdoutYears: [2017],
          targetYear: 2017,
          lAnnualizationRule: "official_annual",
        },
      ],
    });
    expect(result.acceptance.accepted).toBe(false);
    expect(result.acceptance.betaPassed).toBe(false);
  });
});
