export function findHeaderRow(raw: any[][]): number | null {
  for (let i = 0; i < Math.min(20, raw.length); i++) {
    const row = raw[i].map((v) => String(v ?? "").trim());
    if (row.some((cell) => cell === "年月" || cell.includes("年月"))) return i;
  }
  return null;
}

export function findLabelRow(raw: any[][], headerRow: number): number | null {
  const searchStart = Math.max(0, headerRow - 15);
  let bestScore = 0,
    bestRow = null;
  for (let i = searchStart; i < headerRow; i++) {
    let score = 0;
    for (let j = 11; j < raw[i].length; j++) {
      const s = String(raw[i][j] ?? "").trim();
      if (!s || s.toLowerCase() === "nan") continue;
      if (/[^\d]/.test(s)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  return bestScore > 0 ? bestRow : null;
}

export function synthesizeColumns(
  raw: any[][],
  headerRow: number,
  labelRow: number | null,
): string[] {
  const headerVals = raw[headerRow].map((v) => String(v ?? "").trim());
  if (labelRow !== null) {
    const labelVals = raw[labelRow].map((v) => String(v ?? "").trim());
    return labelVals.map((a, i) => {
      const b = headerVals[i] ?? "";
      if (a && a.toLowerCase() !== "nan") return a;
      if (b && b.toLowerCase() !== "nan") return b;
      return "";
    });
  }
  return headerVals.map((v) => v.trim());
}
