import styles from "./CpiChart.module.css";
import { MIN_DISPLAY_YEAR } from "@/lib/chartConstants";

interface ChartFiltersProps {
  allYears: number[];
  startYear: number;
  endYear: number;
  setStartYear: (year: number) => void;
  setEndYear: (year: number) => void;
}

export const ChartFilters = ({
  allYears,
  startYear,
  endYear,
  setStartYear,
  setEndYear,
}: ChartFiltersProps) => {
  return (
    <div className={styles.filterContainer}>
      <div className={styles.filterRow}>
        <div className={styles.filterItem}>
          <label htmlFor="startYear">開始年:</label>
          <select
            id="startYear"
            value={startYear}
            onChange={(e) => setStartYear(parseInt(e.target.value, 10))}
            className={styles.select}
          >
            {allYears.map((year) => (
              <option key={year} value={year} disabled={year > endYear}>
                {year}年
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.filterItem} ${styles.endYearFilterItem}`}>
          <label htmlFor="endYear">終了年:</label>
          <select
            id="endYear"
            value={endYear}
            onChange={(e) => setEndYear(parseInt(e.target.value, 10))}
            className={styles.select}
          >
            {allYears.map((year) => (
              <option key={year} value={year} disabled={year < startYear}>
                {year}年
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.maxRangeButton}
            onClick={() => {
              const maxYear = allYears[allYears.length - 1] ?? MIN_DISPLAY_YEAR;
              setStartYear(MIN_DISPLAY_YEAR);
              setEndYear(maxYear);
            }}
          >
            最大期間
          </button>
        </div>
      </div>
    </div>
  );
};
