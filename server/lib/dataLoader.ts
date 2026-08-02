import { clearTestCache } from "./data-loader/cache";

export { clearTestCache };

export async function loadPopulationData() {
  const { loadPopulationDataInternal } = await import("./data-loader/population");
  return loadPopulationDataInternal();
}

export async function loadTotalEarningData() {
  const { loadTotalEarningDataInternal } = await import("./data-loader/earnings");
  return loadTotalEarningDataInternal();
}

export async function loadCtiData() {
  const { loadCtiDataInternal } = await import("./data-loader/cpi");
  return loadCtiDataInternal();
}

export async function loadCpiData() {
  const { loadCpiDataInternal } = await import("./data-loader/cpi");
  return loadCpiDataInternal();
}
