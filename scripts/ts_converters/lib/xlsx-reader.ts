import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import * as iconv from "iconv-lite";

export function readWorkbook(filePath: string): Map<string, any[][]> {
  const ext = path.extname(filePath).toLowerCase();
  const sheets = new Map<string, any[][]>();

  if ([".xls", ".xlsx", ".xlsb"].includes(ext)) {
    const workbook = XLSX.readFile(filePath);
    workbook.SheetNames.forEach((name) => {
      const worksheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,
        defval: "",
      }) as any[][];
      sheets.set(name, data);
    });
  } else if (ext === ".csv") {
    const buffer = fs.readFileSync(filePath);
    let content: string;
    try {
      content = buffer.toString("utf-8");
    } catch (e) {
      content = iconv.decode(buffer, "cp932");
    }
    const workbook = XLSX.read(content, { type: "string" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: "",
    }) as any[][];
    sheets.set(sheetName, data);
  } else {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  return sheets;
}
