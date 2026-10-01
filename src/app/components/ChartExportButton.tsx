"use client";

import React from "react";
import styles from "./CpiChart.module.css";
import { buildCsv, toFileName, withBom } from "../../lib/csvExport";
import type { BuildCsvOptions } from "../../lib/csvExport";
import { SUPPORT_SERIES_KEY_NOMINAL, type SeriesMetadata } from "../../lib/chartConstants";

interface ChartExportButtonProps {
  /** ダウンロードファイル名の元になるグラフ名 */
  title: string;
  /** 表示中のフィルタ済みデータ（画面に見えているものと一致させる） */
  data: Record<string, unknown>[];
  /** 出力する系列キー */
  keys: string[];
  /** keys に対応する表示名（凡例ラベル） */
  headers?: string[];
  metadata?: readonly SeriesMetadata[];
}

/**
 * P6-6: 表示中データの CSV ダウンロード。
 *
 * 画面に出ている範囲・系列をそのまま書き出すため、フィルタ後のデータを受け取る。
 */
export const ChartExportButton: React.FC<ChartExportButtonProps> = ({
  title,
  data,
  keys,
  headers,
  metadata,
}) => {
  const handleExport = () => {
    const csvMetadata = metadata?.filter(({ key }) => keys.includes(key)) ?? [];
    const declaredKeys = new Set(csvMetadata.map(({ key }) => key));
    const rowMetadata: NonNullable<BuildCsvOptions["metadata"]> = keys.flatMap((key) => {
      if (declaredKeys.has(key)) return [];
      const measurement = data.find((row) => {
        const measurements = row.measurements;
        return (
          measurements &&
          typeof measurements === "object" &&
          (measurements as Record<string, unknown>)[key] &&
          typeof (measurements as Record<string, unknown>)[key] === "object"
        );
      })?.measurements;
      const entry =
        measurement && typeof measurement === "object"
          ? (measurement as Record<string, unknown>)[key]
          : undefined;
      if (!entry || typeof entry !== "object") return [];
      const current = entry as Record<string, unknown>;
      return [
        {
          key,
          label: typeof current.label === "string" ? current.label : key,
          valueType: current.valueType === "comparison" ? "comparison" : "raw",
          value: typeof current.value === "number" ? current.value : null,
          unit: typeof current.unit === "string" ? current.unit : "",
          source: typeof current.source === "string" ? current.source : "",
          frequency:
            current.frequency === "monthly" ||
            current.frequency === "annual" ||
            current.frequency === "quarterly"
              ? current.frequency
              : undefined,
          aggregation: typeof current.aggregation === "string" ? current.aggregation : "",
          status:
            current.status === "invalid" ||
            current.status === "unavailable" ||
            current.status === "available"
              ? current.status
              : "valid",
          reason: typeof current.reason === "string" ? current.reason : null,
          seriesType:
            current.seriesType === "estimated_adjusted" ||
            current.seriesType === "official_adjusted" ||
            current.seriesType === "derived_adjusted" ||
            current.seriesType === "unavailable"
              ? current.seriesType
              : undefined,
          official: typeof current.official === "boolean" ? current.official : undefined,
          annualAnchorType:
            current.annualAnchorType === "estimated" || current.annualAnchorType === "official"
              ? current.annualAnchorType
              : undefined,
          quarterlyDerived:
            typeof current.quarterlyDerived === "boolean" ? current.quarterlyDerived : undefined,
          model: current.model === "v2-bottom-up" ? "v2-bottom-up" : undefined,
          estimateVersion: current.estimateVersion === "plan39-v2" ? "plan39-v2" : undefined,
          inputFingerprint:
            typeof current.inputFingerprint === "string" ? current.inputFingerprint : undefined,
          sourceId: typeof current.sourceId === "string" ? current.sourceId : undefined,
          statInfId: typeof current.statInfId === "string" ? current.statInfId : undefined,
          householdScope:
            typeof current.householdScope === "string" ? current.householdScope : undefined,
          sourceWorkbook:
            typeof current.sourceWorkbook === "string" ? current.sourceWorkbook : undefined,
          sourceSheet: typeof current.sourceSheet === "string" ? current.sourceSheet : undefined,
          sourceColumn: typeof current.sourceColumn === "string" ? current.sourceColumn : undefined,
          sourceRole: typeof current.sourceRole === "string" ? current.sourceRole : undefined,
          sourceDerivedFromColumns: Array.isArray(current.sourceDerivedFromColumns)
            ? current.sourceDerivedFromColumns.filter(
                (value): value is string => typeof value === "string",
              )
            : undefined,
          canonicalSeries:
            typeof current.canonicalSeries === "string" ? current.canonicalSeries : undefined,
          seasonalitySourceId:
            typeof current.seasonalitySourceId === "string"
              ? current.seasonalitySourceId
              : undefined,
          targetSourceId:
            typeof current.targetSourceId === "string" ? current.targetSourceId : undefined,
          targetHouseholdScope:
            typeof current.targetHouseholdScope === "string"
              ? current.targetHouseholdScope
              : undefined,
          bridgeAppliedRange:
            current.bridgeAppliedRange &&
            typeof current.bridgeAppliedRange === "object" &&
            typeof (current.bridgeAppliedRange as Record<string, unknown>).startYear === "number" &&
            typeof (current.bridgeAppliedRange as Record<string, unknown>).endYear === "number"
              ? {
                  startYear: (current.bridgeAppliedRange as { startYear: number }).startYear,
                  endYear: (current.bridgeAppliedRange as { endYear: number }).endYear,
                }
              : undefined,
          bridgeCoefficient:
            typeof current.bridgeCoefficient === "number" ? current.bridgeCoefficient : undefined,
          baseYear:
            typeof current.baseYear === "number" || current.baseYear === null
              ? current.baseYear
              : undefined,
          cpiSeries: typeof current.cpiSeries === "string" ? current.cpiSeries : undefined,
          cpiPeriod: typeof current.cpiPeriod === "string" ? current.cpiPeriod : undefined,
          cpiAggregation:
            typeof current.cpiAggregation === "string" ? current.cpiAggregation : undefined,
          nominalSource:
            typeof current.nominalSource === "string" ? current.nominalSource : undefined,
          measurementNote:
            typeof current.measurementNote === "string" ? current.measurementNote : undefined,
        } satisfies NonNullable<BuildCsvOptions["metadata"]>[number],
      ];
    });
    const csvMetadataRows: NonNullable<BuildCsvOptions["metadata"]> = csvMetadata.map(
      ({
        key,
        label,
        unit,
        source,
        valueType,
        frequency,
        aggregation,
        status,
        reason,
        seriesType,
        official,
        annualAnchorType,
        quarterlyDerived,
        model,
        estimateVersion,
        inputFingerprint,
      }) => ({
        key,
        label,
        value: null,
        unit: unit ?? "",
        source: source ?? "",
        valueType: valueType ?? "raw",
        frequency,
        aggregation: aggregation ?? "",
        status: status ?? "valid",
        reason: reason ?? null,
        seriesType,
        official,
        annualAnchorType,
        quarterlyDerived,
        model,
        estimateVersion,
        inputFingerprint,
      }),
    );
    const csv = withBom(
      buildCsv(data, keys, headers, {
        metadata: [...csvMetadataRows, ...rowMetadata],
        includeProvenanceMetadata:
          csvMetadataRows.some(
            (measurement) =>
              measurement.seriesType !== undefined || measurement.official !== undefined,
          ) ||
          rowMetadata.some(
            (measurement) =>
              measurement.seriesType !== undefined || measurement.official !== undefined,
          ) ||
          keys.includes(SUPPORT_SERIES_KEY_NOMINAL) ||
          !data.some((row) => row.measurements && typeof row.measurements === "object"),
      }),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = toFileName(title);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className={styles.actionButton}
      aria-label={`${title}のデータをCSVでダウンロード`}
    >
      CSV
    </button>
  );
};
