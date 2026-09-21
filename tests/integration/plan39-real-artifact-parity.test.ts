// @bun-environment happy-dom
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import artifact from "../../results/plan39/plan39-analysis-20c80ddac60344d0.json";
import { CustomTooltip } from "@/app/components/CustomTooltip";
import { ChartDataContract, normalizePublicChartData } from "@/app/components/ChartDataContract";
import {
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_PUBLIC_KEYS,
  CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTORS,
} from "@/lib/chartConstants";
import { buildCsv } from "@/lib/csvExport";
import {
  adaptCtiAdjustedV2PublicView,
  projectCtiAdjustedV2PublicView,
} from "@/lib/ctiAdjustedV2PublicProjection";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Row,
} from "@server/lib/ctiAdjustedConnectionEstimateV2";
import { loadCtiAdjustedV2Estimate } from "@server/lib/data-loader/ctiAdjusted";
import { evaluateCtiAdjustedPublicationGate } from "@server/lib/ctiAdjustedPublicationGate";
import type { CtiAdjustedRollingLooEvidence } from "@server/lib/ctiAdjustedPublicationGate";
import type { CtiAdjustedOutputRow } from "@server/lib/ctiAdjustedConnectionEstimate";

type ArtifactRow = CtiAdjustedOutputRow;
type CtiAdjustedV2ProjectionInput = Pick<
  CtiAdjustedV2Result,
  "model" | "estimateVersion" | "rows" | "publicationGate"
>;

const projectArtifactV2PublicView = (result: CtiAdjustedV2ProjectionInput) =>
  projectCtiAdjustedV2PublicView(result as unknown as CtiAdjustedV2Result);

const analysis = artifact as unknown as {
  options: {
    standardBacktest: { trainingYears: number[]; targetYear: number };
    production: {
      calibrationYears: number[];
      backtest: { trainingYears: number[]; targetYear: number };
      holdoutYears: number[];
    };
    sensitivity: {
      scenarios: {
        name: string;
        calibrationYears: number[];
        holdoutYears: number[];
        lAnnualizationRule: string;
      }[];
    };
  };
  periods: {
    productionCalibrationYears: number[];
    backtestTrainingYears: number[];
    targetYear: number;
    holdoutYears: number[];
    sensitivity: {
      name: string;
      calibrationYears: number[];
      holdoutYears: number[];
      lAnnualizationRule: string;
    }[];
    leakage: { backtest: boolean; holdout: boolean };
  };
  standard: {
    audit: { validation: { status: string; valid: boolean; reasons: string[] } };
    rows: ArtifactRow[];
    backtest: {
      requested: { trainingYears: number[]; targetYear: number };
      evaluatedCategories: string[];
      evaluationCount: number;
      leakage: { detected: boolean; excludedYears: number[] };
      result: { status: string; reason: string | null };
    };
  };
  publication: {
    globallyPublishable: boolean;
    blockingReason: string | null;
    candidateRows: { count: number; publishable: boolean; reason: string | null; years: number[] };
    estimatedRows: { count: number; publishable: boolean; reason: string | null };
    rows: ArtifactRow[];
  };
  sensitivity: {
    scenarios: {
      name: string;
      calibrationYears: number[];
      holdoutYears: number[];
      targetYear: number;
      lAnnualizationRule: string;
      status: string;
      reason: string | null;
    }[];
  };
  sensitivityVerdict: {
    status: string;
    acceptance: boolean;
    reasonCodes: string[];
    check: { status: string; reasonCodes: string[] };
  };
  rollingLoo: CtiAdjustedRollingLooEvidence;
  residualJumpThresholds: Record<
    string,
    {
      threshold: number;
      status: string;
      accepted: boolean;
      reason: string;
      boundary2016To2017: {
        fromYear: number;
        toYear: number;
        absoluteDifference: number | null;
        relativeChange: number | null;
        yearOverYearRatio: number | null;
        exceeded: boolean | null;
        reason: string;
      };
      estimatedRows: { count: number; publishable: boolean; reason: string | null };
    }
  >;
  verdict: {
    status: string;
    accepted: boolean;
    checks: {
      input: { status: string; valid: boolean; reasonCodes: string[] };
      backtest: { status: string; reason: string | null };
      sensitivity: { status: string; reasonCodes: string[] };
      residualBoundary: { threshold: number; status: string; reason: string };
    };
  };
  v2: {
    model: CtiAdjustedV2Result["model"];
    version: CtiAdjustedV2Result["estimateVersion"];
    publicationGate: CtiAdjustedV2Result["publicationGate"];
    bottomUp: Record<
      string,
      {
        total: number | null;
        majorSum: number | null;
        other: number | null;
        status: string;
        reason: string | null;
      }
    >;
  };
};

const categories = [...CTI_ADJUSTED_PUBLIC_CATEGORIES];
const keys = [...CTI_ADJUSTED_PUBLIC_KEYS];
const candidateRows = analysis.standard.rows;
const rows = analysis.publication.rows;
const v2Rows = rows
  .filter((row) => row.year >= 2005)
  .map((row) => {
    const v2Row = analysis.v2.bottomUp[String(row.year)];
    return {
      ...row,
      seriesType: row.seriesType === "estimated_adjusted" ? "estimated_bottom_up" : row.seriesType,
      status: v2Row.status === "available" ? "available" : "insufficient-data",
      reason: v2Row.reason,
      values: { ...row.values, その他の消費支出: row.values["残差"] },
    };
  }) as unknown as CtiAdjustedV2Row[];
const v2Result: CtiAdjustedV2ProjectionInput = {
  model: analysis.v2.model,
  estimateVersion: analysis.v2.version,
  rows: v2Rows,
  publicationGate: analysis.v2.publicationGate,
};
const publicProjectionRows = adaptCtiAdjustedV2PublicView(projectArtifactV2PublicView(v2Result));
const artifactRowsWithMeasurements = publicProjectionRows;
const publicRows = normalizePublicChartData(
  artifactRowsWithMeasurements.map((row) => ({
    ...row,
    label: String(row.year),
    年月: String(row.year),
  })),
  keys,
);
const descriptors = CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTORS;
const measurementFields = [
  "valueType",
  "seriesType",
  "official",
  "unit",
  "source",
  "frequency",
  "aggregation",
  "status",
  "reason",
] as const;

describe("Plan39 real analysis artifact graph/table/tooltip/CSV parity", () => {
  it("keeps analysis and runtime publication gates identical and publishes available estimates", () => {
    const runtime = loadCtiAdjustedV2Estimate({
      artifactRoot: "data/source/cti-adjusted",
    });
    const comparableGate = (gate: typeof analysis.v2.publicationGate) => ({
      accepted: gate.accepted,
      status: gate.status,
      blockingReasonCodes: [...gate.blockingReasonCodes].sort(),
      warningReasonCodes: [...gate.warningReasonCodes].sort(),
      diagnostics: [...gate.diagnostics].sort(),
    });

    expect(comparableGate(runtime.publicationGate)).toEqual(
      comparableGate(analysis.v2.publicationGate),
    );
    expect(runtime.rows.find((row) => row.year === 2005)).toMatchObject({
      status: "available",
      seriesType: "estimated_bottom_up",
    });
    expect(runtime.rows.find((row) => row.year === 2016)).toMatchObject({
      status: "available",
      seriesType: "estimated_bottom_up",
    });
  });

  it.each([
    ["missing evidence schema", undefined],
    ["legacy evidence schema", "plan39-publication-gate-v0"],
  ])("fails closed consistently when %s", (_label, evidenceSchema) => {
    const runtime = loadCtiAdjustedV2Estimate({ artifactRoot: "data/source/cti-adjusted" });
    const input = {
      baseGate: analysis.v2.publicationGate,
      rollingLoo: analysis.rollingLoo,
      evidenceSchema,
    };
    const analysisGate = evaluateCtiAdjustedPublicationGate(input);
    const runtimeGate = evaluateCtiAdjustedPublicationGate({
      ...input,
      baseGate: runtime.publicationGate,
    });
    expect(analysisGate.accepted).toBe(false);
    expect(runtimeGate.accepted).toBe(false);
    expect(runtimeGate.status).toBe(analysisGate.status);
    expect(runtimeGate.blockingReasonCodes).toEqual(analysisGate.blockingReasonCodes);
    expect(runtimeGate.reasonCodes).toEqual(analysisGate.reasonCodes);
    expect(analysisGate.blockingReasonCodes).toContain("rolling_loo_backtest_incomplete");
  });

  it("locks the saved validation, verdict, nine-category backtest, sensitivity, and threshold contract", () => {
    expect(analysis.standard.audit.validation).toMatchObject({ status: "available", valid: true });
    expect(analysis.standard.audit.validation.reasons).toHaveLength(9);
    const years = Array.from({ length: 8 }, (_, index) => 2018 + index);
    expect(analysis.periods).toMatchObject({
      productionCalibrationYears: years,
      backtestTrainingYears: years,
      targetYear: 2017,
      holdoutYears: [2017],
      leakage: { backtest: false, holdout: false },
    });
    expect(analysis.options.production).toEqual({
      calibrationYears: years,
      backtest: { trainingYears: years, targetYear: 2017 },
      holdoutYears: [2017],
    });
    expect(analysis.options.sensitivity.scenarios).toEqual([
      {
        name: "baseline_2018_2025",
        calibrationYears: years,
        holdoutYears: [2017],
        lAnnualizationRule: "official_annual",
      },
      {
        name: "alternative_2018_2024",
        calibrationYears: years.slice(0, 7),
        holdoutYears: [2017],
        lAnnualizationRule: "official_annual",
      },
    ]);
    expect(analysis.verdict).toMatchObject({
      status: "pass",
      accepted: true,
      diagnosticStatus: "insufficient-data",
    });
    expect(analysis.verdict.checks.input).toMatchObject({
      status: "pass",
      valid: true,
      reasonCodes: [],
    });
    expect(analysis.standard.backtest).toMatchObject({
      requested: analysis.options.standardBacktest,
      evaluatedCategories: [
        "食料",
        "住居",
        "光熱・水道",
        "家具・家事用品",
        "被服及び履物",
        "保健医療",
        "交通・通信",
        "教育",
        "教養娯楽",
      ],
      evaluationCount: 9,
      leakage: { detected: false, excludedYears: [] },
      result: { status: "available", reason: null },
    });
    expect(analysis.verdict.checks.backtest).toMatchObject({ status: "pass", reason: null });
    expect(analysis.sensitivity.scenarios).toEqual([
      expect.objectContaining({
        name: "baseline_2018_2025",
        calibrationYears: years,
        targetYear: 2017,
        holdoutYears: [2017],
        lAnnualizationRule: "official_annual",
      }),
      expect.objectContaining({
        name: "alternative_2018_2024",
        calibrationYears: years.slice(0, 7),
        targetYear: 2017,
        holdoutYears: [2017],
        lAnnualizationRule: "official_annual",
      }),
    ]);
    expect(
      analysis.sensitivity.scenarios.every(
        (scenario) => scenario.lAnnualizationRule === "official_annual",
      ),
    ).toBe(true);
    expect(
      analysis.sensitivity.scenarios.some(
        (scenario) => scenario.name === "calendar_average_no_2017_holdout_leakage",
      ),
    ).toBe(false);
    expect(analysis.sensitivityVerdict).toMatchObject({
      status: "insufficient-data",
      acceptance: false,
      reasonCodes: ["insufficient_estimate_difference"],
      check: { status: "not-evaluable" },
    });
    expect(analysis.verdict.checks.sensitivity).toMatchObject({
      status: "not-evaluable",
      reasonCodes: analysis.sensitivityVerdict.reasonCodes,
    });

    const threshold = analysis.residualJumpThresholds["1.4"];
    expect(threshold).toMatchObject({
      threshold: 1.4,
      status: "pass",
      accepted: true,
      reason: null,
      boundary2016To2017: {
        fromYear: 2016,
        toYear: 2017,
        absoluteDifference: 0.7122004366712389,
        relativeChange: 0.042935196675858434,
        yearOverYearRatio: 1.0429351966758584,
        exceeded: false,
        reason: null,
      },
      estimatedRows: { count: 7, publishable: true, reason: null },
    });
    expect(analysis.verdict.checks.residualBoundary).toMatchObject({
      threshold: 1.4,
      status: "pass",
      reason: null,
    });
    expect(analysis.publication).toMatchObject({
      globallyPublishable: true,
      blockingReason: null,
      candidateRows: {
        count: 7,
        publishable: true,
        reason: null,
        years: [2005, 2006, 2007, 2008, 2009, 2010, 2012],
      },
      estimatedRows: {
        count: 12,
        publishable: true,
        reason: null,
      },
    });
  });

  it("preserves real periods, official 2017+ rows, estimated history, and every category reason", () => {
    expect(rows.map((row) => row.year)).toEqual(
      Array.from({ length: 45 }, (_, index) => 1981 + index),
    );
    expect(categories).toEqual([
      "総合",
      "食料",
      "住居",
      "光熱・水道",
      "家具・家事用品",
      "被服及び履物",
      "保健医療",
      "交通・通信",
      "教育",
      "教養娯楽",
      "残差",
    ]);
    for (const row of rows) {
      const expected =
        row.year >= 2017
          ? { seriesType: "official_adjusted", official: true, status: "available", reason: null }
          : row.year >= 2005
            ? {
                seriesType: "estimated_adjusted",
                official: false,
                status: "available",
                reason: null,
              }
            : {
                seriesType: "unavailable",
                official: false,
                status: "unavailable",
                reason: expect.any(String),
              };
      expect(row).toMatchObject(expected);
      expect(Object.keys(row.values)).toEqual(expect.arrayContaining(categories));
      if (row.year >= 2005 && row.year < 2017) {
        expect(Object.values(row.values).every((value) => value !== null)).toBe(true);
      }
    }
    expect(analysis.publication.candidateRows).toMatchObject({
      count: 7,
      years: [2005, 2006, 2007, 2008, 2009, 2010, 2012],
    });
    expect(
      candidateRows.filter((row) => row.seriesType === "estimated_adjusted").map((row) => row.year),
    ).toEqual(analysis.publication.candidateRows.years);
    expect(
      Array.from({ length: 12 }, (_, index) => 2005 + index).filter(
        (year) => !analysis.publication.candidateRows.years.includes(year),
      ),
    ).toEqual([2011, 2013, 2014, 2015, 2016]);
    expect(
      rows.filter((row) => row.year >= 2005 && row.year <= 2016 && row.status === "available"),
    ).toHaveLength(12);
    expect(
      rows.filter(
        (row) =>
          row.year >= 2017 && row.seriesType === "official_adjusted" && row.status === "available",
      ),
    ).toHaveLength(9);
    expect(rows.find((row) => row.year === 2005)).toMatchObject({
      seriesType: "estimated_adjusted",
      status: "available",
      reason: null,
    });
    expect(rows.find((row) => row.year === 2016)).toMatchObject({
      status: "available",
      reason: null,
    });
    expect(rows.find((row) => row.year === 2017)).toMatchObject({
      status: "available",
      reason: null,
    });
  });

  it("publishes candidate estimates when the sensitivity diagnostic is insufficient-data and the v2 gate passes", () => {
    expect(analysis.verdict).toMatchObject({
      status: "pass",
      accepted: true,
      diagnosticStatus: "insufficient-data",
    });
    expect(analysis.v2.publicationGate).toMatchObject({ status: "pass", accepted: true });
    expect(analysis.publication.estimatedRows).toMatchObject({
      count: 12,
      publishable: true,
      reason: null,
    });
    expect(v2Rows).toHaveLength(21);
    expect(
      publicProjectionRows.filter((row) => row.seriesType === "estimated_adjusted"),
    ).toHaveLength(12);
    expect(
      publicProjectionRows.filter(
        (row) => row.year >= 2005 && row.year <= 2016 && row.status === "available",
      ),
    ).toHaveLength(12);
    expect(
      publicProjectionRows.filter(
        (row) => row.year >= 2017 && row.seriesType === "official_adjusted",
      ),
    ).toHaveLength(9);
    expect(publicProjectionRows.find((row) => row.year === 2005)).toMatchObject({
      seriesType: "estimated_adjusted",
      status: "available",
      reason: null,
      values: { 総合: expect.any(Number) },
    });
  });

  it("uses the same measurement value and provenance in ChartDataContract, table rows, tooltip, and CSV", () => {
    const contract = render(
      createElement(ChartDataContract, {
        data: publicRows,
        keys,
        labelKeys: ["label"],
        descriptors,
      }),
    ).container;
    const contractRows = [...contract.querySelectorAll("[data-chart-data-row]")];
    expect(contractRows).toHaveLength(publicRows.length);

    for (const [rowIndex, row] of publicRows.entries()) {
      const artifactRow = publicProjectionRows[rowIndex];
      const contractRow = contractRows[rowIndex];
      expect(contractRow.getAttribute("data-period")).toBe(String(artifactRow.year));
      for (const category of categories) {
        const key = CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY[category];
        const measurement = artifactRowsWithMeasurements[rowIndex].measurements[key];
        const cell = contractRow.querySelector(`[data-series-key="${key}"]`);
        expect(cell).not.toBeNull();
        expect(measurement).toMatchObject({
          value: artifactRow.status === "available" ? artifactRow.values[category] : null,
          seriesType: artifactRow.seriesType,
          official: artifactRow.official,
          status: artifactRow.status,
          reason: artifactRow.reason,
          model: "v2-bottom-up",
          estimateVersion: "plan39-v2",
        });
        expect(cell?.getAttribute("data-value")).toBe(
          typeof row[key] === "number" ? String(row[key]) : "null",
        );
        for (const field of measurementFields) {
          const attribute =
            field === "valueType"
              ? "data-measurement-value-type"
              : `data-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
          expect(cell?.getAttribute(attribute)).toBe(
            measurement[field] == null ? "" : String(measurement[field]),
          );
        }
      }
    }

    const tooltipRowIndexes = [
      publicProjectionRows.findIndex((row) => row.year === 2016),
      publicProjectionRows.findIndex((row) => row.year === 2017),
    ];
    for (const rowIndex of tooltipRowIndexes) {
      const row = publicRows[rowIndex];
      const tooltip = render(
        createElement(CustomTooltip, {
          active: true,
          label: String(row.label),
          isMobile: false,
          isTouch: false,
          tooltipBg: "white",
          tooltipText: "black",
          showAllPayload: true,
          allowedKeys: keys,
          seriesMeta: descriptors,
          payload: keys.map((key) => ({
            name: key,
            dataKey: key,
            value: row[key] as number | null,
            payload: row,
          })),
        }),
      ).container;
      const tooltipRows = [...tooltip.querySelectorAll("[data-tooltip-row]")];
      expect(tooltipRows).toHaveLength(keys.length);
      for (const [keyIndex, key] of keys.entries()) {
        const measurement = artifactRowsWithMeasurements[rowIndex].measurements[key];
        const tooltipCell = tooltipRows[keyIndex];
        expect(tooltipCell.getAttribute("data-tooltip-key")).toBe(key);
        expect(tooltipCell.getAttribute("data-tooltip-value-type")).toBe(measurement.valueType);
        expect(tooltipCell.getAttribute("data-tooltip-series-type")).toBe(measurement.seriesType);
        expect(tooltipCell.getAttribute("data-tooltip-status")).toBe(measurement.status);
        expect(tooltipCell.getAttribute("data-tooltip-reason")).toBe(measurement.reason ?? "");
        expect(tooltipCell.getAttribute("data-tooltip-source")).toBe(measurement.source);
        expect(tooltipCell.getAttribute("data-tooltip-frequency")).toBe(measurement.frequency);
        expect(tooltipCell.getAttribute("data-tooltip-aggregation")).toBe(measurement.aggregation);
      }
    }

    const csv = buildCsv(
      publicRows,
      keys,
      descriptors.map((descriptor) => descriptor.label),
      { metadata: descriptors },
    );
    const csvLines = csv.trimEnd().split("\r\n");
    const header = csvLines[0].split(",");
    expect(csvLines).toHaveLength(publicProjectionRows.length + 1);
    for (const [rowIndex, row] of publicRows.entries()) {
      const cells = csvLines[rowIndex + 1].split(",");
      expect(cells[0]).toBe(String(publicProjectionRows[rowIndex].year));
      for (const key of keys) {
        const measurement = artifactRowsWithMeasurements[rowIndex].measurements[key];
        const base = header.indexOf(`${key}__valueType`);
        expect(cells[base]).toBe(measurement.valueType);
        expect(cells[base + 1]).toBe(measurement.seriesType);
        expect(cells[base + 2]).toBe(String(measurement.official));
        expect(cells[base + 3]).toBe(measurement.value === null ? "" : String(measurement.value));
        expect(cells[base + 4]).toBe(measurement.unit);
        expect(cells[base + 5]).toBe(measurement.source);
        expect(cells[base + 6]).toBe(measurement.frequency);
        expect(cells[base + 7]).toBe(measurement.aggregation);
        expect(cells[base + 8]).toBe(measurement.status);
        expect(cells[base + 9]).toBe(measurement.reason ?? "");
      }
    }
  });
});
