import { clearTestCache } from "./data-loader/cache";

export { clearTestCache };

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
