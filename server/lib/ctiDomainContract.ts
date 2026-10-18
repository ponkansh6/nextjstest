/** Canonical internal names for the composition-adjusted CTI contracts. */
import {
  ADJUSTED_CTI_ANNUAL_SCHEMA,
  ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA,
} from "../../shared/cti-contract-schemas.mjs";
import { COMPOSITION_ADJUSTED_V2_ESTIMATE_VERSION } from "../../shared/cti-estimate-contract";

export const COMPOSITION_ADJUSTED_V2 = {
  algorithm: "composition-adjusted-v2",
  model: "v2-bottom-up",
  /** Retained on existing public measurements until a public schema migration. */
  estimateVersion: COMPOSITION_ADJUSTED_V2_ESTIMATE_VERSION,
} as const;

export type AnnualInputContract = "annual-public" | "quarterly-annual-anchor";
export type LegacyAnnualInputContract = "plan39" | "plan40";
export type AnnualInputContractResolution = {
  contract: AnnualInputContract;
  valid: boolean;
  reason?: "unknown_input_contract" | "input_contract_conflict";
};

export function resolveAnnualInputContract(value: unknown): AnnualInputContract | null {
  if (value === "annual-public" || value === "plan39") return "annual-public";
  if (value === "quarterly-annual-anchor" || value === "plan40") return "quarterly-annual-anchor";
  return null;
}

export function resolveAnnualInputContractOptions(
  inputContract: unknown,
  legacyContract: unknown,
): AnnualInputContractResolution {
  const hasInputContract = inputContract !== undefined;
  const hasLegacyContract = legacyContract !== undefined;
  const resolvedInputContract = hasInputContract ? resolveAnnualInputContract(inputContract) : null;
  const resolvedLegacyContract = hasLegacyContract
    ? resolveAnnualInputContract(legacyContract)
    : null;
  if (
    (hasInputContract && resolvedInputContract === null) ||
    (hasLegacyContract && resolvedLegacyContract === null)
  )
    return { contract: "annual-public", valid: false, reason: "unknown_input_contract" };
  if (
    resolvedInputContract !== null &&
    resolvedLegacyContract !== null &&
    resolvedInputContract !== resolvedLegacyContract
  )
    return { contract: "annual-public", valid: false, reason: "input_contract_conflict" };
  return {
    contract: resolvedInputContract ?? resolvedLegacyContract ?? "annual-public",
    valid: true,
  };
}

export function resolveAnnualArtifactSchema(value: unknown): string | null {
  if (value === ADJUSTED_CTI_ANNUAL_SCHEMA.canonical || value === ADJUSTED_CTI_ANNUAL_SCHEMA.legacy)
    return ADJUSTED_CTI_ANNUAL_SCHEMA.canonical;
  return null;
}

export function resolveQuarterlyNominalArtifactSchema(value: unknown): string | null {
  if (
    value === ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA.canonical ||
    value === ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA.legacy
  )
    return ADJUSTED_CTI_QUARTERLY_NOMINAL_SCHEMA.canonical;
  return null;
}

export function haveMatchingAnnualArtifactSchemas(...values: readonly unknown[]): boolean {
  const canonical = values.map(resolveAnnualArtifactSchema);
  return canonical.every((value) => value !== null && value === canonical[0]);
}
