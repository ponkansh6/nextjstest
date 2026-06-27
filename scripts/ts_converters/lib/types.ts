import * as aq from "arquero";

export interface SheetData {
  name: string;
  data: any[][];
}

export interface ExtractedTable {
  table: aq.Table;
  mapped: Map<string, string | null>;
  unmatched: string[];
}

export interface MergeResult {
  table: aq.Table;
  stats: { updated: number; appended: number; unmatched: string[] };
}
