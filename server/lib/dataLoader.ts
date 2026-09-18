import { clearTestCache } from "./data-loader/cache";

export { clearTestCache };

// Keep all public CPI/CTI/GDP status and data entry points behind this
// compatibility facade. The implementation remains in the domain loader.
export {
  getCpiDataStatus,
  getCpiMajorWeightTotal,
  getCtiDataStatus,
  getGdpSupportStatus,
  getQuarterlyGdpSupportStatus,
  loadQuarterlyGdpData,
  validateQuarterlyGdpSupport,
} from "./data-loader/cpi";
export { getCtiBasicConsumptionStatus } from "./ctiBasicSeries2025LongTerm";
export type { CtiBasicConsumptionStatus } from "./ctiBasicSeries2025LongTerm";
export type {
  CpiDataStatus,
  CtiDataStatus,
  CtiLoadOptions,
  GdpMetadata,
  GdpSupportStatus,
  QuarterlyGdpData,
  QuarterlyGdpRow,
  QuarterlyGdpSupportStatus,
} from "./data-loader/cpi";

export async function loadPopulationData() {
  const { loadPopulationDataInternal } = await import("./data-loader/population");
  return loadPopulationDataInternal();
}

export async function loadTotalEarningData(options?: import("./data-loader/cpi").CtiLoadOptions) {
  const { loadTotalEarningDataInternal } = await import("./data-loader/earnings");
  return loadTotalEarningDataInternal(options);
}

export async function loadCtiData(options?: import("./data-loader/cpi").CtiLoadOptions) {
  const { loadCtiDataInternal } = await import("./data-loader/cpi");
  return loadCtiDataInternal(options);
}

export async function loadCpiData() {
  const { loadCpiDataInternal } = await import("./data-loader/cpi");
  return loadCpiDataInternal();
}
