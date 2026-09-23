/**
 * チャートデータの CSV 化（P6-6 エクスポート）。
 *
 * DOM に触れない純関数として切り出し、ダウンロード処理（Blob / a[download]）は
 * 呼び出し側のコンポーネントに置く。こうすると CSV の中身だけを単体テストできる。
 */

import { createMissingSeriesMeasurement } from "../types/chart";

/** CSV の 1 セルをエスケープする。カンマ・引用符・改行を含む場合のみ引用符で囲む。 */
export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface BuildCsvOptions {
  /** 行の見出し（年月 / label）に使うキーの候補。先に見つかったものを使う。 */
  labelKeys?: string[];
  /** 見出し列のヘッダ名 */
  labelHeader?: string;
  /** 数値の小数桁数 */
  digits?: number;
  /** Include Plan39 provenance columns even when metadata descriptors omit them. */
  includeProvenanceMetadata?: boolean;
  /** Optional machine-readable metadata columns for measurement-aware exports. */
  metadata?: ReadonlyArray<{
    key: string;
    label?: string;
    valueType?: "raw" | "comparison";
    value?: number | null;
    unit: string;
    source: string;
    frequency?: "monthly" | "quarterly" | "annual";
    aggregation?: string;
    status: "valid" | "invalid" | "unavailable" | "available";
    reason: string | null;
    seriesType?: "estimated_adjusted" | "official_adjusted" | "unavailable";
    official?: boolean;
    annualAnchorType?: "estimated" | "official";
    quarterlyDerived?: boolean;
    model?: "v2-bottom-up";
    estimateVersion?: "plan39-v2";
    sourceId?: string;
    statInfId?: string;
    householdScope?: string;
    seasonalitySourceId?: string;
    targetSourceId?: string;
    targetHouseholdScope?: string;
    bridgeAppliedRange?: { startYear: number; endYear: number };
    bridgeCoefficient?: number;
  }>;
}

type CsvMeasurement = NonNullable<BuildCsvOptions["metadata"]>[number];

function rowMeasurementValue(
  row: Record<string, unknown>,
  key: string,
): (Partial<CsvMeasurement> & Pick<CsvMeasurement, "key">) | undefined {
  const measurements = row.measurements;
  const measurement =
    measurements && typeof measurements === "object"
      ? (measurements as Record<string, unknown>)[key]
      : undefined;
  return measurement && typeof measurement === "object"
    ? (measurement as Partial<CsvMeasurement> & Pick<CsvMeasurement, "key">)
    : undefined;
}

function rowMeasurement(
  row: Record<string, unknown>,
  metadata: CsvMeasurement,
): Partial<CsvMeasurement> & Pick<CsvMeasurement, "key"> {
  const measurement = rowMeasurementValue(row, metadata.key);
  if (!measurement) {
    return createMissingSeriesMeasurement(metadata.key, metadata);
  }
  return measurement;
}

/**
 * チャート行データを CSV 文字列に変換する。
 *
 * @param rows チャートに渡している行データ
 * @param keys 出力する系列キー（凡例ラベルではなく生キー）
 * @param headers keys に対応する表示名。省略時は keys をそのまま使う。
 */
export const buildCsv = (
  rows: Record<string, unknown>[],
  keys: string[],
  headers?: string[],
  options: BuildCsvOptions = {},
): string => {
  const { labelKeys = ["年月", "label"], labelHeader = "年月", digits = 2 } = options;

  const metadata =
    options.metadata ??
    keys.flatMap((key) => {
      const row = rows.find((candidate) => {
        const measurements = candidate.measurements;
        return measurements && typeof measurements === "object" && key in measurements;
      });
      const measurement = row?.measurements;
      const entry =
        measurement && typeof measurement === "object"
          ? (measurement as Record<string, unknown>)[key]
          : undefined;
      return entry && typeof entry === "object" ? [entry as CsvMeasurement] : [];
    });
  const includeProvenanceMetadata =
    options.includeProvenanceMetadata ??
    (Boolean(options.metadata) ||
      rows.some((row) =>
        keys.some((key) => {
          const measurement = rowMeasurementValue(row, key);
          return measurement?.seriesType !== undefined || measurement?.official !== undefined;
        }),
      ));
  const includeDerivedAxisMetadata =
    metadata.some(
      ({ annualAnchorType, quarterlyDerived }) =>
        annualAnchorType !== undefined || quarterlyDerived !== undefined,
    ) ||
    rows.some((row) =>
      keys.some((key) => {
        const measurement = rowMeasurementValue(row, key);
        return (
          measurement?.annualAnchorType !== undefined || measurement?.quarterlyDerived !== undefined
        );
      }),
    );
  const hasBridgeMetadata = (measurement: Partial<CsvMeasurement> | undefined) =>
    measurement?.sourceId !== undefined ||
    measurement?.statInfId !== undefined ||
    measurement?.seasonalitySourceId !== undefined ||
    measurement?.targetSourceId !== undefined ||
    measurement?.bridgeAppliedRange !== undefined ||
    measurement?.bridgeCoefficient !== undefined;
  const includeBridgeMetadata =
    metadata.some(hasBridgeMetadata) ||
    rows.some((row) => keys.some((key) => hasBridgeMetadata(rowMeasurementValue(row, key))));
  const metadataHeaders = metadata.flatMap(({ key }) => [
    `${key}__label`,
    `${key}__valueType`,
    ...(includeProvenanceMetadata
      ? [
          `${key}__seriesType`,
          `${key}__official`,
          ...(includeDerivedAxisMetadata
            ? [`${key}__annualAnchorType`, `${key}__quarterlyDerived`]
            : []),
        ]
      : []),
    `${key}__value`,
    `${key}__unit`,
    `${key}__source`,
    `${key}__frequency`,
    `${key}__aggregation`,
    `${key}__status`,
    `${key}__reason`,
    ...(includeBridgeMetadata
      ? [
          `${key}__sourceId`,
          `${key}__statInfId`,
          `${key}__householdScope`,
          `${key}__seasonalitySourceId`,
          `${key}__targetSourceId`,
          `${key}__targetHouseholdScope`,
          `${key}__bridgeAppliedRange`,
          `${key}__bridgeCoefficient`,
        ]
      : []),
  ]);
  const headerRow = [labelHeader, ...(headers ?? keys), ...metadataHeaders]
    .map(escapeCsvCell)
    .join(",");

  const bodyRows = rows.map((row) => {
    const labelKey = labelKeys.find((k) => row[k] !== undefined && row[k] !== null);
    const label = labelKey ? row[labelKey] : "";
    const cells = keys.map((k) => {
      const metadataEntry = metadata.find((entry) => entry.key === k);
      const actualMeasurement = metadataEntry ? rowMeasurementValue(row, k) : undefined;
      const unavailable =
        actualMeasurement?.seriesType === "unavailable" ||
        actualMeasurement?.status === "unavailable" ||
        actualMeasurement?.value === null;
      const v = unavailable ? null : row[k];
      return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "";
    });
    const metadataCells = metadata.flatMap((entry) => {
      const measurement = rowMeasurement(row, entry);
      const {
        label,
        valueType,
        seriesType,
        official,
        annualAnchorType,
        quarterlyDerived,
        value,
        unit,
        source,
        frequency,
        aggregation,
        status,
        reason,
        sourceId,
        statInfId,
        householdScope,
        seasonalitySourceId,
        targetSourceId,
        targetHouseholdScope,
        bridgeAppliedRange,
        bridgeCoefficient,
      } = measurement;
      const unavailable =
        measurement.seriesType === "unavailable" || measurement.status === "unavailable";
      return [
        label ?? "",
        valueType ?? "",
        ...(includeProvenanceMetadata
          ? [seriesType ?? "", official === undefined ? "" : String(official)].concat(
              includeDerivedAxisMetadata
                ? [
                    annualAnchorType ?? "",
                    quarterlyDerived === undefined ? "" : String(quarterlyDerived),
                  ]
                : [],
            )
          : []),
        unavailable ? "" : (value ?? ""),
        unit ?? "",
        source ?? "",
        frequency ?? "",
        aggregation ?? "",
        status ?? "",
        reason ?? "",
        ...(includeBridgeMetadata
          ? [
              sourceId ?? "",
              statInfId ?? "",
              householdScope ?? "",
              seasonalitySourceId ?? "",
              targetSourceId ?? "",
              targetHouseholdScope ?? "",
              bridgeAppliedRange
                ? `${bridgeAppliedRange.startYear}-${bridgeAppliedRange.endYear}`
                : "",
              bridgeCoefficient ?? "",
            ]
          : []),
      ].map(escapeCsvCell);
    });
    return [escapeCsvCell(label), ...cells, ...metadataCells].join(",");
  });

  // RFC 4180 records are CRLF terminated, including the final record.
  return `${[headerRow, ...bodyRows].join("\r\n")}\r\n`;
};

/** Excel が UTF-8 と判定できるよう BOM を付ける。 */
export const withBom = (csv: string): string => `﻿${csv}`;

/** ファイル名に使えない文字を落とす。 */
export const toFileName = (title: string): string =>
  `${title.replace(/[\\/:*?"<>|\s]+/g, "_")}.csv`;
