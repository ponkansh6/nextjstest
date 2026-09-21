/** Shared, fail-closed publication gate for Plan39-v2. */

export const CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA = "plan39-publication-gate-v1" as const;

export type CtiAdjustedRollingLooEvidence = {
  rolling?: { status?: unknown; pass?: unknown; allFoldsFinite?: unknown; leakageFree?: unknown };
  loo?: { status?: unknown; pass?: unknown; allFoldsFinite?: unknown; leakageFree?: unknown };
};

export type CtiAdjustedPublicationGateInput = {
  baseGate?: {
    status?: unknown;
    accepted?: unknown;
    reasonCodes?: unknown;
    blockingReasonCodes?: unknown;
  };
  rollingLoo?: CtiAdjustedRollingLooEvidence;
  evidenceSchema?: unknown;
  evidenceInputFingerprint?: unknown;
  expectedInputFingerprint?: string;
};

export type CtiAdjustedPublicationGateOutput = {
  accepted: boolean;
  status: "pass" | "invalid" | "insufficient-data";
  reasonCodes: string[];
  blockingReasonCodes: string[];
  evidence: {
    schema: typeof CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA;
    accepted: boolean;
    inputFingerprint: string | null;
    reasonCodes: string[];
  };
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function evaluateCtiAdjustedPublicationGate(
  input: CtiAdjustedPublicationGateInput,
): CtiAdjustedPublicationGateOutput {
  const base = input.baseGate ?? {};
  const blocking = new Set(strings(base.blockingReasonCodes));
  const reasons = new Set(strings(base.reasonCodes));
  const evidenceReasons: string[] = [];
  const rolling = input.rollingLoo?.rolling;
  const loo = input.rollingLoo?.loo;
  const schemaOk = input.evidenceSchema === CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA;
  const fingerprintOk =
    !input.expectedInputFingerprint ||
    input.evidenceInputFingerprint === input.expectedInputFingerprint;
  const checks = [rolling, loo].map(
    (item) =>
      item?.status === "pass" &&
      item?.pass === true &&
      item?.allFoldsFinite === true &&
      item?.leakageFree === true,
  );
  if (!schemaOk) evidenceReasons.push("rolling_loo_evidence_schema_missing_or_invalid");
  if (!input.rollingLoo || !rolling || !loo) evidenceReasons.push("rolling_loo_evidence_missing");
  if (!fingerprintOk) evidenceReasons.push("rolling_loo_evidence_input_fingerprint_mismatch");
  if (checks.some((passed) => !passed)) evidenceReasons.push("rolling_loo_backtest_incomplete");
  const evidenceAccepted = evidenceReasons.length === 0;
  if (evidenceAccepted) blocking.delete("rolling_loo_backtest_incomplete");
  else blocking.add("rolling_loo_backtest_incomplete");
  if (evidenceAccepted) reasons.delete("rolling_loo_backtest_incomplete");
  else reasons.add("rolling_loo_backtest_incomplete");
  const accepted = blocking.size === 0;
  return {
    accepted,
    status: accepted ? "pass" : base.status === "invalid" ? "invalid" : "insufficient-data",
    reasonCodes: [...reasons],
    blockingReasonCodes: [...blocking],
    evidence: {
      schema: CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
      accepted: evidenceAccepted,
      inputFingerprint:
        typeof input.evidenceInputFingerprint === "string" ? input.evidenceInputFingerprint : null,
      reasonCodes: evidenceReasons,
    },
  };
}
