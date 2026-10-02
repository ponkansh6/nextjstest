export function validateClarificationCandidates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("clarification candidates must be an object");
  if (!Array.isArray(value.choices) || value.choices.length < 2)
    throw new Error("clarification candidates.choices must contain at least two entries");
  const ids = new Set();
  for (const [index, item] of value.choices.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`clarification candidate ${index + 1} must be an object`);
    for (const field of ["id", "label", "finding", "affected", "remainingUncertainty"])
      if (typeof item[field] !== "string" || !item[field].trim())
        throw new Error(`clarification candidate ${index + 1}.${field} must be a non-empty string`);
    if (item.id !== item.id.trim())
      throw new Error(
        `clarification candidate ${index + 1}.id must not contain surrounding whitespace`,
      );
    if (ids.has(item.id)) throw new Error(`clarification candidate IDs must be unique: ${item.id}`);
    ids.add(item.id);
    const hasObservedEvidence = typeof item.evidence === "string" && Boolean(item.evidence.trim());
    const hasNeededEvidence =
      typeof item.neededEvidence === "string" && Boolean(item.neededEvidence.trim());
    if (hasObservedEvidence === hasNeededEvidence)
      throw new Error(
        `clarification candidate ${item.id} must contain exactly one of evidence or neededEvidence`,
      );
    if (
      ("evidence" in item && !hasObservedEvidence) ||
      ("neededEvidence" in item && !hasNeededEvidence)
    )
      throw new Error(
        `clarification candidate ${item.id} evidence fields must be non-empty strings`,
      );
    const hasNextAction = typeof item.nextAction === "string" && Boolean(item.nextAction.trim());
    const hasProposedFix = typeof item.proposedFix === "string" && Boolean(item.proposedFix.trim());
    if (hasNextAction === hasProposedFix)
      throw new Error(
        `clarification candidate ${item.id} must contain exactly one of nextAction or proposedFix`,
      );
    if (("nextAction" in item && !hasNextAction) || ("proposedFix" in item && !hasProposedFix))
      throw new Error(`clarification candidate ${item.id} action fields must be non-empty strings`);
  }
  return { choices: value.choices };
}

export function automaticCandidateChoices(candidates) {
  return {
    version: 1,
    selectionMode: "single",
    question:
      "Select exactly one of the supplied mutually exclusive, case-specific next-action candidates.",
    choices: candidates.choices.map((item) => ({
      id: item.id,
      label: item.label,
      description: [
        `Finding: ${item.finding}`,
        `Affected location or requirement: ${item.affected}`,
        item.evidence
          ? `Observed evidence: ${item.evidence}`
          : `Needed evidence: ${item.neededEvidence}`,
        `Next action: ${item.nextAction ?? item.proposedFix}`,
        `Remaining uncertainty: ${item.remainingUncertainty}`,
      ].join(" "),
    })),
  };
}

export function diagnosisFromCandidate(candidate) {
  return {
    finding: candidate.finding,
    affected: candidate.affected,
    evidence: candidate.evidence ?? null,
    neededEvidence: candidate.neededEvidence ?? null,
    nextAction: candidate.nextAction ?? candidate.proposedFix,
    remainingUncertainty: candidate.remainingUncertainty,
  };
}
