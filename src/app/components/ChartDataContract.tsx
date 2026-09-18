import React from "react";
import type { SeriesMetadata } from "../../lib/chartConstants";

export interface ChartDataContractProps {
  data: Record<string, unknown>[];
  keys: string[];
  labelKeys?: string[];
  descriptors?: readonly SeriesMetadata[];
}

export type PublicChartRow = Record<string, unknown>;

/** The one public row model consumed by chart, table, and CSV surfaces. */
export function normalizePublicChartData(data: PublicChartRow[], keys: string[]): PublicChartRow[] {
  return data.map((row) => {
    const normalized = { ...row };
    for (const key of keys) {
      const value = row[key];
      normalized[key] =
        typeof value === "number" && Number.isFinite(value)
          ? value
          : typeof value === "string"
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
              return (
                <span
                  key={key}
                  data-series-key={key}
                  data-value={isNumber || typeof value === "string" ? String(value) : "null"}
                  data-value-type={
                    isNumber ? "number" : typeof value === "string" ? "string" : "null"
                  }
                  data-unit={descriptors.find((descriptor) => descriptor.key === key)?.unit}
                  data-source={descriptors.find((descriptor) => descriptor.key === key)?.source}
                  data-status={descriptors.find((descriptor) => descriptor.key === key)?.status}
                  data-reason={
                    descriptors.find((descriptor) => descriptor.key === key)?.reason ?? ""
                  }
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
