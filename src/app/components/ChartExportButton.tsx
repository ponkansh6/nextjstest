"use client";

import React from "react";
import styles from "./CpiChart.module.css";
import { buildCsv, toFileName, withBom } from "../../lib/csvExport";
import type { BuildCsvOptions } from "../../lib/csvExport";
import type { SeriesMetadata } from "../../lib/chartConstants";

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
          status: current.status === "invalid" ? "invalid" : "valid",
          reason: typeof current.reason === "string" ? current.reason : null,
        } satisfies NonNullable<BuildCsvOptions["metadata"]>[number],
      ];
    });
    const csvMetadataRows: NonNullable<BuildCsvOptions["metadata"]> = csvMetadata.map(
      ({ key, label, unit, source, valueType, frequency, aggregation, status, reason }) => ({
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
      }),
    );
    const csv = withBom(
      buildCsv(data, keys, headers, {
        metadata: [...csvMetadataRows, ...rowMetadata],
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
