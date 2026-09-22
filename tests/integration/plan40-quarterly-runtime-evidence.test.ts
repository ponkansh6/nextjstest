// @bun-environment happy-dom
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartDataContract, normalizePublicChartData } from "@/app/components/ChartDataContract";
import { CustomTooltip } from "@/app/components/CustomTooltip";
import { DataTablesSection } from "@/app/components/DataTablesSection";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY,
  type CtiAdjustedV2PublicCategory,
  type CtiAdjustedV2PublicKey,
} from "@/lib/chartConstants";
import { buildCsv } from "@/lib/csvExport";
import {
  projectQuarterlyPublicView,
  QUARTERLY_PUBLIC_KEYS,
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
} from "@/lib/quarterlyPublicProjection";
import { getMeasurementNote } from "@/types/chart";
import { buildCtiAdjustedV2Estimate } from "@server/lib/ctiAdjustedConnectionEstimateV2";
import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";
import { buildPlan39V2CtiNominalRows } from "@server/lib/view-models/quarterlyAggregation";
import type { CtiBasicRecord } from "@server/lib/ctiBasicSeries2025LongTerm";

function defined<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected fixture value");
  return value;
}

function isCtiAdjustedV2PublicCategory(value: string): value is CtiAdjustedV2PublicCategory {
  return CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.some((category) => category === value);
}

function measurementFor(
  row: ReturnType<typeof buildPlan39V2CtiNominalRows>[number],
  categoryOrKey: string,
) {
  const key = isCtiAdjustedV2PublicCategory(categoryOrKey)
    ? CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[categoryOrKey]
    : categoryOrKey;
  const registryEntry = defined(CTI_ADJUSTED_V2_PUBLIC_REGISTRY.find((entry) => entry.key === key));
  return defined(defined(row.measurements)[registryEntry.key]);
}

function plan40Validation(result: ReturnType<typeof buildCtiAdjustedV2Estimate>) {
  return defined(result.plan40InputValidation);
}

const categories = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter((category) => category !== "総合");
const keys: CtiAdjustedV2PublicKey[] = CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter(
  (entry) => entry.category !== "総合",
).map((entry) => entry.key);
const metadata = (artifact: string) => ({
  source: `Plan40 runtime ${artifact}`,
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
  rows: Array.from({ length: 21 }, (_, index) => {
    const year = 2005 + index;
    return {
      year,
      values: Object.fromEntries(
        CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, category === "総合" ? 100 : 10]),
      ),
    };
  }),
});

const makeAnnualInputs = () => ({ B: input("B.json"), A: input("A.json"), L: input("L.json") });

function records(year = 2017, mutator?: (records: CtiBasicRecord[]) => void): CtiBasicRecord[] {
  const result: CtiBasicRecord[] = [];
  const indexByCategory = Object.fromEntries(
    categories.map((category, index) => [category, index + 2]),
  );
  for (let month = 1; month <= 12; month += 1) {
    for (const category of categories) {
      result.push({
        variant: "nominal",
        seriesIndex: defined(indexByCategory[category]),
        officialSeriesCode: String(indexByCategory[category]),
        seriesName: `${category}（名目）`,
        month: `${year}-${String(month).padStart(2, "0")}` as `${number}-${number}`,
        rawValue: month <= 3 ? 20 : 10,
        isMissing: false,
      });
    }
  }
  if (mutator) mutator(result);
  return result;
}

function runtimeRows(
  annualMutator?: (inputs: ReturnType<typeof makeAnnualInputs>) => void,
  monthlyMutator?: (records: CtiBasicRecord[]) => void,
  year = 2017,
) {
  const inputs = makeAnnualInputs();
  if (annualMutator) annualMutator(inputs);
  const result = buildCtiAdjustedV2Estimate(inputs.B, inputs.A, inputs.L, {
    contract: "plan40",
  });
  return {
    result,
    rows: buildPlan39V2CtiNominalRows({ records: records(year, monthlyMutator), result }),
  };
}

function targetRow(rows: ReturnType<typeof buildPlan39V2CtiNominalRows>) {
  const row = defined(rows.find((candidate) => candidate.label === "2017Q1"));
  if (row.kind !== "plan40-v2-cost-stack") throw new Error("expected Plan40 v2 row kind");
  return row;
}

function rowForYear(
  rows: ReturnType<typeof buildPlan39V2CtiNominalRows>,
  year: number,
  quarter = 1,
) {
  const row = defined(rows.find((candidate) => candidate.label === `${year}Q${quarter}`));
  if (row.kind !== "plan40-v2-cost-stack") throw new Error("expected Plan40 v2 row kind");
  return row;
}

function metadataSnapshot(measurement: ReturnType<typeof measurementFor>) {
  return {
    value: measurement.value,
    status: measurement.status,
    reason: measurement.reason,
    source: measurement.source,
    unit: measurement.unit,
    frequency: measurement.frequency,
    aggregation: measurement.aggregation,
    seriesType: measurement.seriesType,
    official: measurement.official,
    annualAnchorType: measurement.annualAnchorType,
    quarterlyDerived: measurement.quarterlyDerived,
    note: getMeasurementNote(measurement),
    model: measurement.model,
    estimateVersion: measurement.estimateVersion,
    baseYear: measurement.baseYear,
    rawRange: measurement.rawRange,
    adoptedRange: measurement.adoptedRange,
  };
}

function csvRow(source: string): string[] {
  const rows = source
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
  return rows[1]?.split(",") ?? [];
}

function assertPlan40SurfaceParity(row: ReturnType<typeof rowForYear>) {
  const publicRow = defined(
    projectQuarterlyPublicView([row]).find((candidate) => candidate.label === row.label),
  );
  expect(Object.keys(publicRow.measurements ?? {}).sort()).toEqual([...keys].sort());
  expect(
    Object.keys(publicRow)
      .filter((key): key is CtiAdjustedV2PublicKey => keys.some((candidate) => candidate === key))
      .sort(),
  ).toEqual([...keys].sort());

  const chart = render(
    createElement(ChartDataContract, {
      data: [publicRow],
      keys,
      descriptors: CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter((entry) => keys.includes(entry.key)).map(
        (entry) => ({ ...entry, color: "#0f766e" }),
      ),
    }),
  );
  const table = render(
    createElement(DataTablesSection, {
      tables: [{ chartSectionId: "evidence-all", title: "evidence", data: [publicRow], keys }],
    }),
  );
  const tooltip = render(
    createElement(CustomTooltip, {
      active: true,
      isMobile: false,
      isTouch: false,
      tooltipBg: "white",
      tooltipText: "black",
      label: row.label,
      showAllPayload: true,
      payload: keys.map((key) => ({
        name: key,
        value: publicRow[key] as number | null,
        dataKey: key,
        payload: publicRow as Record<string, unknown>,
      })),
      seriesMeta: keys.map((key, order) => ({ key, label: key, color: "#000", order })),
    }),
  );
  const csv = buildCsv([publicRow as unknown as Record<string, unknown>], keys, keys);
  const csvHeaders =
    csv
      .replace(/^\uFEFF/, "")
      .split("\r\n")[0]
      ?.split(",") ?? [];
  const csvValues = csvRow(csv);

  for (const key of keys) {
    const measurement = measurementFor(row, key);
    const expected = metadataSnapshot(measurement);
    const projected = defined(publicRow.measurements?.[key]);
    expect(metadataSnapshot(projected)).toEqual(expected);

    const chartCell = defined(chart.container.querySelector(`[data-series-key="${key}"]`));
    expect({
      value:
        chartCell.getAttribute("data-value") === "null"
          ? null
          : Number(chartCell.getAttribute("data-value")),
      status: chartCell.getAttribute("data-status"),
      reason: chartCell.getAttribute("data-reason") || null,
      source: chartCell.getAttribute("data-source"),
      unit: chartCell.getAttribute("data-unit"),
      frequency: chartCell.getAttribute("data-frequency"),
      aggregation: chartCell.getAttribute("data-aggregation"),
      seriesType: chartCell.getAttribute("data-series-type"),
      official:
        chartCell.getAttribute("data-official") === null
          ? undefined
          : chartCell.getAttribute("data-official") === "true",
      note: chartCell.getAttribute("data-measurement-note") || null,
    }).toEqual({
      value: expected.value,
      status: expected.status,
      reason: expected.reason,
      source: expected.source,
      unit: expected.unit,
      frequency: expected.frequency,
      aggregation: expected.aggregation,
      seriesType: expected.seriesType,
      official: expected.official,
      note: expected.note,
    });

    const tableCell = defined(
      table.container.querySelector(`[data-measurement-metadata="${key}"]`),
    );
    expect(tableCell.textContent).toContain(`状態: ${expected.status}`);
    expect(tableCell.textContent).toContain(`理由: ${expected.reason ?? "-"}`);
    expect(tableCell.textContent).toContain(`区分: ${expected.note}`);

    const tooltipRow = defined(tooltip.container.querySelector(`[data-tooltip-key="${key}"]`));
    expect({
      value: tooltipRow.textContent?.includes("—")
        ? null
        : Number(tooltipRow.textContent?.match(/[-\d.]+$/)?.[0]),
      unit: tooltipRow.getAttribute("data-tooltip-unit"),
      source: tooltipRow.getAttribute("data-tooltip-source"),
      frequency: tooltipRow.getAttribute("data-tooltip-frequency"),
      aggregation: tooltipRow.getAttribute("data-tooltip-aggregation"),
      status: tooltipRow.getAttribute("data-tooltip-status"),
      reason: tooltipRow.getAttribute("data-tooltip-reason") || null,
      seriesType: tooltipRow.getAttribute("data-tooltip-series-type"),
      official:
        tooltipRow.getAttribute("data-tooltip-official") === null
          ? undefined
          : tooltipRow.getAttribute("data-tooltip-official") === "true",
      note: tooltipRow.getAttribute("data-tooltip-note") || null,
    }).toEqual({
      value: expected.value,
      unit: expected.unit,
      source: expected.source,
      frequency: expected.frequency,
      aggregation: expected.aggregation,
      status: expected.status,
      reason: expected.reason,
      seriesType: expected.seriesType,
      official: expected.official,
      note: expected.note,
    });

    for (const suffix of [
      "status",
      "reason",
      "annualAnchorType",
      "quarterlyDerived",
      "seriesType",
      "official",
    ] as const) {
      const index = csvHeaders.indexOf(`${key}__${suffix}`);
      expect(index).toBeGreaterThan(-1);
      const value = csvValues[index];
      const expectedValue =
        suffix === "reason" ? (expected.reason ?? "") : String(expected[suffix] ?? "");
      expect(value).toBe(expectedValue);
    }
    const valueIndex = csvHeaders.indexOf(`${key}__value`);
    expect(csvValues[valueIndex]).toBe(expected.value === null ? "" : String(expected.value));
  }
}

type AnnualMutation = (data: ReturnType<typeof makeAnnualInputs>) => void;
type MonthlyMutation = (records: CtiBasicRecord[]) => void;

const annualFailureCases: ReadonlyArray<[string, AnnualMutation, string]> = [
  [
    "missing",
    (data) => {
      data.B.rows = data.B.rows.filter((row) => row.year !== 2010);
    },
    "B:missing_required_year:2010",
  ],
  [
    "duplicate",
    (data) => {
      data.B.rows = [...data.B.rows, defined(data.B.rows.find((row) => row.year === 2010))];
    },
    "B:duplicate_year:2010",
  ],
  [
    "non-finite",
    (data) => {
      defined(data.B.rows[0]).values.食料 = Number.NaN;
    },
    "B:non_finite_value:2005:食料",
  ],
  [
    "anchor",
    (data) => {
      data.A.rows = data.A.rows.filter((row) => row.year !== 2025);
    },
    "A:missing_required_year:2025",
  ],
  [
    "adopted range missing",
    (data) => {
      data.B.metadata = { ...data.B.metadata, adoptedRange: undefined as never };
    },
    "B:missing_adopted_range",
  ],
  [
    "adopted range non-finite",
    (data) => {
      data.B.metadata = {
        ...data.B.metadata,
        adoptedRange: { startYear: Number.NaN, endYear: 2025 },
      };
    },
    "B:non_finite_adopted_range",
  ],
  [
    "adopted range reversed",
    (data) => {
      data.B.metadata = { ...data.B.metadata, adoptedRange: { startYear: 2025, endYear: 2005 } };
    },
    "B:reversed_adopted_range",
  ],
  [
    "adopted range excludes target",
    (data) => {
      data.B.metadata = { ...data.B.metadata, adoptedRange: { startYear: 2006, endYear: 2025 } };
    },
    "B:adopted_range_excludes_target:2005",
  ],
  [
    "raw range missing",
    (data) => {
      data.B.metadata = { ...data.B.metadata, rawRange: undefined as never };
    },
    "B:missing_raw_range",
  ],
  [
    "raw range non-finite",
    (data) => {
      data.B.metadata = {
        ...data.B.metadata,
        rawRange: { startYear: 2005, endYear: Number.POSITIVE_INFINITY },
      };
    },
    "B:non_finite_raw_range",
  ],
  [
    "raw range reversed",
    (data) => {
      data.B.metadata = { ...data.B.metadata, rawRange: { startYear: 2025, endYear: 2005 } };
    },
    "B:reversed_raw_range",
  ],
  [
    "raw range excludes target",
    (data) => {
      data.B.metadata = { ...data.B.metadata, rawRange: { startYear: 2006, endYear: 2025 } };
    },
    "B:raw_range_excludes_target:2005",
  ],
  [
    "base year missing",
    (data) => {
      data.A.metadata = { ...data.A.metadata, baseYear: undefined as never };
    },
    "A:missing_base_year",
  ],
  [
    "base year non-finite",
    (data) => {
      data.A.metadata = { ...data.A.metadata, baseYear: Number.NaN };
    },
    "A:non_finite_base_year",
  ],
  [
    "2025 anchor non-positive",
    (data) => {
      defined(data.A.rows.find((row) => row.year === 2025)).values.総合 = 0;
    },
    "A:missing_or_non_positive_2025_anchor",
  ],
];

const monthlyFailureCases: ReadonlyArray<[string, MonthlyMutation, string]> = [
  ["missing", (rows) => rows.splice(1, 1), "insufficient_months"],
  ["duplicate", (rows) => rows.push({ ...defined(rows[0]) }), "duplicate_month"],
  [
    "non-finite",
    (rows) => {
      defined(rows[0]).rawValue = Number.NaN;
    },
    "insufficient_months",
  ],
  ["less than three months", (rows) => rows.splice(0, 2), "insufficient_months"],
];

describe("Plan40 phase-1 runtime evidence", () => {
  it.each(annualFailureCases)(
    "fails closed for annual %s input across all ten quarterly expenses",
    (_label, mutate, expectedReason) => {
      const { result, rows } = runtimeRows(mutate);
      const row = targetRow(rows);
      const measurements = keys.map((key) => measurementFor(row, key));
      const validation = plan40Validation(result);
      expect(validation.valid).toBe(false);
      expect(validation.reasonCodes).toContain(expectedReason);
      expect(measurements).toHaveLength(10);
      const invalidFields = measurements.map(({ status, value, reason }) => ({
        status,
        value,
        reason,
      }));
      expect(new Set(invalidFields.map((fields) => JSON.stringify(fields)))).toHaveLength(1);
      expect(invalidFields[0]).toEqual({
        status: "unavailable",
        value: null,
        reason: "v2_annual_anchor_unavailable",
      });
      expect(measurements.every((measurement) => measurement.model === "v2-bottom-up")).toBe(true);
      expect(measurements.every((measurement) => measurement.estimateVersion === "plan39-v2")).toBe(
        true,
      );
      expect(measurements.every((measurement) => measurement.source.length > 0)).toBe(true);
      expect(measurements.every((measurement) => measurement.unit === "指数")).toBe(true);
      expect(measurements.every((measurement) => measurement.frequency === "quarterly")).toBe(true);
      expect(measurements.every((measurement) => measurement.aggregation.length > 0)).toBe(true);
      expect(measurements.every((measurement) => measurement.seriesType === "unavailable")).toBe(
        true,
      );
      expect(measurements.every((measurement) => measurement.official === false)).toBe(true);
      expect(measurements.every((measurement) => measurement.annualAnchorType === "official")).toBe(
        true,
      );
      expect(measurements.every((measurement) => measurement.quarterlyDerived === true)).toBe(true);
      expect(
        measurements.every(
          (measurement) =>
            getMeasurementNote(measurement) === "利用不可: v2_annual_anchor_unavailable",
        ),
      ).toBe(true);
      const expectsValidMetadata =
        !_label.includes("base year") && !_label.includes("adopted range");
      if (expectsValidMetadata) {
        expect(measurements.every((measurement) => measurement.baseYear === 2025)).toBe(true);
        const rawRanges = measurements.map((measurement) => measurement.rawRange);
        expect(rawRanges.every((range) => range !== undefined)).toBe(true);
        for (const range of rawRanges) {
          if (!range) throw new Error("expected raw range");
          expect(range.startYear).toBe(2005);
          expect(range.endYear).toBe(2025);
        }
        const adoptedRanges = measurements.map((measurement) => measurement.adoptedRange);
        expect(adoptedRanges.every((range) => range !== undefined)).toBe(true);
        for (const range of adoptedRanges) {
          if (!range) throw new Error("expected adopted range");
          expect(range.startYear).toBeLessThanOrEqual(2017);
          expect(range.endYear).toBeGreaterThanOrEqual(2017);
        }
      }
    },
  );

  it.each(monthlyFailureCases)(
    "fails closed for monthly %s input across all ten quarterly expenses",
    (_label, mutate, reason) => {
      const { result, rows } = runtimeRows(undefined, mutate);
      const row = targetRow(rows);
      const measurements = keys.map((key) => measurementFor(row, key));
      expect(plan40Validation(result).valid).toBe(true);
      expect(keys.every((key) => row[key] === null)).toBe(true);
      expect(measurements.every((measurement) => measurement.value === null)).toBe(true);
      expect(new Set(measurements.map((measurement) => measurement.reason))).toEqual(
        new Set([reason]),
      );
      expect(
        measurements.every((measurement) => measurement.reason !== "v2_annual_anchor_unavailable"),
      ).toBe(true);
      expect(measurements.every((measurement) => measurement.status === "unavailable")).toBe(true);
    },
  );

  it("fails closed for every quarter in a year when a different quarter has a duplicate month", () => {
    const { rows } = runtimeRows(undefined, (monthlyRecords) => {
      const april = defined(monthlyRecords.find((record) => record.month === "2017-04"));
      monthlyRecords.push({ ...april });
    });

    for (const quarter of [1, 2, 3, 4]) {
      const row = rowForYear(rows, 2017, quarter);
      expect(keys.every((key) => row[key] === null)).toBe(true);
      expect(keys.map((key) => measurementFor(row, key).reason)).toEqual(
        keys.map(() => "duplicate_month"),
      );
      expect(keys.every((key) => measurementFor(row, key).status === "unavailable")).toBe(true);
    }
  });

  it("keeps 2005 Plan40 rows unavailable when the publication gate is closed", () => {
    const { result, rows } = runtimeRows(undefined, undefined, 2005);
    const row = rowForYear(rows, 2005);
    const measurements = keys.map((key) => measurementFor(row, key));

    expect(result.plan40InputValidation?.valid).toBe(true);
    expect(result.publicationGate.accepted).toBe(false);
    expect(measurements.every((measurement) => measurement.status === "unavailable")).toBe(true);
    expect(measurements.every((measurement) => measurement.seriesType === "unavailable")).toBe(
      true,
    );
    expect(measurements.every((measurement) => measurement.value === null)).toBe(true);
    expect(measurements.every((measurement) => measurement.annualAnchorType === "estimated")).toBe(
      true,
    );
    expect(measurements.every((measurement) => measurement.quarterlyDerived === true)).toBe(true);
    expect(measurements.every((measurement) => measurement.official === false)).toBe(true);
  });

  it("keeps 2017 official annual anchors distinct from derived quarterly values, including Other", () => {
    const { result, rows } = runtimeRows((inputs) => {
      const annual = defined(inputs.A.rows.find((candidate) => candidate.year === 2017));
      annual.values.総合 = 200;
      for (const category of CTI_ADJUSTED_INPUT_CATEGORIES) {
        if (category !== "総合") annual.values[category] = 10;
      }
    });
    const row = rowForYear(rows, 2017);
    const measurements = keys.map((key) => measurementFor(row, key));
    const otherKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY.その他の消費支出;
    const annualOther = defined(result.rows.find((candidate) => candidate.year === 2017)).values
      .その他の消費支出;

    expect(annualOther).toBe(110);
    if (typeof annualOther !== "number") throw new Error("expected available annual Other value");
    const otherValue = measurementFor(row, otherKey).value;
    expect(typeof otherValue).toBe("number");
    if (typeof otherValue !== "number") throw new Error("expected available Other measurement");
    expect(otherValue).toBeGreaterThan(annualOther);
    expect(measurements.every((measurement) => measurement.status === "available")).toBe(true);
    expect(
      measurements.every((measurement) => measurement.seriesType === "official_adjusted"),
    ).toBe(true);
    expect(measurements.every((measurement) => measurement.annualAnchorType === "official")).toBe(
      true,
    );
    expect(measurements.every((measurement) => measurement.official === false)).toBe(true);
    expect(measurements.every((measurement) => measurement.quarterlyDerived === true)).toBe(true);
  });

  it("keeps the 2017Q4 official-anchor Plan40 adapter contract in parity for all ten categories (Recharts DOM is out of scope)", () => {
    const { rows } = runtimeRows();
    assertPlan40SurfaceParity(rowForYear(rows, 2017, 4));
  });

  it("keeps all ten categories null, unavailable, and reason-identical across surfaces for an unavailable fixture", () => {
    const { rows } = runtimeRows((inputs) => {
      inputs.A.rows = inputs.A.rows.filter((candidate) => candidate.year !== 2017);
    });
    const row = rowForYear(rows, 2017, 4);
    const measurements = keys.map((key) => measurementFor(row, key));
    expect(measurements.every((measurement) => measurement.value === null)).toBe(true);
    expect(measurements.every((measurement) => measurement.status === "unavailable")).toBe(true);
    expect(new Set(measurements.map((measurement) => measurement.reason))).toEqual(
      new Set(["v2_annual_anchor_unavailable"]),
    );
    assertPlan40SurfaceParity(row);
  });

  it("keeps v2 ten categories absent for the legacy 2018Q1 adapter fixture", () => {
    const legacyRow = {
      年: 2018,
      quarter: 1,
      label: "2018Q1",
      年月: "2018年1月",
      kind: "legacy-cti" as const,
      ...Object.fromEntries(QUARTERLY_PUBLIC_NOMINAL_KEYS.map((key) => [key, 10])),
      ...Object.fromEntries(keys.map((key) => [key, 999])),
    };
    const projected = defined(projectQuarterlyPublicView([legacyRow])[0]);
    expect(keys.every((key) => projected[key] === undefined)).toBe(true);
    expect(keys.every((key) => projected.measurements?.[key] === undefined)).toBe(true);

    const chart = render(
      createElement(ChartDataContract, {
        data: [projected],
        keys: QUARTERLY_PUBLIC_NOMINAL_KEYS as unknown as string[],
      }),
    );
    expect(
      JSON.parse(
        defined(chart.container.querySelector("[data-testid=chart-data-contract]")).getAttribute(
          "data-series",
        ) ?? "[]",
      ),
    ).not.toEqual(expect.arrayContaining(keys));

    const table = render(
      createElement(DataTablesSection, {
        tables: [
          {
            chartSectionId: "legacy",
            title: "legacy",
            data: [projected],
            keys: [...QUARTERLY_PUBLIC_NOMINAL_KEYS],
          },
        ],
      }),
    );
    expect(keys.some((key) => table.container.querySelector(`[data-series-key="${key}"]`))).toBe(
      false,
    );
    const csv = buildCsv(
      [projected as unknown as Record<string, unknown>],
      [...QUARTERLY_PUBLIC_NOMINAL_KEYS],
    );
    expect(keys.some((key) => csv.includes(key))).toBe(false);
  });

  it("projects one runtime measurement unchanged through the chart contract, tooltip, table, and CSV", () => {
    const { rows } = runtimeRows(undefined, (records) => records.splice(1, 1));
    const source = targetRow(rows);
    expect(source.kind).toBe("plan40-v2-cost-stack");
    const key = defined(keys[0]);
    const measurement = measurementFor(source, key);
    const publicRows = projectQuarterlyPublicView(rows);
    const publicRow = defined(publicRows.find((row) => row.label === "2017Q1"));
    expect(new Set([...QUARTERLY_PUBLIC_KEYS, ...keys]).size).toBe(32);
    const normalized = defined(normalizePublicChartData([publicRow], [key])[0]);
    expect(Object.keys(source.measurements ?? {}).sort()).toEqual([...keys].sort());
    const publicMeasurement = measurementFor(publicRow, key);
    expect(publicMeasurement).toMatchObject({
      key,
      value: measurement.value,
      status: measurement.status,
      reason: measurement.reason,
      unit: measurement.unit,
      source: measurement.source,
      frequency: measurement.frequency,
      aggregation: measurement.aggregation,
    });
    expect(publicMeasurement).toBe(measurement);
    expect(normalized[key]).toBeNull();

    const chart = render(
      createElement(ChartDataContract, {
        data: [publicRow],
        keys: [key],
        descriptors: CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter((entry) => entry.key === key).map(
          (entry) => ({ ...entry, color: "#0f766e" }),
        ),
      }),
    );
    const chartCell = defined(chart.container.querySelector(`[data-series-key="${key}"]`));
    expect(chartCell.getAttribute("data-status")).toBe(measurement.status);
    expect(chartCell.getAttribute("data-reason")).toBe(measurement.reason);
    expect(chartCell.getAttribute("data-measurement-note")).toBe(getMeasurementNote(measurement));

    const table = render(
      createElement(DataTablesSection, {
        tables: [{ chartSectionId: "evidence", title: "evidence", data: [publicRow], keys: [key] }],
      }),
    );
    const metadata = defined(table.container.querySelector(`[data-measurement-metadata="${key}"]`));
    expect(metadata.textContent).toContain(`状態: ${measurement.status}`);
    expect(metadata.textContent).toContain(`理由: ${measurement.reason}`);

    const tooltip = render(
      createElement(CustomTooltip, {
        active: true,
        isMobile: false,
        isTouch: false,
        tooltipBg: "white",
        tooltipText: "black",
        label: "2017Q1",
        payload: [
          { name: key, value: null, dataKey: key, payload: publicRow as Record<string, unknown> },
        ],
        seriesMeta: [{ key, label: key, color: "#000", order: 0 }],
      }),
    );
    const tooltipReason = tooltip.container.querySelector("[data-tooltip-reason]");
    if (!tooltipReason) throw new Error("expected tooltip reason");
    expect(tooltipReason.getAttribute("data-tooltip-reason")).toBe(measurement.reason);

    const csv = buildCsv([publicRow as unknown as Record<string, unknown>], [key], [key]);
    expect(csv).toContain(`${key}__status`);
    expect(csv).toContain(`${key}__reason`);
    expect(csv).toContain(measurement.reason);
  });
});
