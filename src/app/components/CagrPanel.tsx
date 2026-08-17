import React, { useState } from "react";
import styles from "./CpiChart.module.css";
import { MIN_DISPLAY_YEAR } from "../../lib/chartConstants";
import { BottomSheet } from "./BottomSheet";

interface CagrPanelProps {
  sectionId?: string;
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
    sectionId,
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

    return (
      <div id={sectionId} className={styles.cagrSection} style={{ scrollMarginTop: "5rem" }}>
        <h2 className={styles.chartTitle}>年率上昇率（CAGR）</h2>
        <div className={styles.cagrContainer}>
          <div className={styles.cagrControls}>
            <button
              type="button"
              className={styles.cagrRangeButton}
              onClick={() => setSheetOpen(true)}
              aria-label={`CAGRの期間・評価月を変更（現在: ${cagrStartYear}年${String(cagrMonth).padStart(2, "0")}月から${cagrEndYear}年${String(cagrMonth).padStart(2, "0")}月）`}
            >
              {formatCagrRange(cagrStartYear, cagrEndYear, cagrMonth)} ▾
            </button>
            <button
              onClick={calculateCAGR}
              className={styles.calculateButton}
              disabled={cagrStartYear === cagrEndYear}
            >
              計算する
            </button>
          </div>

          {cagrError && (
            <div className={styles.cagrError}>
              <p className={styles.cagrErrorText}>{cagrError}</p>
            </div>
          )}

          {cagrResult !== null && (
            <div className={styles.cagrResult}>
              <p className={styles.cagrResultLabel}>年率上昇率（CAGR）:</p>
              <p className={styles.cagrResultValue}>{(cagrResult * 100).toFixed(2)}%</p>
              <p className={styles.cagrResultDetail}>
                {formatCagrRange(cagrStartYear, cagrEndYear, cagrMonth)}
              </p>
            </div>
          )}
        </div>
        <p className={styles.cagrNote}>※凡例で選択した費目の合計を基準にCAGRを算出</p>

        <BottomSheet
          open={sheetOpen}
          title="CAGRの期間・評価月"
          onClose={() => setSheetOpen(false)}
        >
          <div className={styles.cagrSheetControls}>
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
        </BottomSheet>
      </div>
    );
  },
);

CagrPanel.displayName = "CagrPanel";
