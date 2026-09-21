import React from "react";
import type { SeriesMetadata } from "../../lib/chartConstants";
import { getMeasurementNote } from "../../types/chart";
import type { SeriesMeasurement } from "../../types/chart";

export interface ChartDataContractProps {
  data: Record<string, unknown>[];
  keys: string[];
  labelKeys?: string[];
  descriptors?: readonly SeriesMetadata[];
}

export type PublicChartRow = Record<string, unknown>;

function asMeasurement(value: unknown): Partial<SeriesMeasurement> | undefined {
  return value && typeof value === "object" ? (value as Partial<SeriesMeasurement>) : undefined;
}

/** The one public row model consumed by chart, table, and CSV surfaces. */
export function normalizePublicChartData(data: PublicChartRow[], keys: string[]): PublicChartRow[] {
  return data.map((row) => {
    const normalized = { ...row };
    for (const key of keys) {
      const value = row[key];
      const measurements = row.measurements;
      const measurement =
        measurements && typeof measurements === "object"
          ? asMeasurement((measurements as Record<string, unknown>)[key])
          : undefined;
      const isUnavailable =
        measurement?.seriesType === "unavailable" || measurement?.status === "unavailable";
      normalized[key] =
        !isUnavailable && typeof value === "number" && Number.isFinite(value)
          ? value
          : !isUnavailable && typeof value === "string"
            ? value
            : null;
    }
    return normalized;
  });
}

export function getPublicSpendingKeys(keys: string[]): string[] {
  return [...keys];
}

/** Stable public data surface shared by chart, table and CSV assertions. */
export function ChartDataContract({
  data,
  keys,
  labelKeys = ["年月", "label"],
  descriptors = [],
}: ChartDataContractProps) {
  const publicData = normalizePublicChartData(data, keys);
  return (
    <div
      data-testid="chart-data-contract"
      data-series={JSON.stringify(keys)}
      data-points={String(publicData.length)}
      data-descriptors={JSON.stringify(descriptors)}
      hidden
    >
      {publicData.map((row, rowIndex) => {
        const labelKey = labelKeys.find((key) => row[key] !== undefined && row[key] !== null);
        const period = labelKey ? String(row[labelKey]) : "";
        return (
          <div key={`${period}-${rowIndex}`} data-chart-data-row data-period={period}>
            {keys.map((key) => {
              const value = row[key];
              const isNumber = typeof value === "number" && Number.isFinite(value);
              const descriptor = descriptors.find((candidate) => candidate.key === key);
              const measurements = row.measurements;
              const rowMeasurement =
                measurements && typeof measurements === "object"
                  ? asMeasurement((measurements as Record<string, unknown>)[key])
                  : undefined;
              const fallbackMeasurement: SeriesMeasurement = {
                key,
                label: descriptor?.label ?? key,
                unit: "",
                source: "",
                valueType: "raw",
                value: null,
                status: "invalid",
                reason: "unavailable",
                frequency: descriptor?.frequency ?? "quarterly",
                aggregation: "",
              };
              const measurement =
                rowMeasurement && typeof rowMeasurement === "object"
                  ? rowMeasurement
                  : descriptor
                    ? fallbackMeasurement
                    : undefined;
              const note = measurement ? getMeasurementNote(measurement) : null;
              return (
                <span
                  key={key}
                  data-series-key={key}
                  data-value={isNumber || typeof value === "string" ? String(value) : "null"}
                  data-value-type={
                    isNumber ? "number" : typeof value === "string" ? "string" : "null"
                  }
                  data-measurement-value-type={measurement?.valueType}
                  data-unit={measurement?.unit}
                  data-source={measurement?.source}
                  data-frequency={measurement?.frequency}
                  data-aggregation={measurement?.aggregation}
                  data-status={measurement?.status}
                  data-reason={measurement?.reason ?? ""}
                  data-series-type={measurement?.seriesType}
                  data-official={
                    measurement?.official === undefined ? undefined : String(measurement.official)
                  }
                  data-measurement-note={note ?? ""}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
