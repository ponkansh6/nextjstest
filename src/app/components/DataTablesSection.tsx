import React from "react";
import styles from "./CpiChart.module.css";
import { ChartExportButton } from "./ChartExportButton";

export interface DataTableSpec {
  /** ジャンプ元グラフの sectionId(例: "section-cpi-major") */
  chartSectionId: string;
  /** グラフタイトル(見出し・CSVファイル名に使用) */
  title: string;
  data: Record<string, unknown>[];
  keys: string[];
  headers?: string[];
}

interface DataTablesSectionProps {
  tables: DataTableSpec[];
}

export function DataTablesSection({ tables }: DataTablesSectionProps) {
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
          className={styles.chartDataTable}
        >
          <summary>{t.title} のデータテーブルを表示</summary>
          <p className={styles.chartNote}>
            <a href={`#${t.chartSectionId}`}>▲ グラフへ戻る</a>
          </p>
          <div className={styles.chartDataTableActions}>
            <ChartExportButton title={t.title} data={t.data} keys={t.keys} headers={t.headers} />
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
              {t.data.slice(-12).map((d, rowIndex) => {
                const rowLabel = String(d["年月"] ?? d["label"] ?? "");
                return (
                  <tr key={rowLabel || rowIndex}>
                    <td>{rowLabel}</td>
                    {t.keys.map((k) => (
                      <td key={k}>
                        {typeof d[k] === "number" ? (d[k] as number).toFixed(2) : "-"}
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
