"use client";

import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import styles from "./CpiChart.module.css";
import {
  CTI_ADJUSTED_PUBLIC_KEYS,
  CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTORS,
} from "../../lib/chartConstants";
import {
  ChartDataContract,
  normalizePublicChartData,
  type PublicChartRow,
} from "./ChartDataContract";
import { TimeSeriesXAxis } from "./charts/TimeSeriesXAxis";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useChartTooltipController } from "./charts/useChartTooltipProps";
import { buildCsv, toFileName, withBom } from "../../lib/csvExport";
import { getMeasurementNote, type SeriesMeasurement } from "../../types/chart";
import type { CtiAdjustedPublicMeasurements } from "../../lib/ctiAdjustedPublicProjection";

export type CtiAdjustedDisplayRow = Record<string, unknown> & {
  年: number;
  年月: string;
  label: string;
  measurements: CtiAdjustedPublicMeasurements;
};

interface CtiAdjustedSeriesSectionProps {
  data: CtiAdjustedDisplayRow[];
}

const measurementTypeLabel = (measurement?: SeriesMeasurement): string => {
  if (
    !measurement ||
    measurement.seriesType === "unavailable" ||
    measurement.status === "unavailable" ||
    measurement.status === "invalid"
  ) {
    return "利用不可";
  }
  if (measurement.seriesType === "official_adjusted" || measurement.official === true) {
    return "公式";
  }
  if (measurement.seriesType === "estimated_adjusted") {
    return "推計";
  }
  return "利用不可";
};

/** Public Plan39 annual series: one measurement contract for every surface. */
export function CtiAdjustedSeriesSection({ data }: CtiAdjustedSeriesSectionProps) {
  const { isMobile, isTouch, chartColors } = useChartTheme();
  const chartTooltip = useChartTooltipController({ suppressed: false, isTouch });
  const displayData = data.map((row) => {
    const normalized = { ...row };
    for (const key of CTI_ADJUSTED_PUBLIC_KEYS) {
      const measurement = row.measurements[key];
      const invalid =
        !measurement ||
        measurement.seriesType === "unavailable" ||
        measurement.status === "unavailable" ||
        measurement.status === "invalid" ||
        typeof measurement.value !== "number" ||
        !Number.isFinite(measurement.value);
      normalized[key] = invalid ? null : measurement.value;
    }
    return normalized;
  });
  const descriptors = CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTORS.map((descriptor) => {
    const rowMeasurement = displayData[0]?.measurements?.[descriptor.key];
    return rowMeasurement && typeof rowMeasurement === "object"
      ? { ...descriptor, ...rowMeasurement, color: descriptor.color, order: descriptor.order }
      : descriptor;
  });
  const officialYears = data.flatMap((row) =>
    CTI_ADJUSTED_PUBLIC_KEYS.some((key) => {
      const measurement = row.measurements[key];
      return measurement?.seriesType === "official_adjusted" || measurement?.official === true;
    })
      ? [row.年]
      : [],
  );
  const firstOfficialYear = officialYears.length > 0 ? Math.min(...officialYears) : null;
  const tooltip = chartTooltip.bind("section-cti-adjusted", {
    dataLength: data.length,
    seriesMeta: descriptors,
    allowedKeys: CTI_ADJUSTED_PUBLIC_KEYS,
  });
  const publicData = normalizePublicChartData(displayData, CTI_ADJUSTED_PUBLIC_KEYS);
  const timeSeriesData: Array<PublicChartRow & { 年月: string }> = publicData.map((row, index) => ({
    ...row,
    年月: typeof row.年月 === "string" ? row.年月 : (data[index]?.年月 ?? String(row.label ?? "")),
  }));
  const exportCsv = () => {
    const csv = withBom(
      buildCsv(
        publicData,
        CTI_ADJUSTED_PUBLIC_KEYS,
        descriptors.map((descriptor) => descriptor.label),
        {
          metadata: descriptors,
        },
      ),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = toFileName("CTIミクロ調整系列");
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section
        id="section-cti-adjusted"
        className={styles.chartSection}
        style={{ scrollMarginTop: "5rem" }}
      >
        <div className={styles.chartTitleRow}>
          <h2 className={styles.chartTitle}>CTIミクロ調整系列（カテゴリ別）</h2>
        </div>
        <p className={styles.chartNote}>
          各年の値種別（推計・公式・利用不可）はデータの measurement に基づいて表示します。
        </p>
        <p className={styles.chartNote} data-testid="cti-adjusted-boundary-note">
          {firstOfficialYear === null
            ? "データ上、公式調整値はありません。"
            : `データ上の公式調整値は${firstOfficialYear}年から（推計から公式への境界）。`}
        </p>
        <ChartDataContract
          data={publicData}
          keys={CTI_ADJUSTED_PUBLIC_KEYS}
          labelKeys={["label"]}
          descriptors={descriptors}
        />
        <div
          className={styles.chartWrapper}
          onClick={tooltip.onClick}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseMove={tooltip.onMouseMove}
          onMouseLeave={tooltip.onMouseLeave}
          style={{ touchAction: "pan-y" }}
          role="img"
          aria-label="CTIミクロ調整系列（カテゴリ別）の年次グラフ"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={publicData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={chartColors.gridStroke}
              />
              <TimeSeriesXAxis data={timeSeriesData} chartColors={chartColors} tickKey="label" />
              <YAxis
                domain={["auto", "auto"]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.axisText }}
                dx={-10}
              />
              <Tooltip {...tooltip.tooltipProps} />
              {descriptors.map((descriptor) => (
                <Line
                  key={descriptor.key}
                  data-testid={`cti-adjusted-line-${descriptor.key}`}
                  dataKey={descriptor.key}
                  name={descriptor.label}
                  stroke={descriptor.color}
                  strokeWidth={isMobile ? 2 : 3}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className={styles.chartNote}>
          <a href="#data-table-section-cti-adjusted">データテーブルを表示 ▾</a>
        </p>
      </section>
      <div
        id="data-table-section-cti-adjusted"
        data-testid="data-table-section-cti-adjusted"
        className={styles.chartDataTable}
      >
        <h3>CTIミクロ調整系列（カテゴリ別）のデータテーブル</h3>
        <p className={styles.chartNote}>
          <a href="#section-cti-adjusted">▲ グラフへ戻る</a>
        </p>
        <div className={styles.chartDataTableActions}>
          <button type="button" onClick={exportCsv} className={styles.actionButton}>
            CSV
          </button>
        </div>
        <p className={styles.chartNote}>
          CSVには各系列の値種別（推計・公式・利用不可）が含まれます。
        </p>
        <table>
          <thead>
            <tr>
              <th>年</th>
              {descriptors.map((descriptor) => (
                <th key={descriptor.key}>{descriptor.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {publicData.map((row, rowIndex) => {
              return (
                <tr key={String(row.label ?? rowIndex)}>
                  <td>{String(row.label ?? "")}</td>
                  {CTI_ADJUSTED_PUBLIC_KEYS.map((key) => {
                    const measurement = (
                      row.measurements as Record<string, SeriesMeasurement> | undefined
                    )?.[key];
                    const note = measurement ? getMeasurementNote(measurement) : null;
                    return (
                      <td key={key} data-series-key={key}>
                        {typeof row[key] === "number" ? Number(row[key]).toFixed(2) : "-"}
                        {measurement && (
                          <small data-measurement-metadata={key}>
                            <br />
                            状態: {measurement.status}
                            <br />
                            値種別: {measurementTypeLabel(measurement)}
                            <br />
                            理由: {measurement.reason || "-"}
                            {note && (
                              <>
                                <br />
                                注記: {note}
                              </>
                            )}
                          </small>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
