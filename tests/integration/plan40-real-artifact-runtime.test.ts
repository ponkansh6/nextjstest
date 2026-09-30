import { describe, expect, it } from "vitest";
import { loadCtiAdjustedV2Estimate } from "@server/lib/data-loader/ctiAdjusted";
import { loadCtiDataInternal } from "@server/lib/data-loader/cpi";
import { loadPlan39V2CtiNominalRows } from "@server/lib/view-models/quarterlyAggregation";
import { CTI_ADJUSTED_V2_PUBLIC_REGISTRY } from "@/lib/chartConstants";

describe("Plan40 repository artifact runtime", () => {
  it("accepts current-input Plan40 evidence and keeps historical and official quarterly values", async () => {
    const result = loadCtiAdjustedV2Estimate({
      artifactRoot: "data/source/cti-adjusted",
      contract: "plan40",
    });
    const runtime = await loadCtiDataInternal();
    const rows = loadPlan39V2CtiNominalRows(result, runtime, runtime.ctiMetadata);

    expect(result.plan40InputValidation?.valid).toBe(true);
    expect(result.publicationGate.accepted).toBe(true);
    expect(result.publicationGate.status).toBe("pass");
    expect(result.publicationGate.reasonCodes).not.toContain("rolling_loo_backtest_incomplete");
    expect(result.publicationGate.blockingReasonCodes).not.toContain(
      "rolling_loo_backtest_incomplete",
    );
    expect(result.publicationGate.blockingReasonCodes).toEqual([]);
    expect(runtime.ctiMetadata?.statInfId).toBe("000040499069");
    const metadataDescriptor = Object.getOwnPropertyDescriptor(runtime, "ctiMetadata");
    expect(metadataDescriptor).toMatchObject({
      enumerable: false,
      configurable: false,
      writable: false,
    });
    expect(Object.keys(runtime)).not.toContain("ctiMetadata");
    expect({ ...runtime }).not.toHaveProperty("ctiMetadata");
    const historical = rows.find((candidate) => candidate.label === "2005Q1");
    expect(historical).toBeDefined();
    for (const entry of CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter(
      (candidate) => candidate.category !== "総合",
    )) {
      const measurement = historical?.measurements?.[entry.key];
      expect(measurement?.value).toEqual(expect.any(Number));
      expect(measurement?.value).not.toBeNaN();
      expect(measurement?.status).toBe("available");
      expect(measurement?.reason).toBeNull();
    }

    for (const period of ["2017Q4", "2018Q1"]) {
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
    const official2018 = rows.find((row) => row.label === "2018Q1");
    expect(official2018?.kind).toBe("plan40-official-quarterly");
    const foodKey = CTI_ADJUSTED_V2_PUBLIC_REGISTRY.find((entry) => entry.category === "食料")?.key;
    expect(foodKey).toBeDefined();
    expect(official2018?.measurements?.[foodKey!]?.sourceId).toBe("000040499087");
  });
});
