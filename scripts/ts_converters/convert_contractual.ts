import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import * as aq from "arquero";

const SRC_FILE = "hon-t13.xls";
const TARGET_FILE = "contractual_earnings.csv";
const HEADER_SKIP = 6;

const SRC_PATH = path.join(process.cwd(), "public", "economics_source", SRC_FILE);
const TARGET_PATH = path.join(process.cwd(), "public", TARGET_FILE);

function main() {
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`Source file not found: ${SRC_PATH}`);
    process.exit(1);
  }

  console.log(`Loading ${SRC_FILE}...`);
  const workbook = XLSX.readFile(SRC_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: HEADER_SKIP });

  if (jsonData.length === 0) {
    console.error("No data found in sheet");
    process.exit(1);
  }

  const csvContent = XLSX.utils.sheet_to_csv(worksheet, { FS: ",", strip: false });
  const bom = Buffer.from("\uFEFF", "utf8");
  fs.writeFileSync(TARGET_PATH, Buffer.concat([bom, Buffer.from(csvContent, "utf8")]));
  console.log(`Saved to ${TARGET_PATH}`);
}

main();
