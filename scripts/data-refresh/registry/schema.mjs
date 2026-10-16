import { RefreshError, invariant } from "../lib/errors.mjs";

/** @typedef {{kind: 'api', statsDataId: string}} ApiIdentity */
/** @typedef {{kind: 'file', statInfId: string, format: 'csv'|'xls'|'xlsx'}} FileIdentity */
/** @typedef {ApiIdentity|FileIdentity} SourceIdentity */

const idPattern = /^[0-9]{8,16}$/;

export function validateSource(source) {
  invariant(
    source && typeof source === "object",
    "invalid-registry",
    "Source entry must be an object.",
  );
  invariant(
    typeof source.id === "string" && /^[a-z0-9][a-z0-9-]+$/.test(source.id),
    "invalid-registry",
    "Source id is invalid.",
  );
  invariant(
    source.required === true,
    "invalid-registry",
    `Source ${source.id} must be marked required.`,
  );
  invariant(
    source.identity && typeof source.identity === "object",
    "invalid-registry",
    `Source ${source.id} has no identity.`,
  );
  validateIdentity(source.identity, source.id);
  if (source.inputIdentities !== undefined) {
    invariant(
      Array.isArray(source.inputIdentities) && source.inputIdentities.length > 0,
      "invalid-registry",
      `Source ${source.id} input identities must be an explicit nonempty array.`,
    );
    const identities = new Set([identityKey(source.identity)]);
    for (const identity of source.inputIdentities) {
      validateIdentity(identity, source.id);
      invariant(
        !identities.has(identityKey(identity)),
        "invalid-registry",
        `Source ${source.id} declares a duplicate input identity.`,
      );
      identities.add(identityKey(identity));
    }
  }
  if (source.distributionIdentity !== undefined) {
    validateIdentity(source.distributionIdentity, source.id);
    invariant(
      source.distributionIdentity.kind !== source.identity.kind,
      "identity-kind-mismatch",
      `Source ${source.id} API and distribution identities must remain distinct variants.`,
    );
  }
  invariant(
    typeof source.title === "string" && source.title.trim(),
    "invalid-registry",
    `Source ${source.id} has no table title.`,
  );
  for (const field of [
    "classifications",
    "frequency",
    "unit",
    "baseline",
    "period",
    "revision",
    "outputs",
    "dependencies",
  ]) {
    invariant(
      Object.hasOwn(source, field),
      "invalid-registry",
      `Source ${source.id} is missing ${field}.`,
    );
  }
  invariant(
    Array.isArray(source.classifications) && source.classifications.length > 0,
    "invalid-registry",
    `Source ${source.id} classifications must be explicit.`,
  );
  invariant(
    typeof source.frequency === "string" && source.frequency,
    "invalid-registry",
    `Source ${source.id} frequency is invalid.`,
  );
  invariant(
    typeof source.unit === "string" && source.unit,
    "invalid-registry",
    `Source ${source.id} unit is invalid.`,
  );
  invariant(
    typeof source.baseline === "string" && source.baseline,
    "invalid-registry",
    `Source ${source.id} baseline is invalid.`,
  );
  invariant(
    source.period &&
      typeof source.period.from === "string" &&
      typeof source.period.through === "string",
    "invalid-registry",
    `Source ${source.id} period is invalid.`,
  );
  invariant(
    typeof source.revision === "string" && source.revision,
    "invalid-registry",
    `Source ${source.id} revision policy is invalid.`,
  );
  invariant(
    Array.isArray(source.outputs) && source.outputs.length > 0,
    "invalid-registry",
    `Source ${source.id} must declare output paths.`,
  );
  invariant(
    Array.isArray(source.dependencies),
    "invalid-registry",
    `Source ${source.id} dependencies must be an array.`,
  );
  return source;
}

function identityKey(identity) {
  return identity.kind === "api"
    ? `api:${identity.statsDataId}`
    : `file:${identity.statInfId}:${identity.format}`;
}

function validateIdentity(identity, sourceId) {
  if (identity.kind === "api") {
    invariant(
      typeof identity.statsDataId === "string" && idPattern.test(identity.statsDataId),
      "invalid-registry",
      `Source ${sourceId} has an invalid API statsDataId.`,
    );
    invariant(
      !Object.hasOwn(identity, "statInfId") && !Object.hasOwn(identity, "format"),
      "identity-kind-mismatch",
      `API source ${sourceId} cannot use file identity fields.`,
    );
  } else if (identity.kind === "file") {
    invariant(
      typeof identity.statInfId === "string" && idPattern.test(identity.statInfId),
      "invalid-registry",
      `Source ${sourceId} has an invalid file statInfId.`,
    );
    invariant(
      ["csv", "xls", "xlsx"].includes(identity.format),
      "invalid-registry",
      `Source ${sourceId} has an unsupported file format.`,
    );
    invariant(
      !Object.hasOwn(identity, "statsDataId"),
      "identity-kind-mismatch",
      `File source ${sourceId} cannot use statsDataId.`,
    );
  } else {
    throw new RefreshError(
      "identity-kind-mismatch",
      `Source ${sourceId} must use API or file identity.`,
    );
  }
}

export function validateRegistry(registry) {
  invariant(
    registry && Array.isArray(registry.sources),
    "invalid-registry",
    "Registry must declare sources.",
  );
  invariant(registry.sources.length > 0, "invalid-registry", "Registry cannot be empty.");
  const seen = new Set();
  const outputs = new Set();
  for (const source of registry.sources) {
    validateSource(source);
    invariant(!seen.has(source.id), "invalid-registry", `Duplicate source id ${source.id}.`);
    seen.add(source.id);
    for (const output of source.outputs) {
      invariant(
        output !== ".data-refresh/semantic-state.json",
        "invalid-registry",
        "Registry cannot claim the refresh semantic-state path.",
      );
      invariant(
        typeof output === "string" && output && !outputs.has(output),
        "invalid-registry",
        `Duplicate or invalid output path for ${source.id}.`,
      );
      outputs.add(output);
    }
  }
  for (const source of registry.sources) {
    for (const dependency of source.dependencies)
      invariant(
        seen.has(dependency),
        "invalid-registry",
        `Unknown dependency ${dependency} in ${source.id}.`,
      );
  }
  invariant(
    Array.isArray(registry.requiredAdapters) &&
      registry.requiredAdapters.every((id) => typeof id === "string" && id),
    "invalid-registry",
    "Registry requiredAdapters must be explicit.",
  );
  invariant(
    registry.requiredAdapters.length > 0,
    "invalid-registry",
    "Registry must declare required adapters.",
  );
  topologicallyOrderSources(registry.sources);
  return registry;
}

export function topologicallyOrderSources(sources) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const temporary = new Set();
  const permanent = new Set();
  const ordered = [];
  function visit(source) {
    if (permanent.has(source.id)) return;
    invariant(
      !temporary.has(source.id),
      "invalid-registry",
      `Dependency cycle includes source ${source.id}.`,
    );
    temporary.add(source.id);
    for (const dependency of source.dependencies) visit(byId.get(dependency));
    temporary.delete(source.id);
    permanent.add(source.id);
    ordered.push(source);
  }
  for (const source of sources) visit(source);
  return ordered;
}
