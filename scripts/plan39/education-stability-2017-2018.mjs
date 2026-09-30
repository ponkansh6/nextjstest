#!/usr/bin/env node

/** Analyze household-size composition sensitivity around the 2018 survey redesign. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INPUT = path.join(ROOT, "data/source/cti-size-composition");
const OUTPUT = path.join(INPUT, "education-stability-2017-2018");
const RESULT = path.join(ROOT, "results/plan39/size-composition-candidate");
const MANIFEST_FILE = path.join(INPUT, "education-stability-2017-2018-manifest.json");
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
const ALL_CATEGORIES = ["総合", ...SURVEY_CATEGORIES];
const REFERENCES = {
  twoOrMore2018: {
    year: 2018,
    statInfId: "000031795454",
    url: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000031795454",
    file: "data/source/cti-size-composition/raw/two-or-more/2018-000031795454.xls",
    sheet: "二人",
    table: "家計調査 家計収支編 2018年 詳細結果表 表3-1 二人以上の世帯",
  },
  single2018: {
    year: 2018,
    statInfId: "000031795518",
    url: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000031795518",
    file: "data/source/cti-size-composition/raw/single/2018-000031795518.xls",
    sheet: "単身，勤労，勤労以外，無職",
    table: "家計調査 家計収支編 2018年 詳細結果表 表1 単身世帯",
  },
  lfsSpecial2017: {
    year: 2017,
    url: "https://www.stat.go.jp/data/kakei/2017nn/zuhyou/setai-n.xls",
    file: "data/source/cti-size-composition/raw/lfs-special-jan/2017-setai-n.xls",
    sheet: "2017年世帯数分布表",
  },
  lfsSpecial2018: {
    year: 2018,
    url: "https://www.stat.go.jp/data/kakei/2018nn/zuhyou/setai-n.xls",
    file: "data/source/cti-size-composition/raw/lfs-special-jan/2018-setai-n.xls",
    sheet: "2018年世帯数分布表",
  },
  ctiBasic: {
    year: "2017-2018",
    statInfId: "000040499069",
    url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040499069&fileKind=0",
    file: "data/source/cti-size-composition/raw/cti/000040499069-basic.xlsx",
    sheet: "総・年",
    series: "basic nominal B",
  },
  ctiAdjusted: {
    year: "2017-2018",
    statInfId: "000040499087",
    url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040499087&fileKind=0",
    file: "data/source/cti-size-composition/raw/cti/000040499087-adjusted.xlsx",
    sheet: "総・年",
    series: "distribution-adjusted nominal A",
  },
};
const REDESIGN_CAVEAT =
  "The Household Survey ledger format was comprehensively revised in 2018. Top-level labels are matched, but 2017/2018 household-size expenditure profiles may not be fully comparable; this is a stability diagnostic, not a seamless time series.";
const LFS_CAVEAT =
  "setai-n.xls is published as the special tabulation used for each year's January Household Survey adjustment. Household Survey sample-design documentation defines the adjustment distribution as the Labour Force Survey household-size distribution averaged over the latest 12 months; it is not confirmed as a calendar-year average. It is not an annual IV-4 household-count series and is not the 2025 CTI joint household-size-by-age reference distribution. Sources: https://www.stat.go.jp/data/kakei/pdf/18gai00.pdf p.25 and https://www.stat.go.jp/data/kakei/setai_bunpu.html.";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
  return lines
    .filter(Boolean)
    .map((line) =>
      Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""])),
    );
}

const csv = (rows) =>
  `${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
const normalizeLabel = (value) =>
  typeof value === "string" ? value.trim().replaceAll("　", " ").replace(/\s+/g, " ") : "";
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

async function bytes(relative) {
  return readFile(path.join(ROOT, relative));
}

async function workbook(relative) {
  const data = await bytes(relative);
  return { bytes: data, hash: sha256(data), book: XLSX.read(data, { type: "buffer", raw: true }) };
}

function tableRows(book, sheetName) {
  const sheet = book.Sheets[sheetName];
  if (!sheet) throw new Error(`required sheet missing: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

function rowForCategory(rows, category, afterIndex = 0, majorCode = null) {
  const hits = [];
  for (let i = afterIndex; i < rows.length; i += 1) {
    const labels = rows[i].map(normalizeLabel);
    const labelMatches = labels.some(
      (label) =>
        label === category || (category === "その他の消費支出" && label.startsWith(`${category} `)),
    );
    if (labelMatches && (majorCode === null || Number(rows[i][7]) === majorCode))
      hits.push({ rowIndex: i, row: rows[i] });
  }
  if (!hits.length) throw new Error(`expected one top-level row for ${category}; found none`);
  if (hits.length > 1 && majorCode === null) {
    hits.sort((left, right) => Number(left.row[5]) - Number(right.row[5]));
    if (!Number.isFinite(Number(hits[0].row[5])))
      throw new Error(`ambiguous top-level row for ${category}; found ${hits.length}`);
    return hits[0];
  }
  if (hits.length !== 1)
    throw new Error(`expected one top-level row for ${category}; found ${hits.length}`);
  return hits[0];
}

async function verify2017Panel() {
  const manifest = JSON.parse(
    (await bytes("data/source/cti-size-composition/household-survey-panel-manifest.json")).toString(
      "utf8",
    ),
  );
  const expenditureBytes = await bytes("data/source/cti-size-composition/expenditure.csv");
  if (
    manifest.schemaVersion !== "cti-size-composition-household-survey-panel-v1" ||
    manifest.output?.normalizedOutputs?.expenditureCsv?.sha256 !== sha256(expenditureBytes)
  )
    throw new Error("2017 household panel manifest/output hash mismatch");
  const source = manifest.sources?.find((entry) => entry.year === 2017);
  if (!source) throw new Error("2017 household panel source is absent");
  for (const key of ["twoOrMore", "single"]) {
    const entry = source[key];
    const expectedUrl = `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${entry.statInfId}`;
    if (entry.url !== expectedUrl || !entry.file.includes("/2017-"))
      throw new Error(`2017 ${key} source identity/URL mismatch`);
    if (sha256(await bytes(entry.file)) !== entry.sha256)
      throw new Error(`2017 ${key} raw source hash mismatch`);
  }
  const rows = parseCsv(expenditureBytes.toString("utf8"));
  const panel = new Map(
    rows
      .filter((row) => Number(row.year) === 2017)
      .map((row) => [
        `${row.size}|${row.category === "消費支出" ? "総合" : row.category}`,
        Number(row.value_yen),
      ]),
  );
  const profile = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [
      category,
      Object.fromEntries(
        SIZES.map((size) => {
          const value = panel.get(`${size}|${category}`);
          if (!Number.isFinite(value) || value < 0)
            throw new Error(`2017 household expenditure panel missing ${size}/${category}`);
          return [size, value];
        }),
      ),
    ]),
  );
  return {
    profile,
    provenance: {
      sourceManifestSha256: sha256(
        await bytes("data/source/cti-size-composition/household-survey-panel-manifest.json"),
      ),
      expenditureCsvSha256: sha256(expenditureBytes),
      sources: source,
    },
  };
}

async function extract2018Profile(sourceEntries) {
  const twoPlusSource = sourceEntries.twoOrMore2018;
  const singleSource = sourceEntries.single2018;
  for (const [key, source] of Object.entries({
    twoOrMore2018: twoPlusSource,
    single2018: singleSource,
  })) {
    const reference = REFERENCES[key];
    if (
      source.statInfId !== reference.statInfId ||
      source.url !== reference.url ||
      source.file !== reference.file ||
      source.year !== 2018
    )
      throw new Error(`${key} source ID/URL/path does not match the declared primary source`);
  }
  const [two, one] = await Promise.all([workbook(twoPlusSource.file), workbook(singleSource.file)]);
  const twoRows = tableRows(two.book, twoPlusSource.sheet);
  const oneRows = tableRows(one.book, singleSource.sheet);
  const totalTwoPlus = rowForCategory(twoRows, "消費支出");
  const totalSingle = rowForCategory(oneRows, "消費支出");
  const distributionIndex = twoRows.findIndex((row) =>
    row.some((cell) => typeof cell === "string" && normalizeLabel(cell).includes("世帯数分布")),
  );
  if (distributionIndex < 0)
    throw new Error("2018 table 3-1 household-size distribution row is missing");
  const householdCounts = twoRows[distributionIndex].slice(16, 21);
  if (householdCounts.length !== 5 || householdCounts.some((value) => !isFiniteNumber(value)))
    throw new Error("2018 table 3-1 2/3/4/5/6+ household counts are invalid");
  const fivePlusCount = householdCounts[3] + householdCounts[4];
  const profile = {};
  const trace = {
    table3_1DistributionRow: distributionIndex + 1,
    singleTableConsumptionRow: totalSingle.rowIndex + 1,
    categories: {},
  };
  const majorCodes = Object.fromEntries(
    SURVEY_CATEGORIES.map((category, index) => [category, index + 1]),
  );
  for (const category of ALL_CATEGORIES) {
    const twoHit =
      category === "総合"
        ? totalTwoPlus
        : rowForCategory(twoRows, category, totalTwoPlus.rowIndex, majorCodes[category]);
    const oneHit =
      category === "総合" ? totalSingle : rowForCategory(oneRows, category, totalSingle.rowIndex);
    const oneValue = oneHit.row[16];
    const twoValues = twoHit.row.slice(16, 21);
    if (
      !isFiniteNumber(oneValue) ||
      twoValues.length !== 5 ||
      twoValues.some((value) => !isFiniteNumber(value))
    )
      throw new Error(`2018 source amounts invalid for ${category}`);
    const fivePlus =
      (householdCounts[3] * twoValues[3] + householdCounts[4] * twoValues[4]) / fivePlusCount;
    profile[category] = {
      1: oneValue,
      2: twoValues[0],
      3: twoValues[1],
      4: twoValues[2],
      "5+": fivePlus,
    };
    trace.categories[category] = {
      table3_1Row: twoHit.rowIndex + 1,
      table3_1AmountCells: "Q:U",
      singleTableRow: oneHit.rowIndex + 1,
      singleAmountCell: "Q",
      singleLabel: oneHit.row.find((value) => normalizeLabel(value).startsWith(category)),
    };
  }
  return {
    profile,
    trace,
    rawHashes: { twoOrMore: two.hash, single: one.hash },
    sheetNames: { twoOrMore: two.book.SheetNames, single: one.book.SheetNames },
  };
}

async function extractSpecialShares(sourceEntries) {
  const shares = {};
  const trace = {};
  const rawHashes = {};
  for (const key of ["lfsSpecial2017", "lfsSpecial2018"]) {
    const source = sourceEntries[key];
    const reference = REFERENCES[key];
    if (
      source.year !== reference.year ||
      source.url !== reference.url ||
      source.file !== reference.file
    )
      throw new Error(`${key} URL/path/year does not match the declared source`);
    const input = await workbook(source.file);
    const rows = tableRows(input.book, source.sheet);
    const rowLabels = {
      total: "総数",
      1: "１人",
      2: "２人",
      3: "３人",
      4: "４人",
      "5+": "５人以上",
    };
    const located = {};
    for (const [size, label] of Object.entries(rowLabels)) {
      const matches = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => normalizeLabel(row[2]) === label);
      if (matches.length !== 1)
        throw new Error(`${source.year} setai-n row ${label} is missing or duplicated`);
      located[size] = matches[0];
    }
    const displayedTotal = located.total.row[4];
    if (displayedTotal !== 1_000_000)
      throw new Error(`${source.year} setai-n national total must be 1,000,000 parts`);
    const sizeCountTotal = SIZES.reduce((sum, size) => sum + located[size].row[4], 0);
    if (!(sizeCountTotal > 0) || Math.abs(sizeCountTotal - displayedTotal) > 5)
      throw new Error(
        `${source.year} setai-n size counts materially differ from the displayed total`,
      );
    const yearShares = Object.fromEntries(
      SIZES.map((size) => {
        const row = located[size].row;
        if (!isFiniteNumber(row[4]))
          throw new Error(`${source.year} setai-n national ${size} count is invalid`);
        return [size, row[4] / sizeCountTotal];
      }),
    );
    const shareSum = Object.values(yearShares).reduce((sum, value) => sum + value, 0);
    if (Math.abs(shareSum - 1) > 1e-12)
      throw new Error(`${source.year} setai-n nationwide size shares do not sum to one`);
    shares[source.year] = yearShares;
    const sourceFootnotes = rows.flatMap((row) =>
      row.filter((cell) => typeof cell === "string" && /注[１２]/.test(cell)).map(normalizeLabel),
    );
    trace[source.year] = {
      sheet: source.sheet,
      nationalColumn: "E",
      unit: "parts per million households",
      rows: Object.fromEntries(
        Object.entries(located).map(([size, value]) => [size, value.index + 1]),
      ),
      displayedTotalParts: displayedTotal,
      roundedSizeCountSum: sizeCountTotal,
      sharesRenormalizedToSizeCountSum: true,
      shareSum,
      sourceFootnotes,
    };
    rawHashes[key] = input.hash;
  }
  return { shares, trace, rawHashes };
}

async function ctiInputs() {
  const [a, b] = await Promise.all([
    workbook(REFERENCES.ctiAdjusted.file),
    workbook(REFERENCES.ctiBasic.file),
  ]);
  const expectedHeaders = [
    "消費支出（名目）",
    "食料（名目）",
    "住居（名目）",
    "光熱・水道（名目）",
    "家具・家事用品（名目）",
    "被服及び履物（名目）",
    "保健医療（名目）",
    "交通・通信（名目）",
    "教育（名目）",
    "教養娯楽（名目）",
    "その他の消費支出（名目）",
  ];
  const categories = ["総合", ...CATEGORIES, "その他の消費支出"];
  const valuesFor = (input, reference) => {
    if (!input.book.SheetNames.includes(reference.sheet))
      throw new Error(`official CTI sheet missing: ${reference.sheet}`);
    const rows = tableRows(input.book, reference.sheet);
    const headers = rows[8]?.slice(9, 20).map(normalizeLabel);
    if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders))
      throw new Error(
        `${reference.series} nominal annual headers do not match the expected category mapping`,
      );
    const byYear = new Map();
    const trace = {};
    for (const year of [2017, 2018]) {
      const matches = rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }) => normalizeLabel(row[8]) === `${year}年`);
      if (matches.length !== 1)
        throw new Error(`${reference.series} has ${matches.length} ${year} annual rows`);
      const { row, rowIndex } = matches[0];
      const published = row.slice(9, 20);
      if (
        !isFiniteNumber(published[0]) ||
        published.slice(1, 9).some((value) => !isFiniteNumber(value)) ||
        published[10] !== "-"
      )
        throw new Error(
          `${reference.series} ${year} nominal row has missing/invalid total, category, or Other marker`,
        );
      const values = Object.fromEntries(
        categories.slice(0, 10).map((category, index) => [category, published[index]]),
      );
      // The official annual table marks Other as "-"; retain the published total and derive its residual.
      values["その他の消費支出"] =
        values["総合"] - CATEGORIES.reduce((sum, category) => sum + values[category], 0);
      if (!(values["その他の消費支出"] > 0))
        throw new Error(`${reference.series} ${year} derived Other residual must be positive`);
      byYear.set(year, values);
      trace[year] = {
        excelRow: rowIndex + 1,
        timeLabel: row[8],
        timeCode: row[7],
        cells: Object.fromEntries(
          categories.map((category, index) => [
            category,
            category === "その他の消費支出"
              ? {
                  cell: "T",
                  published: "-",
                  derivedFrom: [
                    "J",
                    ...Array.from({ length: 9 }, (_, offset) => String.fromCharCode(75 + offset)),
                  ],
                }
              : { cell: String.fromCharCode(74 + index), value: values[category] },
          ]),
        ),
        sourceRow: Object.fromEntries(
          categories.slice(0, 10).map((category, index) => [category, published[index]]),
        ),
      };
    }
    return { byYear, trace };
  };
  const aResult = valuesFor(a, REFERENCES.ctiAdjusted);
  const bResult = valuesFor(b, REFERENCES.ctiBasic);
  return {
    aByYear: aResult.byYear,
    bByYear: bResult.byYear,
    trace: {
      adjustedA: aResult.trace,
      basicB: bResult.trace,
      headerExcelRow: 9,
      nominalColumns: "J:T",
      categoryMapping: expectedHeaders,
      otherDefinition: "official annual table publishes a dash in T; residual = J - sum(K:S)",
    },
    hashes: { A: a.hash, B: b.hash },
  };
}

function writeCsv(rows) {
  return csv(rows);
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  await mkdir(RESULT, { recursive: true });
  const priorManifest = await readFile(MANIFEST_FILE)
    .then((data) => JSON.parse(data.toString("utf8")))
    .catch((error) => (error.code === "ENOENT" ? null : Promise.reject(error)));
  const [panel2017, cti, refManifest, allWeightsBytes] = await Promise.all([
    verify2017Panel(),
    ctiInputs(),
    bytes("data/source/cti-size-composition/weights-source-manifest.json").then((raw) =>
      JSON.parse(raw.toString("utf8")),
    ),
    bytes("data/source/cti-size-composition/weights.csv"),
  ]);
  if (refManifest.weightsCsv?.sha256 !== sha256(allWeightsBytes))
    throw new Error("2025 reference weights.csv hash mismatch");
  const [profile2018, special] = await Promise.all([
    extract2018Profile(priorManifest?.sources ?? REFERENCES),
    extractSpecialShares(priorManifest?.sources ?? REFERENCES),
  ]);
  const rawSources = {
    twoOrMore2018: {
      ...REFERENCES.twoOrMore2018,
      sha256: profile2018.rawHashes.twoOrMore,
      sheetNames: profile2018.sheetNames.twoOrMore,
    },
    single2018: {
      ...REFERENCES.single2018,
      sha256: profile2018.rawHashes.single,
      sheetNames: profile2018.sheetNames.single,
    },
    lfsSpecial2017: { ...REFERENCES.lfsSpecial2017, sha256: special.rawHashes.lfsSpecial2017 },
    lfsSpecial2018: { ...REFERENCES.lfsSpecial2018, sha256: special.rawHashes.lfsSpecial2018 },
    ctiBasic: { ...REFERENCES.ctiBasic, sha256: cti.hashes.B, annualRows: cti.trace.basicB },
    ctiAdjusted: {
      ...REFERENCES.ctiAdjusted,
      sha256: cti.hashes.A,
      annualRows: cti.trace.adjustedA,
    },
  };
  if (priorManifest) {
    if (priorManifest.schemaVersion !== "cti-size-composition-education-stability-2017-2018-v1")
      throw new Error("unsupported 2017/2018 diagnostic manifest");
    for (const [key, source] of Object.entries(rawSources))
      if (priorManifest.sources?.[key]?.sha256 !== source.sha256)
        throw new Error(`${key} raw source hash differs from diagnostic manifest`);
    if (
      priorManifest.panel2017?.expenditureCsvSha256 !== panel2017.provenance.expenditureCsvSha256 ||
      priorManifest.weights2025?.weightsCsvSha256 !== sha256(allWeightsBytes)
    )
      throw new Error("2017 panel or 2025 reference input hash differs from manifest");
  }
  const weightsRows = parseCsv(allWeightsBytes.toString("utf8"));
  const p2025Counts = Object.fromEntries(
    weightsRows
      .filter((row) => Number(row.year) === 2025)
      .map((row) => [row.size, Number(row.households)]),
  );
  const total2025 = SIZES.reduce((sum, size) => sum + p2025Counts[size], 0);
  const p2025 = Object.fromEntries(SIZES.map((size) => [size, p2025Counts[size] / total2025]));
  const qByYear = {};
  const lambdaByYear = {};
  for (const year of [2017, 2018]) {
    const profile = year === 2017 ? panel2017.profile : profile2018.profile;
    const shares = special.shares[year];
    qByYear[year] = {};
    for (const category of ALL_CATEGORIES) {
      const fixedValue = SIZES.reduce(
        (sum, size) => sum + p2025[size] * profile[category][size],
        0,
      );
      const actualValue = SIZES.reduce(
        (sum, size) => sum + shares[size] * profile[category][size],
        0,
      );
      qByYear[year][category] = fixedValue / actualValue;
    }
    const denominator = Math.log(qByYear[year]["総合"]);
    const unstable = Math.abs(denominator) < 0.01;
    lambdaByYear[year] = Object.fromEntries([
      [
        "総合",
        {
          value: 1,
          logQCategory: denominator,
          logQTotal: denominator,
          unstableSingleObservationRatio: unstable,
          reason: null,
        },
      ],
      ...SURVEY_CATEGORIES.map((category) => [
        category,
        {
          value: denominator === 0 ? null : Math.log(qByYear[year][category]) / denominator,
          logQCategory: Math.log(qByYear[year][category]),
          logQTotal: denominator,
          unstableSingleObservationRatio: unstable,
          reason: denominator === 0 ? "zero_log_Q_total_denominator" : null,
        },
      ]),
    ]);
  }
  const r18Total = qByYear[2018]["総合"] / qByYear[2017]["総合"];
  const r18Log = Math.log(r18Total);
  const candidate = JSON.parse(
    (await readFile(path.join(RESULT, "candidate.json"))).toString("utf8"),
  );
  if (
    candidate.status !== "legacy_unharmonized_weights" ||
    JSON.stringify(candidate.validation?.fitPeriod) !==
      JSON.stringify([2005, 2006, 2007, 2008, 2009, 2010, 2012, 2013, 2014, 2015, 2016])
  )
    throw new Error("historical lambda candidate must remain the 2005-2016 fit excluding 2011");
  const historicalLambdas = Object.fromEntries(
    SURVEY_CATEGORIES.map((category) => [
      category,
      candidate.diagnostics.lambdas[category].estimate,
    ]),
  );
  const a17 = cti.aByYear.get(2017);
  const b17 = cti.bByYear.get(2017);
  const a18 = cti.aByYear.get(2018);
  const b18 = cti.bByYear.get(2018);
  const officialRatio17 = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [category, a17[category] / b17[category]]),
  );
  const officialRatio18 = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [category, a18[category] / b18[category]]),
  );
  const totalTarget = b18["総合"] * officialRatio17["総合"] * r18Total;
  const rawPrediction = Object.fromEntries(
    SURVEY_CATEGORIES.map((category) => [
      category,
      b18[category] * officialRatio17[category] * r18Total ** historicalLambdas[category],
    ]),
  );
  const rawSum = Object.values(rawPrediction).reduce((sum, value) => sum + value, 0);
  const commonScale = totalTarget / rawSum;
  const predicted = Object.fromEntries(
    SURVEY_CATEGORIES.map((category) => [category, rawPrediction[category] * commonScale]),
  );
  const predictedTotalRatio = totalTarget / b18["総合"];
  const holdoutRows = Object.fromEntries(
    ALL_CATEGORIES.map((category) => {
      const predictedIndex = category === "総合" ? totalTarget : predicted[category];
      const predictedRatio = predictedIndex / b18[category];
      const official = officialRatio18[category];
      return [
        category,
        {
          historicalLambda: category === "総合" ? 1 : historicalLambdas[category],
          ctiValueStatus:
            category === "その他の消費支出"
              ? "derived_residual_not_published_as_a_category_value"
              : "published_nominal_category_value",
          predictedIndex2018: predictedIndex,
          predictedAoverB2018: predictedRatio,
          comparisonAoverB2018: official,
          indexErrorVsOfficialA: predictedIndex - a18[category],
          ratioError: predictedRatio - official,
          ratioErrorPercent: predictedRatio / official - 1,
        },
      ];
    }),
  );
  const twoYearLambdas = Object.fromEntries(
    SURVEY_CATEGORIES.map((category) => {
      const numerator = Math.log(officialRatio18[category] / officialRatio17[category]);
      const value = r18Log === 0 ? null : numerator / r18Log;
      return [
        category,
        {
          value,
          logOfficialAdjustmentChange: numerator,
          logQTotalChange: r18Log,
          unstableSmallDenominator: Math.abs(r18Log) < 0.01,
          reason: r18Log === 0 ? "zero_log_Q_total_change" : null,
        },
      ];
    }),
  );
  const geoAnchor = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [
      category,
      Math.sqrt(officialRatio17[category] * officialRatio18[category]),
    ]),
  );
  const geoCompositionAnchor = Math.sqrt(qByYear[2017]["総合"] * qByYear[2018]["総合"]);
  const geoCenteredR18 = qByYear[2018]["総合"] / geoCompositionAnchor;
  const geoTotalTarget = b18["総合"] * geoAnchor["総合"] * geoCenteredR18;
  const geoRaw = Object.fromEntries(
    SURVEY_CATEGORIES.map((category) => [
      category,
      b18[category] * geoAnchor[category] * geoCenteredR18 ** historicalLambdas[category],
    ]),
  );
  const geoScale = geoTotalTarget / Object.values(geoRaw).reduce((sum, value) => sum + value, 0);
  const geoScenario = Object.fromEntries(
    ALL_CATEGORIES.map((category) => {
      const index = category === "総合" ? geoTotalTarget : geoRaw[category] * geoScale;
      return [
        category,
        {
          geometricMeanPublishedOrDerivedAnchor: geoAnchor[category],
          referenceIndex2018: index,
          referenceAoverB2018: index / b18[category],
          comparisonAoverB2018: officialRatio18[category],
          inSampleDifferenceVsComparison: index / b18[category] - officialRatio18[category],
        },
      ];
    }),
  );
  const profileRows = [["year", "size", "category", "value_yen_per_household_month"]];
  for (const year of [2017, 2018]) {
    const profile = year === 2017 ? panel2017.profile : profile2018.profile;
    for (const category of ALL_CATEGORIES)
      for (const size of SIZES) profileRows.push([year, size, category, profile[category][size]]);
  }
  const weightRows = [["year", "size", "share", "sourceUrl", "vintage"]];
  for (const year of [2017, 2018])
    for (const size of SIZES)
      weightRows.push([
        year,
        size,
        special.shares[year][size],
        REFERENCES[`lfsSpecial${year}`].url,
        `Published as ${year} January adjustment special tabulation; sample design uses latest-12-month LFS household-size distribution, not confirmed as calendar-year average`,
      ]);
  const profileCsv = writeCsv(profileRows);
  const weightsCsv = writeCsv(weightRows);
  const normalizedDir = path.relative(ROOT, OUTPUT);
  const manifest = {
    schemaVersion: "cti-size-composition-education-stability-2017-2018-v1",
    generatedPurpose: "analysis-only education and category stability diagnostic",
    sources: rawSources,
    panel2017: {
      sourceManifestSha256: panel2017.provenance.sourceManifestSha256,
      expenditureCsvSha256: panel2017.provenance.expenditureCsvSha256,
      sourceRows: panel2017.provenance.sources,
    },
    weights2025: {
      sourceManifestPath: "data/source/cti-size-composition/weights-source-manifest.json",
      weightsCsvSha256: sha256(allWeightsBytes),
      referenceStatus: refManifest.reference.status,
      notSameDefinitionAsSetaiSpecialTabulation: true,
    },
    extraction: {
      twoOrMore2018: profile2018.trace,
      setaiSpecialShares: special.trace,
      year2018HouseholdSurveyRedesignCaveat: REDESIGN_CAVEAT,
      lfsSpecialWeightsCaveat: LFS_CAVEAT,
    },
    outputs: {
      profileCsv: `${normalizedDir}/profiles.csv`,
      profileCsvSha256: sha256(Buffer.from(profileCsv)),
      weightsCsv: `${normalizedDir}/setai-special-shares.csv`,
      weightsCsvSha256: sha256(Buffer.from(weightsCsv)),
    },
  };
  if (priorManifest) {
    if (
      priorManifest.outputs?.profileCsvSha256 !== manifest.outputs.profileCsvSha256 ||
      priorManifest.outputs?.weightsCsvSha256 !== manifest.outputs.weightsCsvSha256
    )
      throw new Error("normalized 2017/2018 candidate panel hash differs from diagnostic manifest");
  }
  await writeFile(path.join(OUTPUT, "profiles.csv"), profileCsv);
  await writeFile(path.join(OUTPUT, "setai-special-shares.csv"), weightsCsv);
  await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = {
    schemaVersion: "plan39-education-stability-2017-2018-v1",
    status: "analysis_only_holdout_diagnostic",
    interpretation: {
      yearSpecificLambda:
        "lambda[t,c] = log(Q[t,c]) / log(Q[t,total]); one cross-sectional ratio per year, unstable diagnostic rather than a regression estimate",
      q: "Q[t,c] = sum_s p[2025,s] x[t,s,c] / sum_s p[setai-special,t,s] x[t,s,c]",
      r: "R[2018,total] = Q[2018,total] / Q[2017,total]",
      householdSurveyBreak2018: REDESIGN_CAVEAT,
      specialWeightDefinition: LFS_CAVEAT,
    },
    inputs: {
      manifest: path.relative(ROOT, MANIFEST_FILE),
      profileCsvSha256: manifest.outputs.profileCsvSha256,
      weightsCsvSha256: manifest.outputs.weightsCsvSha256,
      ctiHashes: cti.hashes,
      officialCtiRawTrace: cti.trace,
      officialCtiRawValues: {
        2017: { adjustedA: a17, basicB: b17 },
        2018: { adjustedA: a18, basicB: b18 },
      },
      publishedOrDerivedCtiAoverBRatios: { 2017: officialRatio17, 2018: officialRatio18 },
      otherRatioStatus:
        "Other is derived residual because T-column is published as '-'; do not describe this as an official published Other ratio",
      historicalLambdaFitYears: candidate.validation.fitPeriod,
    },
    fixed2025ReferenceShares: p2025,
    qByYear: qByYear,
    yearSpecificLambdaDiagnostics: lambdaByYear,
    historicalLambda2018Holdout: {
      fitPeriod: candidate.validation.fitPeriod,
      excludedInterpolatedWeightYear: 2011,
      uses2017OfficialABAnchorOnly: true,
      holdoutYear: 2018,
      holdoutOfficialABUsedOnlyForPostPredictionComparison: true,
      R2018Total: r18Total,
      logR2018Total: r18Log,
      unstableSmallLogR: Math.abs(r18Log) < 0.01,
      commonScaleForAdditivity: commonScale,
      predictedTotalIndex2018: totalTarget,
      predictedTotalAoverB2018: predictedTotalRatio,
      categories: holdoutRows,
    },
    twoYearAnchorReferenceInSample: {
      fitUses2018OfficialAB: true,
      isValidation: false,
      formulaTwoYearLambda:
        "lambda_2y[c] = log((A18[c]/B18[c])/(A17[c]/B17[c])) / log(Q18[total]/Q17[total])",
      formulaGeometricScenario:
        "anchorGM[c]=sqrt((A17/B17)[c]*(A18/B18)[c]); compositionFactorAt2018=sqrt(Q18[total]/Q17[total]); then common-scale to the geometric-anchor total",
      logRTotalDenominator: r18Log,
      unstableSmallDenominator: Math.abs(r18Log) < 0.01,
      lambdaTwoYearAnchored: twoYearLambdas,
      geometricMeanAnchorScenario: geoScenario,
    },
    limitations: [
      REDESIGN_CAVEAT,
      LFS_CAVEAT,
      "The 2017 and 2018 year-specific lambda diagnostics each use one cross-section and can be unstable when log(Q_total) is near zero; raw ratios are retained with an instability flag.",
      "2018 official A/B is held out from the historical-lambda prediction, but the separately labeled two-year anchor scenarios use it in-sample and are not validation.",
      "No production estimator, loader, publication gate, or quarterly measurement consumes this analysis.",
    ],
  };
  const resultPath = path.join(RESULT, "education-stability-2017-2018.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  const rows = [
    [
      "category",
      "Q2017",
      "lambda2017_one_observation",
      "Q2018",
      "lambda2018_one_observation",
      "historical_lambda_fit",
      "published_or_derived_AoverB_2017_anchor",
      "predicted_AoverB_2018",
      "published_or_derived_AoverB_2018_holdout",
      "prediction_error_percent",
      "two_year_anchored_lambda_in_sample",
      "geometric_anchor_reference_AoverB_2018",
    ],
  ];
  for (const category of SURVEY_CATEGORIES)
    rows.push([
      category,
      qByYear[2017][category],
      lambdaByYear[2017][category].value,
      qByYear[2018][category],
      lambdaByYear[2018][category].value,
      historicalLambdas[category],
      officialRatio17[category],
      holdoutRows[category].predictedAoverB2018,
      holdoutRows[category].comparisonAoverB2018,
      holdoutRows[category].ratioErrorPercent,
      twoYearLambdas[category].value,
      geoScenario[category].referenceAoverB2018,
    ]);
  rows.push([
    "総合",
    qByYear[2017]["総合"],
    1,
    qByYear[2018]["総合"],
    1,
    1,
    officialRatio17["総合"],
    holdoutRows["総合"].predictedAoverB2018,
    holdoutRows["総合"].comparisonAoverB2018,
    holdoutRows["総合"].ratioErrorPercent,
    "",
    geoScenario["総合"].referenceAoverB2018,
  ]);
  await writeFile(path.join(RESULT, "education-stability-2017-2018.csv"), writeCsv(rows));
  process.stdout.write(
    `${JSON.stringify({ status: result.status, resultFile: path.relative(ROOT, resultPath), education: holdoutRows["教育"], educationLambda2017: lambdaByYear[2017]["教育"], educationLambda2018: lambdaByYear[2018]["教育"], twoYearEducationLambda: twoYearLambdas["教育"] })}\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
