#!/usr/bin/env node

/** Materialize an analysis-only 2011 weight interpolation from 2010/2012 shares. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INPUT = path.join(ROOT, "data/source/cti-size-composition");
const SIZES = ["1", "2", "3", "4", "5+"];
const METHOD = "linear_share_interpolation";
const CAVEAT =
  "Custom interpolation across a benchmark break: 2010 IV-4 statInfId 000008597994 uses the 2005 Census base and 2012 IV-4 statInfId 000018854323 uses the 2010 Census base. No official common-base bridge is established. The 2011 IV-4 statInfId 000012675623 excludes Iwate, Miyagi, and Fukushima and is not a nationwide household-size weight. This is not an observed national 2011 LFS value.";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseCsvLine(line) {
  return line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g).map((field) => {
    const value = field.replace(/^,/, "");
    return value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1).replaceAll('""', '"')
      : value;
  });
}

function readCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines
    .filter(Boolean)
    .map((line) =>
      Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""])),
    );
}

const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function run() {
  const manifestPath = path.join(INPUT, "weights-source-manifest.json");
  const csvPath = path.join(INPUT, "weights.csv");
  const manifest = JSON.parse((await readFile(manifestPath)).toString("utf8"));
  const originalBytes = await readFile(csvPath);
  if (
    manifest.weightsCsv?.path !== "weights.csv" ||
    manifest.weightsCsv.sha256 !== sha256(originalBytes)
  )
    throw new Error("weights.csv source hash differs from weights-source-manifest.json");
  const rows = readCsv(originalBytes.toString("utf8"));
  const old2011 = rows.filter((row) => Number(row.year) === 2011);
  const byYearSize = new Map(
    rows.map((row) => [`${Number(row.year)}|${row.size}`, Number(row.households)]),
  );
  const endpointCounts = (year) =>
    Object.fromEntries(
      SIZES.map((size) => {
        const count = byYearSize.get(`${year}|${size}`);
        if (!Number.isFinite(count))
          throw new Error(`weights.csv missing endpoint ${year}/${size}`);
        return [size, count];
      }),
    );
  const c2010 = endpointCounts(2010);
  const c2012 = endpointCounts(2012);
  const total2010 = SIZES.reduce((sum, size) => sum + c2010[size], 0);
  const total2012 = SIZES.reduce((sum, size) => sum + c2012[size], 0);
  const p = Object.fromEntries(
    SIZES.map((size) => [size, (c2010[size] / total2010 + c2012[size] / total2012) / 2]),
  );
  const roundedShares = Object.fromEntries(
    SIZES.map((size) => [size, Number(p[size].toFixed(12))]),
  );
  const roundedTotal = SIZES.reduce((sum, size) => sum + roundedShares[size], 0);
  const interpolatedTotal = (total2010 + total2012) / 2;
  const counts = Object.fromEntries(
    SIZES.map((size) => [
      size,
      Number(((roundedShares[size] / roundedTotal) * interpolatedTotal).toFixed(9)),
    ]),
  );
  const interpolation = {
    year: 2011,
    method: METHOD,
    endpoints: [2010, 2012],
    notObserved: true,
    normalizedSharesBeforeCountScaling: true,
    vintageCaveat: CAVEAT,
    endpointSourceIds: { 2010: "000008597994", 2012: "000018854323" },
    excluded2011SourceId: "000012675623",
    commonBaseBridgeEstablished: false,
    benchmarkId: "derived-LFS-IV-4-2010-2012-linear-share",
    connectionStatus: "unverified_connected_series",
    interpolatedTotalHouseholds10k: interpolatedTotal,
  };
  if (
    manifest.legacyUnharmonizedWeights?.missingYear !== 2011 ||
    manifest.legacyUnharmonizedWeights?.status !== "unverified_connected_series"
  )
    throw new Error(
      "legacy weight manifest must continue to identify 2011 as an unverified missing raw year",
    );
  manifest.legacyUnharmonizedWeights.interpolatedDiagnosticYear = interpolation;
  const headers = [
    "year",
    "size",
    "households",
    "series_id",
    "benchmark_id",
    "connection_status",
    "interpolationMethod",
    "interpolationEndpoints",
    "vintageCaveat",
  ];
  const retained = rows.filter((row) => Number(row.year) !== 2011);
  const interpolatedRows = SIZES.map((size) => ({
    year: "2011",
    size,
    households: String(counts[size]),
    series_id: manifest.legacyUnharmonizedWeights.seriesId,
    benchmark_id: interpolation.benchmarkId,
    connection_status: interpolation.connectionStatus,
    interpolationMethod: METHOD,
    interpolationEndpoints: "2010;2012",
    vintageCaveat: CAVEAT,
  }));
  if (old2011.length && old2011.length !== SIZES.length)
    throw new Error("existing 2011 rows are incomplete");
  const allRows = [...retained, ...interpolatedRows].map((row) =>
    Object.fromEntries(headers.map((header) => [header, row[header] ?? ""])),
  );
  const csv = `${[headers.map(quote).join(","), ...allRows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\n")}\n`;
  const csvBytes = Buffer.from(csv);
  manifest.weightsCsv.sha256 = sha256(csvBytes);
  await writeFile(csvPath, csvBytes);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ year: 2011, method: METHOD, counts, weightCsvSha256: manifest.weightsCsv.sha256 })}\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
