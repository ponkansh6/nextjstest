import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RefreshError, invariant } from "./lib/errors.mjs";
import { semanticFingerprint, rawSha256 } from "./lib/fingerprint.mjs";
import { acquireExclusiveLock } from "./lib/lock.mjs";
import {
  preflightCanonicalEdits,
  snapshotPublishedManagedOutputs,
  verifyUnstagedManagedChanges,
  ensureSameFilesystem,
  resolveContainedPath,
  createDirectoriesSafely,
  normalizeRelativeOutput,
  verifyCleanTrackedOutputsAtHead,
  verifyNoRebaselineResidue,
} from "./lib/fs-safety.mjs";
import { readJournal, recoverJournal, publishArtifacts } from "./lib/journal.mjs";
import { validateRegistry, topologicallyOrderSources } from "./registry/schema.mjs";
import { loadRefreshEnv } from "./transport/env.mjs";
import {
  RUNTIME_FAILURE_REPORT_STATUSES,
  RUNTIME_FILE_ERROR_CATEGORIES,
  RUNTIME_QUALITY_TESTS,
} from "./runtime-validator.mjs";

const SAFE_ROOT_FILES = [".data-refresh/semantic-state.json"];
const EARNINGS_OUTPUT_SERIES_IDS = new Set([
  "total_earning",
  "contractual_earnings",
  "scheduled_earnings",
  "total_worked_hours",
  "employment_indices",
  "part_time_worker_ratio",
]);
const TRANSACTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function runRefresh({
  root = process.cwd(),
  registry,
  adapters = new Map(),
  check = false,
  verifyLastPublishNoop = false,
  rebaselineSemanticStateHash,
  validate,
  now = () => new Date(),
  preflightChanges,
  publish = publishArtifacts,
} = {}) {
  validateRegistry(registry);
  invariant(
    !verifyLastPublishNoop || check,
    "verify-noop-check-only",
    "Last-publish no-op verification is available only in check mode.",
  );
  invariant(
    rebaselineSemanticStateHash === undefined ||
      (typeof rebaselineSemanticStateHash === "string" &&
        /^[a-f0-9]{64}$/.test(rebaselineSemanticStateHash)),
    "rebaseline-hash-invalid",
    "Semantic-state rebaseline requires an expected SHA-256 hash.",
  );
  invariant(
    !verifyLastPublishNoop || rebaselineSemanticStateHash === undefined,
    "rebaseline-noop-conflict",
    "Semantic-state rebaseline cannot be combined with last-publish no-op verification.",
  );
  invariant(
    typeof validate === "function",
    "quality-validator-required",
    "A staged runtime quality validator is required.",
  );
  const unavailableSources = collectUnavailableSources(registry, adapters);
  if (unavailableSources.length) {
    const error = new RefreshError(
      "source-preflight-blocked",
      "Required sources are blocked or have no registered adapter.",
    );
    error.sources = unavailableSources;
    const absoluteRoot = await import("node:fs/promises").then(({ realpath }) => realpath(root));
    const timestamp = now().toISOString();
    const reportId = randomUUID();
    error.reportPath = await writeBlockedReport({
      absoluteRoot,
      sources: unavailableSources,
      timestamp,
      reportId,
    });
    throw error;
  }
  const absoluteRoot = await import("node:fs/promises").then(({ realpath }) => realpath(root));
  const workRoot = await createDirectoriesSafely(absoluteRoot, ".data-refresh");
  const releaseLock = await acquireExclusiveLock(path.join(workRoot, "refresh.lock"));
  const runId = randomUUID();
  const stageRelative = `.data-refresh/staging/${runId}`;
  const stageRoot = await createDirectoriesSafely(absoluteRoot, stageRelative);
  const report = {
    version: 1,
    runId,
    mode: verifyLastPublishNoop ? "verify-last-publish-noop" : check ? "check" : "publish",
    startedAt: now().toISOString(),
    sources: [],
    status: "running",
  };
  const journalPath = path.join(workRoot, "publish-journal.json");
  const backupRoot = path.join(workRoot, "backups");
  const statePath = path.join(workRoot, "semantic-state.json");
  let outcome;
  let activeSourceId = "refresh-core";
  let canonicalOutputStates = null;
  let candidateEvaluationStarted = false;
  let rebaselineOldStateHash;
  const stagedCandidates = new Map();
  try {
    const cpiVintageApproval = cpiVintageApprovalForRegistry(registry);
    await ensureSameFilesystem(absoluteRoot, stageRoot);
    const pendingJournal = await readJournal(journalPath);
    if (rebaselineSemanticStateHash !== undefined) {
      invariant(
        !pendingJournal,
        "rebaseline-recovery-required",
        "A pending publish journal prevents semantic-state rebaseline.",
      );
      await verifyNoRebaselineResidue({
        root: absoluteRoot,
        stagingRoot: path.join(workRoot, "staging"),
        currentStageName: runId,
        backupRoot,
        outputs: managedOutputsForRegistry(registry),
      });
      await verifyCleanTrackedOutputsAtHead(absoluteRoot, managedOutputsForRegistry(registry));
    }
    if (pendingJournal && check)
      throw new RefreshError(
        "recovery-required",
        "An incomplete publish journal exists; --check will not modify canonical files.",
      );
    if (pendingJournal)
      await recoverJournal({ root: absoluteRoot, journalPath, backupRoot, registry });

    const allowed = new Set([
      ...registry.sources.flatMap((source) => source.outputs.map(normalizeRelativeOutput)),
      ...SAFE_ROOT_FILES,
    ]);
    for (const output of allowed) await resolveContainedPath(absoluteRoot, output);
    const canonicalOutputs = registry.sources.flatMap((source) => source.outputs);
    const managedOutputs = [...new Set(canonicalOutputs)].sort();
    canonicalOutputStates = check ? await readOutputStates(absoluteRoot, managedOutputs) : null;
    let publishedHashes;
    let beforeSnapshot;
    if (verifyLastPublishNoop) {
      let state;
      try {
        state = await readJsonIfExists(statePath, null);
      } catch (error) {
        if (error?.code === "semantic-state-invalid") {
          throw new RefreshError(
            "verify-noop-state-invalid",
            "Last-publish semantic state is malformed.",
            { cause: error },
          );
        }
        throw error;
      }
      invariant(state, "verify-noop-state-missing", "Last-publish semantic state is missing.");
      publishedHashes = validatePublishedState(state, registry);
      beforeSnapshot = await snapshotPublishedManagedOutputs(
        absoluteRoot,
        managedOutputs,
        publishedHashes,
      );
      verifyUnstagedManagedChanges(absoluteRoot, managedOutputs, beforeSnapshot);
    } else {
      await preflightCanonicalEdits(absoluteRoot, canonicalOutputs, {
        checkChanges: preflightChanges,
      });
    }

    const transportConfig = await loadRefreshEnv({ cwd: absoluteRoot });
    const storedState = await readJsonIfExists(statePath, { fingerprints: {} });
    let oldState = storedState;
    if (rebaselineSemanticStateHash !== undefined) {
      let stateBytes;
      try {
        stateBytes = await readFile(statePath);
      } catch (error) {
        if (error?.code === "ENOENT")
          throw new RefreshError(
            "rebaseline-state-missing",
            "Semantic state is required for rebaseline.",
          );
        throw error;
      }
      const oldStateHash = rawSha256(stateBytes);
      invariant(
        oldStateHash === rebaselineSemanticStateHash,
        "rebaseline-state-hash-mismatch",
        "Semantic state does not match the expected rebaseline hash.",
      );
      validatePublishedState(storedState, registry);
      rebaselineOldStateHash = oldStateHash;
      report.semanticStateRebaseline = {
        reason: "explicit-hash-pinned-state-transition",
        oldStateSha256: oldStateHash,
        oldStateVersion: storedState.version,
        candidateFingerprints: {},
        candidateOutputHashes: {},
      };
      oldState = { fingerprints: {}, outputs: {} };
    }
    const nextState = {
      version: rebaselineSemanticStateHash !== undefined || storedState.version === 2 ? 2 : 1,
      fingerprints: { ...oldState.fingerprints },
      outputs: { ...oldState.outputs },
      ...(cpiVintageApproval ? { cpiVintageApproval } : {}),
    };
    const stagedArtifacts = [];
    const seenOutputs = new Set();
    const sourceResults = [];
    for (const source of topologicallyOrderSources(registry.sources)) {
      if (!source.required) continue;
      activeSourceId = source.id;
      const adapter = adapters.get(source.adapterId);
      const result = await adapter({
        source,
        stageRoot,
        root: absoluteRoot,
        check,
        now,
        transportConfig,
      });
      invariant(
        result && Array.isArray(result.artifacts),
        "adapter-contract",
        `Adapter ${source.adapterId} returned no artifact list.`,
      );
      invariant(
        Object.hasOwn(result, "semanticValue") && result.semanticValue !== undefined,
        "adapter-contract",
        `Adapter ${source.adapterId} returned no semantic value.`,
      );
      const fingerprint = semanticFingerprint(result.semanticValue);
      const unchanged = oldState.fingerprints[source.id] === fingerprint;
      if (verifyLastPublishNoop && !unchanged) {
        throw new RefreshError(
          "verify-noop-semantic-change",
          `Source ${source.id} differs semantically from the last published state.`,
        );
      }
      const rawEvidence = (result.rawFetches || []).map((item) => ({
        name: safeLabel(item.name),
        sha256: rawSha256(item.bytes),
        byteLength: item.bytes.byteLength,
      }));
      report.sources.push({
        sourceId: source.id,
        result: unchanged ? "unchanged" : oldState.fingerprints[source.id] ? "revision" : "fetched",
        semanticFingerprint: fingerprint,
        rawFetches: rawEvidence,
        coverage: safeObject(result.coverage),
        validation: safeObject(result.validationSummary),
        revisionAudit: safeRevisionAudit(result.revisionAudit),
        sourceCandidate: safeSourceCandidate(result.reportSummary),
      });
      sourceResults.push({ source, result });
      nextState.fingerprints[source.id] = fingerprint;
      if (report.semanticStateRebaseline) {
        report.semanticStateRebaseline.candidateFingerprints[source.id] = fingerprint;
      }
      const sourceArtifacts = new Map();
      candidateEvaluationStarted = true;
      for (const artifact of result.artifacts) {
        const relative = normalizeRelativeOutput(artifact.path);
        invariant(
          source.outputs.includes(relative),
          "path-not-allowlisted",
          `Source ${source.id} attempted to write an undeclared output.`,
        );
        invariant(
          allowed.has(relative) && !seenOutputs.has(relative),
          "path-not-allowlisted",
          `Output ${relative} is not uniquely allowlisted.`,
        );
        invariant(
          artifact.bytes instanceof Uint8Array || Buffer.isBuffer(artifact.bytes),
          "adapter-contract",
          `Artifact ${relative} must be bytes.`,
        );
        invariant(
          !sourceArtifacts.has(relative),
          "path-not-allowlisted",
          `Source ${source.id} returned duplicate output ${relative}.`,
        );
        seenOutputs.add(relative);
        sourceArtifacts.set(relative, artifact.bytes);
        if (check) {
          const stagedPath = await writeStagedCandidate(
            absoluteRoot,
            stageRelative,
            relative,
            artifact.bytes,
          );
          stagedCandidates.set(relative, stagedPath);
        }
      }
      for (const requiredOutput of source.outputs) {
        invariant(
          sourceArtifacts.has(requiredOutput),
          "adapter-incomplete-output",
          `Required source ${source.id} did not stage every declared output.`,
        );
      }
      if (unchanged) {
        const expected = oldState.outputs?.[source.id];
        if (!expected || source.outputs.some((output) => typeof expected[output] !== "string")) {
          throw new RefreshError(
            "semantic-state-outputs-missing",
            `Stored output integrity is unavailable for unchanged source ${source.id}; refusing to skip canonical outputs.`,
          );
        }
        for (const output of source.outputs) {
          let actual;
          try {
            actual = await readFile(
              await resolveContainedPath(absoluteRoot, output, { allowMissingLeaf: false }),
            );
          } catch (error) {
            if (error?.code === "ENOENT")
              throw new RefreshError(
                "canonical-output-missing",
                `Canonical output is missing for unchanged source ${source.id}.`,
              );
            throw error;
          }
          if (rawSha256(actual) !== expected[output]) {
            throw new RefreshError(
              "canonical-output-modified",
              `Canonical output was modified for unchanged source ${source.id}; refusing to skip it.`,
            );
          }
        }
        continue;
      }
      const outputHashes = {};
      for (const [relative, bytes] of sourceArtifacts) {
        const stagedPath = `${stageRelative}/artifacts/${relative}`;
        if (!check) await writeStagedCandidate(absoluteRoot, stageRelative, relative, bytes);
        stagedArtifacts.push({ path: relative, stagedPath });
        stagedCandidates.set(relative, stagedPath);
        outputHashes[relative] = rawSha256(bytes);
      }
      nextState.outputs[source.id] = outputHashes;
      if (report.semanticStateRebaseline) {
        report.semanticStateRebaseline.candidateOutputHashes[source.id] = { ...outputHashes };
      }
    }

    const quality = await validate({
      registry,
      sourceResults,
      stageRoot,
      root: absoluteRoot,
      check,
    });
    invariant(
      quality && typeof quality === "object" && !Array.isArray(quality),
      "quality-validator-invalid",
      "The staged runtime quality validator returned no check summary.",
    );
    report.quality = safeObject(quality);

    if (verifyLastPublishNoop) {
      verifyUnstagedManagedChanges(absoluteRoot, managedOutputs, beforeSnapshot);
      const afterSnapshot = await snapshotPublishedManagedOutputs(
        absoluteRoot,
        managedOutputs,
        publishedHashes,
      );
      invariant(
        JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot),
        "verify-noop-managed-change",
        "Managed outputs changed during no-op verification.",
      );
    }

    report.finishedAt = now().toISOString();
    report.status = "validated";
    report.outputsChanged = stagedArtifacts.map(({ path: output }) => output);
    if (check) {
      report.outputDiffs = await buildOutputDiffs(
        absoluteRoot,
        managedOutputs,
        canonicalOutputStates,
        stagedCandidates,
        candidateEvaluationStarted,
      );
    }
    if (!check && stagedArtifacts.length > 0) {
      if (rebaselineSemanticStateHash !== undefined) {
        const latestStateHash = rawSha256(await readFile(statePath));
        invariant(
          latestStateHash === rebaselineOldStateHash,
          "rebaseline-state-changed",
          "Semantic state changed during rebaseline; refusing to publish.",
        );
        await verifyCleanTrackedOutputsAtHead(absoluteRoot, managedOutputs);
        await verifyNoRebaselineResidue({
          root: absoluteRoot,
          stagingRoot: path.join(workRoot, "staging"),
          currentStageName: runId,
          backupRoot,
          outputs: managedOutputs,
        });
        invariant(
          !(await readJournal(journalPath)),
          "rebaseline-recovery-required",
          "A pending publish journal prevents semantic-state rebaseline.",
        );
      }
      const transactionId = randomUUID();
      nextState.publishTransactionId = transactionId;
      const stateStage = `${stageRelative}/semantic-state.json`;
      const stateAbsolute = await resolveContainedPath(absoluteRoot, stateStage);
      await writeFile(stateAbsolute, `${JSON.stringify(nextState, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      stagedArtifacts.push({ path: SAFE_ROOT_FILES[0], stagedPath: stateStage });
      await publish({
        root: absoluteRoot,
        workDir: stageRoot,
        journalPath,
        backupRoot,
        artifacts: stagedArtifacts,
        registry,
        transactionId,
      });
      report.status = stagedArtifacts.length > 1 ? "published" : "unchanged";
      report.outputsPublished = stagedArtifacts
        .filter((artifact) => artifact.path !== SAFE_ROOT_FILES[0])
        .map(({ path: output }) => output);
    } else if (!check && stagedArtifacts.length === 0) {
      report.status = "unchanged";
    }
    outcome = { report, exitCode: 0 };
  } catch (error) {
    report.finishedAt = now().toISOString();
    if (check) {
      try {
        const outputs = registry.sources.flatMap((source) => source.outputs);
        const managedOutputs = [...new Set(outputs)].sort();
        const canonicalStates =
          canonicalOutputStates ?? (await readOutputStates(absoluteRoot, managedOutputs));
        report.outputDiffs = await buildOutputDiffs(
          absoluteRoot,
          managedOutputs,
          canonicalStates,
          stagedCandidates,
          candidateEvaluationStarted,
        );
      } catch {
        // Output diagnostics are best effort; never replace the sanitized refresh failure.
      }
    }
    const reasonCode = safeErrorCode(error?.code) ?? "source-worker-failed";
    const sourceId =
      typeof error?.sourceId === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(error.sourceId)
        ? error.sourceId
        : activeSourceId;
    report.status = reasonCode;
    report.errorCode = reasonCode;
    report.sources.push({
      sourceId,
      result: "blocked",
      sourceCandidate: {
        status: "pending",
        reasonCode,
        ...(error?.earningsAnnualOverlapDiagnostics
          ? {
              earningsAnnualOverlapDiagnostics: safeEarningsAnnualOverlapDiagnostics(
                error.earningsAnnualOverlapDiagnostics,
              ),
            }
          : {}),
        ...(reasonCode === "runtime-quality-suite-failed"
          ? {
              runtimeQualityDiagnostics: safeRuntimeQualityDiagnostics(
                error?.runtimeQualityDiagnostics,
              ),
            }
          : {}),
        ...(reasonCode === "cpi-candidate-not-found"
          ? { candidateDiagnostics: safeCandidateDiagnostics(error?.candidateDiagnostics) }
          : {}),
        ...(reasonCode === "cpi-meta-candidate-mismatch"
          ? { candidateDiagnostics: safeCpiMetadataDiagnostics(error?.candidateDiagnostics) }
          : {}),
      },
      ...(reasonCode === "cpi-meta-area-unproven"
        ? {
            cpiMetadataAreaDiagnostics: safeCpiMetadataAreaDiagnostics(
              error?.cpiMetadataAreaDiagnostics,
            ),
          }
        : {}),
      ...(reasonCode === "cpi-meta-series-mismatch"
        ? {
            cpiMetadataCategoryDiagnostics: safeCpiMetadataCategoryDiagnostics(
              error?.cpiMetadataCategoryDiagnostics,
            ),
          }
        : {}),
      ...(reasonCode === "cpi-distribution-series-invalid"
        ? {
            cpiDistributionSeriesDiagnostics: safeCpiDistributionSeriesDiagnostics(
              error?.cpiDistributionSeriesDiagnostics,
            ),
          }
        : {}),
      ...(reasonCode === "cpi-distribution-api-period-mismatch"
        ? {
            cpiDistributionPeriodDiagnostics: safeCpiDistributionPeriodDiagnostics(
              error?.cpiDistributionPeriodDiagnostics,
            ),
          }
        : {}),
      ...(reasonCode === "cpi-meta-time-unproven"
        ? {
            cpiMetadataTimeDiagnostics: safeCpiMetadataTimeDiagnostics(
              error?.cpiMetadataTimeDiagnostics,
            ),
          }
        : {}),
      ...(reasonCode === "cpi-api-record-invalid"
        ? { cpiApiRecordDiagnostics: safeCpiApiRecordDiagnostics(error?.cpiApiRecordDiagnostics) }
        : {}),
      apiFailure: safeApiFailure(error),
      fileFailure: safeFileFailure(error),
    });
    outcome = { report, error, exitCode: 1 };
  } finally {
    await rm(stageRoot, { recursive: true, force: true }).catch(() => {});
    const reportName = `${new Date(report.startedAt).toISOString().replaceAll(":", "-")}-${runId}.json`;
    const reportFile = path.join(workRoot, reportName);
    await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }).catch(
      () => {},
    );
    if (outcome?.error && typeof outcome.error === "object") {
      try {
        outcome.error.reportPath = path.relative(absoluteRoot, reportFile);
      } catch {
        /* The report is still persisted. */
      }
    }
    await releaseLock();
  }
  if (outcome.error) throw outcome.error;
  return outcome.report;
}

async function writeStagedCandidate(root, stageRelative, relative, bytes) {
  const stagedPath = `${stageRelative}/artifacts/${relative}`;
  const stagedAbsolute = await resolveContainedPath(root, stagedPath);
  await mkdir(path.dirname(stagedAbsolute), { recursive: true });
  await writeFile(stagedAbsolute, bytes, { flag: "wx", mode: 0o600 });
  return stagedPath;
}

async function readOutputStates(root, outputs) {
  const states = new Map();
  for (const output of outputs) {
    try {
      const bytes = await readFile(
        await resolveContainedPath(root, output, { allowMissingLeaf: false }),
      );
      states.set(output, outputState(bytes));
    } catch (error) {
      if (error?.code === "ENOENT") states.set(output, absentOutputState());
      else throw error;
    }
  }
  return states;
}

async function buildOutputDiffs(
  root,
  outputs,
  canonicalStates,
  stagedCandidates,
  candidateEvaluationStarted,
) {
  const diffs = [];
  for (const output of outputs) {
    const prior = canonicalStates.get(output) ?? absentOutputState();
    const stagedPath = stagedCandidates.get(output);
    let post = absentOutputState();
    if (stagedPath) {
      try {
        const bytes = await readFile(
          await resolveContainedPath(root, stagedPath, { allowMissingLeaf: false }),
        );
        post = outputState(bytes);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    const status = !candidateEvaluationStarted
      ? "not-evaluated"
      : !prior.exists && !post.exists
        ? "missing"
        : !prior.exists
          ? "added"
          : !post.exists
            ? "removed"
            : prior.sha256 === post.sha256
              ? "unchanged"
              : "changed";
    diffs.push({ path: output, canonicalPrior: prior, stagedPost: post, status });
  }
  return diffs;
}

function outputState(bytes) {
  return { exists: true, sha256: rawSha256(bytes), byteLength: bytes.byteLength };
}

function absentOutputState() {
  return { exists: false, sha256: null, byteLength: null };
}

function validatePublishedState(state, registry) {
  const expectedCpiApproval = cpiVintageApprovalForRegistry(registry);
  invariant(
    state &&
      (state.version === 1 || state.version === 2) &&
      state.fingerprints &&
      typeof state.fingerprints === "object" &&
      !Array.isArray(state.fingerprints) &&
      state.outputs &&
      typeof state.outputs === "object" &&
      !Array.isArray(state.outputs) &&
      TRANSACTION_ID_PATTERN.test(state.publishTransactionId || ""),
    "verify-noop-state-invalid",
    "Last-publish semantic state or transaction id is invalid.",
  );
  const hashes = {};
  const requiredSources = registry.sources.filter((source) => source.required);
  invariant(
    Object.keys(state.fingerprints).length === requiredSources.length &&
      Object.keys(state.outputs).length === requiredSources.length,
    "verify-noop-state-invalid",
    "Last-publish semantic state is incomplete.",
  );
  if (expectedCpiApproval) {
    invariant(
      state.cpiVintageApproval?.discoveryPeriod === expectedCpiApproval.discoveryPeriod &&
        state.cpiVintageApproval?.approvedPeriod?.from ===
          expectedCpiApproval.approvedPeriod.from &&
        state.cpiVintageApproval?.approvedPeriod?.through ===
          expectedCpiApproval.approvedPeriod.through,
      "verify-noop-state-invalid",
      "Last-publish CPI vintage approval manifest does not match the registry.",
    );
  }
  for (const source of requiredSources) {
    const fingerprint = state.fingerprints[source.id];
    const sourceHashes = state.outputs[source.id];
    invariant(
      typeof fingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(fingerprint) &&
        sourceHashes &&
        typeof sourceHashes === "object" &&
        !Array.isArray(sourceHashes) &&
        Object.keys(sourceHashes).length === source.outputs.length &&
        source.outputs.every(
          (output) =>
            typeof sourceHashes[output] === "string" && /^[a-f0-9]{64}$/.test(sourceHashes[output]),
        ),
      "verify-noop-state-invalid",
      `Last-publish output hash manifest is incomplete for ${source.id}.`,
    );
    for (const output of source.outputs) hashes[output] = sourceHashes[output];
  }
  return hashes;
}

function cpiVintageApprovalForRegistry(registry) {
  const source = registry.sources.find(({ id }) => id === "cpi-long");
  if (!source) return undefined;
  invariant(
    source.period?.through === "latest-published" &&
      source.approvedPeriod?.from === "202607" &&
      source.approvedPeriod?.through === "202608",
    "cpi-approval-contract-invalid",
    "CPI registry must keep latest-published discovery separate from the reviewed July–August 2026 period.",
  );
  return {
    discoveryPeriod: source.period.through,
    approvedPeriod: {
      from: source.approvedPeriod.from,
      through: source.approvedPeriod.through,
    },
  };
}

async function writeBlockedReport({ absoluteRoot, sources, timestamp, reportId }) {
  await createDirectoriesSafely(absoluteRoot, ".data-refresh/reports");
  const safeSources = sources.map(({ sourceId, reason }) => ({
    sourceId: /^[a-z0-9][a-z0-9-]{0,79}$/.test(sourceId) ? sourceId : "required-source",
    reason: /^[a-z][a-z0-9-]{0,79}$/.test(reason) ? reason : "source-blocked",
  }));
  const report = {
    version: 1,
    plan: "shared-plan-52",
    planState: "blocked-before-fetch",
    status: "source-preflight-blocked",
    generatedAt: timestamp,
    sources: safeSources,
  };
  const reportName = `${timestamp.replaceAll(":", "-")}-${reportId}.json`;
  const relativePath = `.data-refresh/reports/${reportName}`;
  const reportPath = await resolveContainedPath(absoluteRoot, relativePath);
  const temporaryPath = await resolveContainedPath(absoluteRoot, `${relativePath}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, reportPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return relativePath;
}

function collectUnavailableSources(registry, adapters) {
  const unavailable = [];
  const seen = new Set();
  for (const source of registry.sources) {
    if (!source.required) continue;
    const adapterMissing = !source.adapterId || !adapters.has(source.adapterId);
    if (!source.blockedReason && !adapterMissing) continue;
    const reasonCode =
      typeof source.blockedReason === "string" ? source.blockedReason.split(":", 1)[0] : "";
    const reason = source.blockedReason
      ? /^[a-z][a-z0-9-]{0,79}$/.test(reasonCode)
        ? reasonCode
        : "source-blocked"
      : "adapter-not-registered";
    unavailable.push({ sourceId: source.id, reason });
    seen.add(source.adapterId);
  }
  for (const adapterId of registry.requiredAdapters) {
    if (!adapters.has(adapterId) && !seen.has(adapterId)) {
      unavailable.push({
        sourceId: /^[a-z0-9][a-z0-9-]{0,79}$/.test(adapterId) ? adapterId : "required-adapter",
        reason: "adapter-not-registered",
      });
    }
  }
  return unavailable;
}

async function readJsonIfExists(file, fallback) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    invariant(
      value &&
        (value.version === 1 || value.version === 2) &&
        value.fingerprints &&
        typeof value.fingerprints === "object",
      "semantic-state-invalid",
      "Semantic state file is invalid.",
    );
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    if (error instanceof RefreshError) throw error;
    throw new RefreshError("semantic-state-invalid", "Semantic state file cannot be parsed.");
  }
}

function managedOutputsForRegistry(registry) {
  return [...new Set(registry.sources.flatMap((source) => source.outputs))].sort();
}

function safeLabel(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(value) ? value : "source-bytes";
}

function safeErrorCode(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(value) ? value : undefined;
}

function safeApiFailure(error) {
  const phases = new Set(["table-list", "catalog", "metadata", "stats-data"]);
  if (!phases.has(error?.apiPhase)) return undefined;
  const failure = { phase: error.apiPhase };
  if (error?.code === "candidate-resolution-pending" && error.apiPhase === "catalog") {
    const candidateCountKeys = [
      "catalogRows",
      "datasetRows",
      "resourceRows",
      "expectedIdMatches",
      "allowedFormatMatches",
      "httpsOfficialHostMatches",
      "datasetTitleMarkerMatches",
      "resourceTitleMarkerMatches",
      "parseableDateMatches",
      "fullMatches",
      "latestTieCount",
    ];
    const optionalCandidateCountKeys = ["subCategory1MarkerMatches"];
    const diagnostics = error.candidateDiagnostics;
    if (diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)) {
      const candidateCounts = {};
      for (const key of candidateCountKeys) {
        const value = diagnostics[key];
        if (!Number.isSafeInteger(value) || value < 0) return failure;
        candidateCounts[key] = value;
      }
      for (const key of optionalCandidateCountKeys) {
        if (!Object.hasOwn(diagnostics, key)) continue;
        const value = diagnostics[key];
        if (!Number.isSafeInteger(value) || value < 0) return failure;
        candidateCounts[key] = value;
      }
      failure.candidateCounts = candidateCounts;
    }
    return failure;
  }
  if (error?.code === "api-invalid-schema") {
    const schemaFailureCodes = new Set([
      "payload-not-object",
      "paging-metadata-missing",
      "total-invalid",
    ]);
    if (schemaFailureCodes.has(error.apiSchemaFailureCode)) {
      failure.schemaCode = error.apiSchemaFailureCode;
    }
    return failure;
  }
  if (Number.isSafeInteger(error?.apiStatus) && error.apiStatus !== 0) {
    failure.status = error.apiStatus;
  } else {
    return undefined;
  }
  return failure;
}

function safeFileFailure(error) {
  const value = error?.fileFailure;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { status, attempt, maxAttempts, retryable, retriesExhausted } = value;
  if (
    !Number.isSafeInteger(status) ||
    status < 100 ||
    status > 599 ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    attempt > maxAttempts ||
    typeof retryable !== "boolean" ||
    typeof retriesExhausted !== "boolean" ||
    (retriesExhausted && (!retryable || attempt !== maxAttempts))
  ) {
    return undefined;
  }
  return { status, attempt, maxAttempts, retryable, retriesExhausted };
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/^[a-zA-Z0-9._-]{1,60}$/.test(key) && ["number", "boolean"].includes(typeof entry))
      result[key] = entry;
  }
  return result;
}

function containsControlCodePoint(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if ((codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f))
      return true;
  }
  return false;
}

function safeRuntimeQualityDiagnostics(value) {
  const hasCounts =
    Object.hasOwn(value ?? {}, "testResultCount") ||
    Object.hasOwn(value ?? {}, "failedAssertionCount");
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Number.isSafeInteger(value.exitCode) ||
    value.exitCode < 0 ||
    value.exitCode > 255 ||
    !RUNTIME_FAILURE_REPORT_STATUSES.includes(value.reportStatus) ||
    !Number.isSafeInteger(value.reportBytes) ||
    value.reportBytes < 0 ||
    value.reportBytes > 10 * 1024 * 1024 ||
    (hasCounts &&
      (!Number.isSafeInteger(value.testResultCount) ||
        value.testResultCount < 0 ||
        value.testResultCount > 1_000_000 ||
        !Number.isSafeInteger(value.failedAssertionCount) ||
        value.failedAssertionCount < 0 ||
        value.failedAssertionCount > 1_000_000)) ||
    !Array.isArray(value.failedTestSamples) ||
    value.failedTestSamples.length > 12
  )
    return undefined;
  const samples = [];
  for (const sample of value.failedTestSamples) {
    if (
      !sample ||
      typeof sample !== "object" ||
      Array.isArray(sample) ||
      !RUNTIME_QUALITY_TESTS.includes(sample.file) ||
      Object.keys(sample).some((key) => !["file", "title", "fileErrorCategory"].includes(key)) ||
      (Object.hasOwn(sample, "fileErrorCategory") &&
        !RUNTIME_FILE_ERROR_CATEGORIES.includes(sample.fileErrorCategory))
    )
      return undefined;
    if (Object.hasOwn(sample, "title")) {
      if (
        typeof sample.title !== "string" ||
        sample.title.length < 1 ||
        sample.title.length > 240 ||
        containsControlCodePoint(sample.title) ||
        /https?:\/\/\S+|(?:password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+|(?:[A-Za-z]:\\|\\\\|\/)(?:[^\s"'<>|,;]+[\\/]?)+/i.test(
          sample.title,
        )
      )
        return undefined;
      samples.push({
        file: sample.file,
        title: sample.title,
        ...(sample.fileErrorCategory ? { fileErrorCategory: sample.fileErrorCategory } : {}),
      });
    } else {
      samples.push({
        file: sample.file,
        ...(sample.fileErrorCategory ? { fileErrorCategory: sample.fileErrorCategory } : {}),
      });
    }
  }
  return {
    exitCode: value.exitCode,
    reportStatus: value.reportStatus,
    reportBytes: value.reportBytes,
    ...(value.reportStatus !== "report-failures-found" &&
    typeof value.startupError === "string" &&
    value.startupError.length >= 1 &&
    value.startupError.length <= 240 &&
    (/^(?:error\b|(?:type|syntax|reference|range|uri)error\s*:|failed\b|cannot\b|unhandled\b)/i.test(
      value.startupError,
    ) ||
      /^(?:✘\s*)?(?:\[error\]\s*)?(?:could not (?:resolve|load)\b|failed to resolve import\b|enoent\b)/i.test(
        value.startupError,
      ) ||
      /\b(?:failed to load config|failed to resolve import|error when starting|vite server startup)\b/i.test(
        value.startupError,
      )) &&
    !containsControlCodePoint(value.startupError) &&
    !/https?:\/\/\S+|(?:password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*(?!\[redacted\])[^\s,;]+|(?:[A-Za-z]:\\|\\\\|\/)(?:[^\s"'<>|,;]+[\\/]?)+/i.test(
      value.startupError,
    )
      ? { startupError: value.startupError }
      : {}),
    ...(hasCounts
      ? { testResultCount: value.testResultCount, failedAssertionCount: value.failedAssertionCount }
      : {}),
    failedTestSamples: samples,
  };
}

function safeCandidateDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const cycleCategories = new Set(["monthly", "annual", "quarterly", "other", "missing"]);
  const identityCandidates = value.identityCandidates;
  if (!Array.isArray(identityCandidates) || identityCandidates.length > 3) return undefined;
  const safeIdentityCandidates = [];
  for (const candidate of identityCandidates) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      typeof candidate.statsDataId !== "string" ||
      !/^\d{8,16}$/.test(candidate.statsDataId) ||
      !cycleCategories.has(candidate.cycleCategory) ||
      !Array.isArray(candidate.surveyYears) ||
      candidate.surveyYears.length > 60 ||
      candidate.surveyYears.some(
        (year) =>
          typeof year !== "string" ||
          !/^\d{4}$/.test(year) ||
          Number(year) < 1900 ||
          Number(year) > 2100,
      ) ||
      new Set(candidate.surveyYears).size !== candidate.surveyYears.length
    ) {
      return undefined;
    }
    safeIdentityCandidates.push({
      statsDataId: candidate.statsDataId,
      cycleCategory: candidate.cycleCategory,
      surveyYears: [...candidate.surveyYears],
    });
  }
  const keys = [
    "rowsReturned",
    "requiredIdentityFields",
    "titleAndStatNameIdentityMatch",
    "monthlyFrequencyMatch",
    "surveyDate2025Match",
    "fullMatch",
  ];
  const result = {};
  for (const key of keys) {
    const count = value[key];
    if (Number.isSafeInteger(count) && count >= 0) result[key] = count;
  }
  if (Object.keys(result).length !== keys.length) return undefined;
  result.identityCandidates = safeIdentityCandidates;
  return result;
}

function safeCpiMetadataDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const keys = [
    "selectedPresent",
    "idExact",
    "titleContainsSelectedTitle",
    "identityMarkers",
    "statisticsName",
  ];
  const result = {};
  for (const key of keys) {
    if (typeof value[key] !== "boolean") return undefined;
    result[key] = value[key];
  }
  return result;
}

function safeCpiMetadataAreaDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const keys = [
    "areaDimensionFound",
    "nationalCode00000Found",
    "nationalNameNationalFound",
    "nationalCodeAndNameSameClass",
  ];
  const result = {};
  for (const key of keys) {
    if (typeof value[key] !== "boolean") return undefined;
    result[key] = value[key];
  }
  return result;
}

function safeCpiMetadataCategoryDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (typeof value.categoryClassObjFound !== "boolean") return undefined;
  const result = { categoryClassObjFound: value.categoryClassObjFound };
  for (const key of [
    "rowCount",
    "uniqueCodeCount",
    "expectedCodeMatchCount",
    "exactNameMatchCount",
    "namePrimitiveCount",
    "nameDollarWrappedCount",
    "nameMissingCount",
    "normalizedNameMatchCount",
    "expectedCodeNamePresentCount",
  ]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
    result[key] = value[key];
  }
  return result;
}

function safeCpiDistributionSeriesDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const keys = [
    "codeRowColumnCount",
    "totalCodeCount",
    "nonEmptyCodeCount",
    "uniqueCodeCount",
    "emptyCodeCount",
    "duplicateCodeCount",
    "expectedCodeMatchCount",
    "supplementalCodeCount",
    "missingExpectedCodeCount",
  ];
  const result = {};
  for (const key of keys) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
    result[key] = value[key];
  }
  return result;
}

function safeCpiDistributionPeriodDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const countKeys = [
    "apiPeriodCount",
    "distributionPeriodCount",
    "distributionFileByteLength",
    "positionalMismatchCount",
    "missingApiPeriodCount",
  ];
  const monthKeys = [
    "apiStartMonth",
    "apiEndMonth",
    "distributionStartMonth",
    "distributionEndMonth",
    "firstMismatchApiMonth",
    "firstMismatchDistributionMonth",
  ];
  const result = {};
  for (const key of countKeys) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
    result[key] = value[key];
  }
  if (
    typeof value.distributionFileSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.distributionFileSha256)
  ) {
    return undefined;
  }
  result.distributionFileSha256 = value.distributionFileSha256;
  if (
    value.firstMismatchIndex !== null &&
    (!Number.isSafeInteger(value.firstMismatchIndex) || value.firstMismatchIndex < 0)
  ) {
    return undefined;
  }
  result.firstMismatchIndex = value.firstMismatchIndex;
  for (const key of monthKeys) {
    if (value[key] !== null && (typeof value[key] !== "string" || !/^\d{6}$/.test(value[key]))) {
      return undefined;
    }
    result[key] = value[key];
  }
  return result;
}

function safeCpiMetadataTimeDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const booleanKeys = ["timeDimensionFound", "requiredStartMonthFound", "monthlyContinuity"];
  const countKeys = [
    "rowCount",
    "monthlyPeriodCount",
    "annualPeriodCount",
    "malformedLabelCount",
    "monthLabelPatternCount",
    "calendarYearLabelPatternCount",
    "fiscalYearLabelPatternCount",
    "annualAverageLabelPatternCount",
    "blankLabelCount",
    "otherLabelPatternCount",
    "malformedUniqueCodeCount",
    "duplicateCodeCount",
    "duplicatePeriodCount",
  ];
  const result = {};
  for (const key of booleanKeys) {
    if (typeof value[key] !== "boolean") return undefined;
    result[key] = value[key];
  }
  for (const key of countKeys) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
    result[key] = value[key];
  }
  return result;
}

function safeCpiApiRecordDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const keys = ["totalRows", "unknownCategoryCount", "unrecognizedTimeCount", "bothInvalidCount"];
  const result = {};
  for (const key of keys) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
    result[key] = value[key];
  }
  return result;
}

function safeSourceCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const id = (entry) => (typeof entry === "string" && /^\d{8,16}$/.test(entry) ? entry : undefined);
  const date = (entry) =>
    typeof entry === "string" && /^[0-9年月日./ -]{1,32}$/.test(entry) ? entry : undefined;
  const safeTitle = (entry, max = 200) =>
    typeof entry === "string" &&
    entry.length <= max &&
    !/(?:https?:\/\/|appId\s*=|api.?key|token\s*=)/i.test(entry) &&
    (entry.includes("消費者物価指数") || entry.includes("世帯消費動向指数"))
      ? entry
      : undefined;
  const title =
    safeTitle(value.selectedTitle, 160) && value.selectedTitle.includes("2025年基準")
      ? value.selectedTitle
      : undefined;
  const fileTitle = safeTitle;
  const fileDate = (entry) =>
    typeof entry === "string" && /^[0-9年月日./ -]{1,32}$/.test(entry) ? entry : undefined;
  const safe = {
    status: value.status === "pending" ? "pending" : undefined,
    reasonCode:
      typeof value.reasonCode === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(value.reasonCode)
        ? value.reasonCode
        : undefined,
    candidateCount:
      Number.isSafeInteger(value.candidateCount) && value.candidateCount >= 0
        ? value.candidateCount
        : undefined,
    selectedSourceId: id(value.selectedSourceId),
    selectedTitle: title,
    updatedDate: date(value.updatedDate),
    openDate: date(value.openDate),
    apiStatsDataId: id(value.apiStatsDataId),
    selectedCatalogResourceId:
      typeof value.selectedCatalogResourceId === "string" &&
      /^[A-Za-z0-9._-]{1,128}$/.test(value.selectedCatalogResourceId)
        ? value.selectedCatalogResourceId
        : undefined,
    selectedCatalogTitle: fileTitle(value.selectedCatalogTitle),
    selectedCatalogFormat: ["CSV", "XLS", "XLSX"].includes(value.selectedCatalogFormat)
      ? value.selectedCatalogFormat
      : undefined,
    selectedCatalogReleaseDate: fileDate(value.selectedCatalogReleaseDate),
    selectedCatalogLastModifiedDate: fileDate(value.selectedCatalogLastModifiedDate),
    fileCandidateCount:
      Number.isSafeInteger(value.fileCandidateCount) && value.fileCandidateCount >= 0
        ? value.fileCandidateCount
        : undefined,
    fileCandidateTitle: fileTitle(value.fileCandidateTitle),
    fileResourceTitle: fileTitle(value.fileResourceTitle),
    fileFormat: ["CSV", "XLS", "XLSX"].includes(value.fileFormat) ? value.fileFormat : undefined,
    catalogResourceId:
      typeof value.catalogResourceId === "string" &&
      /^[A-Za-z0-9._-]{1,128}$/.test(value.catalogResourceId)
        ? value.catalogResourceId
        : undefined,
    fileStatInfId: id(value.fileStatInfId),
    expectedLegacyStatInfId: id(value.expectedLegacyStatInfId),
    fileReleaseDate: fileDate(value.fileReleaseDate),
    fileLastModifiedDate: fileDate(value.fileLastModifiedDate),
    retrievedAt:
      typeof value.retrievedAt === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value.retrievedAt)
        ? value.retrievedAt
        : undefined,
    coverageStart: /^\d{6}$/.test(value.coverageStart || "") ? value.coverageStart : undefined,
    coverageEnd: /^\d{6}$/.test(value.coverageEnd || "") ? value.coverageEnd : undefined,
    coverageCount:
      Number.isSafeInteger(value.coverageCount) && value.coverageCount >= 0
        ? value.coverageCount
        : undefined,
    discoveryPeriod:
      value.discoveryPeriod === "latest-published" ? value.discoveryPeriod : undefined,
    approvedPeriod:
      value.discoveryPeriod === "latest-published" &&
      value.approvedPeriod?.from === "202607" &&
      value.approvedPeriod?.through === "202608"
        ? { from: value.approvedPeriod.from, through: value.approvedPeriod.through }
        : undefined,
    revisionCount:
      Number.isSafeInteger(value.revisionCount) && value.revisionCount >= 0
        ? value.revisionCount
        : undefined,
    revisionHash: /^[a-f0-9]{64}$/.test(value.revisionHash || "") ? value.revisionHash : undefined,
    validationResult: value.validationResult === "passed" ? "passed" : undefined,
    revisionStartMonth: /^\d{4}(0[1-9]|1[0-2])$/.test(value.revisionStartMonth || "")
      ? value.revisionStartMonth
      : undefined,
    revisionEndMonth: /^\d{4}(0[1-9]|1[0-2])$/.test(value.revisionEndMonth || "")
      ? value.revisionEndMonth
      : undefined,
    revisionComparedValueCount:
      Number.isSafeInteger(value.revisionComparedValueCount) &&
      value.revisionComparedValueCount >= 0
        ? value.revisionComparedValueCount
        : undefined,
  };
  if (Array.isArray(value.fileCandidates))
    safe.fileCandidates = value.fileCandidates.slice(0, 10).flatMap((item) => {
      if (
        !item ||
        !/^\d{8,16}$/.test(item.identityStatInfId || "") ||
        !["CSV", "XLS", "XLSX"].includes(item.format) ||
        !Number.isSafeInteger(item.candidateCount) ||
        item.candidateCount < 1
      )
        return [];
      const safeFileCandidateTitle = (entry) => safeTitle(entry, 200);
      const releaseDate = date(item.releaseDate);
      const lastModifiedDate = date(item.lastModifiedDate);
      const resourceId =
        typeof item.catalogResourceId === "string" &&
        /^[A-Za-z0-9._-]{1,128}$/.test(item.catalogResourceId)
          ? item.catalogResourceId
          : undefined;
      if (
        !resourceId ||
        !safeFileCandidateTitle(item.title) ||
        !safeFileCandidateTitle(item.resourceTitle) ||
        !releaseDate ||
        !lastModifiedDate
      )
        return [];
      return [
        {
          identityStatInfId: item.identityStatInfId,
          catalogResourceId: resourceId,
          legacyStatInfId: id(item.legacyStatInfId),
          title: item.title,
          resourceTitle: item.resourceTitle,
          format: item.format,
          releaseDate,
          lastModifiedDate,
          candidateCount: item.candidateCount,
        },
      ];
    });
  if (value.coverage && typeof value.coverage === "object" && !Array.isArray(value.coverage)) {
    const coverage = {};
    for (const key of ["start", "end", "startMonth", "endMonth"]) {
      if (
        typeof value.coverage[key] === "string" &&
        /^[0-9年月日Qq. -]{1,32}$/.test(value.coverage[key])
      )
        coverage[key] = value.coverage[key];
    }
    for (const key of [
      "monthCount",
      "monthlyRows",
      "seriesCount",
      "annualStart",
      "quarterlyStart",
    ]) {
      const item = value.coverage[key];
      if (Number.isSafeInteger(item) && item >= 0) coverage[key] = item;
      else if (typeof item === "string" && /^\d{4}Q[1-4]$/.test(item)) coverage[key] = item;
    }
    if (Object.keys(coverage).length) safe.coverage = coverage;
  }
  if (
    value.filters &&
    typeof value.filters === "object" &&
    !Array.isArray(value.filters) &&
    value.filters.cdArea === "00000" &&
    value.filters.cdTab === "1" &&
    value.filters.cdTimeFrom === "197001"
  ) {
    safe.filters = { cdArea: "00000", cdTab: "1", cdTimeFrom: "197001" };
  }
  if (typeof value.table === "string" && value.table === value.selectedTitle) safe.table = title;
  if (value.classification === "CPI 2025 base; nationwide monthly index; 78 cat01 series")
    safe.classification = value.classification;
  if (Array.isArray(value.revisionSamples))
    safe.revisionSamples = value.revisionSamples.slice(0, 10).flatMap((sample) => {
      if (
        !sample ||
        typeof sample.seriesId !== "string" ||
        !/^[A-Za-z0-9._-]{1,80}$/.test(sample.seriesId)
      )
        return [];
      const month = /^\d{4}(0[1-9]|1[0-2])$/.test(sample.month || "")
        ? `${sample.month.slice(0, 4)}-${sample.month.slice(4)}`
        : /^\d{4}-(0[1-9]|1[0-2])$/.test(sample.month || "")
          ? sample.month
          : undefined;
      return month ? [{ seriesId: sample.seriesId, month }] : [];
    });
  if (value.earningsAnnualOverlapDiagnostics) {
    const diagnostics = safeEarningsAnnualOverlapDiagnostics(
      value.earningsAnnualOverlapDiagnostics,
    );
    if (diagnostics) safe.earningsAnnualOverlapDiagnostics = diagnostics;
  }
  if (Array.isArray(value.outputHashes))
    safe.outputHashes = value.outputHashes.slice(0, 20).flatMap((item) => {
      if (
        !item ||
        typeof item.path !== "string" ||
        !/^data\/source\/[a-zA-Z0-9._/-]{1,180}$/.test(item.path) ||
        item.path.split("/").includes("..")
      )
        return [];
      const entry = { path: item.path };
      for (const key of ["oldSha256", "newSha256"])
        if (typeof item[key] === "string" && /^[a-f0-9]{64}$/.test(item[key]))
          entry[key] = item[key];
      return entry.newSha256 ? [entry] : [];
    });
  return Object.fromEntries(Object.entries(safe).filter(([, entry]) => entry !== undefined));
}

function safeEarningsAnnualOverlapDiagnostics(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !EARNINGS_OUTPUT_SERIES_IDS.has(value.series) ||
    !Number.isSafeInteger(value.mismatchCount) ||
    value.mismatchCount < 0 ||
    value.mismatchCount > 1_000_000
  )
    return undefined;
  const samples = Array.isArray(value.sample)
    ? value.sample.slice(0, 5).flatMap((sample) =>
        sample &&
        /^\d{4}$/.test(String(sample.year ?? "")) &&
        Number.isInteger(Number(sample.year)) &&
        Number(sample.year) >= 1900 &&
        Number(sample.year) <= 2100 &&
        Number.isFinite(sample.oldValue) &&
        sample.oldValue >= 0 &&
        sample.oldValue <= 1_000_000 &&
        Number.isFinite(sample.newValue) &&
        sample.newValue >= 0 &&
        sample.newValue <= 1_000_000
          ? [
              {
                year: String(sample.year),
                oldValue: sample.oldValue,
                newValue: sample.newValue,
              },
            ]
          : [],
      )
    : [];
  return { series: value.series, mismatchCount: value.mismatchCount, sample: samples };
}

function safeRevisionAudit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const safeHash = (entry) =>
    typeof entry === "string" && /^[a-f0-9]{64}$/.test(entry) ? entry : undefined;
  const sources = [];
  for (const [sourceId, entry] of Object.entries(value).slice(0, 100)) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(sourceId) || !entry || typeof entry !== "object") continue;
    const record = { sourceId };
    for (const key of [
      "overlapCount",
      "comparedObservationCount",
      "changedObservationCount",
      "changedValueCount",
    ]) {
      if (Number.isSafeInteger(entry[key]) && entry[key] >= 0) record[key] = entry[key];
    }
    if (
      Number.isSafeInteger(entry.acceptedAnnualRoundingAdjustmentCount) &&
      entry.acceptedAnnualRoundingAdjustmentCount >= 0 &&
      entry.acceptedAnnualRoundingAdjustmentCount <= 1_000_000
    ) {
      record.acceptedAnnualRoundingAdjustmentCount = entry.acceptedAnnualRoundingAdjustmentCount;
    }
    if (Array.isArray(entry.acceptedAnnualRoundingAdjustmentSample)) {
      record.acceptedAnnualRoundingAdjustmentSample = entry.acceptedAnnualRoundingAdjustmentSample
        .slice(0, 5)
        .flatMap((sample) =>
          sample &&
          EARNINGS_OUTPUT_SERIES_IDS.has(sample.series) &&
          /^\d{4}$/.test(String(sample.year ?? "")) &&
          Number(sample.year) >= 1900 &&
          Number(sample.year) <= 2100 &&
          Number.isFinite(sample.oldValue) &&
          sample.oldValue >= 0 &&
          sample.oldValue <= 1_000_000 &&
          Number.isFinite(sample.newValue) &&
          sample.newValue >= 0 &&
          sample.newValue <= 1_000_000 &&
          [
            "official-cy-upper-rounding-at-monthly-midpoint",
            "official-cy-matches-monthly-mean-at-higher-precision",
          ].includes(sample.reason)
            ? [
                {
                  series: sample.series,
                  year: String(sample.year),
                  oldValue: sample.oldValue,
                  newValue: sample.newValue,
                  reason: sample.reason,
                },
              ]
            : [],
        );
    }
    for (const key of ["sha256", "previousSha256", "sourceSha256", "currentSha256"]) {
      const hash = safeHash(entry[key]);
      if (hash) record[key] = hash;
    }
    const safeTimestamp = (candidate) =>
      typeof candidate === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate) &&
      Number.isFinite(Date.parse(candidate));
    for (const key of ["previousRetrievedAt", "retrievedAt"]) {
      if (safeTimestamp(entry[key])) record[key] = entry[key];
    }
    if (Array.isArray(entry.changedSample)) {
      const populationSamples = sourceId === "population" ? [] : undefined;
      record.changedSample = entry.changedSample.slice(0, 10).flatMap((sample) => {
        if (!sample) return [];
        if (sourceId === "population") {
          if (
            populationSamples.length > 0 ||
            typeof sample.period !== "string" ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(sample.period) ||
            !Number.isFinite(sample.previous) ||
            sample.previous < 0 ||
            sample.previous > 100_000 ||
            !Number.isFinite(sample.current) ||
            sample.current < 0 ||
            sample.current > 100_000
          ) {
            return [];
          }
          const safeSample = {
            period: sample.period,
            previous: sample.previous,
            current: sample.current,
          };
          populationSamples.push(safeSample);
          return [safeSample];
        }
        if (
          Number.isSafeInteger(sample.seriesIndex) &&
          sample.seriesIndex >= 0 &&
          typeof sample.month === "string" &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(sample.month)
        ) {
          return [{ seriesIndex: sample.seriesIndex, month: sample.month }];
        }
        if (
          sourceId !== "population" &&
          typeof sample.period === "string" &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(sample.period) &&
          Number.isSafeInteger(sample.previous) &&
          sample.previous > 0 &&
          Number.isSafeInteger(sample.current) &&
          sample.current > 0
        ) {
          return [{ period: sample.period, previous: sample.previous, current: sample.current }];
        }
        return [];
      });
    }
    sources.push(record);
  }
  return sources.length ? sources : undefined;
}
