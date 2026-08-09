import styles from "./CpiChart.module.css";

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
  const minYear = allYears.length > 0 ? allYears[0] : 2020;
  const maxYear = allYears.length > 0 ? allYears[allYears.length - 1] : 2025;

  return (
    <div className={styles.filterContainer}>
      <div className={styles.presetChips}>
        <button
          type="button"
          className={styles.presetChip}
          onClick={() => {
            setStartYear(Math.max(minYear, maxYear - 10));
            setEndYear(maxYear);
          }}
        >
          過去10年
        </button>
        <button
          type="button"
          className={styles.presetChip}
          onClick={() => {
            setStartYear(Math.max(minYear, maxYear - 20));
            setEndYear(maxYear);
          }}
        >
          過去20年
        </button>
        <button
          type="button"
          className={styles.presetChip}
          onClick={() => {
            setStartYear(Math.max(minYear, 2020));
            setEndYear(maxYear);
          }}
        >
          2020年〜
        </button>
        <button
          type="button"
          className={styles.presetChip}
          onClick={() => {
            setStartYear(minYear);
            setEndYear(maxYear);
          }}
        >
          全期間
        </button>
      </div>
      <div style={{ display: "flex", gap: "2rem", width: "100%", flexWrap: "wrap" }}>
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
        <div className={styles.filterItem}>
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
        </div>
      </div>
    </div>
  );
};
