import * as aq from "arquero";

export function synthesizeNendoMonth(table: aq.Table): aq.Table {
  const cols = (table as any).columnNames() as string[];
  if (cols.includes("年月")) return table;

  const yearCols = cols.filter((c) => /年|年度|year/i.test(c));
  const monCols = cols.filter((c) => /月|month/i.test(c));
  if (yearCols.length && monCols.length) {
    return (table as any).derive({
      年月: (d: any) => {
        const y = String(d[yearCols[0]]).replace(/[^0-9]/g, "");
        const m = String(d[monCols[0]]).replace(/[^0-9]/g, "");
        return y && m ? `${y}年${parseInt(m, 10)}月` : "";
      },
    });
  }

  for (const c of cols) {
    const sample = Array.from((table as any).column(c)).find((v: any) => v != null);
    if (sample) {
      const s = String(sample);
      if (s.length >= 6 && /^\d{6}/.test(s)) {
        return (table as any).derive({
          年月: (d: any) => {
            const xs = String(d[c]);
            return `${xs.slice(0, 4)}年${parseInt(xs.slice(4, 6), 10)}月`;
          },
        });
      }
    }
  }

  return table;
}
