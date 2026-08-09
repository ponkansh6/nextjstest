"use client";

import React from "react";
import styles from "./CpiChart.module.css";
import { buildCsv, toFileName, withBom } from "../../lib/csvExport";

interface ChartExportButtonProps {
  /** ダウンロードファイル名の元になるグラフ名 */
  title: string;
  /** 表示中のフィルタ済みデータ（画面に見えているものと一致させる） */
  data: Record<string, unknown>[];
  /** 出力する系列キー */
  keys: string[];
  /** keys に対応する表示名（凡例ラベル） */
  headers?: string[];
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
}) => {
  const handleExport = () => {
    const csv = withBom(buildCsv(data, keys, headers));
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
