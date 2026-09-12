import type { QuarterlyGdpData } from "@server/lib/data-loader/cpi";
import { loadCpiData, loadCtiData } from "../dataLoader";
import { loadQuarterlyGdpData } from "../data-loader/cpi";
import {
  computeQuarterlyAggregates,
  mergeQuarterlyGdpRows,
  type QuarterlyRow,
} from "./quarterlyAggregation";
import { projectQuarterlyPublicView } from "../../../src/lib/quarterlyPublicProjection";
import type { QuarterlyView } from "@/types/chart";

/** Join validated GDP comparisons and expose only the public quarterly views. */
export function buildQuarterlyPublicViews(
  nominalRows: QuarterlyRow[],
  realRows: QuarterlyRow[],
  gdp: QuarterlyGdpData,
): { nominal: QuarterlyView[]; real: QuarterlyView[] } {
  const joined = mergeQuarterlyGdpRows(nominalRows, realRows, gdp);
  return {
    nominal: projectQuarterlyPublicView(joined.nominal),
    real: projectQuarterlyPublicView(joined.real),
  };
}

/** Load and project quarterly data through the same public path used by Page. */
export async function loadQuarterlyPublicData(): Promise<{
  nominal: QuarterlyView[];
  real: QuarterlyView[];
  maxCpiDate: { year: number; month: number };
}> {
  const [cpiData, ctiData, quarterlyGdpData] = await Promise.all([
    loadCpiData(),
    loadCtiData(),
    loadQuarterlyGdpData(),
  ]);
  let maxCpiYear = 1994;
  let maxCpiMonth = 1;
  for (const row of cpiData) {
    const match = String(row.年月).match(/^(\d{4})年(\d{1,2})月/);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year > maxCpiYear || (year === maxCpiYear && month > maxCpiMonth)) {
      maxCpiYear = year;
      maxCpiMonth = month;
    }
  }
  const aggregated = computeQuarterlyAggregates(ctiData, {
    year: maxCpiYear,
    month: maxCpiMonth,
  });
  return {
    ...buildQuarterlyPublicViews(aggregated.nominal, aggregated.real, quarterlyGdpData),
    maxCpiDate: { year: maxCpiYear, month: maxCpiMonth },
  };
}
