const TEST_ID_PATTERN = /^[a-f0-9]{16}$/;
const sensitivePath = (file) =>
  /(^|\/)\.env(?:\.|$)/i.test(file) ||
  /(?:secret|credential|token|password|private[-_]?key|api[_-]?key|access[_-]?key)/i.test(file) ||
  /(^|[/._-])(?:keys?|certs?|certificates?|id_(?:rsa|dsa|ecdsa|ed25519))([/._-]|$)/i.test(file) ||
  /\.(?:pem|key|crt|cer|p12|pfx|der|jks|keystore)$/i.test(file);

const isSafeRepositoryPath = (file, maxBytes = 512) => {
  if (typeof file !== "string" || !file || Buffer.byteLength(file, "utf8") > maxBytes) return false;
  if (file.includes("\\") || /\p{Cc}/u.test(file) || file.startsWith("/") || /^[a-z]:/i.test(file))
    return false;
  const segments = file.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..");
};

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
    "diffContext",
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
    request.state.changedPaths.length > 256 ||
    request.state.changedPaths.some((file) => !isSafeRepositoryPath(file) || sensitivePath(file)) ||
    request.state.changedPaths.reduce((sum, file) => sum + Buffer.byteLength(file, "utf8"), 0) >
      16 * 1024
  )
    throw new Error(
      "catalog selection request.state.changedPaths exceeds its count or byte limits",
    );
  const diffContext = request.state.diffContext;
  if (!diffContext || typeof diffContext !== "object" || Array.isArray(diffContext))
    throw new Error("catalog selection request.state.diffContext must be an object");
  const diffContextKeys = [
    "completeness",
    "source",
    "limits",
    "summary",
    "files",
    "omittedFiles",
    "omissionReasons",
    "detectedPathCount",
    "explicitPathCount",
    "diffFileCount",
    "diffByteCount",
  ];
  if (Object.keys(diffContext).some((key) => !diffContextKeys.includes(key)))
    throw new Error("catalog selection request.state.diffContext contains unknown fields");
  if (!["complete", "incomplete"].includes(diffContext.completeness))
    throw new Error("catalog selection request.state.diffContext.completeness is invalid");
  if (!["pre_push_oid_ranges", "head_to_worktree_and_untracked"].includes(diffContext.source))
    throw new Error("catalog selection request.state.diffContext.source is invalid");
  const limits = diffContext.limits;
  if (
    !limits ||
    typeof limits !== "object" ||
    Array.isArray(limits) ||
    Object.keys(limits).some(
      (key) =>
        ![
          "maxFiles",
          "maxDiffFilePathBytes",
          "maxBytesPerFile",
          "maxTotalBytes",
          "maxSummaryFiles",
          "maxSummaryBytes",
          "maxChangedPaths",
          "maxChangedPathBytes",
          "maxChangedPathTotalBytes",
          "maxOmittedFiles",
          "maxOmittedPathBytes",
          "maxOmittedPathTotalBytes",
        ].includes(key),
    ) ||
    limits.maxFiles !== 20 ||
    limits.maxBytesPerFile !== 4096 ||
    limits.maxTotalBytes !== 16384 ||
    limits.maxDiffFilePathBytes !== 512 ||
    limits.maxSummaryFiles !== 40 ||
    limits.maxSummaryBytes !== 4096 ||
    limits.maxChangedPaths !== 256 ||
    limits.maxChangedPathBytes !== 512 ||
    limits.maxChangedPathTotalBytes !== 16384 ||
    limits.maxOmittedFiles !== 64 ||
    limits.maxOmittedPathBytes !== 512 ||
    limits.maxOmittedPathTotalBytes !== 8192
  )
    throw new Error("catalog selection request.state.diffContext.limits are invalid");
  const summary = diffContext.summary;
  const summaryKeys = [
    "files",
    "fileCount",
    "changedPathCount",
    "omittedChangedPathCount",
    "omittedFileCount",
    "sensitiveOmittedFileCount",
    "addedLines",
    "deletedLines",
    "unknownLineCountFileCount",
    "reasons",
    "truncated",
    "truncatedFileCount",
  ];
  const safeCount = (value) => Number.isSafeInteger(value) && value >= 0;
  if (
    !summary ||
    typeof summary !== "object" ||
    Array.isArray(summary) ||
    Object.keys(summary).some((key) => !summaryKeys.includes(key)) ||
    !Array.isArray(summary.files) ||
    summary.files.length > limits.maxSummaryFiles ||
    !safeCount(summary.fileCount) ||
    !safeCount(summary.changedPathCount) ||
    !safeCount(summary.omittedChangedPathCount) ||
    !safeCount(summary.omittedFileCount) ||
    !safeCount(summary.sensitiveOmittedFileCount) ||
    !safeCount(summary.addedLines) ||
    !safeCount(summary.deletedLines) ||
    !safeCount(summary.unknownLineCountFileCount) ||
    !Array.isArray(summary.reasons) ||
    summary.reasons.length > 24 ||
    summary.reasons.some((reason) => typeof reason !== "string" || !reason.trim()) ||
    typeof summary.truncated !== "boolean" ||
    !safeCount(summary.truncatedFileCount) ||
    summary.truncatedFileCount !== summary.omittedFileCount ||
    summary.truncated !== summary.truncatedFileCount > 0 ||
    summary.changedPathCount !==
      request.state.changedPaths.length + summary.omittedChangedPathCount ||
    (summary.omittedChangedPathCount > 0 && !summary.reasons.includes("changed_path_limit")) ||
    (summary.omittedChangedPathCount > 0 &&
      (!Array.isArray(diffContext.omissionReasons) ||
        !diffContext.omissionReasons.includes("changed_path_limit"))) ||
    summary.fileCount <
      summary.files.length + summary.omittedFileCount + summary.sensitiveOmittedFileCount ||
    Buffer.byteLength(JSON.stringify(summary), "utf8") > limits.maxSummaryBytes
  )
    throw new Error(
      "catalog selection request.state.diffContext.summary is invalid or exceeds its limits",
    );
  for (const entry of summary.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(
        "catalog selection request.state.diffContext.summary contains an invalid file entry",
      );
    const keys = Object.keys(entry);
    if (
      keys.some(
        (key) => !["path", "status", "addedLines", "deletedLines", "reasons"].includes(key),
      ) ||
      (Object.hasOwn(entry, "path") &&
        (!isSafeRepositoryPath(entry.path) || sensitivePath(entry.path))) ||
      !["added", "modified", "deleted", "unknown"].includes(entry.status) ||
      !(entry.addedLines === null || safeCount(entry.addedLines)) ||
      !(entry.deletedLines === null || safeCount(entry.deletedLines)) ||
      !Array.isArray(entry.reasons) ||
      entry.reasons.length < 1 ||
      entry.reasons.length > 8 ||
      entry.reasons.some((reason) => typeof reason !== "string" || !reason.trim())
    )
      throw new Error(
        "catalog selection request.state.diffContext.summary contains an invalid file entry",
      );
  }
  if (
    !Array.isArray(diffContext.files) ||
    diffContext.files.length > limits.maxFiles ||
    !Array.isArray(diffContext.omittedFiles) ||
    diffContext.omittedFiles.length > limits.maxOmittedFiles ||
    !Array.isArray(diffContext.omissionReasons)
  )
    throw new Error("catalog selection request.state.diffContext file metadata is invalid");
  let diffBytes = 0;
  let omittedPathBytes = 0;
  const isValidOmission = (omission) => {
    if (!omission || typeof omission !== "object" || Array.isArray(omission)) return false;
    const hasPath = Object.hasOwn(omission, "path");
    const hasCount = Object.hasOwn(omission, "count");
    if (
      Object.keys(omission).some((key) => !["path", "reason", "count"].includes(key)) ||
      typeof omission.reason !== "string" ||
      !omission.reason.trim()
    )
      return false;
    if (hasPath && hasCount) return false;
    if (hasPath) {
      const bytes =
        typeof omission.path === "string" ? Buffer.byteLength(omission.path, "utf8") : Infinity;
      if (
        !isSafeRepositoryPath(omission.path, limits.maxOmittedPathBytes) ||
        sensitivePath(omission.path)
      )
        return false;
      omittedPathBytes += bytes;
      return omittedPathBytes <= limits.maxOmittedPathTotalBytes;
    }
    return (
      hasCount &&
      typeof omission.reason === "string" &&
      omission.reason.trim().length > 0 &&
      Number.isSafeInteger(omission.count) &&
      omission.count > 0
    );
  };
  for (const file of diffContext.files) {
    if (
      !file ||
      typeof file !== "object" ||
      Array.isArray(file) ||
      Object.keys(file).some(
        (key) => !["path", "diff", "truncated", "redactionApplied"].includes(key),
      ) ||
      typeof file.path !== "string" ||
      typeof file.diff !== "string" ||
      typeof file.truncated !== "boolean" ||
      typeof file.redactionApplied !== "boolean"
    )
      throw new Error("catalog selection request.state.diffContext contains an invalid file entry");
    if (!isSafeRepositoryPath(file.path) || sensitivePath(file.path))
      throw new Error("catalog selection request.state.diffContext contains an invalid file path");
    const byteLength = Buffer.byteLength(file.diff, "utf8");
    if (byteLength > limits.maxBytesPerFile)
      throw new Error("catalog selection request.state.diffContext file exceeds its size limit");
    diffBytes += byteLength;
  }
  if (
    diffBytes > limits.maxTotalBytes ||
    diffContext.diffByteCount !== diffBytes ||
    diffContext.diffFileCount !== diffContext.files.length ||
    !Number.isSafeInteger(diffContext.detectedPathCount) ||
    diffContext.detectedPathCount < 0 ||
    !Number.isSafeInteger(diffContext.explicitPathCount) ||
    diffContext.explicitPathCount < 0 ||
    diffContext.omittedFiles.some((omission) => !isValidOmission(omission)) ||
    diffContext.omissionReasons.some((reason) => typeof reason !== "string")
  )
    throw new Error("catalog selection request.state.diffContext counts or omissions are invalid");
  if ((diffContext.completeness === "complete") !== (diffContext.omissionReasons.length === 0))
    throw new Error(
      "catalog selection request.state.diffContext completeness disagrees with omission reasons",
    );
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
