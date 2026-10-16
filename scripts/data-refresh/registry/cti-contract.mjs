export const CTI_INPUT_IDENTITIES = Object.freeze([
  { kind: "file", statInfId: "000040499082", format: "xlsx" },
  { kind: "file", statInfId: "000040499028", format: "xlsx" },
  { kind: "file", statInfId: "000040499069", format: "xlsx" },
  { kind: "file", statInfId: "000040499087", format: "xlsx" },
]);

export const CTI_OUTPUTS = Object.freeze([
  ...["000040499070", "000040499082", "000040499028"].flatMap((id) => [
    `data/source/official-cti-2025-long-term/${id}.raw`,
    `data/source/official-cti-2025-long-term/${id}.normalized.csv`,
    `data/source/official-cti-2025-long-term/${id}.metadata.json`,
  ]),
  "data/source/official-cti-2025-long-term/series-map.csv",
  "data/source/official-cti-2025-long-term/representative-snapshot.csv",
  "data/source/official-cti-2025-long-term/manifest.json",
  "data/source/cti_data2025.csv",
  "data/source/cti_data2025.metadata.json",
  "data/source/cti-2025-series-map.csv",
  "data/source/cti-2025-official-series.csv",
  "data/source/cti_data2025_distribution_adjusted.csv",
  "data/source/cti_data2025_distribution_adjusted.metadata.json",
  "data/source/official-cti-2025/cti-basic-000040499069.xlsx",
  "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
  "data/source/cti-adjusted/B.json",
  "data/source/cti-adjusted/A.json",
  "data/source/cti-adjusted/L.json",
  "data/source/cti-adjusted/manifest.json",
  "data/source/cti-adjusted/audit.json",
  "data/source/cti_data2025_distribution_adjusted_quarterly.csv",
  "data/source/cti_data2025_distribution_adjusted_quarterly.metadata.json",
  "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv",
  "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.metadata.json",
  "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.csv",
  "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.metadata.json",
]);

export const CTI_SOURCE_CONTRACT = Object.freeze({
  title:
    "Consumer Trend Index (CTI), 2025 base: official 2+ household long-term series, all-household basic and distribution-adjusted monthly series, Plan39 annual and quarterly dependents, and pinned 2004 inputs",
  classifications: Object.freeze([
    "000040499070: 10大費目別 世帯消費動向指数 原数値 二人以上の世帯 monthly 22 series, source 2002-01, adopted 2005-01 onward",
    "000040499082: 10大費目別 世帯消費動向指数 季節調整値 二人以上の世帯 monthly 22 series, source 2002-01, adopted 2005-01 onward",
    "000040499028: 10大費目別 世帯消費動向指数 分布調整値（原数値） 総世帯 monthly 22 series from 2017-01",
    "000040499069: basic series annual and all-household monthly table 00401, 22 nominal/real series",
    "000040499087: distribution-adjusted annual, all-household monthly table 00501, and quarterly nominal source",
    "Plan39 L.json, 2004 prehistory, and LFS IV-4 composition are immutable pinned dependencies",
  ]),
  filters: Object.freeze({
    sheet:
      "総・月(原) for current total-household outputs; series-specific sheets for 070/082/028 long-term; 総・年 and 総・四(原) for Plan39",
    householdScopes: ["二人以上の世帯", "総世帯"],
    seriesCounts: { longTerm: 22, currentMonthly: 22 },
    baseline: "2025年消費支出平均月額=100",
    tableCodes: { "000040499069": "00401", "000040499087": "00501" },
    missing: "preserve official missing markers; never coerce missing values to numeric zero",
  }),
});
