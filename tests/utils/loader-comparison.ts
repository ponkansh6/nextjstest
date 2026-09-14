import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";

export type LoaderError = {
  name: string;
  message: string;
};

export type LoaderObservation<T, S> = {
  value: T | null;
  status: S | null;
  error: {
    load: LoaderError | null;
    status: LoaderError | null;
  };
};

export type LoaderComparison = {
  dataEqual: boolean;
  statusEqual: boolean;
  errorEqual: boolean;
  equal: boolean;
};

export const OBSERVATION_CANONICALIZATION_METADATA = {
  version: 1,
  volatileKeys: ["createdAt", "generatedAt", "retrievedAt", "timestamp", "updatedAt"],
  unorderedArrayPaths: [],
} as const;

export type ObservationCanonicalizationMetadata = {
  version: 1;
  volatileKeys: readonly string[];
  unorderedArrayPaths: readonly string[];
};

export type ObservationGoldenContract = {
  digest: string;
  metadata: ObservationCanonicalizationMetadata;
};

export type ObservationGoldenComparison = {
  matches: boolean;
  digest: string;
  expectedDigest: string;
  metadataMatches: boolean;
};

type MaybePromise<T> = T | Promise<T>;

function normalizeError(error: unknown): LoaderError {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

function canonicalize(
  value: unknown,
  path: string,
  metadata: ObservationCanonicalizationMetadata,
): unknown {
  if (value === undefined) return { $type: "undefined" };
  if (typeof value === "number" && Number.isNaN(value)) return { $type: "nan" };
  if (typeof value === "number" && !Number.isFinite(value)) return { $type: String(value) };
  if (Array.isArray(value)) {
    const items = value.map((item, index) => canonicalize(item, `${path}[${index}]`, metadata));
    return metadata.unorderedArrayPaths.includes(path) ? items.sort(compareCanonical) : items;
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .filter((key) => !metadata.volatileKeys.includes(key))
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize(
          (value as Record<string, unknown>)[key],
          `${path}.${key}`,
          metadata,
        );
        return result;
      }, {});
  }
  return value;
}

function compareCanonical(left: unknown, right: unknown): number {
  return Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
}

/** Canonical JSON for the observed data, status, and classified errors. */
export function canonicalizeObservation<T, S>(
  observation: LoaderObservation<T, S>,
  metadata: ObservationCanonicalizationMetadata = OBSERVATION_CANONICALIZATION_METADATA,
): string {
  return JSON.stringify(
    canonicalize(
      {
        data: observation.value,
        status: observation.status,
        error: observation.error,
      },
      "",
      metadata,
    ),
  );
}

export function digestObservation<T, S>(
  observation: LoaderObservation<T, S>,
  metadata: ObservationCanonicalizationMetadata = OBSERVATION_CANONICALIZATION_METADATA,
): string {
  return createHash("sha256").update(canonicalizeObservation(observation, metadata)).digest("hex");
}

/** Compare a source observation with an independent, fixed golden contract. */
export function compareObservationToGolden<T, S>(
  observation: LoaderObservation<T, S>,
  golden: ObservationGoldenContract,
): ObservationGoldenComparison {
  const metadataMatches = isDeepStrictEqual(golden.metadata, OBSERVATION_CANONICALIZATION_METADATA);
  const digest = digestObservation(observation, golden.metadata);
  return {
    matches: metadataMatches && digest === golden.digest,
    digest,
    expectedDigest: golden.digest,
    metadataMatches,
  };
}

async function observe<T>(
  loader: () => MaybePromise<T>,
): Promise<{ value: T | null; error: LoaderError | null }> {
  try {
    return { value: await loader(), error: null };
  } catch (error) {
    return { value: null, error: normalizeError(error) };
  }
}

/** Capture a loader and its public status independently, including rejected contracts. */
export async function observeLoader<T, S>(
  loader: () => MaybePromise<T>,
  statusLoader: () => MaybePromise<S>,
): Promise<LoaderObservation<T, S>> {
  const [value, status] = await Promise.all([observe(loader), observe(statusLoader)]);
  return {
    value: value.value,
    status: status.value,
    error: { load: value.error, status: status.error },
  };
}

/** Compare data, status, and error contracts separately so a status mismatch is never hidden by data equality. */
export function compareLoaderFixtures<T, S>(
  sourceObservation: LoaderObservation<T, S>,
  goldenObservation: LoaderObservation<T, S>,
): LoaderComparison {
  const dataEqual = isDeepStrictEqual(sourceObservation.value, goldenObservation.value);
  const statusEqual = isDeepStrictEqual(sourceObservation.status, goldenObservation.status);
  const errorEqual = isDeepStrictEqual(sourceObservation.error, goldenObservation.error);
  return {
    dataEqual,
    statusEqual,
    errorEqual,
    equal: dataEqual && statusEqual && errorEqual,
  };
}
