import { describe, expect, it } from "vitest";
import {
  buildCtiAdjustedV2Estimate,
  validateCtiAdjustedV2Plan40Inputs,
} from "@server/lib/ctiAdjustedConnectionEstimateV2";
import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";

const years = Array.from({ length: 21 }, (_, index) => 2005 + index);
function defined<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected fixture value");
  return value;
}
const metadata = (artifact: string) => ({
  source: "Plan40 test source",
  artifact,
  retrievedAt: "2026-09-22T00:00:00.000Z",
  baseYear: 2025,
  unit: "指数",
  valueType: "原数値（指数）",
  householdScope: "総世帯",
  frequency: "annual" as const,
  rawRange: { startYear: 2005, endYear: 2025 },
  adoptedRange: { startYear: 2005, endYear: 2025 },
  missingRepresentation: "null",
});

const input = (artifact: string): CtiAdjustedAnnualInput => ({
  metadata: metadata(artifact),
  categoryOrder: [...CTI_ADJUSTED_INPUT_CATEGORIES],
  rows: years.map((year) => ({
    year,
    values: Object.fromEntries(
      CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [
        category,
        category === "総合" && artifact === "A.json" && year === 2025 ? 100 : 10,
      ]),
    ),
  })),
});

const fixture = () => ({ B: input("B.json"), A: input("A.json"), L: input("L.json") });

describe("Plan40 annual-anchor input contract", () => {
  it("accepts complete positive 2005-2017 anchors with an explicit 2025 base invariant", () => {
    const { B, A, L } = fixture();
    const result = validateCtiAdjustedV2Plan40Inputs(B, A, L);
    expect(result.valid).toBe(true);
    expect(result.targetYears).toEqual(Array.from({ length: 13 }, (_, index) => 2005 + index));
    expect(result.inputCategories).toHaveLength(10);
    expect(result.normalizedBaseYear).toBe(2025);
  });

  it.each([
    [
      "missing",
      (data: ReturnType<typeof fixture>) =>
        (data.B.rows = data.B.rows.filter((row) => row.year !== 2010)),
    ],
    [
      "non-finite",
      (data: ReturnType<typeof fixture>) => (defined(data.B.rows[0]).values.食料 = Number.NaN),
    ],
    [
      "non-positive",
      (data: ReturnType<typeof fixture>) => (defined(data.B.rows[0]).values.食料 = 0),
    ],
    [
      "year omission",
      (data: ReturnType<typeof fixture>) =>
        (data.L.rows = data.L.rows.filter((row) => row.year !== 2011)),
    ],
    [
      "category omission",
      (data: ReturnType<typeof fixture>) => {
        const row = defined(data.A.rows.find((item) => item.year === 2017));
        delete row.values.食料;
      },
    ],
    [
      "source/artifact metadata omission",
      (data: ReturnType<typeof fixture>) => {
        data.B.metadata = { ...data.B.metadata, source: "", artifact: "" };
      },
    ],
  ])("rejects Plan40 %s input", (_label, mutate) => {
    const data = fixture();
    mutate(data);
    const result = validateCtiAdjustedV2Plan40Inputs(data.B, data.A, data.L);
    expect(result.valid).toBe(false);
    expect(result.status).toBe("invalid");
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  it("fails closed when the 2025 normalization invariant is not declared", () => {
    const data = fixture();
    data.A.metadata = { ...data.A.metadata, baseYear: 2024 };
    const result = validateCtiAdjustedV2Plan40Inputs(data.B, data.A, data.L);
    expect(result.reasonCodes).toContain("A:base_year_not_2025");
    expect(result.normalizedBaseYear).toBeNull();
  });

  it("fails closed when the 2025 official A anchor is non-positive", () => {
    const data = fixture();
    const row = defined(data.A.rows.find((item) => item.year === 2025));
    row.values.総合 = 0;
    const result = validateCtiAdjustedV2Plan40Inputs(data.B, data.A, data.L);
    expect(result.reasonCodes).toContain("A:missing_or_non_positive_2025_anchor");
    expect(result.normalizedBaseYear).toBeNull();
  });

  it("makes every Plan40 anchor row unavailable when the contract fails", () => {
    const data = fixture();
    data.A.rows = data.A.rows.filter((row) => row.year !== 2025);
    const result = buildCtiAdjustedV2Estimate(data.B, data.A, data.L, { contract: "plan40" });
    expect(result.plan40InputValidation?.valid).toBe(false);
    expect(result.rows.filter((row) => row.year >= 2005 && row.year <= 2017)).toHaveLength(13);
    expect(
      result.rows
        .filter((row) => row.year >= 2005 && row.year <= 2017)
        .every(
          (row) =>
            row.seriesType === "unavailable" &&
            row.values["食料"] === null &&
            row.reason === "plan40_input_contract_invalid",
        ),
    ).toBe(true);
  });
});
