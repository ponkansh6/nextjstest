const TEST_ID_PATTERN = /^[a-f0-9]{16}$/;

export function validateCatalogSelectionRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request))
    throw new Error("catalog selection request must be an object");
  const requestKeys = Object.keys(request);
  if (requestKeys.some((key) => !["model", "state", "questions"].includes(key)))
    throw new Error("catalog selection request contains unknown fields");
  if (request.model !== undefined && (typeof request.model !== "string" || !request.model.trim()))
    throw new Error("catalog selection request.model must be a non-empty string when provided");
  if (!request.state || typeof request.state !== "object" || Array.isArray(request.state))
    throw new Error("catalog selection request.state must be an object");
  const stateKeys = Object.keys(request.state);
  const allowedStateKeys = [
    "evaluationScope",
    "changedPaths",
    "catalogChunk",
    "candidateCount",
    "outputRequirement",
  ];
  if (stateKeys.some((key) => !allowedStateKeys.includes(key)))
    throw new Error("catalog selection request.state contains unknown fields");
  if (request.state.evaluationScope !== "select_browser_tests")
    throw new Error("catalog selection request.state.evaluationScope must be select_browser_tests");
  if (
    !Array.isArray(request.state.changedPaths) ||
    request.state.changedPaths.some((file) => typeof file !== "string")
  )
    throw new Error("catalog selection request.state.changedPaths must be a string array");
  if (
    typeof request.state.catalogChunk !== "string" ||
    !/^\d+\/\d+$/.test(request.state.catalogChunk)
  )
    throw new Error("catalog selection request.state.catalogChunk must have the form index/count");
  const [chunkIndex, chunkCount] = request.state.catalogChunk.split("/").map(Number);
  if (
    !Number.isSafeInteger(chunkIndex) ||
    !Number.isSafeInteger(chunkCount) ||
    chunkIndex < 1 ||
    chunkCount < 1 ||
    chunkIndex > chunkCount
  )
    throw new Error(
      "catalog selection request.state.catalogChunk must be within the range 1..count",
    );
  if (request.state.candidateCount !== Object.keys(request.questions ?? {}).length)
    throw new Error("catalog selection request.state.candidateCount must match its question count");
  if (
    typeof request.state.outputRequirement !== "string" ||
    !request.state.outputRequirement.trim()
  )
    throw new Error("catalog selection request.state.outputRequirement must be a non-empty string");
  if (
    !request.questions ||
    typeof request.questions !== "object" ||
    Array.isArray(request.questions)
  )
    throw new Error("catalog selection request.questions must be an object");

  const ids = Object.keys(request.questions);
  if (ids.length < 1 || ids.length > 24)
    throw new Error("catalog selection request must contain between 1 and 24 questions");

  for (const id of ids) {
    if (!TEST_ID_PATTERN.test(id))
      throw new Error(`catalog selection question ID has an invalid test ID shape: ${id}`);
    const question = request.questions[id];
    if (!question || typeof question !== "object" || Array.isArray(question))
      throw new Error(`catalog selection question ${id} must be an object`);
    if (question.type !== "choice")
      throw new Error(`catalog selection question ${id} must have type choice`);
    if (Object.keys(question).some((key) => !["type", "instructions", "criteria"].includes(key)))
      throw new Error(`catalog selection question ${id} contains unknown fields`);
    if (typeof question.instructions !== "string" || !question.instructions.trim())
      throw new Error(`catalog selection question ${id}.instructions must be a non-empty string`);

    const criteria = question.criteria;
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria))
      throw new Error(`catalog selection question ${id}.criteria must be an object`);
    const choiceIds = Object.keys(criteria);
    if (choiceIds.length !== 2 || !choiceIds.includes("run") || !choiceIds.includes("skip"))
      throw new Error(
        `catalog selection question ${id}.criteria must contain exactly run and skip`,
      );
    if (
      choiceIds.some(
        (choiceId) => typeof criteria[choiceId] !== "string" || !criteria[choiceId].trim(),
      )
    )
      throw new Error(`catalog selection question ${id}.criteria values must be non-empty strings`);
  }
  return ids;
}
