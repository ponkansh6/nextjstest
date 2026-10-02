import React from "react";
import styles from "./CpiChart.module.css";
import { ChartExportButton } from "./ChartExportButton";
import { normalizePublicChartData } from "./ChartDataContract";
import { SUPPORT_SERIES_KEY_NOMINAL, type SeriesMetadata } from "../../lib/chartConstants";
import {
  createMissingSeriesMeasurement,
  getMeasurementNote,
  type SeriesMeasurement,
} from "../../types/chart";

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
    const descriptor = metadata?.find((entry) => entry.key === key);
    if (rowMeasurement && typeof rowMeasurement === "object") {
      const measurement = rowMeasurement as SeriesMeasurement;
      return {
        ...measurement,
        baseYear: measurement.baseYear ?? descriptor?.baseYear,
      };
    }
    return descriptor &&
      (key === SUPPORT_SERIES_KEY_NOMINAL ||
        descriptor.estimateVersion === "plan39-v2" ||
        key.startsWith("CTIミクロ調整系列（"))
      ? createMissingSeriesMeasurement(key, descriptor)
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
                        {(() => {
                          const measurement = getMeasurement(d, k, t.metadata);
                          return measurement?.reason === "outside_period"
                            ? "対象期間外"
                            : typeof d[k] === "number"
                              ? (d[k] as number).toFixed(2)
                              : "-";
                        })()}
                        {(() => {
                          const measurement = getMeasurement(d, k, t.metadata);
                          if (!measurement) return null;
                          return (
                            <small
                              data-measurement-metadata={k}
                              data-measurement-series-type={measurement.seriesType}
                              data-measurement-source-id={measurement.sourceId}
                              data-measurement-stat-inf-id={measurement.statInfId}
                              data-measurement-household-scope={measurement.householdScope}
                              data-measurement-source-workbook={measurement.sourceWorkbook}
                              data-measurement-source-sheet={measurement.sourceSheet}
                              data-measurement-source-column={measurement.sourceColumn}
                              data-measurement-source-role={measurement.sourceRole}
                              data-measurement-source-derived-from-columns={measurement.sourceDerivedFromColumns?.join(
                                ";",
                              )}
                              data-measurement-canonical-series={measurement.canonicalSeries}
                              data-measurement-model={measurement.model}
                              data-measurement-estimate-version={measurement.estimateVersion}
                              data-measurement-input-fingerprint={measurement.inputFingerprint}
                              data-measurement-seasonality-source-id={
                                measurement.seasonalitySourceId
                              }
                              data-measurement-target-source-id={measurement.targetSourceId}
                              data-measurement-target-household-scope={
                                measurement.targetHouseholdScope
                              }
                              data-measurement-bridge-applied-range={
                                measurement.bridgeAppliedRange
                                  ? `${measurement.bridgeAppliedRange.startYear}-${measurement.bridgeAppliedRange.endYear}`
                                  : undefined
                              }
                              data-measurement-bridge-coefficient={
                                measurement.bridgeCoefficient === undefined
                                  ? undefined
                                  : String(measurement.bridgeCoefficient)
                              }
                              data-measurement-official={
                                measurement.official === undefined
                                  ? undefined
                                  : String(measurement.official)
                              }
                              data-measurement-base-year={
                                measurement.baseYear === undefined
                                  ? undefined
                                  : String(measurement.baseYear)
                              }
                              data-measurement-monthly-source-id={
                                measurement.monthlyProvenance?.sourceId
                              }
                              data-measurement-monthly-household-scope={
                                measurement.monthlyProvenance?.householdScope
                              }
                              data-measurement-monthly-series-type={
                                measurement.monthlyProvenance?.seriesType
                              }
                              data-measurement-ma12-window-start={
                                measurement.ma12Provenance?.windowStart
                              }
                              data-measurement-ma12-window-end={
                                measurement.ma12Provenance?.windowEnd
                              }
                              data-measurement-ma12-sources={measurement.ma12Provenance?.sources.join(
                                ";",
                              )}
                              data-measurement-ma12-statuses={measurement.ma12Provenance?.statuses.join(
                                ";",
                              )}
                            >
                              <span data-measurement-value-type={measurement.valueType} />
                              {getMeasurementNote(measurement) && (
                                <>
                                  区分: {getMeasurementNote(measurement)}
                                  <br />
                                </>
                              )}
                              単位: {measurement.unit || "-"}
                              <br />
                              出典: {measurement.source || "-"}
                              {measurement.baseYear !== undefined && !measurement.cpiSeries && (
                                <>
                                  <br />
                                  基準年: {measurement.baseYear}年
                                </>
                              )}
                              {measurement.monthlyProvenance && (
                                <>
                                  <br />
                                  月次出典: {measurement.monthlyProvenance.sourceId}（
                                  {measurement.monthlyProvenance.householdScope}、
                                  {measurement.monthlyProvenance.seriesType}）
                                  <br />
                                  {measurement.monthlyProvenance.description}
                                </>
                              )}
                              {measurement.ma12Provenance && (
                                <>
                                  <br />
                                  12MA期間: {measurement.ma12Provenance.windowStart}〜
                                  {measurement.ma12Provenance.windowEnd}
                                  <br />
                                  期間内出典: {measurement.ma12Provenance.sources.join(", ")}
                                  <br />
                                  期間内区分: {measurement.ma12Provenance.statuses.join(", ")}
                                </>
                              )}
                              {measurement.cpiSeries && (
                                <>
                                  <br />
                                  CPI識別子: {measurement.statInfId ?? measurement.sourceId ?? "-"}
                                  <br />
                                  CPI系列: {measurement.cpiSeries}（{measurement.baseYear ?? "-"}
                                  年基準）
                                  <br />
                                  CPI期間: {measurement.cpiPeriod || "-"}
                                  <br />
                                  CPI集計: {measurement.cpiAggregation || "-"}
                                  <br />
                                  名目出典: {measurement.nominalSource || "-"}
                                </>
                              )}
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
