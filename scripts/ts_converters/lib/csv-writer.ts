import * as fs from "fs";
import * as aq from "arquero";

export function writeCSVWithBackup(
  table: aq.Table,
  outPath: string,
  headerLines: string[] = [],
): void {
  if (fs.existsSync(outPath)) {
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 14);
    const backupPath = outPath.replace(".csv", `.bak.${ts}.csv`);
    fs.renameSync(outPath, backupPath);
    console.log(`Backed up existing file to ${backupPath}`);
  }
  let csvContent = (table as any).toCSV();

  // Replace 'null' with empty string to match Python's behavior
  csvContent = csvContent
    .split("\n")
    .map((line: string) => {
      return line
        .split(",")
        .map((field: string) => (field === "null" ? "" : field))
        .join(",");
    })
    .join("\n");

  const finalContent =
    headerLines.length > 0 ? headerLines.join("\n") + "\n" + csvContent : csvContent;

  fs.writeFileSync(outPath, finalContent, "utf-8");
}
