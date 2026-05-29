import { it } from "vitest";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

it("debug CTI parsing", async () => {
  const ctiFilePath = path.join(process.cwd(), "public/cti_data.csv");
  const ctiContent = fs.readFileSync(ctiFilePath, "utf8");

  const parsed = Papa.parse<string[]>(ctiContent, {
    header: false,
    skipEmptyLines: false,
  });

  const rows = (parsed.data || []) as string[][];
  console.log("Total rows in CSV:", rows.length);

  const headerIndex = rows.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some(
        (c) =>
          typeof c === "string" && (c.trim() === "月" || c.trim().includes("消費支出（名目）")),
      ),
  );
  console.log("Header index found at:", headerIndex);

  const dataRows = rows.slice(headerIndex + 1);
  console.log("Data rows identified:", dataRows.length);

  const filtered = dataRows.filter((row) => {
    const monthCell = row.find(c => typeof c === 'string' && /^\d{4}年/.test(c.trim()));
    if (!monthCell) return false;
    
    const m = monthCell.trim().match(/^(\d{4})年/);
    if (!m) return false;
    
    const year = parseInt(m[1], 10);
    return year >= 2005;
  });

  console.log("Filtered rows count (>= 2005):", filtered.length);
});
