import React from "react";
import styles from "./CpiChart.module.css";
import { ChartExportButton } from "./ChartExportButton";
import { normalizePublicChartData } from "./ChartDataContract";
import { SUPPORT_SERIES_KEY_NOMINAL, type SeriesMetadata } from "../../lib/chartConstants";
import type { SeriesMeasurement } from "../../types/chart";

export interface DataTableSpec {
  /** ジャンプ元グラフの sectionId(例: "section-cpi-major") */
  chartSectionId: string;
  /** グラフタイトル(見出し・CSVファイル名に使用) */
  title: string;
  data: Record<string, unknown>[];
  keys: string[];
  headers?: string[];
  metadata?: readonly SeriesMetadata[];
}

interface DataTablesSectionProps {
  tables: DataTableSpec[];
}

export function DataTablesSection({ tables }: DataTablesSectionProps) {
  const getMeasurement = (
    row: Record<string, unknown>,
    key: string,
    metadata?: readonly SeriesMetadata[],
  ) => {
    const measurements = row.measurements;
    const rowMeasurement =
      measurements && typeof measurements === "object"
        ? (measurements as Record<string, unknown>)[key]
        : undefined;
    if (rowMeasurement && typeof rowMeasurement === "object")
      return rowMeasurement as SeriesMeasurement;
    return key === SUPPORT_SERIES_KEY_NOMINAL && metadata?.some((entry) => entry.key === key)
      ? ({
          key,
          label: key,
          unit: "",
          source: "",
          valueType: "raw",
          value: null,
          status: "invalid",
          reason: "unavailable",
          frequency: "quarterly",
          aggregation: "",
        } satisfies SeriesMeasurement)
      : undefined;
  };

  return (
    <div
      id="section-data-tables"
      className={styles.chartSection}
      style={{ scrollMarginTop: "5rem" }}
    >
      <h2 className={styles.chartTitle}>データテーブル</h2>
      {tables.map((t) => (
        <details
          key={t.chartSectionId}
          id={`data-table-${t.chartSectionId}`}
          data-testid={`data-table-${t.chartSectionId}`}
          className={styles.chartDataTable}
        >
          <summary data-testid={`data-table-toggle-${t.chartSectionId}`}>
            {t.title} のデータテーブルを表示
          </summary>
          <p className={styles.chartNote}>
            <a href={`#${t.chartSectionId}`}>▲ グラフへ戻る</a>
          </p>
          <div className={styles.chartDataTableActions}>
            <ChartExportButton
              title={t.title}
              data={normalizePublicChartData(t.data, t.keys)}
              keys={t.keys}
              headers={t.headers}
              metadata={t.metadata}
            />
          </div>
          <table>
            <thead>
              <tr>
                <th>年月</th>
                {t.keys.map((k, i) => (
                  <th key={k}>{t.headers?.[i] ?? k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizePublicChartData(t.data, t.keys).map((d, rowIndex) => {
                const rowLabel = String(d["年月"] ?? d["label"] ?? "");
                return (
                  <tr key={rowLabel || rowIndex}>
                    <td>{rowLabel}</td>
                    {t.keys.map((k) => (
                      <td key={k} data-series-key={k}>
                        {typeof d[k] === "number" ? (d[k] as number).toFixed(2) : "-"}
                        {(() => {
                          const measurement = getMeasurement(d, k, t.metadata);
                          if (!measurement) return null;
                          return (
                            <small data-measurement-metadata={k}>
                              <span data-measurement-value-type={measurement.valueType} />
                              <br />
                              単位: {measurement.unit || "-"}
                              <br />
                              出典: {measurement.source || "-"}
                              <br />
                              頻度: {measurement.frequency || "-"}
                              <br />
                              集計: {measurement.aggregation || "-"}
                              <br />
                              状態: {measurement.status}
                              <br />
                              理由: {measurement.reason || "-"}
                            </small>
                          );
                        })()}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
