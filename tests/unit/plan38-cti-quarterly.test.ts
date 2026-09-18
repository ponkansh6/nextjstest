import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregateCtiBasicNominalQuarterly,
  loadCtiBasicSeries2025,
  type CtiBasicRecord,
} from "../../server/lib/ctiBasicSeries2025LongTerm";
import { projectQuarterlyPublicView } from "../../src/lib/quarterlyPublicProjection";
import { buildPlan38CtiNominalRowsFromRecords } from "../../server/lib/view-models/quarterlyAggregation";
import { loadTotalEarningDataInternal } from "../../server/lib/data-loader/earnings";
import { buildCsv } from "../../src/lib/csvExport";
import {
  QUARTERLY_GDP_RAW_NOMINAL_KEY,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import type { QuarterlyView } from "../../src/types/chart";

const records = (mutate?: (rows: CtiBasicRecord[]) => void): CtiBasicRecord[] => {
  const rows: CtiBasicRecord[] = [];
  for (let year = 2005; year <= 2017; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      rows.push({
        variant: "nominal",
        seriesIndex: 1,
        officialSeriesCode: "1",
        seriesName: "消費支出（名目）",
        month: `${year}-${String(month).padStart(2, "0")}` as `${number}-${number}`,
        rawValue: month === 1 ? 0 : year + month,
        isMissing: false,
      });
    }
  }
  mutate?.(rows);
  return rows;
};

describe("Plan38 CTI nominal quarterly support", () => {
  it("keeps CTI support aggregation out of legacy and client calculation APIs", () => {
    const aggregationSource = readFileSync(
      resolve("server/lib/view-models/quarterlyAggregation.ts"),
      "utf8",
    );
    const clientMathSource = readFileSync(resolve("src/lib/math/clientCalculations.ts"), "utf8");
    const clientSource = readFileSync(resolve("src/lib/clientCalculations.ts"), "utf8");

    expect(aggregationSource).not.toContain("applySupportSeriesScaling");
    expect(aggregationSource).not.toContain("item[k] = v");
    expect(clientMathSource).not.toContain("isCompleteCtiQuarter");
    expect(clientMathSource).not.toContain("normalizeYearMonth");
    expect(clientMathSource).toContain("server responsibilities");
    expect(clientSource).not.toContain("ctiKeys");
    expect(clientSource).not.toContain("SUPPORT_SERIES_KEY_NOMINAL");
  });

  it("documents GDP as outside the Plan38 nominal public projection", () => {
    const spec = readFileSync(resolve("openspec/specs/nextjstest/spec.md"), "utf8");
    expect(spec).toMatch(/GDP raw\/\s*comparison names, values, and measurements are absent/);
    expect(spec).toMatch(/GDP is isolated to the real\/legacy compatibility contract/);
  });

  it("averages exactly three calendar months and keeps zero valid", () => {
    const result = aggregateCtiBasicNominalQuarterly(records());
    expect(result.status).toBe("valid");
    expect(result.values.get("2005Q1")).toBe((0 + 2007 + 2008) / 3);
    expect(result.values).toHaveLength(52);
  });

  it.each(["missing", "non-finite", "duplicate"])(
    "returns null for a quarter with %s input without fallback",
    (kind) => {
      const result = aggregateCtiBasicNominalQuarterly(
        records((rows) => {
          if (kind === "missing") rows.splice(1, 1);
          if (kind === "non-finite") rows[1]!.rawValue = Number.NaN;
          if (kind === "duplicate") rows.push({ ...rows[0]! });
        }),
      );
      expect(result.status).toBe("invalid");
      expect(result.values.has("2005Q1")).toBe(false);
      expect(result.measurements.get("2005Q1")?.reason).toBe(
        kind === "missing" ? "insufficient_months" : kind === "non-finite" ? "non_finite" : kind,
      );
    },
  );

  it("keeps all 52 fixed rows and carries null plus reason for invalid quarters", () => {
    const rows = buildPlan38CtiNominalRowsFromRecords(records((items) => items.splice(1, 1)));
    expect(rows).toHaveLength(52);
    const invalid = rows.find((row) => row.label === "2005Q1")!;
    expect(invalid[SUPPORT_SERIES_KEY_NOMINAL]).toBeNull();
    expect(invalid.measurements?.[SUPPORT_SERIES_KEY_NOMINAL]).toMatchObject({
      status: "invalid",
      reason: "insufficient_months",
      value: null,
    });
    expect(rows.some((row) => row[SUPPORT_SERIES_KEY_NOMINAL] === 0)).toBe(false);
  });

  it("does not reintroduce a GDP key into the nominal public projection", () => {
    const ctiMeasurement = aggregateCtiBasicNominalQuarterly(records()).measurements.get("2005Q1");
    if (!ctiMeasurement) throw new Error("CTI measurement missing");
    const row = projectQuarterlyPublicView(
      [
        {
          年: 2005,
          quarter: 1,
          label: "2005Q1",
          年月: "2005年1月",
          [SUPPORT_SERIES_KEY_NOMINAL]: 10,
          GDP名目原値: 999,
          GDP名目比較指数: 888,
          measurements: {
            [SUPPORT_SERIES_KEY_NOMINAL]: ctiMeasurement,
            GDP名目原値: {
              key: QUARTERLY_GDP_RAW_NOMINAL_KEY,
              label: "GDP名目原値",
              unit: "百万円",
              source: "GDP",
              valueType: "raw",
              value: 999,
              status: "valid",
              reason: null,
              frequency: "quarterly",
              aggregation: "official",
            },
          },
        },
      ],
      "nominal",
    )[0];
    expect(row).not.toHaveProperty("GDP名目原値");
    expect(row).not.toHaveProperty("GDP名目比較指数");
    expect(row.measurements).not.toHaveProperty("GDP名目原値");
  });

  it("ignores artifact records outside the fixed Plan38 window", () => {
    const result = aggregateCtiBasicNominalQuarterly(
      records((rows) => rows.push({ ...rows[0]!, month: "2018-01" })),
    );
    expect(result.status).toBe("valid");
    expect(result.reason).toBeNull();
    expect(result.values).toHaveLength(52);
  });

  it("accepts the complete long-term artifact while projecting only Plan38 quarters", () => {
    const fullArtifact = loadCtiBasicSeries2025("nominal").filter(
      (record) => record.seriesIndex === 1,
    );
    const result = aggregateCtiBasicNominalQuarterly(fullArtifact);

    expect(result.status).toBe("valid");
    expect(result.values).toHaveLength(52);
    expect(result.values.get("2005Q1")).toBe((98.3 + 90.3 + 108.4) / 3);
    expect([...result.values.keys()].every((key) => /^20(?:0[5-9]|1[0-7])Q[1-4]$/.test(key))).toBe(
      true,
    );
  });

  it("rejects an identity mismatch without GDP fallback", () => {
    const result = aggregateCtiBasicNominalQuarterly(
      records((rows) => {
        rows[0]!.officialSeriesCode = "2";
        rows[1]!.rawValue = 999999;
      }),
    );
    expect(result.measurements.get("2005Q1")?.status).toBe("invalid");
    expect(result.measurements.get("2005Q1")?.reason).toBe("series_mismatch");
    expect(result.values.has("2005Q1")).toBe(false);
  });

  it("keeps zero as a valid value and exposes metadata", () => {
    const result = aggregateCtiBasicNominalQuarterly(
      records((rows) => {
        rows[1]!.rawValue = 0;
        rows[2]!.rawValue = 0;
      }),
    );
    expect(result.measurements.get("2005Q1")?.status).toBe("valid");
    expect(result.measurements.get("2005Q1")?.valueType).toBe("raw");
    expect(result.measurements.get("2005Q1")?.value).toBe(0);
  });

  it("preserves the same row metadata through public projection and CSV", () => {
    const measurement = aggregateCtiBasicNominalQuarterly(records()).measurements.get("2005Q1");
    if (!measurement || measurement.value === null)
      throw new Error("valid CTI measurement missing");
    const rows = projectQuarterlyPublicView([
      {
        年: 2005,
        quarter: 1,
        label: "2005Q1",
        年月: "2005年1月",
        [SUPPORT_SERIES_KEY_NOMINAL]: measurement.value,
        measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: measurement },
      },
    ]);
    const csv = buildCsv(
      rows as unknown as Record<string, unknown>[],
      [SUPPORT_SERIES_KEY_NOMINAL],
      ["CTI"],
      { metadata: [measurement] },
    );
    expect(rows[0]!.measurements?.[SUPPORT_SERIES_KEY_NOMINAL]).toEqual(measurement);
    expect(csv).toContain("e-Stat 公式CTI長期artifact 000040499070");
    expect(csv).toContain("__frequency");
    expect(csv).toContain("__aggregation");
    expect(csv).toContain("quarterly");
    expect(csv).toContain("simple_mean_of_three_calendar_months");
    expect(csv).toContain(",valid,");
  });

  it("projects only the requested mode and never leaks GDP measurements into nominal CTI", () => {
    const ctiMeasurement = aggregateCtiBasicNominalQuarterly(records()).measurements.get("2005Q1");
    if (!ctiMeasurement) throw new Error("CTI measurement missing");
    const gdpMeasurement = {
      key: QUARTERLY_GDP_RAW_NOMINAL_KEY,
      label: "GDP名目原値",
      unit: "百万円",
      source: "GDP",
      valueType: "raw" as const,
      value: 999,
      status: "valid" as const,
      reason: null,
      frequency: "quarterly" as const,
      aggregation: "official",
    };
    const nominal = projectQuarterlyPublicView(
      [
        {
          年: 2005,
          quarter: 1,
          label: "2005Q1",
          年月: "2005Q1",
          [SUPPORT_SERIES_KEY_NOMINAL]: ctiMeasurement.value,
          [SUPPORT_SERIES_KEY_REAL]: 202,
          [QUARTERLY_GDP_RAW_NOMINAL_KEY]: 999,
          measurements: {
            [SUPPORT_SERIES_KEY_NOMINAL]: ctiMeasurement,
            [SUPPORT_SERIES_KEY_REAL]: { ...ctiMeasurement, key: SUPPORT_SERIES_KEY_REAL },
            [QUARTERLY_GDP_RAW_NOMINAL_KEY]: gdpMeasurement,
          },
        } satisfies QuarterlyView,
      ],
      "nominal",
    );
    expect(nominal[0]).toHaveProperty(SUPPORT_SERIES_KEY_NOMINAL, ctiMeasurement.value);
    expect(nominal[0]).not.toHaveProperty(SUPPORT_SERIES_KEY_REAL);
    expect(nominal[0]).not.toHaveProperty(QUARTERLY_GDP_RAW_NOMINAL_KEY);
    expect(nominal[0]!.measurements).toEqual({ [SUPPORT_SERIES_KEY_NOMINAL]: ctiMeasurement });
  });

  it("does not create values outside 2005Q1-2017Q4", () => {
    const result = aggregateCtiBasicNominalQuarterly(records());
    expect([...result.values.keys()].some((key) => key.startsWith("2018"))).toBe(false);
    expect([...result.values.keys()].some((key) => key.startsWith("2004"))).toBe(false);
  });

  it("does not expose CTI micro or GDP/consumption columns through earnings", async () => {
    const rows = await loadTotalEarningDataInternal();
    const forbidden = [
      "CTIミクロ基本系列（名目・原数値）",
      "CTIミクロ基本系列（名目・参考）",
      "CTIミクロ基本系列（名目・参考・延長）",
      "民間最終消費支出（名目・原値）",
      "民間最終消費支出（名目・比較指数）",
      "民間最終消費支出（実質・原値）",
      "民間最終消費支出（実質・比較指数）",
    ];
    for (const row of rows) {
      for (const key of forbidden) expect(row).not.toHaveProperty(key);
    }
  });
});
