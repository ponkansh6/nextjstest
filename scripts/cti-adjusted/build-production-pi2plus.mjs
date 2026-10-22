#!/usr/bin/env node
/** Build the manifest-validated provisional production 2+ household-share input. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "data/source/cti-size-composition");
const INPUTS = {
  weights: "weights.csv",
  weightsManifest: "weights-source-manifest.json",
  januaryShares: "two-plus-share-backtest/lfs-national-shares.csv",
  januaryTrace: "two-plus-share-backtest/source-trace.json",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const csv = (text) => {
  const [headerLine, ...lines] = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const parse = (line) =>
    line
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((v) => v.trim().replace(/^"|"$/g, "").replaceAll('""', '"'));
  const headers = parse(headerLine);
  return lines
    .filter(Boolean)
    .map((line) => Object.fromEntries(headers.map((key, i) => [key, parse(line)[i] ?? ""])));
};
const num = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${label} is not finite`);
  return n;
};
const bytes = {};
for (const [key, relative] of Object.entries(INPUTS))
  bytes[key] = await readFile(path.join(DIR, relative));
const weightsManifest = JSON.parse(bytes.weightsManifest.toString("utf8"));
const trace = JSON.parse(bytes.januaryTrace.toString("utf8"));
if (
  weightsManifest.schemaVersion !== "cti-size-composition-lfs-weights-v1" ||
  weightsManifest.weightsCsv?.sha256 !== sha256(bytes.weights)
)
  throw new Error("weights provenance/hash mismatch");
if (trace.schemaVersion !== "plan39-two-plus-share-backtest-source-trace-v1")
  throw new Error("unsupported January share trace");
for (const [year, source] of Object.entries(trace.sources?.lfsFiles ?? {})) {
  const rawBytes = await readFile(path.join(ROOT, source.file));
  if (sha256(rawBytes) !== source.sha256)
    throw new Error(`January raw source hash mismatch at ${year}`);
}
const weightRows = csv(bytes.weights.toString("utf8"));
const historical = {};
const historicalStatus = {};
for (let year = 2005; year <= 2017; year++) {
  const rows = weightRows.filter((row) => Number(row.year) === year);
  if (rows.length !== 5) throw new Error(`weights missing/incomplete at ${year}`);
  if (
    year === 2011 &&
    rows.some(
      (row) =>
        row.connection_status !== "unverified_connected_series" ||
        row.interpolationMethod !== "linear_share_interpolation" ||
        row.benchmark_id !== "derived-LFS-IV-4-2010-2012-linear-share",
    )
  )
    throw new Error("2011 interpolation metadata mismatch");
  const total = rows.reduce((sum, row) => sum + num(row.households, `${year}/${row.size}`), 0);
  const one = rows.find((row) => row.size === "1");
  if (!(total > 0) || !one) throw new Error(`invalid weights at ${year}`);
  historical[year] = 1 - num(one.households, `${year}/1`) / total;
  const isSynthetic = year === 2011;
  historicalStatus[year] = {
    status: isSynthetic
      ? "synthetic_interpolation_unverified"
      : "published_annual_unverified_vintage",
    synthetic: isSynthetic,
    benchmarkId: one.benchmark_id,
    connectionStatus: one.connection_status,
    interpolationMethod: one.interpolationMethod || null,
  };
  if (!(historical[year] > 0 && historical[year] < 1))
    throw new Error(`invalid 2+ share at ${year}`);
}
const januaryRows = csv(bytes.januaryShares.toString("utf8"));
const calibration = {};
for (let year = 2017; year <= 2025; year++) {
  const row = januaryRows.find((item) => Number(item.year) === year);
  const traceRow = trace.sources?.lfsFiles?.[year];
  if (
    !row ||
    !traceRow ||
    num(row.pi2plus, `${year}/pi2plus`) !== num(traceRow.pi2plus, `${year}/trace.pi2plus`)
  )
    throw new Error(`January share provenance/value mismatch at ${year}`);
  calibration[year] = num(row.pi2plus, `${year}/pi2plus`);
}
const artifact = {
  schemaVersion: "plan39-production-pi2plus-v1",
  modelStatus: "provisional_source_bridged_by_2017_centering",
  historicalDefinition:
    "1 - one-person share from annual IV-4 weights.csv, years 2005-2017; 2011 is interpolated and unverified",
  calibrationDefinition:
    "January setai-n pi2plus from annual national special tabulations, years 2017-2025",
  historicalPi2Plus: historical,
  historicalPiStatusByYear: historicalStatus,
  calibrationPi2Plus: calibration,
  caveats: [
    "Historical IV-4 and January setai-n shares are distinct source/vintage definitions; historical correction is centered on historical 2017, so the composition correction is zero at the anchor.",
    "2011 is synthetic interpolation in weights.csv from unverified 2010/2012 endpoints; it is included provisionally and must be revised when a verified national value is available.",
    "January setai-n is a proxy for the preceding/trailing 12-month correction distribution, not a calendar-year mean; 2018 survey redesign and LFS benchmark changes remain caveats.",
    "The endpoint-calibrated residual is a provisional predictive correction, not evidence of a causal household-size effect or independent forecast validation.",
  ],
};
const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
const manifest = {
  schemaVersion: "plan39-production-pi2plus-manifest-v1",
  artifact: { path: "production-pi2plus.json", sha256: sha256(artifactBytes) },
  inputs: Object.fromEntries(
    Object.entries(INPUTS).map(([key, relative]) => [
      key,
      { path: `data/source/cti-size-composition/${relative}`, sha256: sha256(bytes[key]) },
    ]),
  ),
  sourceRawFiles: Object.fromEntries(
    Object.entries(trace.sources?.lfsFiles ?? {}).map(([year, source]) => [
      year,
      { path: source.file, sha256: source.sha256 },
    ]),
  ),
  artifactStatus: artifact.modelStatus,
};
await mkdir(DIR, { recursive: true });
await writeFile(path.join(DIR, "production-pi2plus.json"), artifactBytes);
await writeFile(
  path.join(DIR, "production-pi2plus-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ artifact: "data/source/cti-size-composition/production-pi2plus.json", sha256: sha256(artifactBytes), manifest: "data/source/cti-size-composition/production-pi2plus-manifest.json" })}\n`,
);
