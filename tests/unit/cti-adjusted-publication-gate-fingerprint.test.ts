import { describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
  evaluateCtiAdjustedPublicationGate,
} from "../../server/lib/ctiAdjustedPublicationGate";

const fingerprint = "sha256:current-input-snapshot";
const completeEvidence = {
  rolling: { status: "pass", pass: true, allFoldsFinite: true, leakageFree: true },
  loo: { status: "pass", pass: true, allFoldsFinite: true, leakageFree: true },
};

function evaluate(evidenceInputFingerprint?: string) {
  return evaluateCtiAdjustedPublicationGate({
    baseGate: { status: "pass", accepted: true, reasonCodes: [], blockingReasonCodes: [] },
    rollingLoo: completeEvidence,
    evidenceSchema: CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
    ...(evidenceInputFingerprint === undefined ? {} : { evidenceInputFingerprint }),
    expectedInputFingerprint: fingerprint,
  });
}

describe("Plan39 publication gate input fingerprint", () => {
  it.each([
    ["missing", undefined],
    ["stale", "sha256:older-input-snapshot"],
  ] as const)("fails closed when the evidence fingerprint is %s", (_case, evidenceFingerprint) => {
    const gate = evaluate(evidenceFingerprint);

    expect(gate.accepted).toBe(false);
    expect(gate.evidence.accepted).toBe(false);
    expect(gate.reasonCodes).toContain("rolling_loo_evidence_input_fingerprint_mismatch");
    expect(gate.blockingReasonCodes).toContain("rolling_loo_backtest_incomplete");
  });

  it("accepts complete evidence only when its fingerprint matches the current inputs", () => {
    const gate = evaluate(fingerprint);

    expect(gate.accepted).toBe(true);
    expect(gate.evidence.accepted).toBe(true);
    expect(gate.evidence.inputFingerprint).toBe(fingerprint);
    expect(gate.blockingReasonCodes).toEqual([]);
  });
});
