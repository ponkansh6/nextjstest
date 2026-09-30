#!/usr/bin/env node

/** Research-only annual CTI education-share backtest using January LFS household-size shares. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INPUT = path.join(ROOT, "data/source/cti-size-composition");
const LFS_DIR = path.join(INPUT, "raw/lfs-special-jan");
const DATA_DIR = path.join(INPUT, "two-plus-share-backtest");
const OUTPUT_DIR = path.join(ROOT, "results/plan39/two-plus-share-backtest");
const YEARS = Array.from({ length: 9 }, (_, index) => 2017 + index);
const SIZES = ["1", "2", "3", "4", "5+"];
const LFS_URL = (year) =>
  `https://www.stat.go.jp/data/kakei/${year}nn/zuhyou/setai-n.${year === 2025 ? "xlsx" : "xls"}`;
const LFS_FILE = (year) => path.join(LFS_DIR, `${year}-setai-n.${year === 2025 ? "xlsx" : "xls"}`);
const CTI_SOURCES = {
  B: {
    url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040499069&fileKind=0",
    file: path.join(INPUT, "raw/cti/000040499069-basic.xlsx"),
    series: "CTI basic B",
  },
  A: {
    url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040499087&fileKind=0",
    file: path.join(INPUT, "raw/cti/000040499087-adjusted.xlsx"),
    series: "CTI distribution-adjusted A",
  },
};
const CAVEATS = {
  lfsProxy:
    "Each file is the special setai-n tabulation published for that year's January Household Survey. Household Survey design documentation says the correction distribution used for a month is the LFS household-size distribution averaged over the preceding/trailing 12 months. Thus one January snapshot is only an annual proxy, not a calendar-year average. References: https://www.stat.go.jp/data/kakei/setai_bunpu.html and https://www.stat.go.jp/data/kakei/pdf/18gai00.pdf.",
  redesign:
    "The Household Survey underwent a major redesign in 2018. CTI basic/adjusted series use the 2025-base official tables, but the target A/B composition may still reflect source-survey methodology changes around 2018.",
  lfsBenchmarks:
    "LFS population benchmarks changed to the 2015 Census-based estimates beginning January 2017 and to the 2020 Census-based estimates beginning January 2022. Treat movements across these January benchmark changes, especially the 2021-to-2022 movement, as potentially affected by rebenchmarking as well as real household-composition change. Sources: https://www.stat.go.jp/data/roudou/benchpop/change/2017.html and https://www.stat.go.jp/data/roudou/benchpop/change.html.",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (value) =>
  typeof value === "string"
    ? value
        .trim()
        .replaceAll("　", " ")
        .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
        .replace(/\s+/g, " ")
    : "";
const csv = (rows) =>
  `${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
const validNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const xlCol = (n) => {
  let s = "";
  for (let x = n; x; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

async function loadWorkbook(file) {
  const bytes = await readFile(file);
  return { bytes, hash: sha256(bytes), book: XLSX.read(bytes, { type: "buffer", raw: true }) };
}

function rowsFor(book, sheetName) {
  const sheet = book.Sheets[sheetName];
  if (!sheet) throw new Error(`required sheet missing: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

function extractLfs(year, loaded) {
  const expectedSheet = `${year}年世帯数分布表`;
  if (!loaded.book.SheetNames.includes(expectedSheet))
    throw new Error(`${year}: expected sheet ${expectedSheet} not found`);
  const rows = rowsFor(loaded.book, expectedSheet);
  const title = text(rows[0]?.[0]);
  if (!title.includes("世帯分布") || text(rows[1]?.[0]).replaceAll(" ", "") !== `${year}年1月分`)
    throw new Error(`${year}: title/year header does not identify January ${year}`);
  const header = rows[4];
  if (text(header?.[4]) !== "全国") throw new Error(`${year}: national values are not in column E`);
  const labels = { total: "総数", 1: "1人", 2: "2人", 3: "3人", 4: "4人", "5+": "5人以上" };
  const located = {};
  for (const [size, label] of Object.entries(labels)) {
    const hits = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => text(row?.[2]) === label);
    if (hits.length !== 1)
      throw new Error(`${year}: expected exactly one ${label} row, found ${hits.length}`);
    located[size] = hits[0];
    if (!validNumber(hits[0].row[4]))
      throw new Error(`${year}: invalid national value for ${label}`);
  }
  const denominator = located.total.row[4];
  if (denominator !== 1_000_000)
    throw new Error(`${year}: published national denominator must be 1,000,000 parts`);
  const counts = Object.fromEntries(SIZES.map((size) => [size, located[size].row[4]]));
  const rawBinSum = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (Math.abs(rawBinSum - denominator) > 5)
    throw new Error(
      `${year}: household-size row sum ${rawBinSum} differs materially from reported denominator ${denominator}`,
    );
  const shares = Object.fromEntries(SIZES.map((size) => [size, counts[size] / denominator]));
  const shareSum = Object.values(shares).reduce((sum, value) => sum + value, 0);
  const pi2plus = 1 - shares["1"];
  if (!(pi2plus > 0 && pi2plus < 1))
    throw new Error(`${year}: computed 2+ household share is outside (0,1)`);
  return {
    year,
    sourceUrl: LFS_URL(year),
    file: path.relative(ROOT, LFS_FILE(year)),
    sha256: loaded.hash,
    sheet: expectedSheet,
    tableTitle: title,
    reportedYear: Number(text(rows[1][0]).match(/\d{4}/)?.[0]),
    nationalColumn: "E",
    unit: "parts per million households",
    denominator,
    rawCounts: { total: denominator, ...counts },
    shares,
    rawBinSum,
    shareSum,
    pi2plus,
    extractionEvidence: {
      headerCell: "E5",
      nationalHeader: header[4],
      rowNumbers: Object.fromEntries(
        Object.entries(located).map(([size, item]) => [size, item.index + 1]),
      ),
      cells: Object.fromEntries(
        Object.entries(located).map(([size, item]) => [size, `E${item.index + 1}`]),
      ),
      note: "Shares use each exact published row count divided by the published 1,000,000-part national total. Source rounding can make the five size rows sum to 999,999 or 1,000,001; values are not renormalized.",
    },
  };
}

function extractCti(year, loaded, kind) {
  const sheetName = "総・年";
  const rows = rowsFor(loaded.book, sheetName);
  const headerIndex = rows.findIndex(
    (row) =>
      row.some((cell) => text(cell) === "年平均") &&
      row.some((cell) => text(cell) === "教育（名目）"),
  );
  if (headerIndex < 0) throw new Error(`${kind}: annual nominal headers are missing`);
  const yearColumn = rows[headerIndex].findIndex((cell) => text(cell) === "年平均");
  const totalColumn = rows[headerIndex].findIndex((cell) => text(cell) === "消費支出（名目）");
  const educationColumn = rows[headerIndex].findIndex((cell) => text(cell) === "教育（名目）");
  if (yearColumn < 0 || totalColumn < 0 || educationColumn < 0)
    throw new Error(`${kind}: required CTI columns not found`);
  const hits = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => text(row[yearColumn]) === `${year}年`);
  if (hits.length !== 1)
    throw new Error(`${kind}: expected exactly one ${year} annual row, found ${hits.length}`);
  const { row, index } = hits[0];
  const total = row[totalColumn];
  const education = row[educationColumn];
  if (!validNumber(total) || total <= 0 || !validNumber(education) || education > total)
    throw new Error(`${kind}: invalid raw total/education value for ${year}`);
  return {
    value: { total, education, share: education / total },
    evidence: {
      file: path.relative(ROOT, kind === "A" ? CTI_SOURCES.A.file : CTI_SOURCES.B.file),
      sourceUrl: CTI_SOURCES[kind].url,
      sha256: loaded.hash,
      series: CTI_SOURCES[kind].series,
      sheet: sheetName,
      headerRow: headerIndex + 1,
      yearRow: index + 1,
      reportedYear: text(row[yearColumn]),
      cells: {
        year: `${xlCol(yearColumn + 1)}${index + 1}`,
        total: `${xlCol(totalColumn + 1)}${index + 1}`,
        education: `${xlCol(educationColumn + 1)}${index + 1}`,
      },
      rawValues: { total, education },
    },
  };
}

function stats(rows, estimateKey) {
  const residuals = rows.map((row) => row[estimateKey] - row.pAedu);
  const mae = residuals.length
    ? residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length
    : null;
  const rmse = residuals.length
    ? Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length)
    : null;
  const bias = residuals.length
    ? residuals.reduce((sum, value) => sum + value, 0) / residuals.length
    : null;
  return {
    n: rows.length,
    coverage: `${rows.length}/8 validation years`,
    mae,
    rmse,
    bias,
    maePercentagePoints: mae === null ? null : mae * 100,
    rmsePercentagePoints: rmse === null ? null : rmse * 100,
    biasPercentagePoints: bias === null ? null : bias * 100,
    unit: "share fraction; percentage-point values are also provided",
  };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  const lfs = {};
  const ctiBooks = {};
  const yearFailures = [];
  const workbookFailures = [];
  for (const year of YEARS) {
    try {
      const loaded = await loadWorkbook(LFS_FILE(year));
      lfs[year] = extractLfs(year, loaded);
    } catch (error) {
      yearFailures.push({ year, source: LFS_URL(year), reason: error.message });
    }
  }
  for (const [kind, source] of Object.entries(CTI_SOURCES)) {
    try {
      ctiBooks[kind] = await loadWorkbook(source.file);
    } catch (error) {
      workbookFailures.push({ source: source.url, reason: error.message });
    }
  }
  const cti = {};
  if (ctiBooks.A && ctiBooks.B) {
    for (const year of YEARS) {
      try {
        cti[year] = { A: extractCti(year, ctiBooks.A, "A"), B: extractCti(year, ctiBooks.B, "B") };
      } catch (error) {
        yearFailures.push({
          year,
          source: "retained 2025-base CTI workbooks",
          reason: error.message,
        });
      }
    }
  }
  const cleanupOutputs = async () =>
    Promise.all([
      rm(path.join(OUTPUT_DIR, "annual-backtest.csv"), { force: true }),
      rm(path.join(OUTPUT_DIR, "summary.json"), { force: true }),
      rm(path.join(OUTPUT_DIR, "lfs-national-shares.csv"), { force: true }),
      rm(path.join(DATA_DIR, "source-trace.json"), { force: true }),
      rm(path.join(DATA_DIR, "lfs-national-shares.csv"), { force: true }),
    ]);
  if (workbookFailures.length || !lfs[2017] || !cti[2017]) {
    if (
      !lfs[2017] &&
      !yearFailures.some((failure) => failure.year === 2017 && failure.source === LFS_URL(2017))
    )
      yearFailures.push({
        year: 2017,
        source: LFS_URL(2017),
        reason: "2017 LFS input is unavailable",
      });
    if (
      !cti[2017] &&
      !yearFailures.some(
        (failure) => failure.year === 2017 && failure.source === "retained 2025-base CTI workbooks",
      )
    )
      yearFailures.push({
        year: 2017,
        source: "retained 2025-base CTI workbooks",
        reason: "2017 CTI input is unavailable",
      });
    const failurePath = path.join(OUTPUT_DIR, "source-failures.json");
    await cleanupOutputs();
    await writeFile(
      failurePath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), failures: [...workbookFailures, ...yearFailures] }, null, 2)}\n`,
    );
    throw new Error(
      `Fail-closed: calibration/source is unavailable; see ${path.relative(ROOT, failurePath)}`,
    );
  }
  const validYears = YEARS.filter((year) => lfs[year] && cti[year]);
  const missingYears = YEARS.filter((year) => !validYears.includes(year));
  if (yearFailures.length) {
    await writeFile(
      path.join(OUTPUT_DIR, "source-failures.json"),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), failures: yearFailures }, null, 2)}\n`,
    );
  } else {
    await rm(path.join(OUTPUT_DIR, "source-failures.json"), { force: true });
  }

  const anchor = cti[2017].A.value.share / cti[2017].B.value.share;
  const K = anchor / lfs[2017].pi2plus;
  const annual = validYears.map((year) => {
    const pB = cti[year].B.value.share;
    const pA = cti[year].A.value.share;
    const pi2plus = lfs[year].pi2plus;
    const anchorPrediction = pB * anchor;
    const piPrediction = pB * pi2plus * K;
    return {
      year,
      validation: year >= 2018,
      pAedu: pA,
      pBedu: pB,
      pi1: lfs[year].shares["1"],
      pi2plus,
      anchorRatio2017: anchor,
      K2017: K,
      pHatAnchor: anchorPrediction,
      anchorResidual: anchorPrediction - pA,
      pHatPi2plus: piPrediction,
      pi2plusResidual: piPrediction - pA,
      A_total: cti[year].A.value.total,
      A_education: cti[year].A.value.education,
      B_total: cti[year].B.value.total,
      B_education: cti[year].B.value.education,
      lfsDenominator: lfs[year].denominator,
      lfsCounts: lfs[year].rawCounts,
    };
  });
  const validationRows = annual.filter((row) => row.validation);
  const summary = {
    schemaVersion: "plan39-two-plus-share-backtest-v1",
    generatedAt: new Date().toISOString(),
    purpose:
      "Research-only annual backtest; separate from production estimators, loaders, gates, quarterly values, and prior 2017/2018 study outputs.",
    formulas: {
      pBedu: "B_education / B_total from exact raw values in the 2025-base basic CTI workbook",
      pAedu:
        "A_education / A_total from exact raw values in the 2025-base distribution-adjusted CTI workbook",
      pi2plus: "1 - pi_1, where pi_1 is the January LFS special-tabulation single-household share",
      K: "(pAedu_2017 / pBedu_2017) / pi2plus_2017; calibrated only on 2017",
      proposed: "pHat_Aedu_t = pBedu_t * pi2plus_t * K",
      baseline: "pHat_Aedu_t = pBedu_t * (pAedu_2017 / pBedu_2017)",
      residual: "prediction - official adjusted CTI education share",
    },
    calibration: {
      year: 2017,
      pAedu: cti[2017].A.value.share,
      pBedu: cti[2017].B.value.share,
      pi2plus: lfs[2017].pi2plus,
      anchorRatio: anchor,
      K,
    },
    validation: {
      years: "2018-2025",
      excludedCalibrationYear: 2017,
      count: validationRows.length,
      expectedCount: 8,
      coverage: `${validationRows.length}/8`,
      missingYears: missingYears.filter((year) => year >= 2018),
      failures: yearFailures,
      models: {
        anchor: stats(validationRows, "pHatAnchor"),
        pi2plus: stats(validationRows, "pHatPi2plus"),
      },
    },
    caveats: CAVEATS,
    sources: {
      lfsFiles: Object.fromEntries(validYears.map((year) => [year, lfs[year]])),
      ctiWorkbooks: Object.fromEntries(
        Object.entries(CTI_SOURCES).map(([key, source]) => [
          key,
          {
            ...source,
            file: path.relative(ROOT, source.file),
            sha256: ctiBooks[key].hash,
            sheet: "総・年",
          },
        ]),
      ),
      ctiRows: Object.fromEntries(validYears.map((year) => [year, cti[year]])),
    },
    annual,
  };
  const tracePath = path.join(DATA_DIR, "source-trace.json");
  await writeFile(
    tracePath,
    `${JSON.stringify({ schemaVersion: "plan39-two-plus-share-backtest-source-trace-v1", sources: summary.sources, caveats: CAVEATS }, null, 2)}\n`,
  );
  await writeFile(
    path.join(DATA_DIR, "lfs-national-shares.csv"),
    csv([
      [
        "year",
        "source_url",
        "file",
        "sha256",
        "sheet",
        "reported_year",
        "national_column",
        "denominator",
        "single_count",
        "share_1",
        "count_2",
        "share_2",
        "count_3",
        "share_3",
        "count_4",
        "share_4",
        "count_5plus",
        "share_5plus",
        "pi2plus",
        "raw_bin_sum",
        "share_sum",
      ],
      ...validYears.map((year) => {
        const item = lfs[year];
        return [
          year,
          item.sourceUrl,
          item.file,
          item.sha256,
          item.sheet,
          item.reportedYear,
          item.nationalColumn,
          item.denominator,
          item.rawCounts["1"],
          item.shares["1"],
          item.rawCounts["2"],
          item.shares["2"],
          item.rawCounts["3"],
          item.shares["3"],
          item.rawCounts["4"],
          item.shares["4"],
          item.rawCounts["5+"],
          item.shares["5+"],
          item.pi2plus,
          item.rawBinSum,
          item.shareSum,
        ];
      }),
    ]),
  );
  await writeFile(
    path.join(OUTPUT_DIR, "annual-backtest.csv"),
    csv([
      [
        "year",
        "validation",
        "pAedu_official",
        "pBedu",
        "pi1",
        "pi2plus",
        "K_2017",
        "pHat_anchor",
        "anchor_residual",
        "pHat_pi2plus",
        "pi2plus_residual",
        "A_total_raw",
        "A_education_raw",
        "B_total_raw",
        "B_education_raw",
        "LFS_denominator",
        "LFS_counts_json",
      ],
      ...annual.map((row) => [
        row.year,
        row.validation,
        row.pAedu,
        row.pBedu,
        row.pi1,
        row.pi2plus,
        row.K2017,
        row.pHatAnchor,
        row.anchorResidual,
        row.pHatPi2plus,
        row.pi2plusResidual,
        row.A_total,
        row.A_education,
        row.B_total,
        row.B_education,
        row.lfsDenominator,
        JSON.stringify(row.lfsCounts),
      ]),
    ]),
  );
  await writeFile(path.join(OUTPUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        output: path.relative(ROOT, OUTPUT_DIR),
        calibration: summary.calibration,
        validation: summary.validation,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
