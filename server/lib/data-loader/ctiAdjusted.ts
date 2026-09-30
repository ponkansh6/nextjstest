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
  type CtiAdjustedV2HouseholdComposition,
  type CtiAdjustedV2Result,
} from "../ctiAdjustedConnectionEstimateV2";
import {
  evaluateCtiAdjustedPublicationGate,
  CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
  type CtiAdjustedRollingLooEvidence,
} from "../ctiAdjustedPublicationGate";
import { buildCtiAdjustedRollingLooBacktest } from "../ctiAdjustedRollingBacktest";

export type CtiAdjustedArtifactPaths = Partial<Record<"B" | "A" | "L", string>>;
export type CtiAdjustedLoaderOptions = {
  artifactRoot?: string;
  paths?: CtiAdjustedArtifactPaths;
  /** Select the annual estimate contract used by the caller. */
  contract?: "plan39" | "plan40";
  /** Preserve strict annual source integrity checks independently of the estimate contract. */
  validatePlan40Inputs?: boolean;
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
const NOMINAL_ANNUAL_VALUE_TYPE = "原数値（名目指数）";
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

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function loadProductionPi2Plus(root: string): CtiAdjustedV2HouseholdComposition | null {
  try {
    const dir = path.resolve(root, "../cti-size-composition");
    const manifestFile = path.join(dir, "production-pi2plus-manifest.json");
    const manifestBytes = fs.readFileSync(manifestFile);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      schemaVersion?: string;
      artifactStatus?: string;
      artifact?: { path?: string; sha256?: string };
      inputs?: Record<string, { path?: string; sha256?: string }>;
      sourceRawFiles?: Record<string, { path?: string; sha256?: string }>;
    };
    if (manifest.schemaVersion !== "plan39-production-pi2plus-manifest-v1") return null;
    if (
      Object.keys(manifest.inputs ?? {})
        .sort()
        .join(",") !==
        ["januaryShares", "januaryTrace", "weights", "weightsManifest"].sort().join(",") ||
      Object.keys(manifest.sourceRawFiles ?? {})
        .sort()
        .join(",") !== Array.from({ length: 9 }, (_, i) => String(2017 + i)).join(",") ||
      manifest.artifactStatus !== "provisional_source_bridged_by_2017_centering"
    )
      return null;
    const sourceRoot = path.resolve(root, "../../../");
    const verifyHash = (relative: string, expected: string) => {
      const file = path.resolve(sourceRoot, relative);
      if (!file.startsWith(`${sourceRoot}${path.sep}`)) return false;
      return (
        HASH_PATTERN.test(expected) &&
        fs.existsSync(file) &&
        createHash("sha256").update(fs.readFileSync(file)).digest("hex") === expected
      );
    };
    for (const source of Object.values(manifest.inputs ?? {}))
      if (!source.path || !source.sha256 || !verifyHash(source.path, source.sha256)) return null;
    for (const source of Object.values(manifest.sourceRawFiles ?? {}))
      if (!source.path || !source.sha256 || !verifyHash(source.path, source.sha256)) return null;
    const artifactPath = manifest.artifact?.path;
    if (artifactPath !== "production-pi2plus.json" || !manifest.artifact?.sha256) return null;
    const artifactFile = path.join(dir, artifactPath);
    const artifactBytes = fs.readFileSync(artifactFile);
    const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
    if (artifactSha256 !== manifest.artifact.sha256) return null;
    const artifact = JSON.parse(artifactBytes.toString("utf8")) as {
      schemaVersion?: string;
      modelStatus?: string;
      historicalPi2Plus?: Record<string, number>;
      historicalPiStatusByYear?: Record<
        string,
        {
          status?: string;
          synthetic?: boolean;
          benchmarkId?: string;
          connectionStatus?: string;
          interpolationMethod?: string | null;
        }
      >;
      calibrationPi2Plus?: Record<string, number>;
      caveats?: string[];
    };
    if (
      artifact.schemaVersion !== "plan39-production-pi2plus-v1" ||
      artifact.modelStatus !== "provisional_source_bridged_by_2017_centering"
    )
      return null;
    const historicalPi2Plus: Record<number, number> = {};
    const historicalPiStatusByYear: CtiAdjustedV2HouseholdComposition["historicalPiStatusByYear"] =
      {};
    const calibrationPi2Plus: Record<number, number> = {};
    for (let year = 2005; year <= 2017; year++) {
      const value = artifact.historicalPi2Plus?.[year];
      const quality = artifact.historicalPiStatusByYear?.[year];
      const isSynthetic = year === 2011;
      if (
        !finiteNumber(value) ||
        !(value > 0 && value < 1) ||
        !quality ||
        quality.synthetic !== isSynthetic ||
        quality.status !==
          (isSynthetic
            ? "synthetic_interpolation_unverified"
            : "published_annual_unverified_vintage") ||
        quality.connectionStatus !== "unverified_connected_series" ||
        typeof quality.benchmarkId !== "string" ||
        !quality.benchmarkId ||
        quality.interpolationMethod !== (isSynthetic ? "linear_share_interpolation" : null)
      )
        return null;
      historicalPi2Plus[year] = value;
      historicalPiStatusByYear[year] =
        quality as CtiAdjustedV2HouseholdComposition["historicalPiStatusByYear"][number];
    }
    for (let year = 2017; year <= 2025; year++) {
      const value = artifact.calibrationPi2Plus?.[year];
      if (!finiteNumber(value) || !(value > 0 && value < 1)) return null;
      calibrationPi2Plus[year] = value;
    }
    return {
      historicalPi2Plus,
      historicalPiStatusByYear,
      calibrationPi2Plus,
      provenance: {
        artifactPath: path.relative(sourceRoot, artifactFile),
        artifactSha256,
        manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
        historicalSource: "weights.csv IV-4 annual household counts; 2011 synthetic interpolation",
        calibrationSource: "annual January setai-n national pi2plus special tabulations",
        caveats: artifact.caveats ?? [],
      },
    };
  } catch {
    return null;
  }
}

function readManifest(root: string, manifestBytes?: Buffer): CtiAdjustedManifest {
  const file = path.join(root, "manifest.json");
  if (!fs.existsSync(file)) throw new Error("missing CTI adjusted manifest");
  const value = (
    manifestBytes ? JSON.parse(manifestBytes.toString("utf8")) : readJson(file)
  ) as Partial<CtiAdjustedManifest>;
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
  if ((kind === "B" || kind === "A") && extended.valueType !== NOMINAL_ANNUAL_VALUE_TYPE)
    return false;
  const hash = extended.sha256 ?? extended.csvSha256 ?? extended.hash;
  if (!hash || !HASH_PATTERN.test(hash)) return false;
  const manifestArtifact = manifest?.artifacts[kind];
  if (manifest && extended.schemaVersion !== manifest.schemaVersion) return false;
  const expectedRevision = manifestArtifact?.revision ?? manifest?.revision;
  if (expectedRevision && extended.revision !== expectedRevision) return false;
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
  artifactBytes?: Buffer,
): CtiAdjustedAnnualInput {
  const contentBytes = artifactBytes ?? fs.readFileSync(file);
  const content = contentBytes.toString("utf8");
  if (file.endsWith(".json")) {
    const data = JSON.parse(content) as { metadata?: unknown; rows?: unknown };
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
  artifactBytes?: Buffer,
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
  if (
    createHash("sha256")
      .update(artifactBytes ?? fs.readFileSync(file))
      .digest("hex") !== expected
  )
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
  const plan40ExpectedInputFingerprint =
    options.contract === "plan40" ? fingerprintLoadedCtiAdjustedInputs(inputs) : null;
  const plan39ExpectedInputFingerprint =
    options.contract === "plan40" ? null : inputs.inputFingerprint;
  const result = {
    ...buildCtiAdjustedV2Estimate(inputs.B, inputs.A, inputs.L, {
      contract: options.contract ?? "plan39",
      validatePlan40Inputs: options.validatePlan40Inputs,
      householdComposition: inputs.householdComposition ?? undefined,
    }),
    ...(plan40ExpectedInputFingerprint || plan39ExpectedInputFingerprint
      ? { inputFingerprint: plan40ExpectedInputFingerprint ?? plan39ExpectedInputFingerprint! }
      : {}),
  };
  if (options.contract === "plan40") {
    // Plan40 has its own publication blockers, but rolling/LOO evidence is
    // shared. Recompute it from the exact loaded B/A inputs; never reuse a
    // stored Plan39 analysis report as Plan40 evidence.
    const canBuildEvidence =
      !inputs.manifestInvalid &&
      inputs.missingKinds.length === 0 &&
      inputs.loadReasons.length === 0 &&
      inputs.B !== null &&
      inputs.A !== null &&
      inputs.L !== null;
    let rollingLoo: CtiAdjustedRollingLooEvidence | undefined;
    if (canBuildEvidence) {
      try {
        rollingLoo = buildCtiAdjustedRollingLooBacktest(inputs.B!, inputs.A!, inputs.L!);
      } catch {
        // The shared evaluator treats missing evidence as a hard blocker.
      }
    }
    // Fingerprint the loaded input snapshot before and after estimate/backtest
    // construction so evidence stays bound to the exact in-memory inputs.
    const evidenceInputFingerprint = fingerprintLoadedCtiAdjustedInputs(inputs);
    const gate = evaluateCtiAdjustedPublicationGate({
      baseGate: result.publicationGate,
      rollingLoo,
      evidenceSchema: CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
      evidenceInputFingerprint,
      expectedInputFingerprint:
        plan40ExpectedInputFingerprint ?? "missing_expected_cti_adjusted_input_fingerprint",
    });
    return {
      ...result,
      publicationGate: {
        ...result.publicationGate,
        ...gate,
        warningReasonCodes: result.publicationGate.warningReasonCodes,
        diagnostics: [
          ...result.publicationGate.diagnostics.filter(
            (diagnostic) => diagnostic !== "publication_gate_closed",
          ),
          ...(gate.accepted ? [] : ["publication_gate_closed"]),
        ],
      },
    };
  }
  const analysis = loadMatchingPlan39Analysis(inputs.artifactRoot, plan39ExpectedInputFingerprint);
  let rollingLoo = analysis?.rollingLoo;
  let evidenceSchema = analysis?.v2?.publicationGate?.rollingLooEvidence?.schema;
  let evidenceInputFingerprint = analysis?.inputFingerprint;
  if (!analysis) {
    const canBuildEvidence =
      !inputs.manifestInvalid &&
      inputs.missingKinds.length === 0 &&
      inputs.loadReasons.length === 0 &&
      inputs.B !== null &&
      inputs.A !== null &&
      inputs.L !== null;
    if (canBuildEvidence) {
      try {
        rollingLoo = buildCtiAdjustedRollingLooBacktest(inputs.B!, inputs.A!, inputs.L!);
        evidenceSchema = CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA;
        const fingerprintAfterEvidenceBuild = deriveCtiAdjustedInputFingerprint(
          inputs.artifactRoot,
        );
        evidenceInputFingerprint =
          fingerprintAfterEvidenceBuild === plan39ExpectedInputFingerprint
            ? (plan39ExpectedInputFingerprint ?? undefined)
            : undefined;
      } catch {
        // Missing or invalid evidence remains a publication blocker.
      }
    }
  }
  const gate = evaluateCtiAdjustedPublicationGate({
    baseGate: result.publicationGate,
    rollingLoo,
    evidenceSchema,
    evidenceInputFingerprint,
    expectedInputFingerprint:
      deriveCtiAdjustedInputFingerprint(inputs.artifactRoot) === inputs.inputFingerprint
        ? (inputs.inputFingerprint ?? undefined)
        : undefined,
  });
  return {
    ...result,
    publicationGate: {
      ...result.publicationGate,
      ...gate,
      warningReasonCodes: result.publicationGate.warningReasonCodes,
      diagnostics: [
        ...result.publicationGate.diagnostics.filter(
          (diagnostic) => diagnostic !== "publication_gate_closed",
        ),
        ...(gate.accepted ? [] : ["publication_gate_closed"]),
      ],
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
  householdComposition: CtiAdjustedV2HouseholdComposition | null;
  inputFingerprint: string | null;
};

type Plan39AnalysisArtifact = { path?: string; sha256?: string };
type Plan39Analysis = {
  schemaVersion?: string;
  inputFingerprint?: string;
  rollingLoo?: CtiAdjustedRollingLooEvidence;
  v2?: {
    model?: string;
    version?: string;
    publicationGate?: { rollingLooEvidence?: { schema?: unknown } };
  };
  inputs?: { artifacts?: Partial<Record<"B" | "A" | "L", Plan39AnalysisArtifact>> };
};

function loadMatchingPlan39Analysis(
  artifactRoot: string,
  expectedFingerprint: string | null = deriveCtiAdjustedInputFingerprint(artifactRoot),
): Plan39Analysis | null {
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
  if (!expectedFingerprint) return null;
  for (const file of files) {
    try {
      const value = readJson(file) as Plan39Analysis;
      if (
        value?.schemaVersion !== "plan39-analysis-v1" ||
        value.inputFingerprint !== expectedFingerprint ||
        !value.rollingLoo ||
        value.v2?.model !== "v2-bottom-up" ||
        value.v2?.version !== "plan39-v2" ||
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

/** Hash the same serialized snapshot parts used by saved Plan39 analysis artifacts. */
function fingerprintCtiAdjustedSnapshot(
  manifestBytes: Buffer,
  auditBytes: Buffer,
  artifacts: Record<"B" | "A" | "L", string>,
  composition: CtiAdjustedV2HouseholdComposition | null,
): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        manifest: createHash("sha256").update(manifestBytes).digest("hex"),
        audit: createHash("sha256").update(auditBytes).digest("hex"),
        artifacts,
        householdComposition: composition
          ? {
              artifact: composition.provenance.artifactSha256,
              manifest: composition.provenance.manifestSha256,
            }
          : null,
      }),
    )
    .digest("hex")}`;
}

/** Canonical current-file fingerprint used to guard the loaded Plan39 snapshot. */
function deriveCtiAdjustedInputFingerprint(artifactRoot: string): string | null {
  try {
    const root = path.resolve(artifactRoot);
    const manifestBytes = fs.readFileSync(path.join(root, "manifest.json"));
    const auditBytes = fs.readFileSync(path.join(root, "audit.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      artifacts?: Partial<Record<"B" | "A" | "L", { path?: string }>>;
    };
    const artifacts = Object.fromEntries(
      (["B", "A", "L"] as const).map((kind) => {
        const relative = manifest.artifacts?.[kind]?.path;
        if (typeof relative !== "string" || relative.length === 0)
          throw new Error("missing input artifact path");
        const artifactPath = path.resolve(root, relative);
        if (!artifactPath.startsWith(`${root}${path.sep}`))
          throw new Error("input artifact path escapes root");
        return [kind, createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex")];
      }),
    );
    const composition = loadProductionPi2Plus(root);
    return fingerprintCtiAdjustedSnapshot(
      manifestBytes,
      auditBytes,
      artifacts as Record<"B" | "A" | "L", string>,
      composition,
    );
  } catch {
    return null;
  }
}

/** Fingerprint the exact validated in-memory inputs consumed by both Plan40 builders. */
function fingerprintLoadedCtiAdjustedInputs(inputs: LoadedCtiAdjustedInputs): string | null {
  try {
    const serialized = JSON.stringify({
      B: inputs.B,
      A: inputs.A,
      L: inputs.L,
      householdComposition: inputs.householdComposition,
    });
    if (serialized === undefined) return null;
    return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
  } catch {
    return null;
  }
}

export function loadCtiAdjustedInputs(
  options: CtiAdjustedLoaderOptions = {},
): LoadedCtiAdjustedInputs {
  const root = resolveRoot(options.artifactRoot);
  let manifestBytes: Buffer | null = null;
  let auditBytes: Buffer | null = null;
  let manifest: CtiAdjustedManifest | null = null;
  let manifestInvalid = false;
  try {
    manifestBytes = fs.readFileSync(path.join(root, "manifest.json"));
    manifest = readManifest(root, manifestBytes);
  } catch {
    manifestInvalid = true;
  }
  try {
    auditBytes = fs.readFileSync(path.join(root, "audit.json"));
  } catch {
    // The Plan39 snapshot fingerprint remains unavailable without its audit input.
  }
  const missingKinds =
    manifestInvalid || !manifest
      ? []
      : (["B", "A", "L"] as const).filter((kind) => {
          const file = locate(kind, root, manifest, options.paths?.[kind]);
          return !file || !fs.existsSync(file);
        });
  const loadReasons: string[] = [];
  const artifactHashes: Partial<Record<"B" | "A" | "L", string>> = {};
  const load = (kind: "B" | "A" | "L") => {
    if (manifestInvalid) return empty();
    const file = locate(kind, root, manifest, options.paths?.[kind]);
    if (!file || !fs.existsSync(file)) return empty();
    try {
      const bytes = fs.readFileSync(file);
      const input = parseArtifact(file, manifest, kind, bytes);
      const validated = validateArtifactHash(file, input, manifest, kind, bytes);
      if (validated) artifactHashes[kind] = createHash("sha256").update(bytes).digest("hex");
      return validated;
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
  const householdComposition = loadProductionPi2Plus(root);
  return {
    B,
    A,
    L,
    missingKinds,
    loadReasons,
    manifestInvalid,
    artifactRoot: root,
    householdComposition,
    inputFingerprint:
      manifestBytes && auditBytes && artifactHashes.B && artifactHashes.A && artifactHashes.L
        ? fingerprintCtiAdjustedSnapshot(
            manifestBytes,
            auditBytes,
            artifactHashes as Record<"B" | "A" | "L", string>,
            householdComposition,
          )
        : null,
  };
}

export const loadCtiAdjustedData = loadCtiAdjustedConnectionEstimate;
