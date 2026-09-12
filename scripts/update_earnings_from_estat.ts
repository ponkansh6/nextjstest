import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = process.argv[2] ?? "/tmp/estat-earnings-index.utf8.csv";
const raw = fs.readFileSync(source, "utf8").trimEnd().split(/\r?\n/);
const rows = raw.slice(1).map((line) => line.split(","));
const target = new Map<string, number[]>();
for (const row of rows) {
  if (row[0] !== "指数" || row[3].trim() !== "TL" || row[4] !== "T" || row[5] !== "0") continue;
  const year = Number(row[1]);
  const month = Number(row[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) continue;
  target.set(
    `${year}-${month}`,
    [6, 7, 8, 13, 18].map((i) => Number(row[i])),
  );
}

const files = [
  ["total_earning.csv", 0],
  ["contractual_earnings.csv", 1],
  ["scheduled_earnings.csv", 2],
  ["total_worked_hours.csv", 3],
  ["employment_indices.csv", 4],
] as const;
const monthColumns = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const average = (values: string[]) => {
  const valid = values
    .filter((value) => value !== "")
    .map(Number)
    .filter(Number.isFinite);
  return valid.length === 12
    ? String(Math.round((valid.reduce((a, b) => a + b, 0) / 12) * 10) / 10)
    : "";
};
for (const [name, valueIndex] of files) {
  const file = path.join(root, "data/source", name);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 3; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const year = Number(cells[0]);
    if (!Number.isInteger(year) || year < 1960) continue;
    const values = monthColumns.map((column, month) => {
      const value = target.get(`${year}-${month + 1}`)?.[valueIndex];
      return value !== undefined && Number.isFinite(value) ? String(value) : "";
    });
    if (values.some(Boolean)) {
      cells[1] = average(values);
      cells[2] = values.slice(0, 6).every(Boolean)
        ? String(
            Math.round(
              (values
                .slice(0, 6)
                .map(Number)
                .reduce((a, b) => a + b, 0) /
                6) *
                10,
            ) / 10,
          )
        : "";
      cells[3] = values.slice(6).every(Boolean)
        ? String(
            Math.round(
              (values
                .slice(6)
                .map(Number)
                .reduce((a, b) => a + b, 0) /
                6) *
                10,
            ) / 10,
          )
        : "";
      cells[4] = values.slice(0, 3).every(Boolean)
        ? String(
            Math.round(
              (values
                .slice(0, 3)
                .map(Number)
                .reduce((a, b) => a + b, 0) /
                3) *
                10,
            ) / 10,
          )
        : "";
      cells[5] = values.slice(3, 6).every(Boolean)
        ? String(
            Math.round(
              (values
                .slice(3, 6)
                .map(Number)
                .reduce((a, b) => a + b, 0) /
                3) *
                10,
            ) / 10,
          )
        : "";
      cells[6] = values.slice(6, 9).every(Boolean)
        ? String(
            Math.round(
              (values
                .slice(6, 9)
                .map(Number)
                .reduce((a, b) => a + b, 0) /
                3) *
                10,
            ) / 10,
          )
        : "";
      cells[7] = values.slice(9).every(Boolean)
        ? String(
            Math.round(
              (values
                .slice(9)
                .map(Number)
                .reduce((a, b) => a + b, 0) /
                3) *
                10,
            ) / 10,
          )
        : "";
      monthColumns.forEach((column, index) => {
        cells[column] = values[index];
      });
      lines[i] = cells.join(",");
    }
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}
console.log(`Updated ${files.length} official long-series CSVs through 2026-06`);
