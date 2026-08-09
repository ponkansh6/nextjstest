/**
 * チャートデータの CSV 化（P6-6 エクスポート）。
 *
 * DOM に触れない純関数として切り出し、ダウンロード処理（Blob / a[download]）は
 * 呼び出し側のコンポーネントに置く。こうすると CSV の中身だけを単体テストできる。
 */

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

  const headerRow = [labelHeader, ...(headers ?? keys)].map(escapeCsvCell).join(",");

  const bodyRows = rows.map((row) => {
    const labelKey = labelKeys.find((k) => row[k] !== undefined && row[k] !== null);
    const label = labelKey ? row[labelKey] : "";
    const cells = keys.map((k) => {
      const v = row[k];
      return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "";
    });
    return [escapeCsvCell(label), ...cells].join(",");
  });

  return [headerRow, ...bodyRows].join("\n");
};

/** Excel が UTF-8 と判定できるよう BOM を付ける。 */
export const withBom = (csv: string): string => `﻿${csv}`;

/** ファイル名に使えない文字を落とす。 */
export const toFileName = (title: string): string =>
  `${title.replace(/[\\/:*?"<>|\s]+/g, "_")}.csv`;
