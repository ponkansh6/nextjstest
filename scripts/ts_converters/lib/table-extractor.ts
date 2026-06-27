import * as aq from "arquero";
import {
  detectDateInSeries,
  parseColumnHeaderToYM,
  normalizeYearMonth,
  ensureYM,
} from "./date-utils";

export function coerceHeader(data: any[][]): any[] {
  if (!data.length) return [];
  const firstRow = data[0].map((v) => String(v ?? "").trim());
  const nonNumeric = firstRow.filter((s) => !/\d/.test(s)).length;

  if (nonNumeric >= firstRow.length / 2) {
    const headers = firstRow;
    return data.slice(1).map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
  }

  return data.map((row) => {
    const obj: Record<string, any> = {};
    row.forEach((v, i) => (obj[`col_${i}`] = v));
    return obj;
  });
}

export function extractTable(rawData: any[][]): aq.Table {
  console.log("Raw data length:", rawData.length);

  // Convert to Arquero table with generic column names first
  let table = aq.from(
    rawData.map((row, i) => {
      const obj: Record<string, any> = { _row: i };
      row.forEach((v, j) => (obj[`c${j}`] = v));
      return obj;
    }),
  );
  console.log("Table type:", typeof table, "Table object:", table);

  // 1. Try to find date column in existing columns
  const cols = (table as any).columnNames() as string[];
  console.log("Columns:", cols);
  const dateColCandidates = cols.filter((c) => /年|年月|月|year|date|時間/i.test(c));

  for (const dc of dateColCandidates) {
    const series = (table as any).column(dc) as (string | number | null)[];
    const ym = detectDateInSeries(series);
    if (ym) {
      // Found date column - normalize it to 年月
      return table
        .derive({
          年月: (d) => ensureYM(String(d[dc])),
        })
        .select("年月", ...cols.filter((c) => c !== dc));
    }
  }

  // 2. Check first column for date-like values
  const firstCol = cols[0];
  if (firstCol) {
    const series = (table as any).column(firstCol) as (string | number | null)[];
    const ym = detectDateInSeries(series);
    if (ym) {
      return table.rename(firstCol, "年月").derive({ 年月: (d) => ensureYM(String(d.年月)) });
    }
  }

  // 2b. Check first data column (c0) for YEAR-ONLY values (4-digit years)
  // Handles files where col 0 has yearly values like 1952, 1953, ...
  const dataCol0 = cols.find((c) => c === "c0");
  if (dataCol0) {
    const series = (table as any).column(dataCol0) as (string | number | null)[];
    const yearOnlyValues = series.filter((v) => v != null && /^\d{4}$/.test(String(v).trim()));
    if (yearOnlyValues.length >= 5) {
      // Find data start (first 4-digit year)
      let dataStart = -1;
      for (let i = 0; i < series.length; i++) {
        if (series[i] != null && /^\d{4}$/.test(String(series[i]).trim())) {
          dataStart = i;
          break;
        }
      }

      if (dataStart >= 0) {
        // Collect consecutive year rows until a gap
        const dataRows: number[] = [];
        for (let i = dataStart; i < series.length; i++) {
          const v = series[i];
          if (v != null && /^\d{4}$/.test(String(v).trim())) {
            dataRows.push(i);
          } else if (dataRows.length > 0 && i > dataRows[dataRows.length - 1] + 2) {
            break; // Gap detected
          }
        }

        if (dataRows.length > 0) {
          // Try to find a header row with year-related labels
          let headerRow = -1;
          for (let i = Math.max(0, dataStart - 6); i < dataStart; i++) {
            const r = series[i];
            if (r != null && (/年/.test(String(r)) || /year/i.test(String(r)))) {
              headerRow = i;
              break;
            }
          }

          // Build output data
          const allCols = (table as any).columnNames() as string[];
          const numericCols = allCols.filter((c) => c !== "_row" && c !== dataCol0);

          const outData = dataRows.map((ri) => {
            const row = (table as any).object(ri);
            const result: Record<string, any> = {
              年月: String(row[dataCol0]).trim() + "年",
            };

            // Use header labels from detected headerRow if available
            if (headerRow >= 0) {
              const headerObj = (table as any).object(headerRow);
              numericCols.forEach((c) => {
                const label = String(headerObj[c] ?? c).trim();
                if (label && label !== "nan" && label !== "NaN" && label !== "") {
                  result[label] = row[c];
                } else {
                  result[c] = row[c];
                }
              });
            } else {
              numericCols.forEach((c) => {
                result[c] = row[c];
              });
            }
            return result;
          });

          if (outData.length > 0) {
            // Ensure consistent column order: 年月 first, then columns in c1-c20 order
            const desiredOrder = ["年月"];
            // Collect header labels in c1-c20 order
            const headerLabels: string[] = [];
            if (headerRow >= 0) {
              const headerObj = (table as any).object(headerRow);
              const usedLabels = new Set<string>();
              usedLabels.add("年月");
              numericCols.forEach((c) => {
                const label = String(headerObj[c] ?? c).trim();
                const key = label && label !== "nan" && label !== "NaN" && label !== "" ? label : c;
                if (!usedLabels.has(key)) {
                  usedLabels.add(key);
                  headerLabels.push(key);
                }
              });
            } else {
              numericCols.forEach((c) => headerLabels.push(c));
            }
            desiredOrder.push(...headerLabels);

            const orderedData = outData.map((row) => {
              const ordered: Record<string, any> = {};
              desiredOrder.forEach((key) => {
                if (key in row) ordered[key] = row[key];
              });
              return ordered;
            });
            return aq.from(orderedData);
          }
        }
      }
    }
  }

  // 3. Wide format detection: column headers look like dates
  const wideDateCols = cols.filter((c) => /^\d{4}$|^\d{4}[/-]\d{1,2}$|^\d{4}年/.test(String(c)));
  if (wideDateCols.length > 0) {
    const idVars = cols.filter((c) => !wideDateCols.includes(c));
    // Arquero melt: fold wideDateCols into key/value pairs
    let melted = table.fold(wideDateCols, { as: ["年月", "value"] });
    // Normalize 年月 from column headers
    melted = melted.derive({
      年月: (d) => parseColumnHeaderToYM(String(d.年月)) ?? String(d.年月),
    });
    return melted;
  }

  // 4. Last resort: coerce header and search again
  const coerced = coerceHeader(rawData);
  if (coerced.length === 0) return aq.table({ 年月: [] });

  const coercedTable = aq.from(coerced);
  const coercedCols = (coercedTable as any).columnNames() as string[];
  console.log("Coerced columns:", coercedCols);

  // Re-run date column detection on coerced table
  const coercedDateColCandidates = coercedCols.filter((c) => /年|年月|月|year|date|時間/i.test(c));
  for (const dc of coercedDateColCandidates) {
    const series = (coercedTable as any).column(dc) as (string | number | null)[];
    const ym = detectDateInSeries(series);
    if (ym) {
      return coercedTable
        .derive({
          年月: (d) => ensureYM(String(d[dc])),
        })
        .select("年月", ...coercedCols.filter((c) => c !== dc));
    }
  }

  return coercedTable;
}
