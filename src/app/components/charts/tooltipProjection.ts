import type { CompositionAdjustedV2EstimateVersion } from "../../../../shared/cti-estimate-contract";
import type { CustomTooltipProps, SeriesMeasurement } from "@/types/chart";
import { createMissingSeriesMeasurement, isCompositionAdjustedMeasurement } from "@/types/chart";

export type TooltipDisplayPayload = NonNullable<CustomTooltipProps["payload"]>[number] & {
  order?: number;
  unit?: string;
  source?: string;
  sourceId?: string;
  statInfId?: string;
  householdScope?: string;
  sourceWorkbook?: string;
  sourceSheet?: string;
  sourceColumn?: string;
  sourceRole?: string;
  sourceDerivedFromColumns?: string[];
  canonicalSeries?: string;
  seasonalitySourceId?: string;
  targetSourceId?: string;
  targetHouseholdScope?: string;
  bridgeAppliedRange?: { startYear: number; endYear: number };
  bridgeCoefficient?: number;
  valueType?: "raw" | "comparison";
  frequency?: string;
  aggregation?: string;
  status?: "valid" | "invalid" | "unavailable" | "available";
  reason?: string | null;
  seriesType?: "estimated_adjusted" | "official_adjusted" | "derived_adjusted" | "unavailable";
  official?: boolean;
  annualAnchorType?: "estimated" | "official";
  quarterlyDerived?: boolean;
  model?: "v2-bottom-up";
  estimateVersion?: CompositionAdjustedV2EstimateVersion;
  inputFingerprint?: string;
  baseYear?: number | null;
  cpiSeries?: string;
  cpiPeriod?: string;
  cpiAggregation?: string;
  nominalSource?: string;
  measurementNote?: string;
  monthlyProvenance?: SeriesMeasurement["monthlyProvenance"];
  ma12Provenance?: SeriesMeasurement["ma12Provenance"];
};

type TooltipMeasurement = Partial<
  Pick<
    SeriesMeasurement,
    | "unit"
    | "source"
    | "sourceId"
    | "statInfId"
    | "householdScope"
    | "sourceWorkbook"
    | "sourceSheet"
    | "sourceColumn"
    | "sourceRole"
    | "sourceDerivedFromColumns"
    | "canonicalSeries"
    | "seasonalitySourceId"
    | "targetSourceId"
    | "targetHouseholdScope"
    | "bridgeAppliedRange"
    | "bridgeCoefficient"
    | "valueType"
    | "frequency"
    | "aggregation"
    | "status"
    | "reason"
    | "seriesType"
    | "official"
    | "annualAnchorType"
    | "quarterlyDerived"
    | "model"
    | "estimateVersion"
    | "inputFingerprint"
    | "baseYear"
    | "cpiSeries"
    | "cpiPeriod"
    | "cpiAggregation"
    | "nominalSource"
    | "measurementNote"
    | "monthlyProvenance"
    | "ma12Provenance"
  >
>;

interface ProjectTooltipPayloadOptions {
  payload: NonNullable<CustomTooltipProps["payload"]>;
  label?: string;
  seriesMeta?: CustomTooltipProps["seriesMeta"];
  allowedKeys?: CustomTooltipProps["allowedKeys"];
  includeUnmappedPayload?: boolean;
}

/** Projects Recharts entries into the public, metadata-ordered tooltip rows. */
export function projectTooltipPayload({
  payload,
  label,
  seriesMeta,
  allowedKeys,
  includeUnmappedPayload = false,
}: ProjectTooltipPayloadOptions): TooltipDisplayPayload[] {
  const resolvedAllowedKeys = allowedKeys
    ? new Set(typeof allowedKeys === "function" ? allowedKeys(label) : allowedKeys)
    : null;
  // An explicit allowed-key contract is authoritative for every payload,
  // including unknown keys. Raw-key fallback is only an explicit escape
  // hatch for callers that do not provide a period/visibility contract.
  const canIncludeUnmappedPayload = includeUnmappedPayload && !resolvedAllowedKeys;
  const visiblePayload = resolvedAllowedKeys
    ? payload.filter((entry) => resolvedAllowedKeys.has((entry.dataKey ?? entry.name) as string))
    : payload;
  const visibleMeta = seriesMeta?.filter(
    (meta) => !resolvedAllowedKeys || resolvedAllowedKeys.has(meta.key),
  );

  return visibleMeta
    ? [
        ...[...visibleMeta]
          .sort(
            (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
          )
          .map((meta) => {
            const entry = payload.find(
              (candidate) => (candidate.dataKey ?? candidate.name) === meta.key,
            );
            const row = entry?.payload;
            const rowMeasurements = row?.["measurements"];
            const rowMeasurement =
              rowMeasurements && typeof rowMeasurements === "object"
                ? (rowMeasurements as Record<string, unknown>)[meta.key]
                : undefined;
            const fallbackMeasurement = createMissingSeriesMeasurement(
              meta.key,
              meta as Partial<SeriesMeasurement>,
            );
            const period = row?.["年月"] ?? row?.["label"] ?? label;
            const periodYear =
              typeof period === "string" ? Number(period.match(/^(\d{4})/)?.[1]) : NaN;
            const isCompositionAdjustedKey = isCompositionAdjustedMeasurement(meta);
            const isCompositionAdjustedBoundaryMissing =
              isCompositionAdjustedKey && periodYear >= 2018 && entry?.value == null;
            const measurement: TooltipMeasurement = isCompositionAdjustedBoundaryMissing
              ? fallbackMeasurement
              : row &&
                  typeof row === "object" &&
                  rowMeasurement &&
                  typeof rowMeasurement === "object"
                ? (rowMeasurement as Partial<TooltipMeasurement>)
                : row && typeof row === "object"
                  ? typeof entry?.value === "number" && Number.isFinite(entry.value)
                    ? (meta as TooltipMeasurement)
                    : fallbackMeasurement
                  : (meta as TooltipMeasurement);
            const hasProvenance =
              measurement.seriesType !== undefined || measurement.official !== undefined;
            const unavailable =
              measurement.seriesType === "unavailable" ||
              measurement.status === "invalid" ||
              measurement.status === "unavailable";
            return {
              name: meta.label,
              value: unavailable ? null : entry?.value,
              color: meta.color ?? entry?.color,
              dataKey: meta.key,
              order: meta.order,
              unit: measurement.unit,
              source: measurement.source,
              sourceId: measurement.sourceId,
              statInfId: measurement.statInfId,
              householdScope: measurement.householdScope,
              sourceWorkbook: measurement.sourceWorkbook,
              sourceSheet: measurement.sourceSheet,
              sourceColumn: measurement.sourceColumn,
              sourceRole: measurement.sourceRole,
              sourceDerivedFromColumns: measurement.sourceDerivedFromColumns,
              canonicalSeries: measurement.canonicalSeries,
              seasonalitySourceId: measurement.seasonalitySourceId,
              targetSourceId: measurement.targetSourceId,
              targetHouseholdScope: measurement.targetHouseholdScope,
              bridgeAppliedRange: measurement.bridgeAppliedRange,
              bridgeCoefficient: measurement.bridgeCoefficient,
              valueType: measurement.valueType as "raw" | "comparison" | undefined,
              frequency: measurement.frequency,
              aggregation: measurement.aggregation,
              status: measurement.status,
              reason: measurement.reason,
              seriesType: hasProvenance ? measurement.seriesType : undefined,
              official: hasProvenance ? measurement.official : undefined,
              annualAnchorType: measurement.annualAnchorType,
              quarterlyDerived: measurement.quarterlyDerived,
              model: measurement.model,
              estimateVersion: measurement.estimateVersion,
              inputFingerprint: measurement.inputFingerprint,
              baseYear: measurement.baseYear ?? meta.baseYear,
              cpiSeries: measurement.cpiSeries,
              cpiPeriod: measurement.cpiPeriod,
              cpiAggregation: measurement.cpiAggregation,
              nominalSource: measurement.nominalSource,
              measurementNote: measurement.measurementNote,
              monthlyProvenance: measurement.monthlyProvenance,
              ma12Provenance: measurement.ma12Provenance,
            };
          }),
        ...(canIncludeUnmappedPayload
          ? visiblePayload
              .filter(
                (entry) => !visibleMeta.some((meta) => meta.key === (entry.dataKey ?? entry.name)),
              )
              .map((entry) => ({ ...entry, name: entry.name }))
          : []),
      ]
    : visiblePayload;
}

export const formatCpiTooltipValue = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";

/** Format a CPI total without allowing invalid upstream values to throw. */
export const formatCpiTooltipTotal = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
