import { parseCsvFile, buildPopulationFilePath } from "../data-io";
import { processPopulationData } from "../data-processor";

export async function loadPopulationDataInternal(): Promise<
  Map<string, { total: number; index: number; ma: number }>
> {
  const filePath = buildPopulationFilePath();
  const rows = await parseCsvFile<string[][]>(filePath);
  if (rows.length === 0) return new Map();

  let headerIndex = rows.findIndex((row) =>
    row.some(
      (cell) =>
        typeof cell === "string" &&
        (/^\s*年\s*月\s*$/.test(cell.trim()) || /Year\s*and\s*month/i.test(cell)),
    ),
  );
  if (headerIndex === -1) {
    headerIndex = rows.findIndex((row) =>
      row.some((cell) => typeof cell === "string" && /年/.test(cell) && /月/.test(cell)),
    );
  }
  if (headerIndex === -1) return new Map();

  const headerRow = rows[headerIndex];
  const yearCol = headerRow.findIndex((c) => typeof c === "string" && /年\s*月/.test(c));
  let separateYearCol = -1;
  let monthCol = -1;
  if (yearCol === -1) {
    separateYearCol = headerRow.findIndex((c) => typeof c === "string" && c.trim().endsWith("年"));
    if (separateYearCol !== -1) monthCol = separateYearCol + 1;
    else {
      separateYearCol = headerRow.findIndex((c) => typeof c === "string" && /年|Year/i.test(c));
      if (separateYearCol !== -1) monthCol = separateYearCol + 1;
    }
  }
  const totalCol =
    headerRow.findIndex((c) => typeof c === "string" && /(総数|Total)/.test(c)) !== -1
      ? headerRow.findIndex((c) => typeof c === "string" && /(総数|Total)/.test(c))
      : 4;

  return processPopulationData(rows, headerIndex, yearCol, separateYearCol, monthCol, totalCol);
}
