import React from "react";
import styles from "./CpiChart.module.css";

const MIN_DISPLAY_YEAR = 2005;

interface CagrPanelProps {
  allYears: number[];
  cagrStartYear: number;
  cagrEndYear: number;
  cagrMonth: number;
  cagrResult: number | null;
  setCagrStartYear: (year: number) => void;
  setCagrEndYear: (year: number) => void;
  setCagrMonth: (month: number) => void;
  calculateCAGR: () => void;
}

export const CagrPanel = React.memo<CagrPanelProps>(
  ({
    allYears,
    cagrStartYear,
    cagrEndYear,
    cagrMonth,
    cagrResult,
    setCagrStartYear,
    setCagrEndYear,
    setCagrMonth,
    calculateCAGR,
  }) => {
    const displayYears = allYears.filter((y) => y >= MIN_DISPLAY_YEAR);

    return (
      <div className={styles.cagrSection}>
        <h2 className={styles.chartTitle}>年率上昇率（CAGR）</h2>
        <div className={styles.cagrContainer}>
          <div className={styles.cagrControls}>
            <div className={styles.cagrItem}>
              <label htmlFor="cagrStartYear">開始年:</label>
              <select
                id="cagrStartYear"
                value={cagrStartYear}
                onChange={(e) => setCagrStartYear(parseInt(e.target.value, 10))}
                className={styles.select}
              >
                {displayYears.map((year) => (
                  <option key={year} value={year} disabled={year > cagrEndYear}>
                    {year}年
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.cagrItem}>
              <label htmlFor="cagrEndYear">終了年:</label>
              <select
                id="cagrEndYear"
                value={cagrEndYear}
                onChange={(e) => setCagrEndYear(parseInt(e.target.value, 10))}
                className={styles.select}
              >
                {displayYears.map((year) => (
                  <option key={year} value={year} disabled={year < cagrStartYear}>
                    {year}年
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.cagrItem}>
              <label htmlFor="cagrMonth">評価月:</label>
              <select
                id="cagrMonth"
                value={cagrMonth}
                onChange={(e) => setCagrMonth(parseInt(e.target.value, 10))}
                className={styles.select}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {String(month).padStart(2, "0")}月
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={calculateCAGR}
              className={styles.calculateButton}
              disabled={cagrStartYear === cagrEndYear}
            >
              Calculate
            </button>
          </div>

          {cagrResult !== null && (
            <div className={styles.cagrResult}>
              <p className={styles.cagrResultLabel}>年率上昇率（CAGR）:</p>
              <p className={styles.cagrResultValue}>{(cagrResult * 100).toFixed(2)}%</p>
              <p className={styles.cagrResultDetail}>
                {cagrStartYear}年{String(cagrMonth).padStart(2, "0")}月 → {cagrEndYear}年
                {String(cagrMonth).padStart(2, "0")}月
              </p>
            </div>
          )}
        </div>
        <p className={styles.cagrNote}>※凡例で選択した費目の合計を基準にCAGRを算出</p>
      </div>
    );
  },
);

CagrPanel.displayName = "CagrPanel";
