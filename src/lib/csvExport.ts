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
    seriesType?: "estimated_adjusted" | "official_adjusted" | "derived_adjusted" | "unavailable";
    official?: boolean;
    annualAnchorType?: "estimated" | "official";
    quarterlyDerived?: boolean;
    model?: "v2-bottom-up";
    estimateVersion?: "plan39-v2";
    inputFingerprint?: string;
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
    baseYear?: number | null;
    cpiSeries?: string;
    cpiPeriod?: string;
    cpiAggregation?: string;
    nominalSource?: string;
    measurementNote?: string;
    monthlyProvenance?: {
      sourceId: string;
      householdScope: "二人以上の世帯" | "総世帯";
      seriesType: "historical_estimate" | "official_monthly_observed" | "unavailable";
      description: string;
    };
    ma12Provenance?: {
      windowStart: string;
      windowEnd: string;
      sources: string[];
      statuses: string[];
    };
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
  return {
    ...measurement,
    baseYear: measurement.baseYear ?? metadata.baseYear,
  };
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
  const includeInputFingerprintMetadata =
    metadata.some(({ inputFingerprint }) => inputFingerprint !== undefined) ||
    rows.some((row) =>
      keys.some((key) => {
        const measurement = rowMeasurementValue(row, key);
        return (
          measurement?.inputFingerprint !== undefined ||
          (measurement?.model === "v2-bottom-up" && measurement.estimateVersion === "plan39-v2")
        );
      }),
    );
  const includeModelMetadata =
    metadata.some(
      ({ model, estimateVersion }) => model !== undefined || estimateVersion !== undefined,
    ) ||
    rows.some((row) =>
      keys.some((key) => {
        const measurement = rowMeasurementValue(row, key);
        return measurement?.model !== undefined || measurement?.estimateVersion !== undefined;
      }),
    );
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
  const hasSourceArtifactMetadata = (measurement: Partial<CsvMeasurement> | undefined) =>
    measurement?.sourceWorkbook !== undefined ||
    measurement?.sourceSheet !== undefined ||
    measurement?.sourceColumn !== undefined ||
    measurement?.sourceRole !== undefined ||
    measurement?.sourceDerivedFromColumns !== undefined ||
    measurement?.canonicalSeries !== undefined;
  const includeSourceArtifactMetadata =
    metadata.some(hasSourceArtifactMetadata) ||
    rows.some((row) =>
      keys.some((key) => hasSourceArtifactMetadata(rowMeasurementValue(row, key))),
    );
  const includeCpiMetadata =
    metadata.some(({ cpiSeries, cpiPeriod, nominalSource }) =>
      [cpiSeries, cpiPeriod, nominalSource].some((value) => value !== undefined),
    ) ||
    rows.some((row) =>
      keys.some((key) => {
        const measurement = rowMeasurementValue(row, key);
        return (
          measurement?.cpiSeries !== undefined ||
          measurement?.cpiPeriod !== undefined ||
          measurement?.nominalSource !== undefined
        );
      }),
    );
  const includeBaseYearMetadata =
    metadata.some(({ baseYear }) => baseYear !== undefined) ||
    rows.some((row) => keys.some((key) => rowMeasurementValue(row, key)?.baseYear !== undefined));
  const hasMa12Provenance = (measurement: Partial<CsvMeasurement> | undefined) =>
    measurement?.monthlyProvenance !== undefined || measurement?.ma12Provenance !== undefined;
  const includeMa12Provenance =
    metadata.some(hasMa12Provenance) ||
    rows.some((row) => keys.some((key) => hasMa12Provenance(rowMeasurementValue(row, key))));
  const metadataHeaders = metadata.flatMap(({ key }) => [
    `${key}__label`,
    `${key}__valueType`,
    ...(includeProvenanceMetadata
      ? [
          `${key}__seriesType`,
          `${key}__official`,
          ...(includeModelMetadata ? [`${key}__model`, `${key}__estimateVersion`] : []),
          ...(includeInputFingerprintMetadata ? [`${key}__inputFingerprint`] : []),
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
    ...(includeSourceArtifactMetadata
      ? [
          `${key}__sourceWorkbook`,
          `${key}__sourceSheet`,
          `${key}__sourceColumn`,
          `${key}__sourceRole`,
          `${key}__sourceDerivedFromColumns`,
          `${key}__canonicalSeries`,
        ]
      : []),
    ...(includeBaseYearMetadata ? [`${key}__baseYear`] : []),
    ...(includeCpiMetadata
      ? [
          `${key}__cpiSeries`,
          `${key}__cpiPeriod`,
          `${key}__cpiAggregation`,
          `${key}__nominalSource`,
          `${key}__measurementNote`,
        ]
      : []),
    ...(includeMa12Provenance
      ? [
          `${key}__monthlySourceId`,
          `${key}__monthlyHouseholdScope`,
          `${key}__monthlySeriesType`,
          `${key}__monthlyDescription`,
          `${key}__ma12WindowStart`,
          `${key}__ma12WindowEnd`,
          `${key}__ma12Sources`,
          `${key}__ma12Statuses`,
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
        model,
        estimateVersion,
        inputFingerprint,
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
        sourceWorkbook,
        sourceSheet,
        sourceColumn,
        sourceRole,
        sourceDerivedFromColumns,
        canonicalSeries,
        seasonalitySourceId,
        targetSourceId,
        targetHouseholdScope,
        bridgeAppliedRange,
        bridgeCoefficient,
        baseYear,
        cpiSeries,
        cpiPeriod,
        cpiAggregation,
        nominalSource,
        measurementNote,
        monthlyProvenance,
        ma12Provenance,
      } = measurement;
      const unavailable =
        measurement.seriesType === "unavailable" || measurement.status === "unavailable";
      return [
        label ?? "",
        valueType ?? "",
        ...(includeProvenanceMetadata
          ? [seriesType ?? "", official === undefined ? "" : String(official)].concat(
              includeModelMetadata ? [model ?? "", estimateVersion ?? ""] : [],
              includeInputFingerprintMetadata ? [inputFingerprint ?? ""] : [],
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
        ...(includeSourceArtifactMetadata
          ? [
              sourceWorkbook ?? "",
              sourceSheet ?? "",
              sourceColumn ?? "",
              sourceRole ?? "",
              sourceDerivedFromColumns?.join(";") ?? "",
              canonicalSeries ?? "",
            ]
          : []),
        ...(includeBaseYearMetadata ? [baseYear ?? ""] : []),
        ...(includeCpiMetadata
          ? [
              cpiSeries ?? "",
              cpiPeriod ?? "",
              cpiAggregation ?? "",
              nominalSource ?? "",
              measurementNote ?? "",
            ]
          : []),
        ...(includeMa12Provenance
          ? [
              monthlyProvenance?.sourceId ?? "",
              monthlyProvenance?.householdScope ?? "",
              monthlyProvenance?.seriesType ?? "",
              monthlyProvenance?.description ?? "",
              ma12Provenance?.windowStart ?? "",
              ma12Provenance?.windowEnd ?? "",
              ma12Provenance?.sources.join(";") ?? "",
              ma12Provenance?.statuses.join(";") ?? "",
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
