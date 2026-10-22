#!/usr/bin/env node

/**
 * Reproducible, non-production household-size composition candidate for Plan39.
 * Inputs are normalized extracts of the cited official tables; this script
 * deliberately refuses to bridge incompatible LFS benchmark series.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const YEARS = Array.from({ length: 13 }, (_, index) => 2005 + index);
const FIT_YEARS = YEARS.slice(0, -1);
const SIZES = ["1", "2", "3", "4", "5+"];
const CATEGORIES = [
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
];
const SURVEY_CATEGORIES = [...CATEGORIES, "その他の消費支出"];
const LEGACY_REPORTED_WEIGHT_YEARS = YEARS.filter((year) => year !== 2011);
const REQUIRED_WEIGHT_YEARS = YEARS.concat(2025);
const INTERPOLATION_METHOD = "linear_share_interpolation";
const INTERPOLATION_CAVEAT =
  "Custom interpolation across a benchmark break: 2010 IV-4 statInfId 000008597994 uses the 2005 Census base and 2012 IV-4 statInfId 000018854323 uses the 2010 Census base. No official common-base bridge is established. The 2011 IV-4 statInfId 000012675623 excludes Iwate, Miyagi, and Fukushima and is not a nationwide household-size weight. This is not an observed national 2011 LFS value.";
const CTI_DIR = "data/source/cti-adjusted";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_INPUT_DIR = path.join(ROOT, "data/source/cti-size-composition");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "results/plan39/size-composition-candidate");
const HASH = (value) => createHash("sha256").update(value).digest("hex");

function argumentsOf(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1]) throw new Error(`invalid argument: ${key}`);
    args.set(key, argv[++index]);
  }
  return args;
}

function parseCsvLine(line) {
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((field) => {
    const value = field.trim();
    return value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1).replaceAll('""', '"')
      : value;
  });
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? "");
  return lines.filter(Boolean).map((line) => {
    const fields = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
  });
}

async function readCsv(file, requiredHeaders) {
  const bytes = await readFile(file);
  const text = bytes.toString("utf8");
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const headers = parseCsvLine(firstLine);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(`${path.basename(file)} missing columns: ${missing.join(", ")}`);
  return { rows: parseCsv(text), sha256: HASH(bytes) };
}

function num(value, context) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${context} is not numeric: ${value}`);
  return parsed;
}

function ratio(numerator, denominator, context) {
  if (!(numerator > 0) || !(denominator > 0)) throw new Error(`${context} must be positive`);
  return numerator / denominator;
}

function throughOriginSlope(points) {
  const denominator = points.reduce((sum, point) => sum + point.x ** 2, 0);
  if (!(denominator > 0)) return null;
  return points.reduce((sum, point) => sum + point.x * point.y, 0) / denominator;
}

function interpolated2011Counts(counts2010, counts2012) {
  const sizes = SIZES;
  const total0 = sizes.reduce((sum, size) => sum + counts2010[size], 0);
  const total2 = sizes.reduce((sum, size) => sum + counts2012[size], 0);
  const targetTotal = (total0 + total2) / 2;
  const shares = Object.fromEntries(
    sizes.map((size) => [size, (counts2010[size] / total0 + counts2012[size] / total2) / 2]),
  );
  const roundedShareTotal = sizes.reduce((sum, size) => sum + Number(shares[size].toFixed(12)), 0);
  return Object.fromEntries(
    sizes.map((size) => [
      size,
      Number(((Number(shares[size].toFixed(12)) / roundedShareTotal) * targetTotal).toFixed(9)),
    ]),
  );
}

function makePanel(rows, keyColumn, valueColumn, requiredYears, label) {
  const panel = new Map();
  for (const row of rows) {
    const year = num(row.year, `${label} year`);
    const key = row[keyColumn];
    if (!YEARS.includes(year) && year !== 2025) continue;
    if (!SIZES.includes(key)) throw new Error(`${label} has unsupported ${keyColumn}: ${key}`);
    const mapKey = `${year}|${key}`;
    if (panel.has(mapKey)) throw new Error(`${label} duplicate row ${mapKey}`);
    panel.set(mapKey, num(row[valueColumn], `${label} ${mapKey}`));
  }
  const missing = [];
  for (const year of requiredYears) {
    for (const key of SIZES) if (!panel.has(`${year}|${key}`)) missing.push(`${year}/${key}`);
  }
  if (missing.length) throw new Error(`${label} incomplete; missing ${missing.join(", ")}`);
  return panel;
}

function validateSeries(rows) {
  const seriesIds = new Set(rows.map((row) => row.series_id));
  if (seriesIds.size !== 1 || seriesIds.has("") || seriesIds.has(undefined)) {
    throw new Error(
      `weights.csv must identify one connected series_id; found ${[...seriesIds].join(", ")}`,
    );
  }
  const benchmarkNotes = new Set(
    rows
      .filter((row) => YEARS.includes(Number(row.year)) || Number(row.year) === 2025)
      .map((row) => row.benchmark_id),
  );
  if (benchmarkNotes.has("") || benchmarkNotes.has(undefined))
    throw new Error("weights.csv benchmark_id is required for every row");
  const connectionStatuses = new Set(rows.map((row) => row.connection_status));
  if (
    connectionStatuses.size !== 1 ||
    connectionStatuses.has("") ||
    connectionStatuses.has(undefined)
  ) {
    throw new Error(
      `weights.csv must declare one connection_status; found ${[...connectionStatuses].join(", ")}`,
    );
  }
  return {
    seriesId: [...seriesIds][0],
    benchmarkIds: [...benchmarkNotes],
    connectionStatus: [...connectionStatuses][0],
  };
}

function containedPath(baseDir, relative, label) {
  if (typeof relative !== "string" || relative.length === 0 || path.isAbsolute(relative))
    throw new Error(`${label} must be a relative path`);
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, relative);
  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`))
    throw new Error(`${label} escapes its source directory`);
  return resolved;
}

async function readJson(file) {
  return JSON.parse((await readFile(file)).toString("utf8"));
}

async function verifyRawFile(baseDir, source, label, expectedId) {
  if (source.statInfId !== expectedId || !/^[A-Z0-9]{10,20}$/.test(source.statInfId ?? ""))
    throw new Error(`${label} has invalid or unexpected statInfId`);
  const expectedUrl = `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${source.statInfId}`;
  if (source.url !== expectedUrl) throw new Error(`${label} download URL does not match statInfId`);
  const file = containedPath(ROOT, source.file, `${label} file`);
  const bytes = await readFile(file);
  const actualHash = HASH(bytes);
  if (source.sha256 !== actualHash) throw new Error(`${label} raw SHA-256 mismatch`);
  return { file: source.file, statInfId: source.statInfId, sha256: actualHash };
}

async function verifyHouseholdPanelProvenance(inputDir) {
  const manifest = await readJson(path.join(inputDir, "household-survey-panel-manifest.json"));
  if (manifest.schemaVersion !== "cti-size-composition-household-survey-panel-v1")
    throw new Error("unsupported household-survey-panel-manifest schema");
  const expectedYears = YEARS.map((year) => year);
  const sourceYears = (manifest.sources ?? []).map((source) => source.year).sort((a, b) => a - b);
  if (JSON.stringify(sourceYears) !== JSON.stringify(expectedYears))
    throw new Error("household panel manifest must cover exactly 2005-2017 once");
  if (manifest.output?.nominal !== true || manifest.output?.unit !== "yen per household per month")
    throw new Error("household panel manifest must declare nominal yen/month values");
  const checkedSources = [];
  for (const entry of manifest.sources) {
    for (const [key, tablePhrase] of [
      ["twoOrMore", "表番号3-1"],
      ["single", "表番号1"],
    ]) {
      const source = entry[key];
      if (!source?.table?.includes(tablePhrase))
        throw new Error(`${entry.year} ${key} table identity is missing or mismatched`);
      checkedSources.push(
        await verifyRawFile(ROOT, source, `${entry.year} ${key}`, source.statInfId),
      );
    }
  }
  const outputHashes = manifest.output?.normalizedOutputs;
  if (
    !outputHashes?.expenditureCsv?.sha256 ||
    !outputHashes?.conditionalTwoPlusDistributionCsv?.sha256
  )
    throw new Error("household panel manifest lacks normalized CSV hashes");
  for (const [key, relative] of [
    ["expenditureCsv", "expenditure.csv"],
    ["conditionalTwoPlusDistributionCsv", "two-plus-household-distribution.csv"],
  ]) {
    const bytes = await readFile(path.join(inputDir, relative));
    if (HASH(bytes) !== outputHashes[key].sha256)
      throw new Error(`${relative} SHA-256 does not match household panel manifest`);
  }
  return {
    schemaVersion: manifest.schemaVersion,
    coveredYears: expectedYears,
    checkedRawSourceCount: checkedSources.length,
    outputSha256: outputHashes.expenditureCsv.sha256,
    checkedSources,
  };
}

async function verifyWeightProvenance(inputDir, weightsRows, weightsHash) {
  const manifest = await readJson(path.join(inputDir, "weights-source-manifest.json"));
  if (manifest.schemaVersion !== "cti-size-composition-lfs-weights-v1")
    throw new Error("unsupported weights-source-manifest schema");
  if (manifest.weightsCsv?.path !== "weights.csv" || manifest.weightsCsv.sha256 !== weightsHash)
    throw new Error("weights.csv SHA-256 does not match weights-source-manifest");
  const legacy = manifest.legacyUnharmonizedWeights;
  if (
    legacy?.status !== "unverified_connected_series" ||
    legacy?.connectionStatus !== "unverified_connected_series"
  )
    throw new Error("legacy weight series must remain explicitly unverified");
  const legacyYears = (legacy.years ?? []).slice().sort((a, b) => a - b);
  const requiredLegacyYears = LEGACY_REPORTED_WEIGHT_YEARS.slice().sort((a, b) => a - b);
  if (
    JSON.stringify(legacyYears) !== JSON.stringify(requiredLegacyYears) ||
    legacy.missingYear !== 2011
  )
    throw new Error("weight manifest must explicitly cover legacy years and exclude 2011");
  if (!legacy.sourceIdRetention || legacy.sourceIdRetention !== "not_retained")
    throw new Error("legacy weight source-ID provenance status is missing");
  const reference = manifest.reference;
  const referenceRaw = await verifyRawFile(
    ROOT,
    reference,
    "2025 LFS IV-4 reference",
    "000040403950",
  );
  if (reference.year !== 2025 || reference.status !== "verified_raw_unconnected_reference")
    throw new Error("2025 LFS reference year/status is invalid");
  const counts = reference.rawCountsInTenThousandHouseholds;
  if (
    !counts ||
    !["total", "one", "two", "three", "four", "five", "six", "sevenPlus"].every((key) =>
      Number.isFinite(counts[key]),
    )
  )
    throw new Error("2025 LFS manifest counts are incomplete");
  const expected2025 = {
    1: counts.one,
    2: counts.two,
    3: counts.three,
    4: counts.four,
    "5+": counts.five + counts.six + counts.sevenPlus,
  };
  const actualByYearSize = new Map(
    weightsRows.map((row) => [
      `${Number(row.year)}|${row.size}`,
      num(row.households, "weights.csv households"),
    ]),
  );
  for (const [size, value] of Object.entries(expected2025)) {
    if (actualByYearSize.get(`2025|${size}`) !== value)
      throw new Error(`weights.csv 2025 ${size} bin does not match verified raw counts`);
  }
  const legacyCounts = legacy.publishedCounts10k;
  if (
    !legacyCounts ||
    Object.keys(legacyCounts)
      .map(Number)
      .sort((a, b) => a - b)
      .join(",") !== legacyYears.join(",")
  )
    throw new Error("legacy weight manifest lacks the declared year-by-year published counts");
  for (const year of legacyYears) {
    const countsForYear = legacyCounts[year];
    if (
      !Array.isArray(countsForYear) ||
      countsForYear.length !== 8 ||
      countsForYear.some((value) => !Number.isFinite(value))
    )
      throw new Error(`legacy weight manifest ${year} household counts are incomplete`);
    const expected = {
      1: countsForYear[1],
      2: countsForYear[2],
      3: countsForYear[3],
      4: countsForYear[4],
      "5+": countsForYear[5] + countsForYear[6] + countsForYear[7],
    };
    for (const [size, value] of Object.entries(expected)) {
      if (actualByYearSize.get(`${year}|${size}`) !== value)
        throw new Error(
          `weights.csv ${year} ${size} bin differs from the declared legacy source snapshot`,
        );
    }
  }
  const interpolation = legacy.interpolatedDiagnosticYear;
  if (
    interpolation?.year !== 2011 ||
    interpolation.method !== INTERPOLATION_METHOD ||
    interpolation.notObserved !== true ||
    interpolation.normalizedSharesBeforeCountScaling !== true ||
    JSON.stringify(interpolation.endpoints) !== JSON.stringify([2010, 2012]) ||
    interpolation.vintageCaveat !== INTERPOLATION_CAVEAT ||
    interpolation.commonBaseBridgeEstablished !== false ||
    JSON.stringify(interpolation.endpointSourceIds) !==
      JSON.stringify({ 2010: "000008597994", 2012: "000018854323" }) ||
    interpolation.excluded2011SourceId !== "000012675623" ||
    interpolation.connectionStatus !== "unverified_connected_series"
  )
    throw new Error("2011 interpolation provenance is missing or inconsistent");
  const endpointCounts = Object.fromEntries(
    SIZES.map((size) => [size, actualByYearSize.get(`2010|${size}`)]),
  );
  const endpointCounts2012 = Object.fromEntries(
    SIZES.map((size) => [size, actualByYearSize.get(`2012|${size}`)]),
  );
  const expected2011 = interpolated2011Counts(endpointCounts, endpointCounts2012);
  const rows2011 = weightsRows.filter((row) => Number(row.year) === 2011);
  if (rows2011.length !== SIZES.length)
    throw new Error("weights.csv must contain five interpolated 2011 size rows");
  for (const row of rows2011) {
    const size = row.size;
    if (
      row.interpolationMethod !== INTERPOLATION_METHOD ||
      row.interpolationEndpoints !== "2010;2012" ||
      row.vintageCaveat !== INTERPOLATION_CAVEAT
    )
      throw new Error(`weights.csv 2011 ${size} interpolation metadata does not match manifest`);
    if (Math.abs(num(row.households, `weights.csv 2011 ${size}`) - expected2011[size]) > 1e-8)
      throw new Error(`weights.csv 2011 ${size} count differs from linear-share interpolation`);
    if (
      row.benchmark_id !== "derived-LFS-IV-4-2010-2012-linear-share" ||
      row.connection_status !== "unverified_connected_series"
    )
      throw new Error(`weights.csv 2011 ${size} vintage/status is invalid`);
  }
  for (const row of weightsRows) {
    const year = Number(row.year);
    if (year === 2025) {
      if (
        row.benchmark_id !== reference.benchmarkId ||
        row.connection_status !== "unverified_connected_series"
      )
        throw new Error("weights.csv 2025 reference vintage/status does not match manifest");
    } else if (legacyYears.includes(year)) {
      if (
        row.benchmark_id !== `legacy-LFS-IV-4-${year}-published-vintage` ||
        row.connection_status !== "unverified_connected_series"
      )
        throw new Error(`weights.csv ${year} vintage/status does not match manifest`);
    } else if (year === 2011) {
      if (
        row.interpolationMethod !== INTERPOLATION_METHOD ||
        row.interpolationEndpoints !== "2010;2012"
      )
        throw new Error("weights.csv contains invalid 2011 interpolation row");
    } else {
      throw new Error(`weights.csv contains an unmanifested year: ${year}`);
    }
  }
  return {
    status: "legacy_unharmonized_weights",
    seriesId: legacy.seriesId,
    connectionStatus: legacy.connectionStatus,
    coveredYears: [...legacyYears, 2011].sort((a, b) => a - b),
    missingRawYear: legacy.missingYear,
    interpolatedDiagnosticYear: {
      year: 2011,
      method: INTERPOLATION_METHOD,
      endpoints: [2010, 2012],
      notObserved: true,
      vintageCaveat: INTERPOLATION_CAVEAT,
    },
    checkedReferenceRaw: referenceRaw,
    checkedLegacySnapshots: legacyYears.length,
    csvSha256: weightsHash,
    sourceIdsRetainedForLegacyYears: false,
  };
}

async function readCtiInputs(root) {
  const [aBytes, bBytes] = await Promise.all([
    readFile(path.join(root, CTI_DIR, "A.json")),
    readFile(path.join(root, CTI_DIR, "B.json")),
  ]);
  const a = JSON.parse(aBytes.toString("utf8"));
  const b = JSON.parse(bBytes.toString("utf8"));
  const a17 = a.rows.find((row) => row.year === 2017)?.values;
  if (!a17) throw new Error("CTI adjusted A has no 2017 anchor");
  const bByYear = new Map(b.rows.map((row) => [row.year, row.values]));
  const aByYear = new Map(a.rows.map((row) => [row.year, row.values]));
  for (const year of YEARS) if (!bByYear.has(year)) throw new Error(`CTI basic B missing ${year}`);
  return {
    a17,
    aByYear,
    bByYear,
    hashes: { A: HASH(aBytes), B: HASH(bBytes) },
  };
}

async function run() {
  const args = argumentsOf(process.argv.slice(2));
  const inputDir = path.resolve(args.get("--input-dir") ?? DEFAULT_INPUT_DIR);
  const outputDir = path.resolve(args.get("--output-dir") ?? DEFAULT_OUTPUT_DIR);
  const resultFile = path.join(outputDir, "candidate.json");
  await mkdir(outputDir, { recursive: true });

  let output;
  try {
    const householdProvenance = await verifyHouseholdPanelProvenance(inputDir);
    const [expenditure, weights, cti] = await Promise.all([
      readCsv(path.join(inputDir, "expenditure.csv"), ["year", "size", "category", "value_yen"]),
      readCsv(path.join(inputDir, "weights.csv"), [
        "year",
        "size",
        "households",
        "series_id",
        "benchmark_id",
        "connection_status",
      ]),
      readCtiInputs(ROOT),
    ]);
    const weightProvenance = await verifyWeightProvenance(inputDir, weights.rows, weights.sha256);
    const series = validateSeries(weights.rows);
    if (
      series.connectionStatus !== "unverified_connected_series" ||
      series.seriesId !== weightProvenance.seriesId
    )
      throw new Error(
        "only the declared legacy unharmonized diagnostic is enabled for this weight vintage",
      );
    const spendByKey = new Map();
    for (const row of expenditure.rows) {
      const year = num(row.year, "expenditure year");
      const category = row.category === "消費支出" ? "総合" : row.category;
      const key = `${year}|${row.size}|${category}`;
      if (spendByKey.has(key)) throw new Error(`expenditure.csv duplicate ${key}`);
      if (
        !SIZES.includes(row.size) ||
        !(SURVEY_CATEGORIES.includes(category) || category === "総合")
      ) {
        throw new Error(`unsupported expenditure row ${key}`);
      }
      spendByKey.set(key, num(row.value_yen, key));
    }
    const weightPanel = makePanel(
      weights.rows,
      "size",
      "households",
      REQUIRED_WEIGHT_YEARS,
      "weights.csv",
    );
    const missingExpenditure = [];
    for (const year of YEARS)
      for (const size of SIZES) {
        for (const category of ["総合", ...SURVEY_CATEGORIES]) {
          if (!spendByKey.has(`${year}|${size}|${category}`))
            missingExpenditure.push(`${year}/${size}/${category}`);
        }
      }
    if (missingExpenditure.length)
      throw new Error(
        `expenditure.csv incomplete (${missingExpenditure.length} rows); first missing: ${missingExpenditure.slice(0, 12).join(", ")}`,
      );

    const weight = (year, size) => weightPanel.get(`${year}|${size}`);
    const p = (year, size) => {
      const total = SIZES.reduce((sum, bin) => sum + weight(year, bin), 0);
      return weight(year, size) / total;
    };
    const x = (year, size, category) => spendByKey.get(`${year}|${size}|${category}`);
    const fixedCompositionIndex = (year, category) =>
      SIZES.reduce((sum, size) => sum + p(2025, size) * x(year, size, category), 0);
    const actualCompositionIndex = (year, category) =>
      SIZES.reduce((sum, size) => sum + p(year, size) * x(year, size, category), 0);
    const analyzableYears = YEARS.filter((year) => REQUIRED_WEIGHT_YEARS.includes(year));
    const r = {};
    for (const category of ["総合", ...SURVEY_CATEGORIES]) {
      const base = ratio(
        fixedCompositionIndex(2017, category),
        actualCompositionIndex(2017, category),
        `${category} 2017 fixed-composition factor`,
      );
      r[category] = Object.fromEntries(
        analyzableYears.map((year) => [
          year,
          ratio(
            ratio(
              fixedCompositionIndex(year, category),
              actualCompositionIndex(year, category),
              `${category} ${year} fixed-composition factor`,
            ),
            base,
            `${category} ${year} normalized R`,
          ),
        ]),
      );
    }

    const lambdas = {};
    const fittedYears = analyzableYears.filter((year) => FIT_YEARS.includes(year) && year !== 2011);
    const strictBreakExcludedYears = new Set([2005, 2007, 2010, 2011, 2012, 2015, 2016]);
    const strictStableYears = fittedYears.filter((year) => !strictBreakExcludedYears.has(year));
    for (const category of SURVEY_CATEGORIES) {
      const points = fittedYears.map((year) => ({
        x: Math.log(r["総合"][year]),
        y: Math.log(r[category][year]),
        year,
      }));
      const lambda = throughOriginSlope(points);
      const loo = fittedYears.map((omittedYear) =>
        throughOriginSlope(points.filter((point) => point.year !== omittedYear)),
      );
      const stablePoints = points.filter((point) => strictStableYears.includes(point.year));
      const stableLambda = throughOriginSlope(stablePoints);
      const stableLoo = strictStableYears.map((omittedYear) =>
        throughOriginSlope(stablePoints.filter((point) => point.year !== omittedYear)),
      );
      lambdas[category] = {
        estimate: lambda,
        observationCount: points.length,
        fitYears: fittedYears,
        leaveOneYearOut: {
          min: Math.min(...loo),
          max: Math.max(...loo),
          byOmittedYear: Object.fromEntries(fittedYears.map((year, index) => [year, loo[index]])),
        },
        strictBreakExclusion: {
          excludedBreakYears: [...strictBreakExcludedYears],
          fitYears: strictStableYears,
          estimate: stableLambda,
          leaveOneYearOut: { min: Math.min(...stableLoo), max: Math.max(...stableLoo) },
        },
      };
    }

    const estimateFor = (year, totalR) => {
      const b = cti.bByYear.get(year);
      const totalTarget =
        b["総合"] *
        ratio(cti.a17["総合"], cti.bByYear.get(2017)["総合"], "CTI total anchor") *
        totalR;
      const bOther = b["総合"] - CATEGORIES.reduce((sum, category) => sum + b[category], 0);
      const b17Other =
        cti.bByYear.get(2017)["総合"] -
        CATEGORIES.reduce((sum, category) => sum + cti.bByYear.get(2017)[category], 0);
      const a17Other =
        cti.a17["総合"] - CATEGORIES.reduce((sum, category) => sum + cti.a17[category], 0);
      if (!(bOther > 0) || !(b17Other > 0) || !(a17Other > 0))
        throw new Error(`${year}: CTI residual Other must be positive for additive candidate`);
      const raw = Object.fromEntries(
        SURVEY_CATEGORIES.map((category) => {
          const current = category === "その他の消費支出" ? bOther : b[category];
          const base = category === "その他の消費支出" ? b17Other : cti.bByYear.get(2017)[category];
          const adjustedBase = category === "その他の消費支出" ? a17Other : cti.a17[category];
          return [
            category,
            current *
              ratio(adjustedBase, base, `${category} CTI anchor`) *
              totalR ** lambdas[category].estimate,
          ];
        }),
      );
      const rawSum = Object.values(raw).reduce((sum, value) => sum + value, 0);
      const scale = ratio(totalTarget, rawSum, `candidate common scale ${year}`);
      const adjusted = Object.fromEntries(
        Object.entries(raw).map(([category, value]) => [category, value * scale]),
      );
      const adjustedSum = Object.values(adjusted).reduce((sum, value) => sum + value, 0);
      return {
        year,
        totalTarget,
        rawCategories: raw,
        commonScale: scale,
        adjustedCategories: adjusted,
        additivityError: totalTarget - adjustedSum,
        anchorIdentityOnly: year === 2017,
      };
    };
    const annualEstimates = analyzableYears.map((year) => {
      const baseline = estimateFor(year, r["総合"][year]);
      if (year !== 2011) return baseline;
      const fixed2025 = SIZES.map((size) => p(2025, size));
      const base2017 = ratio(
        fixedCompositionIndex(2017, "総合"),
        actualCompositionIndex(2017, "総合"),
        "総合 2017 anchor factor",
      );
      const endpointR = Object.fromEntries(
        [2010, 2012].map((endpointYear) => {
          const endpointShares = SIZES.map((size) => p(endpointYear, size));
          const fixed = SIZES.reduce(
            (sum, size, index) => sum + fixed2025[index] * x(2011, size, "総合"),
            0,
          );
          const endpointActual = SIZES.reduce(
            (sum, size, index) => sum + endpointShares[index] * x(2011, size, "総合"),
            0,
          );
          return [
            endpointYear,
            ratio(
              ratio(fixed, endpointActual, `2011 total using ${endpointYear} endpoint`),
              base2017,
              `2011 endpoint ${endpointYear} R`,
            ),
          ];
        }),
      );
      const endpointEstimates = Object.fromEntries(
        Object.entries(endpointR).map(([endpointYear, endpointFactor]) => [
          endpointYear,
          estimateFor(2011, endpointFactor),
        ]),
      );
      const categoryRange = Object.fromEntries(
        SURVEY_CATEGORIES.map((category) => {
          const values = Object.values(endpointEstimates).map(
            (estimate) => estimate.adjustedCategories[category],
          );
          return [
            category,
            {
              min: Math.min(...values),
              max: Math.max(...values),
              baseline: baseline.adjustedCategories[category],
              maxAbsoluteDifferenceFromInterpolated: Math.max(
                ...values.map((value) => Math.abs(value - baseline.adjustedCategories[category])),
              ),
            },
          ];
        }),
      );
      return {
        ...baseline,
        interpolationSensitivity: {
          method: INTERPOLATION_METHOD,
          notObserved: true,
          endpointTotalR: endpointR,
          endpointAlternativeEstimates: endpointEstimates,
          categoryRange,
          totalTargetRange: {
            min: Math.min(
              ...Object.values(endpointEstimates).map((estimate) => estimate.totalTarget),
            ),
            max: Math.max(
              ...Object.values(endpointEstimates).map((estimate) => estimate.totalTarget),
            ),
          },
          endpointAlternativeAnnualCandidatesAreDiagnosticOnly: true,
        },
      };
    });

    const externalValidation = [];
    for (let year = 2018; year <= 2024; year += 1) {
      const b = cti.bByYear.get(year);
      const a = cti.aByYear.get(year);
      if (!b || !a) continue;
      const official = {};
      const predictedComposition = {};
      const normalizedPredicted = {};
      for (const category of CATEGORIES) {
        const officialR = ratio(
          ratio(a[category], b[category], `${year} ${category} A/B`),
          ratio(cti.a17[category], cti.bByYear.get(2017)[category], `2017 ${category} A/B`),
          `${year} ${category} official relative adjustment`,
        );
        official[category] = officialR;
        predictedComposition[category] = null;
      }
      externalValidation.push({
        year,
        status: "not_computed_missing_2018_2024_household_profiles_and_weights",
        officialRelativeAdjustment: official,
        predictedCompositionOnly: predictedComposition,
        normalizedCandidatePrediction: normalizedPredicted,
      });
    }

    output = {
      schemaVersion: "plan39-size-composition-candidate-v1",
      status: "legacy_unharmonized_weights",
      method: {
        referenceDistributionYear: 2025,
        normalizationAnchorYear: 2017,
        weightYear2011: {
          method: INTERPOLATION_METHOD,
          endpoints: [2010, 2012],
          status: "derived_not_observed",
          noCommonBaseBridgeEstablished: true,
          includedInAnnualR: true,
          includedInLambdaFit: false,
        },
        factor:
          "R[t,c] = (sum_s p[2025,s] x[t,s,c] / sum_s p[t,s] x[t,s,c]) / (sum_s p[2025,s] x[2017,s,c] / sum_s p[2017,s] x[2017,s,c])",
        sensitivity:
          "log(R[t,c]) = lambda[c] * log(R[t,total]) through-origin OLS; fit 2005-2016 excluding interpolated 2011",
        commonScaling:
          "the nine published CTI categories are joined by an Other residual (total minus the nine published category indices) at both B[t] and the 2017 A/B anchor; all ten categories are multiplied by target total / sum(raw ten categories)",
        sizeBins: SIZES,
        ctiCategories: CATEGORIES,
        householdSurveyCategories: SURVEY_CATEGORIES,
        units:
          "CTI nominal index points (annual), household-survey expenditures in yen per household per month",
      },
      inputs: {
        expenditure: {
          path: path.relative(ROOT, path.join(inputDir, "expenditure.csv")),
          sha256: expenditure.sha256,
          sourceTables: [
            "e-Stat Household Survey, two-or-more households, annual table 004",
            "e-Stat Household Survey, single-person households, detailed table 1",
          ],
        },
        weights: {
          path: path.relative(ROOT, path.join(inputDir, "weights.csv")),
          sha256: weights.sha256,
          seriesId: series.seriesId,
          connectionStatus: series.connectionStatus,
          benchmarkIds: series.benchmarkIds,
          sourceTable: "e-Stat Labour Force Survey, annual household counts by household size",
        },
        cti: {
          paths: ["data/source/cti-adjusted/A.json", "data/source/cti-adjusted/B.json"],
          ...cti.hashes,
        },
      },
      provenanceGate: {
        status: "passed_for_legacy_diagnostic_only",
        householdPanel: householdProvenance,
        weights: weightProvenance,
      },
      diagnostics: {
        weightSeries: {
          status: series.connectionStatus,
          benchmarkIds: series.benchmarkIds,
          usableForOfficialCandidate: series.connectionStatus === "verified_connected",
        },
        dataCoverage: {
          expenditureYears: YEARS,
          referenceWeightYear: 2025,
          weightYears: [...analyzableYears, 2025],
          interpolatedWeightYear: 2011,
          interpolatedWeightMethod: INTERPOLATION_METHOD,
          excludedWeightYearsFromLambdaFit: [2011],
          sizeBins: SIZES,
          categories: ["総合", ...SURVEY_CATEGORIES],
        },
        compositionFactors: r,
        lambdas,
        additivityMaxAbsError: Math.max(
          ...annualEstimates.map((row) => Math.abs(row.additivityError)),
        ),
      },
      annualEstimates,
      limitations: [
        "The expenditure profiles are from the Household Survey, not CTI's three-survey composite, so this is a diagnostic proxy.",
        "Labour Force Survey household weights must form one defensible connected series across revisions; benchmark_id documents provenance but does not by itself prove comparability.",
        "2011 is not an observed national LFS household-size weight: its diagnostic distribution linearly interpolates shares from 2010 (2005 Census base) and 2012 (2010 Census base), with no official common-base bridge established. The 2011 source excludes three prefectures and is not substituted.",
        "The official CTI adjusted series fixes household attribute distributions to 2025; using 2025 as the reference is a methodological alignment, while normalization to the 2017 A/B anchor is a separate candidate construction.",
        "The common scale guarantees additivity. Other is a derived index residual, not an independently published CTI category; its household-survey lambda is applied to that residual for allocation.",
        "The 2011 endpoint alternatives show sensitivity to using either endpoint composition instead of the interpolated distribution; they do not quantify benchmark uncertainty or establish connected weights.",
        "This artifact does not change production estimates or publication gates.",
      ],
      validation: {
        fitPeriod: fittedYears,
        excludedInterpolatedWeightYear: 2011,
        externalOfficialOverlap: externalValidation,
        anchorIsEvidence: false,
      },
    };
  } catch (error) {
    output = {
      schemaVersion: "plan39-size-composition-candidate-v1",
      status: "not_computed_missing_or_invalid_inputs",
      error: error instanceof Error ? error.message : String(error),
      requiredInputs: {
        expenditureCsv:
          "data/source/cti-size-composition/expenditure.csv with year,size,category,value_yen; years 2005-2017; sizes 1,2,3,4,5+; categories 総合 and all ten Household Survey major categories",
        weightsCsv:
          "data/source/cti-size-composition/weights.csv with year,size,households,series_id,benchmark_id,connection_status,interpolationMethod,interpolationEndpoints,vintageCaveat; years 2005-2017 and 2025; 2011 is linear-share interpolated from unverified 2010/2012 endpoints, is not observed, and is excluded from lambda fit",
      },
      knownSourceUrls: [
        "https://www.e-stat.go.jp/stat-search/database?kana=46&layout=dataset&statdisp_id=0002070009",
        "https://www.e-stat.go.jp/stat-search/files?cycle=7&layout=datalist&month=0&tclass1=000000330001&tclass2=000000330022&tclass3=000000330023&tclass4val=0&toukei=00200561&tstat=000000330001&year=YYYY0",
        "https://www.stat.go.jp/data/cti/pdf/micro_ref_2025.pdf",
      ],
      limitations: [
        "No estimates are fabricated when primary-source extracts or a defensible connected weight series are missing.",
      ],
    };
  }

  await writeFile(resultFile, `${JSON.stringify(output, null, 2)}\n`);
  if (output.annualEstimates) {
    const writeRows = async (name, rows) =>
      writeFile(
        path.join(outputDir, name),
        `${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}\n`,
      );
    await writeRows("lambda-summary.csv", [
      [
        "category",
        "lambda",
        "fit_observations",
        "loo_min",
        "loo_max",
        "fit_years",
        "strict_break_excluded_lambda",
        "strict_break_excluded_loo_min",
        "strict_break_excluded_loo_max",
        "strict_break_excluded_years",
        "interpretation",
      ],
      ...Object.entries(output.diagnostics.lambdas).map(([category, details]) => [
        category,
        details.estimate,
        details.observationCount,
        details.leaveOneYearOut.min,
        details.leaveOneYearOut.max,
        details.fitYears.join(";"),
        details.strictBreakExclusion.estimate,
        details.strictBreakExclusion.leaveOneYearOut.min,
        details.strictBreakExclusion.leaveOneYearOut.max,
        details.strictBreakExclusion.fitYears.join(";"),
        "household-survey size sensitivity; not a CTI A/B backtest",
      ]),
    ]);
    await writeRows("composition-factors.csv", [
      ["year", "category", "R_2025_reference_normalized_to_2017"],
      ...Object.entries(output.diagnostics.compositionFactors).flatMap(([category, values]) =>
        Object.entries(values).map(([year, value]) => [year, category, value]),
      ),
    ]);
    await writeRows("annual-candidate.csv", [
      [
        "year",
        "weight_2011_method",
        "total_target",
        "endpoint_total_min_2011",
        "endpoint_total_max_2011",
        "common_scale_g",
        "anchor_identity_only",
        "additivity_error",
        ...SURVEY_CATEGORIES,
        ...SURVEY_CATEGORIES.flatMap((category) => [
          `${category}_endpoint_min_2011`,
          `${category}_endpoint_max_2011`,
        ]),
      ],
      ...output.annualEstimates.map((row) => {
        const sensitivity = row.interpolationSensitivity;
        return [
          row.year,
          sensitivity?.method ?? "",
          row.totalTarget,
          sensitivity?.totalTargetRange.min ?? "",
          sensitivity?.totalTargetRange.max ?? "",
          row.commonScale,
          row.anchorIdentityOnly,
          row.additivityError,
          ...SURVEY_CATEGORIES.map((category) => row.adjustedCategories[category]),
          ...SURVEY_CATEGORIES.flatMap((category) => [
            sensitivity?.categoryRange[category].min ?? "",
            sensitivity?.categoryRange[category].max ?? "",
          ]),
        ];
      }),
    ]);
  }
  process.stdout.write(
    `${JSON.stringify({ status: output.status, resultFile: path.relative(ROOT, resultFile), error: output.error ?? null })}\n`,
  );
  if (
    !new Set(["computed_candidate_not_for_publication", "legacy_unharmonized_weights"]).has(
      output.status,
    )
  )
    process.exitCode = 2;
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
