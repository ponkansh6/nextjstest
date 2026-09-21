import type { SeriesMeasurement } from "@/types/chart";
import {
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  type CtiAdjustedPublicCategory,
} from "@/lib/chartConstants";

export type CtiAdjustedPublicInputRow = {
  year: number;
  seriesType: "estimated_adjusted" | "official_adjusted" | "unavailable";
  official: boolean;
  status: "available" | "invalid" | "unavailable";
  reason: string | null;
  values: Record<string, number | null>;
};

export type CtiAdjustedPublicRow = CtiAdjustedPublicInputRow & {
  measurements: CtiAdjustedPublicMeasurements;
};

export type CtiAdjustedPublicMeasurements = Record<string, SeriesMeasurement>;

const PUBLIC_KEY = "CTIミクロ調整系列";

type CtiAdjustedPublicViewInput =
  | { rows: readonly CtiAdjustedPublicInputRow[] }
  | readonly CtiAdjustedPublicInputRow[];

export type CtiAdjustedPublicationGate = {
  status: string;
  accepted: boolean;
};

const estimatePublicationAllowed = (gate?: CtiAdjustedPublicationGate): boolean =>
  gate?.status === "pass" && gate.accepted === true;

function denyEstimatedRow(row: CtiAdjustedPublicInputRow): CtiAdjustedPublicInputRow {
  if (row.seriesType !== "estimated_adjusted") return row;
  return {
    ...row,
    seriesType: "unavailable",
    official: false,
    status: "unavailable",
    reason: "overall_verdict_not_accepted",
    values: Object.fromEntries(Object.keys(row.values).map((category) => [category, null])),
  };
}

function isCtiAdjustedPublicRows(
  value: CtiAdjustedPublicViewInput,
): value is readonly CtiAdjustedPublicInputRow[] {
  return Array.isArray(value);
}

/** Project server output into the measurement shape shared by public surfaces. */
export function projectCtiAdjustedPublicRows(
  rows: readonly CtiAdjustedPublicInputRow[],
  publicationGate?: CtiAdjustedPublicationGate,
): CtiAdjustedPublicRow[] {
  const allowEstimates = estimatePublicationAllowed(publicationGate);
  return rows.map((inputRow) => {
    const row = allowEstimates ? inputRow : denyEstimatedRow(inputRow);
    const rowIsInvalid = row.status !== "available" || row.seriesType === "unavailable";
    const values = Object.fromEntries(
      CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category) => {
        const inputValue = row.values[category];
        const value =
          !rowIsInvalid && typeof inputValue === "number" && Number.isFinite(inputValue)
            ? inputValue
            : null;
        return [category, value];
      }),
    ) as Record<CtiAdjustedPublicCategory, number | null>;
    const measurementStatus = row.status;
    const measurements = Object.fromEntries(
      CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category) => [
        category,
        {
          key: `${PUBLIC_KEY}:${category}`,
          label: `${PUBLIC_KEY}（${category}）`,
          unit: "指数",
          source: row.official ? "公式CTIミクロ調整系列" : "CTIミクロ調整接続推計",
          valueType: "comparison",
          value: values[category],
          status: measurementStatus,
          reason: row.reason,
          frequency: "annual",
          aggregation:
            row.seriesType === "estimated_adjusted"
              ? "cti_adjusted_connection_estimate"
              : "official_annual_artifact",
          seriesType: row.seriesType,
          official: row.official,
        } satisfies SeriesMeasurement,
      ]),
    ) as CtiAdjustedPublicMeasurements;

    return {
      year: row.year,
      seriesType: row.seriesType,
      official: row.official,
      status: row.status,
      reason: row.reason,
      values,
      measurements,
    };
  });
}

export function projectCtiAdjustedPublicView(
  estimate: CtiAdjustedPublicViewInput,
  publicationGate?: CtiAdjustedPublicationGate,
): CtiAdjustedPublicRow[] {
  const rows = isCtiAdjustedPublicRows(estimate) ? estimate : estimate.rows;
  return projectCtiAdjustedPublicRows(rows, publicationGate);
}
