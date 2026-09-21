import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartDataContract } from "../../src/app/components/ChartDataContract";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { buildCsv } from "../../src/lib/csvExport";
import {
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_PUBLIC_KEYS,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
} from "../../src/lib/chartConstants";
import { projectCtiAdjustedPublicView } from "../../src/lib/ctiAdjustedPublicProjection";
import type {
  CtiAdjustedV2Category,
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";
import {
  adaptCtiAdjustedV2PublicView,
  projectCtiAdjustedV2PublicView,
} from "../../src/lib/ctiAdjustedV2PublicProjection";

const v2Values = (other: number): Record<CtiAdjustedV2Category, number> => ({
  総合: 100,
  食料: 10,
  住居: 10,
  "光熱・水道": 10,
  "家具・家事用品": 10,
  被服及び履物: 10,
  保健医療: 10,
  "交通・通信": 10,
  教育: 10,
  教養娯楽: 10,
  その他の消費支出: other,
});

const v2Result = (rows: readonly CtiAdjustedV2Row[], accepted: boolean): CtiAdjustedV2Result => ({
  rows,
  years: rows.map(({ year }) => year),
  categories: {} as CtiAdjustedV2Result["categories"],
  other: {
    derived: {},
    officialOther: {},
    ratio2017: null,
    beta: {
      beta: null,
      observations: 0,
      numerator: null,
      denominator: null,
      years: [],
      status: "insufficient-data",
      reason: "fixture",
      finiteInputs: true,
      logInputs: true,
      minimumObservations: 3,
      zeroVariance: false,
    },
    status: "insufficient-data",
    reasons: [],
  },
  residual: {
    residualMajor: {},
    residualWithOther: {},
    jumps: {},
    boundary2016To2017: {
      fromYear: 2016,
      toYear: 2017,
      previousYear: null,
      yearOverYearRatio: null,
      exceeded: null,
      previous: null,
      current: null,
      status: "unavailable",
      reason: "fixture",
    },
    threshold: 1.4,
    thresholdMetadata: "provisional-frozen",
    status: "insufficient-data",
    generationSource: "diagnostic-only",
  },
  beta: {} as CtiAdjustedV2Result["beta"],
  fitDiagnostics: {} as CtiAdjustedV2Result["fitDiagnostics"],
  benchmarkG: {},
  benchmarkGDiagnostics: {
    baselineYear: 2017,
    availableYears: [],
    missingYears: [],
    coverage: 0,
    finite: true,
    longTermDeviation: { available: false, maxAbsoluteDeviation: null, years: [] },
    status: "insufficient-data",
    reason: "fixture",
  },
  artifactValidation: {
    B: { valid: true, reasons: [], diagnostics: [], duplicateYears: [], observedYears: [] },
    A: { valid: true, reasons: [], diagnostics: [], duplicateYears: [], observedYears: [] },
    L: { valid: true, reasons: [], diagnostics: [], duplicateYears: [], observedYears: [] },
  },
  model: "v2-bottom-up",
  estimateVersion: "plan39-v2",
  publicationGate: {
    status: accepted ? "pass" : "insufficient-data",
    accepted,
    reasonCodes: [],
    blockingReasonCodes: [],
    warningReasonCodes: [],
    diagnostics: [],
  },
});

const estimatedMeasurement = {
  key: "CTI調整系列",
  label: "CTI調整系列",
  color: "#0f766e",
  unit: "万円",
  source: "Plan39 connection estimate",
  valueType: "raw" as const,
  value: 101.25,
  status: "available" as const,
  reason: null,
  frequency: "annual" as const,
  aggregation: "annual_adjusted",
  seriesType: "estimated_adjusted" as const,
  official: false,
};

describe("Plan39 annual adjusted measurement parity", () => {
  it("projects v2 Other under its own key and keeps v1 residual untouched", () => {
    expect(CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY.残差).toBe("CTIミクロ調整系列（残差）");
    expect(CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["その他の消費支出"]).toBe(
      "CTIミクロ調整系列（その他の消費支出）",
    );
  });

  it("fails closed for rejected v2 estimates but preserves official A", () => {
    const rows = [
      {
        year: 2016,
        seriesType: "estimated_bottom_up" as const,
        official: false,
        status: "available" as const,
        reason: null,
        values: v2Values(12),
      },
      {
        year: 2017,
        seriesType: "official_adjusted" as const,
        official: true,
        status: "available" as const,
        reason: null,
        values: v2Values(13),
      },
    ];
    const [estimate, official] = projectCtiAdjustedV2PublicView(v2Result(rows, false));
    expect(estimate.values["その他の消費支出"]).toBeNull();
    expect(estimate.measurements["CTIミクロ調整系列（その他の消費支出）"]).toMatchObject({
      status: "unavailable",
      reason: "overall_verdict_not_accepted",
    });
    expect(official.values["その他の消費支出"]).toBe(13);
    expect(official.measurements["CTIミクロ調整系列（その他の消費支出）"]).toMatchObject({
      official: true,
      estimateVersion: "plan39-v2",
      model: "v2-bottom-up",
    });
  });

  it("publishes v2 estimated Other only for an accepted pass gate", () => {
    const [row] = projectCtiAdjustedV2PublicView(
      v2Result(
        [
          {
            year: 2016,
            seriesType: "estimated_bottom_up",
            official: false,
            status: "available",
            reason: null,
            values: v2Values(12),
          },
        ],
        true,
      ),
    );
    expect(row.values["その他の消費支出"]).toBe(12);
    expect(row.measurements["その他の消費支出"]).toMatchObject({
      key: "CTIミクロ調整系列（その他の消費支出）",
      category: "その他の消費支出",
      value: 12,
      seriesType: "estimated_adjusted",
      estimateVersion: "plan39-v2",
    });
  });

  it("preserves v2 provenance and unavailable reasons during public projection", () => {
    const [estimated, official, unavailable] = projectCtiAdjustedV2PublicView(
      v2Result(
        [
          {
            year: 2016,
            seriesType: "estimated_bottom_up",
            official: false,
            status: "available",
            reason: null,
            values: v2Values(12),
          },
          {
            year: 2017,
            seriesType: "official_adjusted",
            official: true,
            status: "available",
            reason: null,
            values: v2Values(13),
          },
          {
            year: 2015,
            seriesType: "unavailable",
            official: false,
            status: "insufficient-data",
            reason: "missing_l_artifact",
            values: v2Values(14),
          },
        ],
        true,
      ),
    );

    expect(estimated).toMatchObject({ status: "available", reason: null });
    expect(estimated.measurements["その他の消費支出"]).toMatchObject({
      value: 12,
      status: "available",
      seriesType: "estimated_adjusted",
      official: false,
    });
    expect(official).toMatchObject({ status: "available", reason: null });
    expect(official.measurements["その他の消費支出"]).toMatchObject({
      value: 13,
      status: "available",
      seriesType: "official_adjusted",
      official: true,
    });
    expect(unavailable).toMatchObject({ status: "unavailable", reason: "missing_l_artifact" });
    expect(unavailable.values["その他の消費支出"]).toBeNull();
    expect(unavailable.measurements["その他の消費支出"]).toMatchObject({
      value: null,
      status: "unavailable",
      seriesType: "unavailable",
      official: false,
      reason: "missing_l_artifact",
    });
  });

  it("keeps adapted row and CSV metadata aligned for estimated, official, and unavailable cases", () => {
    const [estimated, official, unavailable] = adaptCtiAdjustedV2PublicView(
      projectCtiAdjustedV2PublicView(
        v2Result(
          [
            {
              year: 2016,
              seriesType: "estimated_bottom_up",
              official: false,
              status: "available",
              reason: null,
              values: v2Values(12),
            },
            {
              year: 2017,
              seriesType: "official_adjusted",
              official: true,
              status: "available",
              reason: null,
              values: v2Values(13),
            },
            {
              year: 2015,
              seriesType: "unavailable",
              official: false,
              status: "insufficient-data",
              reason: "missing_l_artifact",
              values: v2Values(14),
            },
          ],
          true,
        ),
      ),
    );
    const key = CTI_ADJUSTED_PUBLIC_KEYS[0];

    for (const row of [estimated, official, unavailable]) {
      const measurement = row.measurements[key];
      const displayRow = {
        年: row.year,
        [key]: measurement.value,
        measurements: row.measurements,
      };
      const csv = buildCsv([displayRow], [key], undefined, { metadata: [measurement] });
      const csvFields = csv.trim().split("\r\n")[1].split(",");

      expect(measurement.value).toBe(row.values["総合"]);
      expect(measurement.status).toBe(row.status === "available" ? "available" : row.status);
      expect(measurement.reason).toBe(row.reason);
      expect(measurement.seriesType).toBe(row.seriesType);
      expect(measurement.official).toBe(row.official);
      expect(displayRow[key]).toBe(measurement.value);
      expect(csvFields.slice(2)).toEqual([
        measurement.label,
        measurement.valueType,
        measurement.seriesType,
        String(measurement.official),
        measurement.value === null ? "" : String(measurement.value),
        measurement.unit,
        measurement.source,
        measurement.frequency,
        measurement.aggregation,
        measurement.status,
        measurement.reason ?? "",
      ]);
      if (measurement.seriesType === "unavailable") {
        expect(measurement.official).toBe(false);
        expect(measurement.source).not.toContain("公式");
        expect(csv).not.toContain("公式CTIミクロ調整系列 A");
      }
    }
  });

  it("publishes every output category with the same row measurement contract", () => {
    const values = Object.fromEntries(
      CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category, index) => [category, index + 100]),
    );
    const [row] = projectCtiAdjustedPublicView([
      {
        year: 2025,
        seriesType: "official_adjusted",
        official: true,
        status: "available",
        reason: null,
        values,
      },
    ]);

    expect(Object.keys(row.values)).toEqual([...CTI_ADJUSTED_PUBLIC_CATEGORIES]);
    expect(CTI_ADJUSTED_PUBLIC_KEYS).toHaveLength(CTI_ADJUSTED_PUBLIC_CATEGORIES.length);
    for (const category of CTI_ADJUSTED_PUBLIC_CATEGORIES) {
      const measurement = row.measurements[category];
      expect(measurement.value).toBe(values[category]);
      expect(measurement.frequency).toBe("annual");
      expect(measurement.aggregation).toBe("official_annual_artifact");
      expect(measurement.status).toBe("available");
      expect(measurement.reason).toBeNull();
      expect(measurement.seriesType).toBe("official_adjusted");
      expect(measurement.official).toBe(true);
      expect(CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY[category]).toContain(category);
    }
  });

  it("keeps every category null and reasoned when an estimate is unavailable", () => {
    const [row] = projectCtiAdjustedPublicView([
      {
        year: 2016,
        seriesType: "unavailable",
        official: false,
        status: "unavailable",
        reason: "missing_l_artifact",
        values: { 総合: 999, 食料: 999 },
      },
    ]);

    for (const category of CTI_ADJUSTED_PUBLIC_CATEGORIES) {
      expect(row.values[category]).toBeNull();
      expect(row.measurements[category]).toMatchObject({
        value: null,
        seriesType: "unavailable",
        official: false,
        status: "unavailable",
        reason: "missing_l_artifact",
        frequency: "annual",
      });
    }
  });

  it("keeps every category value for an available estimated series", () => {
    const values = Object.fromEntries(
      CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category, index) => [category, index + 200]),
    );
    const [row] = projectCtiAdjustedPublicView(
      [
        {
          year: 2015,
          seriesType: "estimated_adjusted",
          official: false,
          status: "available",
          reason: null,
          values,
        },
      ],
      { status: "pass", accepted: true },
    );

    for (const category of CTI_ADJUSTED_PUBLIC_CATEGORIES) {
      expect(row.values[category]).toBe(values[category]);
      expect(row.measurements[category]).toMatchObject({
        value: values[category],
        seriesType: "estimated_adjusted",
        official: false,
        status: "available",
        reason: null,
        frequency: "annual",
        aggregation: "cti_adjusted_connection_estimate",
      });
    }
  });

  it("keeps seriesType, official, and the estimate note in the public chart contract", () => {
    render(
      <ChartDataContract
        data={[
          {
            年: 2016,
            CTI調整系列: 101.25,
            measurements: { CTI調整系列: estimatedMeasurement },
          },
        ]}
        keys={["CTI調整系列"]}
        descriptors={[estimatedMeasurement]}
      />,
    );

    const series = screen
      .getByTestId("chart-data-contract")
      .querySelector("[data-series-key='CTI調整系列']");
    expect(series?.getAttribute("data-series-type")).toBe("estimated_adjusted");
    expect(series?.getAttribute("data-official")).toBe("false");
    expect(series?.getAttribute("data-measurement-note")).toContain("2016年以前は接続推計");
    expect(series?.getAttribute("data-measurement-note")).toContain("公式遡及値ではない");
  });

  it("shows the metadata note in the tooltip and keeps unavailable values blank in CSV", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2016"
        payload={[
          {
            name: estimatedMeasurement.label,
            dataKey: estimatedMeasurement.key,
            value: estimatedMeasurement.value,
            payload: { measurements: { [estimatedMeasurement.key]: estimatedMeasurement } },
          },
        ]}
        seriesMeta={[estimatedMeasurement]}
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    const note = screen.getByText(/2016年以前は接続推計/);
    expect(note.textContent).toContain("公式遡及値ではない");

    const csv = buildCsv(
      [
        {
          年: 2016,
          CTI調整系列: 101.25,
          measurements: { CTI調整系列: estimatedMeasurement },
        },
        {
          年: 2015,
          CTI調整系列: 999,
          measurements: {
            CTI調整系列: {
              ...estimatedMeasurement,
              value: null,
              status: "unavailable" as const,
              seriesType: "unavailable" as const,
              official: false,
              reason: "missing_input",
            },
          },
        },
      ],
      ["CTI調整系列"],
      undefined,
      { metadata: [estimatedMeasurement] },
    );
    expect(csv).toContain("CTI調整系列__seriesType,CTI調整系列__official");
    expect(csv).toContain("estimated_adjusted,false,101.25");
    expect(csv).toContain("unavailable,false,,万円");
    expect(csv).not.toContain("2015,999");
  });

  it("keeps unavailable metadata notes and provenance consistent across chart, tooltip, and CSV", () => {
    const unavailableMeasurement = {
      ...estimatedMeasurement,
      value: null,
      status: "unavailable" as const,
      seriesType: "unavailable" as const,
      official: false,
      reason: "missing_input",
    };
    const row = {
      年: 2015,
      CTI調整系列: null,
      measurements: { CTI調整系列: unavailableMeasurement },
    };

    render(
      <ChartDataContract
        data={[row]}
        keys={["CTI調整系列"]}
        descriptors={[unavailableMeasurement]}
      />,
    );
    const series = screen
      .getByTestId("chart-data-contract")
      .querySelector("[data-series-key='CTI調整系列']");
    expect(series?.getAttribute("data-measurement-note")).toBe("利用不可: missing_input");
    expect(series?.getAttribute("data-measurement-note")).not.toContain("公式調整値");
    expect(series?.getAttribute("data-series-type")).toBe("unavailable");
    expect(series?.getAttribute("data-status")).toBe("unavailable");
    expect(series?.getAttribute("data-reason")).toBe("missing_input");
    expect(series?.getAttribute("data-official")).toBe("false");

    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2015"
        payload={[
          {
            name: unavailableMeasurement.label,
            dataKey: unavailableMeasurement.key,
            value: null,
            payload: row,
          },
        ]}
        seriesMeta={[unavailableMeasurement]}
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    const tooltipRow = document.querySelector("[data-tooltip-key='CTI調整系列']");
    expect(tooltipRow?.getAttribute("data-tooltip-note")).toBe("利用不可: missing_input");
    expect(tooltipRow?.getAttribute("data-tooltip-note")).not.toContain("公式調整値");
    expect(tooltipRow?.getAttribute("data-tooltip-series-type")).toBe("unavailable");
    expect(tooltipRow?.getAttribute("data-tooltip-status")).toBe("unavailable");
    expect(tooltipRow?.getAttribute("data-tooltip-reason")).toBe("missing_input");
    expect(tooltipRow?.getAttribute("data-tooltip-official")).toBe("false");

    const csv = buildCsv([row], ["CTI調整系列"], undefined, {
      metadata: [unavailableMeasurement],
    });
    const csvFields = csv.trim().split("\r\n")[1].split(",");
    expect(csvFields.slice(2)).toEqual([
      unavailableMeasurement.label,
      unavailableMeasurement.valueType,
      "unavailable",
      "false",
      "",
      unavailableMeasurement.unit,
      unavailableMeasurement.source,
      unavailableMeasurement.frequency,
      unavailableMeasurement.aggregation,
      "unavailable",
      "missing_input",
    ]);
  });
});
