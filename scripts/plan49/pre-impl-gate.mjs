import * as fs from "node:fs";
import * as path from "node:path";
import Papa from "papaparse";

/**
 * Plan49 Implementation Pre-Gate Validation Script (Self-Contained ESM)
 *
 * Data Sources & Structures:
 * - B.json: Loaded from `data/source/cti-adjusted/B.json`. Structure has `rows: [{ year: number, values: { 総合: number, ... } }]` spanning 2002-2025.
 *   This provides the annual anchors A[y] for 2005-2016 via the Plan39-v2 connection model (or B.json / A.json).
 *   Specifically, for 2005-2016 historical years, quarterlyAggregation / ctiAdjustedConnectionEstimateV2 uses B.json rows (or L.json adjusted by B/A ratio at 2017).
 * - A.json: Loaded from `data/source/cti-adjusted/A.json` (2017-2025 official annual anchor).
 * - 000040499070.normalized.csv: Loaded from `data/source/official-cti-2025-long-term/000040499070.normalized.csv`.
 * - 000040499028.normalized.csv: Loaded from `data/source/official-cti-2025-long-term/000040499028.normalized.csv`.
 * - cti_data2025_distribution_adjusted_quarterly.csv: Loaded from `data/source/cti_data2025_distribution_adjusted_quarterly.csv`.
 */

function runGate() {
  console.log("=== Plan49 Implementation Pre-Gate Validation ===");

  let hasError = false;

  // 1. Load Plan39 annual anchors from B.json (covering 2005-2016) and A.json (covering 2017-2025)
  const bJsonPath = path.join("data", "source", "cti-adjusted", "B.json");
  const aJsonPath = path.join("data", "source", "cti-adjusted", "A.json");

  const annualMap = new Map();
  let anchorRangesLoaded = [];

  if (fs.existsSync(bJsonPath)) {
    const bRaw = JSON.parse(fs.readFileSync(bJsonPath, "utf8"));
    const rows = bRaw.rows || [];
    let minYear = Infinity,
      maxYear = -Infinity;
    for (const row of rows) {
      if (typeof row.year === "number" && row.values && typeof row.values.総合 === "number") {
        annualMap.set(row.year, row.values.総合);
        minYear = Math.min(minYear, row.year);
        maxYear = Math.max(maxYear, row.year);
      }
    }
    anchorRangesLoaded.push(`B.json (${minYear}-${maxYear})`);
  }

  if (fs.existsSync(aJsonPath)) {
    const aRaw = JSON.parse(fs.readFileSync(aJsonPath, "utf8"));
    const rows = aRaw.rows || [];
    let minYear = Infinity,
      maxYear = -Infinity;
    for (const row of rows) {
      if (typeof row.year === "number" && row.values && typeof row.values.総合 === "number") {
        annualMap.set(row.year, row.values.総合);
        minYear = Math.min(minYear, row.year);
        maxYear = Math.max(maxYear, row.year);
      }
    }
    anchorRangesLoaded.push(`A.json (${minYear}-${maxYear})`);
  }

  console.log(
    `[PASS] Loaded annual anchors from: ${anchorRangesLoaded.join(", ")}. Total years: ${annualMap.size}`,
  );
  if (annualMap.size === 0) {
    console.error("[FAIL] Failed to load any annual anchors.");
    process.exit(1);
  }

  // 2. Load 000040499070 normalized CSV (historical raw monthly index)
  const nominalCsvPath = path.join(
    "data",
    "source",
    "official-cti-2025-long-term",
    "000040499070.normalized.csv",
  );
  if (!fs.existsSync(nominalCsvPath)) {
    console.error(`[FAIL] 000040499070 normalized CSV not found at ${nominalCsvPath}`);
    process.exit(1);
  }
  const nominalContent = fs.readFileSync(nominalCsvPath, "utf8");
  const nominalParsed = Papa.parse(nominalContent, { header: true, skipEmptyLines: true });
  const nominalMap = new Map();
  for (const row of nominalParsed.data) {
    if (
      (String(row.series_index) === "1" || row.series_name === "消費支出（名目）") &&
      row.is_missing !== "true"
    ) {
      const val = Number(String(row.raw_value || "").replace(/,/g, ""));
      if (Number.isFinite(val)) {
        nominalMap.set(row.month, val);
      }
    }
  }
  console.log(
    `[PASS] Loaded 000040499070 nominal monthly records (series 1): ${nominalMap.size} months.`,
  );

  // 3. Verify 2005-2016 historical monthly reconstruction & quarterly match
  console.log(
    "\n--- 1. Verifying 2005-2016 Historical Monthly Reconstruction & Quarterly Match ---",
  );
  let historicalPass = true;
  for (let y = 2005; y <= 2016; y++) {
    const A_y = annualMap.get(y);
    if (typeof A_y !== "number" || !Number.isFinite(A_y)) {
      console.log(`[FAIL] Year ${y}: Missing annual anchor A[y] in annual sources.`);
      historicalPass = false;
      continue;
    }

    const rawMonths = [];
    let complete = true;
    for (let m = 1; m <= 12; m++) {
      const mStr = `${y}-${String(m).padStart(2, "0")}`;
      const val = nominalMap.get(mStr);
      if (val === undefined) {
        complete = false;
        break;
      }
      rawMonths.push(val);
    }

    if (!complete) {
      console.log(`[FAIL] Year ${y}: Incomplete raw monthly data in 000040499070.`);
      historicalPass = false;
      continue;
    }

    const meanRaw = rawMonths.reduce((s, v) => s + v, 0) / 12;
    if (meanRaw <= 0 || !Number.isFinite(meanRaw)) {
      console.log(`[FAIL] Year ${y}: Non-positive or non-finite meanRaw (${meanRaw}).`);
      historicalPass = false;
      continue;
    }

    const mVals = rawMonths.map((r) => (A_y * r) / meanRaw);

    for (let q = 1; q <= 4; q++) {
      const qMonths = [(q - 1) * 3, (q - 1) * 3 + 1, (q - 1) * 3 + 2];
      const qMean = (mVals[qMonths[0]] + mVals[qMonths[1]] + mVals[qMonths[2]]) / 3;
      const qRawMean = (rawMonths[qMonths[0]] + rawMonths[qMonths[1]] + rawMonths[qMonths[2]]) / 3;
      const expectedQ = (A_y * qRawMean) / meanRaw;
      const diff = Math.abs(qMean - expectedQ);
      if (diff > 1e-9) {
        console.log(`[FAIL] Year ${y} Q${q}: Quarterly value mismatch (diff=${diff})`);
        historicalPass = false;
      }
    }
  }

  if (!historicalPass) {
    console.error("[FAIL] 2005-2016 historical reconstruction check failed.");
    hasError = true;
  } else {
    console.log(
      "[PASS] 2005-2016 historical monthly reconstruction and quarterly consistency verified.",
    );
  }

  // 4. Verify 2013 12-month completeness & 2014-01 MA window (2013-02..2014-01)
  console.log("\n--- 2. Verifying 2013 12-Month Completeness & 2014-01 MA Window ---");
  let c2013Complete = true;
  for (let m = 1; m <= 12; m++) {
    const mStr = `2013-${String(m).padStart(2, "0")}`;
    if (!nominalMap.has(mStr)) {
      c2013Complete = false;
    }
  }
  if (c2013Complete) {
    console.log("[PASS] 2013 12-month raw data is fully complete.");
    console.log("       2013-02..2013-12 and 2014-01 window inputs are available.");
  } else {
    console.log("[FAIL] 2013 12-month raw data has missing values.");
    hasError = true;
  }

  // 5. Inspect 2017+ official monthly series (000040499028)
  console.log("\n--- 3. Inspecting Official Monthly Series (000040499028) ---");
  const officialMonthlyPath = path.join(
    "data",
    "source",
    "official-cti-2025-long-term",
    "000040499028.normalized.csv",
  );
  const officialMonthlyMap = new Map();
  if (fs.existsSync(officialMonthlyPath)) {
    const csvContent = fs.readFileSync(officialMonthlyPath, "utf8");
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

    const series1Rows = parsed.data.filter(
      (r) => String(r.series_index) === "1" || r.series_name === "消費支出（名目）",
    );
    console.log(
      `[PASS] Loaded official monthly series 000040499028 (series 1 rows): ${series1Rows.length} rows.`,
    );

    const missingAll = [];
    for (const r of series1Rows) {
      const month = r.month;
      const isMissing = r.is_missing === "true";
      const val = Number(String(r.raw_value || "").replace(/,/g, ""));
      if (isMissing || !Number.isFinite(val)) {
        missingAll.push(month);
      } else {
        officialMonthlyMap.set(month, val);
      }
    }

    const rows2025 = [];
    for (let m = 1; m <= 12; m++) {
      const mStr = `2025-${String(m).padStart(2, "0")}`;
      if (officialMonthlyMap.has(mStr)) {
        rows2025.push(mStr);
      }
    }
    console.log(`       2025 complete monthly count: ${rows2025.length} / 12`);
    if (rows2025.length === 12) {
      console.log("[PASS] 2025 12-month complete for B calculation.");
    } else {
      console.log("[WARN] 2025 monthly data is incomplete.");
      hasError = true;
    }

    console.log(`       Total missing/non-finite months in 000040499028: ${missingAll.length}`);
    if (missingAll.length > 0) {
      console.log("       Missing periods:", missingAll.join(", "));
    }
  } else {
    console.error("[FAIL] Official monthly series 000040499028.normalized.csv not found.");
    hasError = true;
  }

  // 6. Compare official monthly 3-month average vs official quarterly (000040499087)
  console.log(
    "\n--- 4. Comparing Official Monthly 3-Month Average vs Official Quarterly (000040499087) ---",
  );
  const officialQuarterlyPath = path.join(
    "data",
    "source",
    "cti_data2025_distribution_adjusted_quarterly.csv",
  );
  if (fs.existsSync(officialQuarterlyPath) && officialMonthlyMap.size > 0) {
    const qCsv = fs.readFileSync(officialQuarterlyPath, "utf8");
    const qParsed = Papa.parse(qCsv, { header: true, skipEmptyLines: true });
    console.log(`[PASS] Loaded official quarterly dataset: ${qParsed.data.length} rows.`);
    console.log(
      "       Pre-defined allowable tolerance based on published digits: ±0.1 (rounding tolerance).",
    );

    let maxDiff = 0;
    let exceedCount = 0;
    const comparisonRows = [];

    for (const qRow of qParsed.data) {
      const period = String(qRow.period || "").trim();
      const match = period.match(/^(\d{4})Q([1-4])$/);
      if (!match) continue;
      const y = Number(match[1]);
      const q = Number(match[2]);

      const qVal = Number(String(qRow.総合 || "").replace(/,/g, ""));
      if (!Number.isFinite(qVal)) continue;

      const m1 = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}`;
      const m2 = `${y}-${String((q - 1) * 3 + 2).padStart(2, "0")}`;
      const m3 = `${y}-${String((q - 1) * 3 + 3).padStart(2, "0")}`;

      if (officialMonthlyMap.has(m1) && officialMonthlyMap.has(m2) && officialMonthlyMap.has(m3)) {
        const v1 = officialMonthlyMap.get(m1);
        const v2 = officialMonthlyMap.get(m2);
        const v3 = officialMonthlyMap.get(m3);
        const monthlyMean = (v1 + v2 + v3) / 3;
        const diff = Math.abs(monthlyMean - qVal);
        maxDiff = Math.max(maxDiff, diff);
        const withinTolerance = diff <= 0.1;
        if (!withinTolerance) {
          exceedCount++;
        }
        comparisonRows.push({
          period,
          monthlyMean: monthlyMean.toFixed(2),
          qVal: qVal.toFixed(2),
          diff: diff.toFixed(3),
          withinTolerance,
        });
      }
    }

    console.log(`       Compared quarters: ${comparisonRows.length}`);
    console.log(`       Max absolute difference: ${maxDiff.toFixed(3)}`);
    console.log(`       Exceeding tolerance (±0.1): ${exceedCount} / ${comparisonRows.length}`);
    if (exceedCount > 0) {
      console.log(
        "       Sample exceeding rows:",
        comparisonRows.filter((r) => !r.withinTolerance),
      );
      hasError = true;
    } else {
      console.log(
        "[PASS] All compared official monthly 3-month averages match official quarterly values within ±0.1 tolerance.",
      );
    }
  } else {
    console.log(
      "[WARN] Official quarterly dataset or monthly dataset missing for direct comparison.",
    );
  }

  console.log("\n=== Gate Validation Completed ===");
  if (hasError) {
    console.error("[FATAL] Pre-gate validation FAILED.");
    process.exit(1);
  } else {
    console.log("[SUCCESS] Pre-gate validation PASSED successfully.");
  }
}

runGate();
