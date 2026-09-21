import type { SeriesMeasurement } from "@/types/chart";
import type {
  CtiAdjustedV2Result,
  CtiAdjustedV2Category,
  CtiAdjustedV2Row,
} from "../../server/lib/ctiAdjustedConnectionEstimateV2";
import {
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY,
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  type CtiAdjustedPublicCategory,
  type CtiAdjustedV2PublicCategory,
} from "@/lib/chartConstants";
import type {
  CtiAdjustedPublicMeasurements,
  CtiAdjustedPublicRow,
} from "@/lib/ctiAdjustedPublicProjection";

export type CtiAdjustedV2PublicationGate = { status: string; accepted: boolean };

export type CtiAdjustedV2PublicMeasurement = SeriesMeasurement & {
  model: CtiAdjustedV2Result["model"];
  estimateVersion: CtiAdjustedV2Result["estimateVersion"];
  year: number;
  category: CtiAdjustedV2PublicCategory;
};

export type CtiAdjustedV2PublicRow = {
  year: number;
  model: CtiAdjustedV2Result["model"];
  estimateVersion: CtiAdjustedV2Result["estimateVersion"];
  status: SeriesMeasurement["status"];
  reason: string | null;
  values: Record<CtiAdjustedV2PublicCategory, number | null>;
  /** Category aliases are retained for v1-shaped consumers; public keys are canonical. */
  measurements: Record<string, CtiAdjustedV2PublicMeasurement>;
};

const v1CategoryFor = (category: CtiAdjustedPublicCategory): CtiAdjustedV2PublicCategory =>
  category === "残差" ? "その他の消費支出" : category;

const isAccepted = (gate: CtiAdjustedV2PublicationGate): boolean =>
  gate.status === "pass" && gate.accepted === true;

const isFiniteValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isEstimated = (row: CtiAdjustedV2Row): boolean => row.seriesType === "estimated_bottom_up";

/**
 * Projects the server v2 result into the shared public measurement contract.
 * Official A values (2017+) are retained even when estimated publication is closed.
 */
export function projectCtiAdjustedV2PublicView(
  result: CtiAdjustedV2Result,
): CtiAdjustedV2PublicRow[] {
  const allowEstimates = isAccepted(result.publicationGate);
  return result.rows.map((row) => {
    // A row that is already unavailable must remain unavailable. The
    // publication gate only closes otherwise publishable estimates; it must
    // not replace the row's original reason or provenance.
    const rowUnavailable = row.seriesType === "unavailable" || row.status !== "available";
    const estimatedDenied = isEstimated(row) && !rowUnavailable && !allowEstimates;
    const seriesType = estimatedDenied
      ? "unavailable"
      : row.seriesType === "estimated_bottom_up"
        ? "estimated_adjusted"
        : row.seriesType === "official_adjusted"
          ? "official_adjusted"
          : "unavailable";
    const official = seriesType === "official_adjusted" && row.official;
    const values = Object.fromEntries(
      CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => {
        const value = row.values[category as CtiAdjustedV2Category];
        return [
          category,
          estimatedDenied || rowUnavailable || !isFiniteValue(value) ? null : value,
        ];
      }),
    ) as Record<CtiAdjustedV2PublicCategory, number | null>;
    const reason = estimatedDenied ? "overall_verdict_not_accepted" : row.reason;
    const status = estimatedDenied || rowUnavailable ? "unavailable" : "available";
    const measurements = Object.fromEntries(
      CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => {
        const key = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category];
        const measurement = {
          key,
          label: key,
          unit: "指数",
          source: official ? "公式CTIミクロ調整系列 A" : "Plan39-v2 bottom-up connection estimate",
          valueType: "comparison" as const,
          value: values[category],
          status,
          reason,
          frequency: "annual" as const,
          aggregation: official ? "official_annual_artifact" : "cti_adjusted_v2_bottom_up_estimate",
          seriesType,
          official,
          model: result.model,
          estimateVersion: result.estimateVersion,
          year: row.year,
          category,
        } satisfies CtiAdjustedV2PublicMeasurement;
        return [category, measurement];
      }),
    ) as Record<string, CtiAdjustedV2PublicMeasurement>;
    for (const category of CTI_ADJUSTED_V2_PUBLIC_CATEGORIES) {
      measurements[CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category]] = measurements[category];
    }
    return {
      year: row.year,
      model: result.model,
      estimateVersion: result.estimateVersion,
      status,
      reason,
      values,
      measurements,
    };
  });
}

/**
 * Adapts the v2 category set to the existing CtiAdjustedDisplayRow contract.
 * The display slot named 残差 is retained for compatibility; its measurement
 * remains the v2 その他の消費支出 measurement and carries v2 provenance.
 */
export function adaptCtiAdjustedV2PublicView(
  rows: readonly CtiAdjustedV2PublicRow[],
): CtiAdjustedPublicRow[] {
  return rows.map((row) => {
    const measurements = Object.fromEntries(
      CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category) => {
        const v2Category = v1CategoryFor(category);
        const source = row.measurements[v2Category];
        const key = CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY[category];
        return [key, { ...source, key, label: `CTIミクロ調整系列（${category}）` }];
      }),
    ) as CtiAdjustedPublicMeasurements;
    const values = Object.fromEntries(
      CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category) => {
        const source = row.values[v1CategoryFor(category)];
        return [category, source];
      }),
    ) as Record<CtiAdjustedPublicCategory, number | null>;
    return {
      year: row.year,
      seriesType: row.measurements["総合"].seriesType ?? "unavailable",
      official: row.measurements["総合"].official ?? false,
      status: row.status === "valid" ? "available" : row.status,
      reason: row.reason,
      values,
      measurements,
    };
  });
}
