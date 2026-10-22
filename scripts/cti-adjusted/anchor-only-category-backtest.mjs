#!/usr/bin/env node

/** Research-only 2017-anchor category-share backtest from retained 2025-base CTI workbooks. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INPUT = path.join(ROOT, "data/source/cti-size-composition/raw/cti");
const OUTPUT = path.join(ROOT, "results/plan39/anchor-only-category-backtest");
const SHEET = "総・年";
const YEARS = Array.from({ length: 9 }, (_, index) => 2017 + index);
const VALIDATION_YEARS = YEARS.filter((year) => year >= 2018);
const SOURCES = {
  B: {
    file: path.join(INPUT, "000040499069-basic.xlsx"),
    url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040499069&fileKind=0",
    label: "2025-base CTI basic",
  },
  A: {
    file: path.join(INPUT, "000040499087-adjusted.xlsx"),
    url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040499087&fileKind=0",
    label: "2025-base distribution-adjusted CTI",
  },
};
const CATEGORIES = [
  { id: "food", label: "Food", header: "食料（名目）" },
  { id: "housing", label: "Housing", header: "住居（名目）" },
  { id: "utilities", label: "Utilities", header: "光熱・水道（名目）" },
  {
    id: "furniture_household_goods",
    label: "Furniture and household goods",
    header: "家具・家事用品（名目）",
  },
  { id: "clothing_footwear", label: "Clothing and footwear", header: "被服及び履物（名目）" },
  { id: "health", label: "Health", header: "保健医療（名目）" },
  {
    id: "transport_communications",
    label: "Transport and communications",
    header: "交通・通信（名目）",
  },
  { id: "education", label: "Education", header: "教育（名目）" },
  { id: "culture_recreation", label: "Culture and recreation", header: "教養娯楽（名目）" },
  { id: "other", label: "Other (official; residual when unpublished)" },
];
const text = (value) =>
  typeof value === "string" ? value.trim().replaceAll("　", " ").replace(/\s+/g, " ") : "";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const columnName = (oneBased) => {
  let value = oneBased;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};
const csv = (rows) =>
  `${rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;

async function loadSource(kind, source) {
  const bytes = await readFile(source.file);
  const workbook = XLSX.read(bytes, { type: "buffer", raw: true });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) throw new Error(`${kind}: missing required sheet ${SHEET}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerMatches = rows.flatMap((row, index) =>
    row.some((cell) => text(cell) === "年平均") &&
    row.some((cell) => text(cell) === "消費支出（名目）")
      ? [index]
      : [],
  );
  if (headerMatches.length !== 1)
    throw new Error(
      `${kind}: expected exactly one annual nominal header row, found ${headerMatches.length}`,
    );
  const headerIndex = headerMatches[0];
  const headers = rows[headerIndex].map(text);
  const findColumn = (header) => {
    const hits = headers.flatMap((value, index) => (value === header ? [index] : []));
    if (hits.length !== 1)
      throw new Error(`${kind}: expected exactly one column '${header}', found ${hits.length}`);
    return hits[0];
  };
  const yearColumn = findColumn("年平均");
  const totalColumn = findColumn("消費支出（名目）");
  const categoryColumns = Object.fromEntries(
    CATEGORIES.filter((category) => category.header).map((category) => [
      category.id,
      findColumn(category.header),
    ]),
  );
  const values = {};
  for (const year of YEARS) {
    const hits = rows.flatMap((row, index) =>
      text(row[yearColumn]) === `${year}年` ? [{ row, index }] : [],
    );
    if (hits.length !== 1)
      throw new Error(`${kind}: expected exactly one ${year} annual row, found ${hits.length}`);
    const { row, index } = hits[0];
    const total = row[totalColumn];
    if (typeof total !== "number" || !Number.isFinite(total) || total <= 0)
      throw new Error(`${kind}: invalid total for ${year}`);
    const published = {};
    const cells = { total: `${columnName(totalColumn + 1)}${index + 1}` };
    for (const category of CATEGORIES.filter((item) => item.header)) {
      const column = categoryColumns[category.id];
      const amount = row[column];
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
        throw new Error(`${kind}: invalid ${category.id} value for ${year}`);
      published[category.id] = amount;
      cells[category.id] = `${columnName(column + 1)}${index + 1}`;
    }
    const rawOtherColumn = findColumn("その他の消費支出（名目）");
    const rawOther = row[rawOtherColumn];
    if (!(rawOther === "-" || (typeof rawOther === "number" && Number.isFinite(rawOther)))) {
      throw new Error(`${kind}: unexpected workbook Other value for ${year}: ${String(rawOther)}`);
    }
    const residual = total - Object.values(published).reduce((sum, amount) => sum + amount, 0);
    if (!Number.isFinite(residual) || residual < 0)
      throw new Error(`${kind}: Other residual is invalid for ${year}: ${residual}`);
    cells.otherRaw = `${columnName(rawOtherColumn + 1)}${index + 1}`;
    values[year] = {
      total,
      categories: { ...published, other: typeof rawOther === "number" ? rawOther : residual },
      evidence: {
        headerRow: headerIndex + 1,
        yearRow: index + 1,
        cells,
        rawOtherValue: rawOther,
        sourceStatus:
          typeof rawOther === "number"
            ? "official_workbook_value"
            : "residual_from_total_minus_nine_published",
        residualValue: residual,
        directMinusResidual: typeof rawOther === "number" ? rawOther - residual : null,
        residualInputs: [cells.total, ...Object.keys(published).map((id) => cells[id])],
      },
    };
  }
  return {
    kind,
    label: source.label,
    file: path.relative(ROOT, source.file),
    url: source.url,
    sha256: sha256(bytes),
    sheet: SHEET,
    values,
  };
}

function metric(values) {
  const n = values.length;
  const bias = values.reduce((sum, value) => sum + value, 0) / n;
  return {
    n,
    mae_pp: values.reduce((sum, value) => sum + Math.abs(value), 0) / n,
    rmse_pp: Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / n),
    bias_pp: bias,
  };
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const sources = {
    B: await loadSource("B", SOURCES.B),
    A: await loadSource("A", SOURCES.A),
  };
  const anchor = {};
  for (const category of CATEGORIES) {
    const pB2017 = sources.B.values[2017].categories[category.id] / sources.B.values[2017].total;
    const pA2017 = sources.A.values[2017].categories[category.id] / sources.A.values[2017].total;
    if (!(pB2017 > 0) || !Number.isFinite(pA2017))
      throw new Error(`2017 anchor unavailable for ${category.id}`);
    anchor[category.id] = pA2017 / pB2017;
  }
  const annual = {};
  const rows = [];
  for (const year of YEARS) {
    const pB = Object.fromEntries(
      CATEGORIES.map(({ id }) => [
        id,
        sources.B.values[year].categories[id] / sources.B.values[year].total,
      ]),
    );
    const pA = Object.fromEntries(
      CATEGORIES.map(({ id }) => [
        id,
        sources.A.values[year].categories[id] / sources.A.values[year].total,
      ]),
    );
    const raw = Object.fromEntries(CATEGORIES.map(({ id }) => [id, pB[id] * anchor[id]]));
    const rawSum = Object.values(raw).reduce((sum, value) => sum + value, 0);
    if (!(rawSum > 0) || !Number.isFinite(rawSum))
      throw new Error(`raw predicted category-share sum invalid for ${year}`);
    const normalized = Object.fromEntries(CATEGORIES.map(({ id }) => [id, raw[id] / rawSum]));
    const categoryRows = CATEGORIES.map((category) => {
      const { id } = category;
      const rawError = raw[id] - pA[id];
      const normalizedError = normalized[id] - pA[id];
      const row = {
        year,
        validation: year >= 2018,
        category: id,
        category_label: category.label,
        anchor_q_2017: anchor[id],
        pB_share: pB[id],
        pA_actual_share: pA[id],
        pHatRaw_share: raw[id],
        pHatRaw_pp: raw[id] * 100,
        raw_error_pp: rawError * 100,
        pHatNorm_share: normalized[id],
        pHatNorm_pp: normalized[id] * 100,
        normalized_error_pp: normalizedError * 100,
        raw_predicted_share_sum_year: rawSum,
        raw_predicted_share_sum_year_pp: rawSum * 100,
        other_source_status_B: sources.B.values[year].evidence.sourceStatus,
        other_source_status_A: sources.A.values[year].evidence.sourceStatus,
        source_cells_B: JSON.stringify(sources.B.values[year].evidence.cells),
        source_cells_A: JSON.stringify(sources.A.values[year].evidence.cells),
      };
      if (year >= 2018) rows.push(row);
      return row;
    });
    annual[year] = {
      validation: year >= 2018,
      rawPredictedCategoryShareSum: rawSum,
      rawPredictedCategoryShareSumPercentagePoints: rawSum * 100,
      normalizedPredictedCategoryShareSum: Object.values(normalized).reduce(
        (sum, value) => sum + value,
        0,
      ),
      otherSourceStatus: {
        B: sources.B.values[year].evidence.sourceStatus,
        A: sources.A.values[year].evidence.sourceStatus,
      },
      categories: Object.fromEntries(
        categoryRows.map((row) => [
          row.category,
          {
            pB: row.pB_share,
            pA_actual: row.pA_actual_share,
            pHatRaw: row.pHatRaw_share,
            rawErrorPercentagePoints: row.raw_error_pp,
            pHatNorm: row.pHatNorm_share,
            normalizedErrorPercentagePoints: row.normalized_error_pp,
          },
        ]),
      ),
    };
  }

  const categoryMetrics = Object.fromEntries(
    CATEGORIES.map(({ id, label }) => {
      const selected = rows.filter((row) => row.category === id);
      return [
        id,
        {
          label,
          raw: metric(selected.map((row) => row.raw_error_pp)),
          normalized: metric(selected.map((row) => row.normalized_error_pp)),
        },
      ];
    }),
  );
  const macro = (variant) => {
    const perCategory = CATEGORIES.map(({ id }) => categoryMetrics[id][variant]);
    return Object.fromEntries(
      ["mae_pp", "rmse_pp", "bias_pp"].map((key) => [
        key,
        perCategory.reduce((sum, item) => sum + item[key], 0) / perCategory.length,
      ]),
    );
  };
  const pooled = (variant) => {
    const key = variant === "raw" ? "raw_error_pp" : "normalized_error_pp";
    return metric(rows.map((row) => row[key]));
  };
  const otherComparability = Object.fromEntries(
    Object.entries(sources).map(([kind, source]) => {
      const numericYears = YEARS.filter(
        (year) => typeof source.values[year].evidence.rawOtherValue === "number",
      );
      const differences = numericYears.map((year) => ({
        year,
        signed: source.values[year].evidence.directMinusResidual,
        absolute: Math.abs(source.values[year].evidence.directMinusResidual),
      }));
      return [
        kind,
        {
          sourceStatusByYear: Object.fromEntries(
            YEARS.map((year) => [year, source.values[year].evidence.sourceStatus]),
          ),
          directVersusResidualNumericYears: numericYears,
          maxAbsoluteDirectMinusResidual: differences.length
            ? Math.max(...differences.map(({ absolute }) => absolute))
            : null,
          maxAbsoluteDifferenceYear: differences.length
            ? differences.reduce((max, item) => (item.absolute > max.absolute ? item : max)).year
            : null,
        },
      ];
    }),
  );
  const summary = {
    schemaVersion: "plan39-anchor-only-category-backtest-v1",
    generatedAt: new Date().toISOString(),
    purpose:
      "Research-only comparison of 2017 category-share anchors against official adjusted CTI category shares for 2018-2025. No connection to production estimators, loaders, gates, or quarterly data.",
    formulas: {
      pB: "B[t,c] / B[t,total], using exact raw numeric cells from the retained basic CTI workbook",
      pA: "A[t,c] / A[t,total], using exact raw numeric cells from the retained distribution-adjusted CTI workbook",
      q: "pA[2017,c] / pB[2017,c], estimated once per category from the 2017 anchor year",
      pHatRaw: "pB[t,c] * q[c]; this is the requested unnormalized formula",
      rawError: "(pHatRaw[t,c] - pA[t,c]) * 100 percentage points",
      pHatNorm:
        "pHatRaw[t,c] / sum_j(pHatRaw[t,j]); separately labeled coherent normalized variant",
      normalizedError: "(pHatNorm[t,c] - pA[t,c]) * 100 percentage points",
      other:
        "Use the official Other column when it contains a numeric value; if the official cell is '-', derive total - sum(the nine published lower-category values). The source status is recorded per year and series.",
      metrics:
        "For each category over n=8 validation years, MAE=mean(abs(error)), RMSE=sqrt(mean(error^2)), bias=mean(error), all in percentage points. Macro is the unweighted arithmetic mean of the ten category-level metrics; pooled metrics aggregate all 80 category-year errors.",
    },
    validation: {
      years: "2018-2025",
      excludedCalibrationYear: 2017,
      n: VALIDATION_YEARS.length,
      expectedN: 8,
      categoryCount: CATEGORIES.length,
      categories: CATEGORIES.map(({ id, label, header }) => ({
        id,
        label,
        sourceHeader: header ?? "その他の消費支出（名目）",
        derivation: header
          ? "published nominal column"
          : "official numeric value; otherwise total minus nine published nominal categories",
      })),
      metricsByCategory: categoryMetrics,
      overallMacro: { raw: macro("raw"), normalized: macro("normalized") },
      overallPooled: { raw: pooled("raw"), normalized: pooled("normalized") },
    },
    anchorQ2017ByCategory: anchor,
    annual,
    otherComparability,
    sources: {
      workbooks: Object.fromEntries(
        Object.entries(sources).map(([key, source]) => [
          key,
          {
            label: source.label,
            file: source.file,
            url: source.url,
            sha256: source.sha256,
            sheet: source.sheet,
          },
        ]),
      ),
      extractionEvidence: Object.fromEntries(
        YEARS.map((year) => [
          year,
          Object.fromEntries(
            Object.entries(sources).map(([key, source]) => [key, source.values[year].evidence]),
          ),
        ]),
      ),
    },
    limitations: [
      "Other uses the workbook's numeric official value in 2020-2025 and is derived as total minus the nine published lower-category columns in 2017-2019, when the workbook cell is '-'. The source status is recorded per year and series. The direct-versus-residual difference for years with a numeric official value is included in source extraction evidence; this creates a source-method boundary at 2020, so interpret Other-category time-series errors with that comparability limitation.",
      "The workbooks contain 2025-base index values, not yen amounts; within-year category shares are computed by dividing each index category by that workbook's same-year total.",
      "Calibration uses only 2017. The 2017 row is shown for traceability and excluded from all error metrics.",
    ],
  };
  await writeFile(
    path.join(OUTPUT, "annual-category-backtest.csv"),
    csv([
      [
        "year",
        "validation",
        "category",
        "category_label",
        "anchor_q_2017",
        "pB_share",
        "pA_actual_share",
        "pHatRaw_share",
        "pHatRaw_pp",
        "raw_error_pp",
        "pHatNorm_share",
        "pHatNorm_pp",
        "normalized_error_pp",
        "raw_predicted_share_sum_year",
        "raw_predicted_share_sum_year_pp",
        "other_source_status_B",
        "other_source_status_A",
        "source_cells_B_json",
        "source_cells_A_json",
      ],
      ...rows.map((row) => [
        row.year,
        row.validation,
        row.category,
        row.category_label,
        row.anchor_q_2017,
        row.pB_share,
        row.pA_actual_share,
        row.pHatRaw_share,
        row.pHatRaw_pp,
        row.raw_error_pp,
        row.pHatNorm_share,
        row.pHatNorm_pp,
        row.normalized_error_pp,
        row.raw_predicted_share_sum_year,
        row.raw_predicted_share_sum_year_pp,
        row.other_source_status_B,
        row.other_source_status_A,
        row.source_cells_B,
        row.source_cells_A,
      ]),
    ]),
  );
  await writeFile(path.join(OUTPUT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(ROOT, path.join(OUTPUT, "summary.json"))} and annual-category-backtest.csv (${rows.length} validation category-year rows).`,
  );
}

main().catch((error) => {
  console.error(`Fail-closed: ${error.message}`);
  process.exitCode = 1;
});
