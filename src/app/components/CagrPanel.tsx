import React, { useState } from "react";
import styles from "./CpiChart.module.css";
import { MIN_DISPLAY_YEAR } from "../../lib/chartConstants";
import { BottomSheet } from "./BottomSheet";

interface CagrPanelProps {
  allYears: number[];
  cagrStartYear: number;
  cagrEndYear: number;
  cagrMonth: number;
  cagrResult: number | null;
  cagrError?: string | null;
  setCagrStartYear: (year: number) => void;
  setCagrEndYear: (year: number) => void;
  setCagrMonth: (month: number) => void;
  calculateCAGR: () => void;
}

const formatCagrRange = (startYear: number, endYear: number, month: number) => {
  const mm = String(month).padStart(2, "0");
  return `${startYear}年${mm}月 → ${endYear}年${mm}月`;
};

export const CagrPanel = React.memo<CagrPanelProps>(
  ({
    allYears,
    cagrStartYear,
    cagrEndYear,
    cagrMonth,
    cagrResult,
    cagrError,
    setCagrStartYear,
    setCagrEndYear,
    setCagrMonth,
    calculateCAGR,
  }) => {
    const [sheetOpen, setSheetOpen] = useState(false);
    const displayYears = allYears.filter((y) => y >= MIN_DISPLAY_YEAR);
    const mm = String(cagrMonth).padStart(2, "0");

    return (
      <>
        <p className={styles.chartNote}>
          <button
            type="button"
            className={styles.cagrLink}
            onClick={() => setSheetOpen(true)}
            aria-label={`年率上昇率（CAGR）を計算（現在: ${cagrStartYear}年${mm}月から${cagrEndYear}年${mm}月）`}
          >
            年率上昇率（CAGR）を計算 ▾
          </button>
        </p>

        <BottomSheet
          compact
          open={sheetOpen}
          title="年率上昇率（CAGR）"
          onClose={() => setSheetOpen(false)}
        >
          <div className={styles.cagrSheetRow}>
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
          </div>

          <button
            className={styles.calculateButton}
            onClick={calculateCAGR}
            disabled={cagrStartYear === cagrEndYear}
          >
            計算する
          </button>

          {cagrError && (
            <div className={styles.cagrError}>
              <p className={styles.cagrErrorText}>{cagrError}</p>
            </div>
          )}

          {cagrResult !== null && (
            <div className={styles.cagrResult}>
              <p className={styles.cagrResultValue}>{(cagrResult * 100).toFixed(2)}%</p>
              <p className={styles.cagrResultDetail}>
                {formatCagrRange(cagrStartYear, cagrEndYear, cagrMonth)}
              </p>
            </div>
          )}

          <p className={styles.cagrSheetNote}>※凡例で選択した費目の合計を基準に算出</p>
        </BottomSheet>
      </>
    );
  },
);

CagrPanel.displayName = "CagrPanel";
