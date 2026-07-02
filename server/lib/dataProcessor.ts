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
    entries.sort((a, b) => {
      const ma = a[0].match(/^(\d{4})年(\d{1,2})月/);
      const mb = b[0].match(/^(\d{4})年(\d{1,2})月/);
      if (!ma || !mb) return 0;
      const ay = parseInt(ma[1], 10);
      const am = parseInt(ma[2], 10);
      const by = parseInt(mb[1], 10);
      const bm = parseInt(mb[2], 10);
      return ay !== by ? ay - by : am - bm;
    });
    entries.forEach(([, data]) => {
      data.index = data.total * indexFactor;
    });
    entries.forEach((_entry, index) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, index - 11); i <= index; i++) {
        sum += entries[i][1].index;
        count++;
      }
      _entry[1].ma = count > 0 ? sum / count : 0;
    });
  }
  return map;
}

// ... (existing processing code)
