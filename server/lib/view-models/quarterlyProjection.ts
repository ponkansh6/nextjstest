import type { QuarterlyGdpData } from "@server/lib/data-loader/cpi";
import { mergeQuarterlyGdpRows, type QuarterlyRow } from "./quarterlyAggregation";
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
