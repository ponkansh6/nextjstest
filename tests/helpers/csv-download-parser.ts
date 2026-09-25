export function parseCsv(input: string): string[][] {
  const source = input.replace(/^\uFEFF/, "");
  if (!source.endsWith("\r\n")) throw new Error("CSV must end with CRLF");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    afterQuote = false;
  const pushRow = () => {
    if (row.length === 0 && cell === "") throw new Error("CSV contains an empty row");
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
    afterQuote = false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else if (c === "\r") {
        if (source[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        cell += "\r\n";
        i += 1;
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else cell += c;
    } else if (afterQuote) {
      if (c === ",") {
        row.push(cell);
        cell = "";
        afterQuote = false;
      } else if (c === "\r") {
        if (source[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        i += 1;
        pushRow();
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else throw new Error(`invalid CSV character after closing quote: ${c}`);
    } else if (c === '"') {
      if (cell !== "") throw new Error("quote in an unquoted CSV field");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r") {
      if (source[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
      i += 1;
      pushRow();
    } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
    else cell += c;
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (rows.some((r) => r.every((v) => v === ""))) throw new Error("extra empty row");
  const columns = rows[0]?.length ?? 0;
  if (columns === 0 || rows.some((r) => r.length !== columns))
    throw new Error("CSV column count mismatch");
  return rows;
}
