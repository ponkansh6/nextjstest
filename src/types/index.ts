export { type CpiData } from "./data";

export interface PopulationData {
  total: number;
  index: number;
  ma: number;
}

export interface ParsedCsvRow {
  [key: string]: string | number;
}
