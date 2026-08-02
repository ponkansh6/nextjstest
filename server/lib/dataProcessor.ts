import { compareYearMonth } from "@/lib/yearMonth";
import { trailingMovingAverage } from "./math/movingAverage";

/**
 * Population data processing: calculates population indices and moving averages.
 */
export function processPopulationData(
  rows: string[][],
  headerIndex: number,
  yearCol: number,
  separateYearCol: number,
  monthCol: number,
  totalCol: number,
): Map<string, { total: number; index: number; ma: number }> {
  const map = new Map<string, { total: number; index: number; ma: number }>();
  let currentYear = 0;
  for (let i = headerIndex + 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const yearCell = row[yearCol] || row[separateYearCol] || row[0];
    const yearStr = typeof yearCell === "string" ? yearCell.trim() : "";
    if (yearStr) {
      const yearMatch = yearStr.match(/(\d{4})|(\d+)年/);
      if (yearMatch) {
        if (yearMatch[1]) currentYear = parseInt(yearMatch[1], 10);
        else if (yearMatch[2]) {
          const eraYear = parseInt(yearMatch[2], 10);
          if (yearStr.includes("令和")) currentYear = 2018 + eraYear;
          else if (yearStr.includes("平成")) currentYear = 1988 + eraYear;
          else if (yearStr.includes("昭和")) currentYear = 1925 + eraYear;
          else currentYear = eraYear;
        }
      }
    }
    if (currentYear < 2004) continue;
    const monthCell = row[monthCol] ?? row[1];
    const monthStr = typeof monthCell === "string" ? monthCell.trim() : "";
    const monthMatch = monthStr.match(/(\d+)月/);
    if (!monthMatch) continue;
    const month = parseInt(monthMatch[1], 10);
    const popCell = row[totalCol] ?? row[4] ?? row[5];
    const popStr = typeof popCell === "string" ? popCell.trim().replace(/,/g, "") : "";
    if (!popStr || popStr === "-" || popStr === "…") continue;
    const pop = parseFloat(popStr);
    if (isNaN(pop)) continue;
    const ym = `${currentYear}年${month}月`;
    map.set(ym, { index: 0, ma: 0, total: pop * 10000 });
  }

  const year2020 = [...map.entries()]
    .filter(([_]) => _.startsWith("2020年"))
    .map(([, data]) => data.total);
  if (year2020.length > 0) {
    const avg2020 = year2020.reduce((a, b) => a + b, 0) / year2020.length;
    const indexFactor = avg2020 > 0 ? 100 / avg2020 : 1;
    const entries = [...map.entries()];
    entries.sort((a, b) => compareYearMonth(a[0], b[0]));
    entries.forEach(([, data]) => {
      data.index = data.total * indexFactor;
    });
    const indexValues = entries.map(([, data]) => data.index);
    const maValues = trailingMovingAverage(indexValues, 12);
    entries.forEach((_entry, index) => {
      _entry[1].ma = maValues[index];
    });
  }
  return map;
}
