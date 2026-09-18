import type { QuarterlyGdpData } from "../dataLoader";
import { loadCpiData, loadCtiData, loadQuarterlyGdpData } from "../dataLoader";
import {
  computeQuarterlyAggregates,
  mergeQuarterlyGdpRows,
  type QuarterlyRow,
} from "./quarterlyAggregation";
import { projectQuarterlyPublicView } from "../../../src/lib/quarterlyPublicProjection";
import type { QuarterlyView } from "@/types/chart";

/** Join GDP only into the independent real support path before public projection. */
export function buildQuarterlyPublicViews(
  nominalRows: QuarterlyRow[],
  realRows: QuarterlyRow[],
  gdp: QuarterlyGdpData,
): { nominal: QuarterlyView[]; real: QuarterlyView[] } {
  const joined = mergeQuarterlyGdpRows([], realRows, gdp);
  return {
    nominal: projectQuarterlyPublicView(nominalRows, "nominal"),
    real: projectQuarterlyPublicView(joined.real, "real"),
  };
}

/** Load and project quarterly data through the same public path used by Page. */
export async function loadQuarterlyPublicData(): Promise<{
  nominal: QuarterlyView[];
  real: QuarterlyView[];
  maxCpiDate: { year: number; month: number };
}> {
  const [cpiData, ctiData] = await Promise.all([loadCpiData(), loadCtiData()]);
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
  const quarterlyGdpData = await loadQuarterlyGdpData();
  return {
    ...buildQuarterlyPublicViews(aggregated.nominal, aggregated.real, quarterlyGdpData),
    maxCpiDate: { year: maxCpiYear, month: maxCpiMonth },
  };
}
