import { describe, expect, it } from "vitest";
import { projectCtiAdjustedPublicRows } from "@/lib/ctiAdjustedPublicProjection";

describe("CTI adjusted public measurement projection", () => {
  it("keeps provenance fields and emits annual JSON-safe measurements", () => {
    const [row] = projectCtiAdjustedPublicRows(
      [
        {
          year: 2016,
          seriesType: "estimated_adjusted",
          official: false,
          status: "available",
          reason: null,
          values: { 総合: 101, 食料: 20 },
        },
      ],
      { status: "pass", accepted: true },
    );

    expect(row.seriesType).toBe("estimated_adjusted");
    expect(row.official).toBe(false);
    expect(row.status).toBe("available");
    expect(row.reason).toBeNull();
    expect(row.measurements.総合).toMatchObject({
      value: 101,
      frequency: "annual",
      aggregation: "cti_adjusted_connection_estimate",
      status: "available",
    });
    expect(() => JSON.stringify(row)).not.toThrow();
  });

  it("fails closed for estimates when the overall audit gate is absent or rejected", () => {
    const [row] = projectCtiAdjustedPublicRows([
      {
        year: 2016,
        seriesType: "estimated_adjusted",
        official: false,
        status: "available",
        reason: null,
        values: { 総合: 101 },
      },
    ]);

    expect(row).toMatchObject({
      seriesType: "unavailable",
      official: false,
      status: "unavailable",
      reason: "overall_verdict_not_accepted",
      values: { 総合: null },
    });
  });

  it("does not turn an unavailable row into a fabricated value", () => {
    const [row] = projectCtiAdjustedPublicRows([
      {
        year: 2010,
        seriesType: "unavailable",
        official: false,
        status: "unavailable",
        reason: "missing_l_artifact",
        values: { 総合: null },
      },
    ]);

    expect(row.values.総合).toBeNull();
    expect(row.reason).toBe("missing_l_artifact");
    expect(row.measurements.総合.frequency).toBe("annual");
  });
});
