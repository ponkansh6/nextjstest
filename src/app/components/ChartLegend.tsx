import React from "react";
import styles from "./CpiChart.module.css";
import { getLegendLabel } from "../../lib/chartConstants";

interface LegendProps {
  title: string;
  keys: string[];
  colors: string[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
}

export const ChartLegend = ({ title, keys, colors, hiddenKeys, onToggle }: LegendProps) => (
  <div className={styles.legendContainer}>
    <div className={styles.legendSection}>
      <h3 className={styles.legendTitle}>{title}</h3>
      <div className={styles.legendItems}>
        {keys.map((key, index) => (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
            aria-pressed={!hiddenKeys.includes(key)}
          >
            <span className={styles.legendIcon} style={{ backgroundColor: colors[index] }} />
            <span className={styles.legendLabel}>{getLegendLabel(key)}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);
