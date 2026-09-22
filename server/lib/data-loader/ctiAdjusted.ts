import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import {
  buildCtiAdjustedConnectionEstimate,
  CTI_ADJUSTED_INPUT_CATEGORIES,
  type CtiAdjustedAnnualInput,
  type CtiAdjustedInputMetadata,
  type CtiAdjustedConnectionEstimate,
} from "../ctiAdjustedConnectionEstimate";
import {
  buildCtiAdjustedV2Estimate,
  type CtiAdjustedV2Result,
} from "../ctiAdjustedConnectionEstimateV2";
import {
  evaluateCtiAdjustedPublicationGate,
  type CtiAdjustedRollingLooEvidence,
} from "../ctiAdjustedPublicationGate";

export type CtiAdjustedArtifactPaths = Partial<Record<"B" | "A" | "L", string>>;
export type CtiAdjustedLoaderOptions = {
  artifactRoot?: string;
  paths?: CtiAdjustedArtifactPaths;
  /** Select the annual estimate contract used by the caller. */
  contract?: "plan39" | "plan40";
};

type CtiAdjustedArtifactMetadata = CtiAdjustedInputMetadata & {
  schemaVersion: string | number;
  revision: string;
  sha256?: string;
  csvSha256?: string;
  hash?: string;
  statInfId?: string;
  sourceUrl?: string;
  statisticalCode?: string;
};

type CtiAdjustedManifest = {
  schemaVersion: string | number;
  revision: string;
  artifacts: Partial<
    Record<
      "B" | "A" | "L",
      {
        path?: string;
        sha256?: string;
        statInfId?: string;
        sourceUrl?: string;
        status?: string;
        hash?: string;
        schemaVersion?: string | number;
        revision?: string;
      }
    >
  >;
  statisticalCode: string;
};

const STATISTICAL_CODE = "00200567";
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

const names: Record<"B" | "A" | "L", string[]> = {
  B: [
    "B.json",
    "B.csv",
    "cti_adjusted_B.json",
    "cti_adjusted_B.csv",
    "cti-adjusted-B.json",
    "cti-adjusted-B.csv",
  ],
  A: [
    "A.json",
    "A.csv",
    "cti_adjusted_A.json",
    "cti_adjusted_A.csv",
    "cti-adjusted-A.json",
    "cti-adjusted-A.csv",
  ],
  L: [
    "L.json",
    "L.csv",
    "cti_adjusted_L.json",
    "cti_adjusted_L.csv",
    "cti-adjusted-L.json",
    "cti-adjusted-L.csv",
  ],
};

const categories = [...CTI_ADJUSTED_INPUT_CATEGORIES, "残差"];
const invalidMetadata = (): CtiAdjustedInputMetadata => ({
  source: "",
  artifact: "",
  retrievedAt: "",
  baseYear: Number.NaN,
  unit: "",
  valueType: "",
  householdScope: "",
  frequency: "",
  rawRange: { startYear: 1, endYear: 0 },
  adoptedRange: { startYear: 1, endYear: 0 },
  missingRepresentation: "",
});

function resolveRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const configured = process.env.CTI_ADJUSTED_ARTIFACT_ROOT?.trim();
  if (configured) return path.resolve(configured);

  const cwdRoot = path.resolve(process.cwd(), "data", "source", "cti-adjusted");
  if (hasArtifactSet(cwdRoot)) return cwdRoot;

  let current = path.resolve(__dirname);
  while (true) {
    const candidate = path.join(current, "data", "source", "cti-adjusted");
    if (hasArtifactSet(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return cwdRoot;
    current = parent;
  }
}

function hasArtifactSet(root: string): boolean {
  const manifestFile = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestFile)) return false;
  try {
    const manifest = readJson(manifestFile) as {
      artifacts?: Partial<Record<"B" | "A" | "L", { path?: string }>>;
    };
    return (["B", "A", "L"] as const).every((kind) => {
      const artifactPath = manifest.artifacts?.[kind]?.path;
      return (
        typeof artifactPath === "string" &&
        artifactPath.length > 0 &&
        fs.existsSync(path.resolve(root, artifactPath))
      );
    });
  } catch {
    return false;
  }
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readManifest(root: string): CtiAdjustedManifest {
  const file = path.join(root, "manifest.json");
  if (!fs.existsSync(file)) throw new Error("missing CTI adjusted manifest");
  const value = readJson(file) as Partial<CtiAdjustedManifest>;
  if (
    value.schemaVersion === undefined ||
    typeof value.revision !== "string" ||
    !value.revision.trim() ||
    !value.artifacts ||
    typeof value.artifacts !== "object" ||
    value.statisticalCode !== STATISTICAL_CODE
  ) {
    throw new Error("invalid CTI adjusted manifest");
  }
  return value as CtiAdjustedManifest;
}

function metadataFrom(value: unknown): CtiAdjustedInputMetadata | null {
  if (!value || typeof value !== "object") return null;
  const metadata = (value as { metadata?: unknown }).metadata ?? value;
  return metadata as CtiAdjustedInputMetadata;
}

function metadataValidationReason(
  metadata: CtiAdjustedInputMetadata | null,
): "invalid_metadata" | "invalid_hash" {
  if (!metadata || typeof metadata !== "object") return "invalid_metadata";
  const extended = metadata as CtiAdjustedArtifactMetadata;
  const hash = extended.sha256 ?? extended.csvSha256 ?? extended.hash;
  return hash && HASH_PATTERN.test(hash) ? "invalid_metadata" : "invalid_hash";
}

function validateMetadata(
  metadata: CtiAdjustedInputMetadata | null,
  manifest: CtiAdjustedManifest | null,
  kind: "B" | "A" | "L",
): metadata is CtiAdjustedInputMetadata & CtiAdjustedArtifactMetadata {
  if (!metadata || typeof metadata !== "object") return false;
  const extended = metadata as CtiAdjustedArtifactMetadata;
  if (
    extended.schemaVersion === undefined ||
    typeof extended.revision !== "string" ||
    extended.revision.trim() === ""
  )
    return false;
  if (extended.statisticalCode !== STATISTICAL_CODE) return false;
  const hash = extended.sha256 ?? extended.csvSha256 ?? extended.hash;
  if (!hash || !HASH_PATTERN.test(hash)) return false;
  if (
    manifest &&
    (extended.schemaVersion !== manifest.schemaVersion || extended.revision !== manifest.revision)
  )
    return false;
  const manifestArtifact = manifest?.artifacts[kind];
  if (manifestArtifact?.statInfId && extended.statInfId !== manifestArtifact.statInfId)
    return false;
  const metadataSourceUrl = extended.sourceUrl ?? extended.downloadUrl;
  if (extended.sourceUrl && extended.downloadUrl && extended.sourceUrl !== extended.downloadUrl)
    return false;
  if (manifestArtifact?.sourceUrl && metadataSourceUrl !== manifestArtifact.sourceUrl) return false;
  if (
    manifestArtifact?.schemaVersion !== undefined &&
    extended.schemaVersion !== manifestArtifact.schemaVersion
  )
    return false;
  if (manifestArtifact?.revision !== undefined && extended.revision !== manifestArtifact.revision)
    return false;
  return true;
}

function parseValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseArtifact(
  file: string,
  manifest: CtiAdjustedManifest | null,
  kind: "B" | "A" | "L",
): CtiAdjustedAnnualInput {
  const content = fs.readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    const data = readJson(file) as { metadata?: unknown; rows?: unknown };
    const metadata = metadataFrom(data);
    if (!validateMetadata(metadata, manifest, kind))
      throw new Error(metadataValidationReason(metadata));
    return {
      metadata,
      categoryOrder: Array.isArray((data as { categoryOrder?: unknown }).categoryOrder)
        ? (data as { categoryOrder: string[] }).categoryOrder
        : undefined,
      rows: (data.rows ?? []) as CtiAdjustedAnnualInput["rows"],
    };
  }
  const records = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  }).data;
  const first = records[0] ?? {};
  const yearKey = Object.keys(first).find((key) => /^(year|年|時間軸|年度)/i.test(key));
  const metadataFile = `${file}.metadata.json`;
  const metadata = fs.existsSync(metadataFile) ? metadataFrom(readJson(metadataFile)) : null;
  if (!validateMetadata(metadata, manifest, kind))
    throw new Error(metadataValidationReason(metadata));
  return {
    categoryOrder: Object.keys(first).filter((key) => key !== yearKey),
    metadata: metadata ?? invalidMetadata(),
    rows: records.map((record) => ({
      year: Number(record[yearKey ?? "year"]),
      values: Object.fromEntries(
        categories
          .filter((category) => category in record)
          .map((category) => [category, parseValue(record[category])]),
      ),
    })),
  };
}

function locate(
  kind: "B" | "A" | "L",
  root: string,
  manifest: CtiAdjustedManifest | null,
  explicit?: string,
): string | null {
  if (explicit) return path.resolve(explicit);
  const manifestPath = manifest?.artifacts[kind]?.path;
  if (manifestPath) return path.resolve(root, manifestPath);
  if (manifest) return null;
  const file = names[kind].find((name) => fs.existsSync(path.join(root, name)));
  return file ? path.join(root, file) : null;
}

function empty(): null {
  return null;
}

function invalidArtifact(): CtiAdjustedAnnualInput {
  return { metadata: invalidMetadata(), categoryOrder: [], rows: [] };
}

function validateArtifactHash(
  file: string,
  input: CtiAdjustedAnnualInput | null,
  manifest: CtiAdjustedManifest | null,
  kind: "B" | "A" | "L",
): CtiAdjustedAnnualInput | null {
  if (!input) return null;
  const metadata = input.metadata as CtiAdjustedArtifactMetadata;
  // The manifest hash covers the saved JSON/CSV artifact. Metadata hashes identify
  // the downloaded source and must not create a self-referential JSON hash.
  const expected =
    manifest?.artifacts[kind]?.sha256 ??
    manifest?.artifacts[kind]?.hash ??
    metadata?.sha256 ??
    metadata?.csvSha256 ??
    metadata?.hash;
  if (!expected || !HASH_PATTERN.test(expected)) throw new Error("missing artifact hash");
  if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== expected)
    throw new Error("artifact hash mismatch");
  return input;
}

export function loadCtiAdjustedConnectionEstimate(
  options: CtiAdjustedLoaderOptions = {},
): CtiAdjustedConnectionEstimate {
  const inputs = loadCtiAdjustedInputs(options);
  const result = buildCtiAdjustedConnectionEstimate(inputs.B, inputs.A, inputs.L);
  if (inputs.manifestInvalid) {
    return {
      ...result,
      audit: {
        ...result.audit,
        validation: {
          ...result.audit.validation,
          status: "unavailable",
          valid: false,
          reasons: ["invalid_manifest"],
          issues: [],
        },
      },
    };
  }

  if (inputs.missingKinds.length === 0 && inputs.loadReasons.length === 0) return result;
  const missingReasons = inputs.missingKinds.map((kind) =>
    kind === "L" ? "missing_l_artifact" : `missing_${kind.toLowerCase()}_artifact`,
  );
  const retainedIssues = result.audit.validation.issues.filter(
    (issue) => !inputs.missingKinds.includes(issue.input as "B" | "A" | "L"),
  );
  return {
    ...result,
    audit: {
      ...result.audit,
      validation: {
        ...result.audit.validation,
        status: "unavailable",
        valid: false,
        reasons: [
          ...new Set([
            ...inputs.loadReasons,
            ...retainedIssues.map((issue) => issue.message),
            ...missingReasons,
          ]),
        ],
        issues: retainedIssues,
      },
    },
  };
}

/** Load the validated annual inputs and build the Plan39-v2 public candidate. */
export function loadCtiAdjustedV2Estimate(
  options: CtiAdjustedLoaderOptions = {},
): CtiAdjustedV2Result {
  const inputs = loadCtiAdjustedInputs(options);
  const result = buildCtiAdjustedV2Estimate(inputs.B, inputs.A, inputs.L, {
    contract: options.contract ?? "plan39",
  });
  // Plan40 owns its input validation and annual/publication state. Its result
  // must not be replaced by the Plan39 evidence gate, which is only a Plan39
  // publication contract.
  if (options.contract === "plan40") return result;
  const analysis = loadMatchingPlan39Analysis(inputs.artifactRoot);
  if (!analysis) return result;
  const gate = evaluateCtiAdjustedPublicationGate({
    baseGate: result.publicationGate,
    rollingLoo: analysis.rollingLoo,
    evidenceSchema: analysis.v2?.publicationGate?.rollingLooEvidence?.schema,
    evidenceInputFingerprint: analysis.inputFingerprint,
    expectedInputFingerprint: analysis.inputFingerprint,
  });
  return {
    ...result,
    publicationGate: {
      ...result.publicationGate,
      ...gate,
      warningReasonCodes: result.publicationGate.warningReasonCodes,
      diagnostics: result.publicationGate.diagnostics,
    },
  };
}

type LoadedCtiAdjustedInputs = {
  B: CtiAdjustedAnnualInput | null;
  A: CtiAdjustedAnnualInput | null;
  L: CtiAdjustedAnnualInput | null;
  missingKinds: Array<"B" | "A" | "L">;
  loadReasons: string[];
  manifestInvalid: boolean;
  artifactRoot: string;
};

type Plan39AnalysisArtifact = { path?: string; sha256?: string };
type Plan39Analysis = {
  schemaVersion?: string;
  inputFingerprint?: string;
  rollingLoo?: CtiAdjustedRollingLooEvidence;
  v2?: { publicationGate?: { rollingLooEvidence?: { schema?: unknown } } };
  inputs?: { artifacts?: Partial<Record<"B" | "A" | "L", Plan39AnalysisArtifact>> };
};

function loadMatchingPlan39Analysis(artifactRoot: string): Plan39Analysis | null {
  const explicit = process.env.CTI_ADJUSTED_ANALYSIS_FILE?.trim();
  const resultsRoot =
    process.env.CTI_ADJUSTED_ANALYSIS_ROOT?.trim() ||
    path.resolve(process.cwd(), "results", "plan39");
  const files = explicit
    ? [path.resolve(explicit)]
    : fs.existsSync(resultsRoot)
      ? fs
          .readdirSync(resultsRoot)
          .filter((name) => /^plan39-analysis-.*\.json$/.test(name))
          .sort()
          .reverse()
          .map((name) => path.join(resultsRoot, name))
      : [];
  let expectedFingerprint: string | null = null;
  try {
    const root = path.resolve(artifactRoot);
    const manifestBytes = fs.readFileSync(path.join(root, "manifest.json"));
    const auditBytes = fs.readFileSync(path.join(root, "audit.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const artifacts = Object.fromEntries(
      ["B", "A", "L"].map((kind) => {
        const relative = manifest.artifacts?.[kind]?.path;
        return [
          kind,
          createHash("sha256")
            .update(fs.readFileSync(path.resolve(root, relative)))
            .digest("hex"),
        ];
      }),
    );
    expectedFingerprint = `sha256:${createHash("sha256")
      .update(
        JSON.stringify({
          manifest: createHash("sha256").update(manifestBytes).digest("hex"),
          audit: createHash("sha256").update(auditBytes).digest("hex"),
          artifacts,
        }),
      )
      .digest("hex")}`;
  } catch {
    return null;
  }
  for (const file of files) {
    try {
      const value = readJson(file) as Plan39Analysis;
      if (
        value?.schemaVersion !== "plan39-analysis-v1" ||
        value.inputFingerprint !== expectedFingerprint ||
        !value.rollingLoo ||
        !value.v2?.publicationGate
      )
        continue;
      const expectedRoot = path.resolve(artifactRoot);
      const hashesMatch = (["B", "A", "L"] as const).every((kind) => {
        const relative = value.inputs?.artifacts?.[kind]?.path;
        const expected = value.inputs?.artifacts?.[kind]?.sha256;
        return (
          typeof relative === "string" &&
          typeof expected === "string" &&
          fs.existsSync(path.resolve(expectedRoot, relative)) &&
          createHash("sha256")
            .update(fs.readFileSync(path.resolve(expectedRoot, relative)))
            .digest("hex") === expected
        );
      });
      if (hashesMatch) return value;
    } catch {
      /* fail closed */
    }
  }
  return null;
}

export function loadCtiAdjustedInputs(
  options: CtiAdjustedLoaderOptions = {},
): LoadedCtiAdjustedInputs {
  const root = resolveRoot(options.artifactRoot);
  let manifest: CtiAdjustedManifest | null = null;
  let manifestInvalid = false;
  try {
    manifest = readManifest(root);
  } catch {
    manifestInvalid = true;
  }
  const missingKinds =
    manifestInvalid || !manifest
      ? []
      : (["B", "A", "L"] as const).filter((kind) => {
          const file = locate(kind, root, manifest, options.paths?.[kind]);
          return !file || !fs.existsSync(file);
        });
  const loadReasons: string[] = [];
  const load = (kind: "B" | "A" | "L") => {
    if (manifestInvalid) return empty();
    const file = locate(kind, root, manifest, options.paths?.[kind]);
    if (!file || !fs.existsSync(file)) return empty();
    try {
      return validateArtifactHash(file, parseArtifact(file, manifest, kind), manifest, kind);
    } catch (error) {
      const reason =
        error instanceof Error &&
        (error.message === "invalid_hash" || error.message === "missing artifact hash")
          ? "invalid_hash"
          : "invalid_metadata";
      loadReasons.push(reason, ...(reason === "invalid_hash" ? ["invalid_metadata"] : []));
      return invalidArtifact();
    }
  };
  const B = load("B");
  const A = load("A");
  const L = load("L");
  return { B, A, L, missingKinds, loadReasons, manifestInvalid, artifactRoot: root };
}

export const loadCtiAdjustedData = loadCtiAdjustedConnectionEstimate;
