import { cpiAdapter } from "./cpi.mjs";
import { ctiAdapter } from "./cti.mjs";
import { earningsAdapter } from "./earnings.mjs";
import { populationAdapter } from "./population.mjs";

// Only adapters with verified source mappings are executable. Required but unresolved
// sources are represented by blockedReason in the registry and intentionally omitted here.
export const adapters = new Map([
  ["cpi", cpiAdapter],
  ["cti", ctiAdapter],
  ["earnings", earningsAdapter],
  ["population", populationAdapter],
]);
