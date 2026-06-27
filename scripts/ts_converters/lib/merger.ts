import * as aq from "arquero";

export function mergeByNengetsu(
  targetTable: aq.Table,
  sourceTable: aq.Table,
  mapping: Map<string, string | null>,
  targetCols: string[],
): aq.Table {
  console.log("Target Table:", targetTable);
  console.log("Source Table:", sourceTable);
  console.log("Source Table type:", typeof sourceTable);

  const srcByYM = new Map<string, any>();
  const sourceRows = sourceTable.objects() as any[];
  for (const row of sourceRows) {
    srcByYM.set(String(row.年月), row);
  }

  let updated = targetTable;
  for (const tc of targetCols) {
    const sc = mapping.get(tc);
    if (!sc || sc === "年月") continue;

    updated = (updated as any).derive({
      [tc]: aq.escape((d: any) => {
        const ym = String(d.年月);
        const srcRow = srcByYM.get(ym);
        if (!srcRow) return d[tc];
        const val = srcRow[sc];
        if (val == null || String(val).trim() === "") return d[tc];

        const orig = d[tc];
        if (orig != null && String(orig).trim() !== "") {
          const oNum = parseFloat(String(orig).replace(/,/g, ""));
          const nNum = parseFloat(String(val).replace(/,/g, ""));
          if (!isNaN(oNum) && !isNaN(nNum) && Math.abs(oNum - nNum) < 1e-9) {
            return orig;
          }
        }
        return String(val);
      }),
    });
  }

  const targetYMs = new Set(Array.from((targetTable as any).column("年月") || []).map(String));
  const newRows: any[] = [];

  for (const [ym, srcRow] of srcByYM.entries()) {
    if (targetYMs.has(ym)) continue;
    const row: any = { 年月: ym };
    for (const tc of targetCols) {
      const sc = mapping.get(tc);
      if (!sc || sc === "年月") {
        row[tc] = null;
        continue;
      }
      row[tc] = srcRow[sc] ?? null;
    }
    newRows.push(row);
  }

  if (newRows.length > 0) {
    updated = (updated as any).concat(aq.from(newRows));
  }

  return updated;
}
