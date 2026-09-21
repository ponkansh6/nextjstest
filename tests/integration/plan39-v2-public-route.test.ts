import { describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_PUBLIC_KEYS,
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
} from "../../src/lib/chartConstants";
import {
  adaptCtiAdjustedV2PublicView,
  projectCtiAdjustedV2PublicView,
} from "../../src/lib/ctiAdjustedV2PublicProjection";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";

const makeRow = (year: number): CtiAdjustedV2Row => ({
  year,
  seriesType: year < 2017 ? "estimated_bottom_up" : "official_adjusted",
  official: year >= 2017,
  status: "available",
  reason: null,
  values: Object.fromEntries(
    CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => [category, year]),
  ) as CtiAdjustedV2Row["values"],
});

const makeResult = (accepted: boolean): CtiAdjustedV2Result => ({
  model: "v2-bottom-up",
  estimateVersion: "plan39-v2",
  years: Array.from({ length: 21 }, (_, index) => 2005 + index),
  rows: Array.from({ length: 21 }, (_, index) => makeRow(2005 + index)),
  categories: {} as CtiAdjustedV2Result["categories"],
  other: {} as CtiAdjustedV2Result["other"],
  residual: {} as CtiAdjustedV2Result["residual"],
  beta: {} as CtiAdjustedV2Result["beta"],
  fitDiagnostics: {} as CtiAdjustedV2Result["fitDiagnostics"],
  benchmarkG: {},
  benchmarkGDiagnostics: {} as CtiAdjustedV2Result["benchmarkGDiagnostics"],
  artifactValidation: {} as CtiAdjustedV2Result["artifactValidation"],
  publicationGate: {
    accepted,
    status: accepted ? "pass" : "insufficient-data",
    reasonCodes: [],
    blockingReasonCodes: accepted ? [] : ["publication_gate_closed"],
    warningReasonCodes: [],
    diagnostics: [],
  },
});

describe("Plan39-v2 public route", () => {
  it.each([false, true])(
    "publishes exactly the gated 2005–2016 estimate set (accepted=%s)",
    (accepted) => {
      const rows = adaptCtiAdjustedV2PublicView(
        projectCtiAdjustedV2PublicView(makeResult(accepted)),
      );
      const estimates = rows.filter((row) => row.year >= 2005 && row.year <= 2016);
      expect(estimates).toHaveLength(12);
      expect(
        estimates.every((row) => row.measurements[CTI_ADJUSTED_PUBLIC_KEYS[0]].value !== null),
      ).toBe(accepted);
      expect(
        estimates.every(
          (row) =>
            row.measurements[CTI_ADJUSTED_PUBLIC_KEYS[0]].status ===
            (accepted ? "available" : "unavailable"),
        ),
      ).toBe(true);
    },
  );

  it("always retains official 2017+ rows and adapts every v2 measurement to the shared contract", () => {
    const rows = adaptCtiAdjustedV2PublicView(projectCtiAdjustedV2PublicView(makeResult(false)));
    const official = rows.filter((row) => row.year >= 2017);
    expect(official).toHaveLength(9);
    expect(
      official.every(
        (row) => row.official && row.measurements[CTI_ADJUSTED_PUBLIC_KEYS[0]].value === row.year,
      ),
    ).toBe(true);
    for (const row of rows) {
      for (const category of CTI_ADJUSTED_PUBLIC_CATEGORIES) {
        const key = CTI_ADJUSTED_PUBLIC_KEYS[CTI_ADJUSTED_PUBLIC_CATEGORIES.indexOf(category)];
        const measurement = row.measurements[key];
        expect(measurement.value).toBe(row.values[category]);
        expect(measurement.model).toBe("v2-bottom-up");
        expect(measurement.estimateVersion).toBe("plan39-v2");
      }
    }
  });
});
