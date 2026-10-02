import { describe, expect, it } from "vitest";
import {
  automaticCandidateChoices,
  diagnosisFromCandidate,
  validateClarificationCandidates,
} from "../../skills/jev-review/scripts/clarification-candidates.mjs";

const validCandidates = () => ({
  choices: [
    {
      id: "fix_code",
      label: "Fix implementation",
      finding: "The shared interaction regressed.",
      affected: "Chart keyboard navigation requirement",
      evidence: "The focused control no longer receives Enter.",
      proposedFix: "Restore keyboard activation handling.",
      remainingUncertainty: "none",
    },
    {
      id: "collect_evidence",
      label: "Collect browser evidence",
      finding: "The shared interaction regressed.",
      affected: "Chart keyboard navigation requirement",
      neededEvidence: "A browser trace of focus and Enter handling.",
      nextAction: "Capture focus state and key event behavior.",
      remainingUncertainty: "Whether the issue reproduces in production build.",
    },
  ],
});

describe("JEV automatic clarification candidates", () => {
  it("requires at least two complete, uniquely identified candidates", () => {
    expect(validateClarificationCandidates(validCandidates()).choices).toHaveLength(2);
    expect(() =>
      validateClarificationCandidates({ choices: [validCandidates().choices[0]] }),
    ).toThrow(/at least two/);
    const duplicate = validCandidates();
    duplicate.choices[1].id = duplicate.choices[0].id;
    expect(() => validateClarificationCandidates(duplicate)).toThrow(/unique/);
    const incomplete = validCandidates();
    delete (incomplete.choices[0] as Partial<(typeof incomplete.choices)[number]>).affected;
    expect(() => validateClarificationCandidates(incomplete)).toThrow(/affected/);
    const bothEvidenceForms = validCandidates();
    bothEvidenceForms.choices[0].neededEvidence = "Also ask for this evidence.";
    expect(() => validateClarificationCandidates(bothEvidenceForms)).toThrow(
      /exactly one of evidence/,
    );
    const emptyPrimaryAction = validCandidates();
    emptyPrimaryAction.choices[0].nextAction = "";
    expect(() => validateClarificationCandidates(emptyPrimaryAction)).toThrow(/action fields/);
  });

  it("sends authored candidate details and maps the choice to local diagnosis", () => {
    const candidates = validateClarificationCandidates(validCandidates());
    const choices = automaticCandidateChoices(candidates);
    expect(choices.selectionMode).toBe("single");
    expect(choices.choices[0].description).toContain(
      "The focused control no longer receives Enter.",
    );
    expect(diagnosisFromCandidate(candidates.choices[1])).toEqual({
      finding: "The shared interaction regressed.",
      affected: "Chart keyboard navigation requirement",
      evidence: null,
      neededEvidence: "A browser trace of focus and Enter handling.",
      nextAction: "Capture focus state and key event behavior.",
      remainingUncertainty: "Whether the issue reproduces in production build.",
    });
  });
});
