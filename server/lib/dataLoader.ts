import { maybeCache, clearTestCache } from "./data-loader/cache";

export { clearTestCache };

export const loadPopulationData = maybeCache(
  async () => {
    const { loadPopulationDataInternal } = await import("./data-loader/population");
    return loadPopulationDataInternal();
  },
  "population-data",
  {
    revalidate: 3600,
  },
);

export const loadTotalEarningData = maybeCache(
  async () => {
    const { loadTotalEarningDataInternal } = await import("./data-loader/earnings");
    return loadTotalEarningDataInternal();
  },
  "earnings-data",
  {
    revalidate: 3600,
  },
);

export const loadCtiData = maybeCache(
  async () => {
    const { loadCtiDataInternal } = await import("./data-loader/cpi");
    return loadCtiDataInternal();
  },
  "cti-data",
  { revalidate: 3600 },
);

export const loadCpiData = maybeCache(
  async () => {
    const { loadCpiDataInternal } = await import("./data-loader/cpi");
    return loadCpiDataInternal();
  },
  "cpi-data",
  { revalidate: 3600 },
);
