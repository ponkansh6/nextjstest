export function pickBestSheet(sheets: Map<string, any[][]>): [string, any[][]] {
  let bestName = "";
  let bestData: any[][] = [];
  let maxNumericCount = -1;

  for (const [name, data] of sheets.entries()) {
    let numericCount = 0;
    for (const row of data) {
      for (const cell of row) {
        if (typeof cell === "number" && !isNaN(cell)) {
          numericCount++;
        }
      }
    }
    if (numericCount > maxNumericCount) {
      maxNumericCount = numericCount;
      bestName = name;
      bestData = data;
    }
  }

  if (maxNumericCount === -1) {
    throw new Error("No sheets found in workbook");
  }

  return [bestName, bestData];
}
