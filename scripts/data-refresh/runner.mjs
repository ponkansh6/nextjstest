import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RefreshError, invariant } from "./lib/errors.mjs";
import { semanticFingerprint, rawSha256 } from "./lib/fingerprint.mjs";
import { acquireExclusiveLock } from "./lib/lock.mjs";
import {
  preflightCanonicalEdits,
  ensureSameFilesystem,
  resolveContainedPath,
  createDirectoriesSafely,
  normalizeRelativeOutput,
} from "./lib/fs-safety.mjs";
import { readJournal, recoverJournal, publishArtifacts } from "./lib/journal.mjs";
import { validateRegistry, topologicallyOrderSources } from "./registry/schema.mjs";
import { loadRefreshEnv } from "./transport/env.mjs";

const SAFE_ROOT_FILES = [".data-refresh/semantic-state.json"];

export async function runRefresh({
  root = process.cwd(),
  registry,
  adapters = new Map(),
  check = false,
  validate,
  now = () => new Date(),
  preflightChanges,
  publish = publishArtifacts,
} = {}) {
  validateRegistry(registry);
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
    mode: check ? "check" : "publish",
    startedAt: now().toISOString(),
    sources: [],
    status: "running",
  };
  const journalPath = path.join(workRoot, "publish-journal.json");
  const backupRoot = path.join(workRoot, "backups");
  const statePath = path.join(workRoot, "semantic-state.json");
  let outcome;
  let activeSourceId = "refresh-core";
  try {
    await ensureSameFilesystem(absoluteRoot, stageRoot);
    const pendingJournal = await readJournal(journalPath);
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
    await preflightCanonicalEdits(absoluteRoot, canonicalOutputs, {
      checkChanges: preflightChanges,
    });

    const transportConfig = await loadRefreshEnv({ cwd: absoluteRoot });
    const oldState = await readJsonIfExists(statePath, { fingerprints: {} });
    const nextState = {
      version: 1,
      fingerprints: { ...oldState.fingerprints },
      outputs: { ...oldState.outputs },
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
      const sourceArtifacts = new Map();
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
        const stagedAbsolute = await resolveContainedPath(absoluteRoot, stagedPath);
        await mkdir(path.dirname(stagedAbsolute), { recursive: true });
        await writeFile(stagedAbsolute, bytes, { flag: "wx", mode: 0o600 });
        stagedArtifacts.push({ path: relative, stagedPath });
        outputHashes[relative] = rawSha256(bytes);
      }
      nextState.outputs[source.id] = outputHashes;
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

    report.finishedAt = now().toISOString();
    report.status = "validated";
    report.outputsChanged = stagedArtifacts.map(({ path: output }) => output);
    if (!check && stagedArtifacts.length > 0) {
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
      sourceCandidate: { status: "pending", reasonCode },
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
      value && value.version === 1 && value.fingerprints && typeof value.fingerprints === "object",
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

function safeLabel(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(value) ? value : "source-bytes";
}

function safeErrorCode(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(value) ? value : undefined;
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
    revisionCount:
      Number.isSafeInteger(value.revisionCount) && value.revisionCount >= 0
        ? value.revisionCount
        : undefined,
    revisionHash: /^[a-f0-9]{64}$/.test(value.revisionHash || "") ? value.revisionHash : undefined,
    validationResult: value.validationResult === "passed" ? "passed" : undefined,
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
    safe.revisionSamples = value.revisionSamples
      .slice(0, 10)
      .flatMap((sample) =>
        sample &&
        typeof sample.seriesId === "string" &&
        /^\d{4}$/.test(sample.seriesId) &&
        /^\d{4}-\d\d$/.test(sample.month || "")
          ? [{ seriesId: sample.seriesId, month: sample.month }]
          : [],
      );
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

function safeRevisionAudit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const safeHash = (entry) =>
    typeof entry === "string" && /^[a-f0-9]{64}$/.test(entry) ? entry : undefined;
  const sources = [];
  for (const [sourceId, entry] of Object.entries(value).slice(0, 100)) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(sourceId) || !entry || typeof entry !== "object") continue;
    const record = { sourceId };
    for (const key of ["overlapCount", "changedObservationCount", "changedValueCount"]) {
      if (Number.isSafeInteger(entry[key]) && entry[key] >= 0) record[key] = entry[key];
    }
    for (const key of ["sha256", "previousSha256", "sourceSha256"]) {
      const hash = safeHash(entry[key]);
      if (hash) record[key] = hash;
    }
    if (Array.isArray(entry.changedSample)) {
      record.changedSample = entry.changedSample.slice(0, 10).flatMap((sample) => {
        if (
          !sample ||
          !Number.isSafeInteger(sample.seriesIndex) ||
          sample.seriesIndex < 0 ||
          typeof sample.month !== "string" ||
          !/^\d{4}-\d{2}$/.test(sample.month)
        )
          return [];
        return [{ seriesIndex: sample.seriesIndex, month: sample.month }];
      });
    }
    sources.push(record);
  }
  return sources.length ? sources : undefined;
}
