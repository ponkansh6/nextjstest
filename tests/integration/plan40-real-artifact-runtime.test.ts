import { describe, expect, it } from "vitest";
import { loadCtiAdjustedV2Estimate } from "@server/lib/data-loader/ctiAdjusted";
import { loadCtiBasicSeries2025 } from "@server/lib/ctiBasicSeries2025LongTerm";
import { buildPlan39V2CtiNominalRows } from "@server/lib/view-models/quarterlyAggregation";
import { CTI_ADJUSTED_V2_PUBLIC_REGISTRY } from "@/lib/chartConstants";

describe("Plan40 repository artifact runtime", () => {
  it("projects finite pre-2018 quarterly values from the A/B/L and monthly artifacts", () => {
    const result = loadCtiAdjustedV2Estimate({
      artifactRoot: "data/source/cti-adjusted",
      contract: "plan40",
    });
    const rows = buildPlan39V2CtiNominalRows({
      records: loadCtiBasicSeries2025("nominal"),
      result,
    });

    expect(result.plan40InputValidation?.valid).toBe(true);
    for (const period of ["2005Q1", "2017Q4"]) {
      const row = rows.find((candidate) => candidate.label === period);
      expect(row).toBeDefined();
      for (const entry of CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter(
        (candidate) => candidate.category !== "総合",
      )) {
        const measurement = row?.measurements?.[entry.key];
        expect(measurement?.value).toEqual(expect.any(Number));
        expect(measurement?.status).toBe("available");
        expect(measurement?.reason).toBeNull();
        expect(measurement?.value).not.toBeNaN();
      }
    }

    // The Plan40 adapter ends at the 2017 connection year; 2018Q1 remains
    // owned by the existing legacy quarterly projection in the normal merge.
    expect(rows.some((row) => row.label === "2018Q1")).toBe(false);
  });
});
