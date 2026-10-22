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
  // When the source has no parseable years (including an empty dataset), keep
  // the controlled selects usable by exposing the current normalized range.
  const hasAvailableYears = allYears.length > 0;
  const selectableYears = hasAvailableYears
    ? allYears
    : [...new Set([MIN_DISPLAY_YEAR, startYear, endYear])].sort((a, b) => a - b);

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
            {selectableYears.map((year) => (
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
            {selectableYears.map((year) => (
              <option key={year} value={year} disabled={year < startYear}>
                {year}年
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.maxRangeButton}
            onClick={() => {
              // Available-year endpoints exist when present; the fallback list always contains MIN_DISPLAY_YEAR.
              const minYear = hasAvailableYears ? selectableYears[0]! : MIN_DISPLAY_YEAR;
              const maxYear = hasAvailableYears ? selectableYears.at(-1)! : MIN_DISPLAY_YEAR;
              setStartYear(minYear);
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
