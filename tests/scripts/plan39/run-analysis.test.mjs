import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Plan39 analysis audit checker", () => {
  it("recomputes v2 with the rolling-LOO input fingerprint from generated analysis", () => {
    const output = execFileSync(
      "pnpm",
      ["exec", "tsx", path.join(repoRoot, "scripts/plan39/run-analysis.mjs"), "--check"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const verifiedFile = output.match(/^verified: (.+)$/m)?.[1];
    expect(verifiedFile).toBeTruthy();

    const result = JSON.parse(readFileSync(verifiedFile, "utf8"));
    expect(result.auditSummary.v2).toEqual(result.v2);
    expect(result.v2.publicationGate.rollingLooEvidence.inputFingerprint).toBe(
      result.inputFingerprint,
    );
    expect(result.auditSummary.v2.publicationGate.rollingLooEvidence.inputFingerprint).toBe(
      result.inputFingerprint,
    );
  });
});
