import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { RefreshError } from "./lib/errors.mjs";

// Every refresh output read by a production loader or one of the quality suites must be
// declared by the registry. Missing entries intentionally stop refresh before publication.
export const REQUIRED_RUNTIME_REFRESH_OUTPUTS = Object.freeze([
  "data/source/cpi_data2025_long.csv",
  "data/source/cpi_data2025_long.metadata.json",
  "data/source/cpi-2025-series-map.csv",
  "data/source/contribution2025.csv",
  "data/source/cpi-2025-official-series.csv",
  "data/source/cti_data2025.csv",
  "data/source/cti_data2025.metadata.json",
  "data/source/cti-2025-series-map.csv",
  "data/source/cti-2025-official-series.csv",
  "data/source/cti_data2025_distribution_adjusted.csv",
  "data/source/cti_data2025_distribution_adjusted.metadata.json",
  "data/source/cti_data2025_distribution_adjusted_quarterly.csv",
  "data/source/cti_data2025_distribution_adjusted_quarterly.metadata.json",
  "data/source/official-cti-2025-long-term/000040499070.raw",
  "data/source/official-cti-2025-long-term/000040499070.normalized.csv",
  "data/source/official-cti-2025-long-term/000040499070.metadata.json",
  "data/source/official-cti-2025-long-term/000040499082.raw",
  "data/source/official-cti-2025-long-term/000040499082.normalized.csv",
  "data/source/official-cti-2025-long-term/000040499082.metadata.json",
  "data/source/official-cti-2025-long-term/000040499028.raw",
  "data/source/official-cti-2025-long-term/000040499028.normalized.csv",
  "data/source/official-cti-2025-long-term/000040499028.metadata.json",
  "data/source/official-cti-2025-long-term/manifest.json",
  "data/source/official-cti-2025-long-term/representative-snapshot.csv",
  "data/source/official-cti-2025-long-term/series-map.csv",
  "data/source/cti-adjusted/A.json",
  "data/source/cti-adjusted/B.json",
  "data/source/cti-adjusted/L.json",
  "data/source/cti-adjusted/audit.json",
  "data/source/cti-adjusted/manifest.json",
  "data/source/official-cti-2025/cti-basic-000040499069.xlsx",
  "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
  "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv",
  "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.metadata.json",
  "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.csv",
  "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.metadata.json",
  "data/source/contractual_earnings.csv",
  "data/source/scheduled_earnings.csv",
  "data/source/total_earning.csv",
  "data/source/total_worked_hours.csv",
  "data/source/employment_indices.csv",
  "data/source/employment_indices.metadata.json",
  "data/source/part_time_worker_ratio.csv",
  "data/source/part_time_worker_ratio.metadata.json",
  "data/source/population_statistics.csv",
  "data/source/population_statistics.metadata.json",
]);

export const RUNTIME_QUALITY_TESTS = Object.freeze([
  "tests/data-quality/cpi-data-integrity.test.ts",
  "tests/data-quality/cti-data-integrity.test.ts",
  "tests/data-quality/cti-source-integrity.test.ts",
  "tests/data-quality/cti-source-artifacts.test.ts",
  "tests/data-quality/cti-basic-series-2025.test.ts",
  "tests/data-quality/population-data-integrity.test.ts",
  "tests/data-quality/earning-data-integrity.test.ts",
]);

const RUNTIME_FAILURE_SAMPLE_LIMIT = 12;
const RUNTIME_FAILURE_LINE_LIMIT = 240;
const RUNTIME_STARTUP_OUTPUT_LIMIT = 32 * 1024;
const RUNTIME_FAILURE_REPORT_LIMIT = 10 * 1024 * 1024;
export const RUNTIME_FAILURE_REPORT_STATUSES = Object.freeze([
  "report-missing",
  "report-oversize",
  "report-invalid-json",
  "report-no-allowlisted-failures",
  "report-failures-found",
]);

/** Extract only allowlisted file names and sanitized assertion titles from Vitest JSON. */
export function extractRuntimeFailureDiagnostics({
  exitCode,
  report,
  reportStatus,
  reportBytes,
  startupError,
  runtimeRoot,
  testFiles = RUNTIME_QUALITY_TESTS,
} = {}) {
  if (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255) return undefined;
  if (!Array.isArray(testFiles) || testFiles.some((file) => !RUNTIME_QUALITY_TESTS.includes(file)))
    return undefined;
  if (reportStatus === "report-missing")
    return withStartupError(
      { exitCode, reportStatus, reportBytes: 0, failedTestSamples: [] },
      startupError,
    );
  if (reportStatus === "report-oversize") {
    const bytes =
      Number.isSafeInteger(reportBytes) && reportBytes >= 0
        ? Math.min(reportBytes, RUNTIME_FAILURE_REPORT_LIMIT)
        : RUNTIME_FAILURE_REPORT_LIMIT;
    return withStartupError(
      { exitCode, reportStatus, reportBytes: bytes, failedTestSamples: [] },
      startupError,
    );
  }
  if (!Buffer.isBuffer(report) && !(report instanceof Uint8Array)) return undefined;
  const byteCount = Math.min(report.byteLength, RUNTIME_FAILURE_REPORT_LIMIT);
  if (report.byteLength > RUNTIME_FAILURE_REPORT_LIMIT) {
    return withStartupError(
      {
        exitCode,
        reportStatus: "report-oversize",
        reportBytes: RUNTIME_FAILURE_REPORT_LIMIT,
        failedTestSamples: [],
      },
      startupError,
    );
  }
  if (typeof runtimeRoot !== "string") return undefined;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(report).toString("utf8"));
  } catch {
    return withStartupError(
      {
        exitCode,
        reportStatus: "report-invalid-json",
        reportBytes: byteCount,
        failedTestSamples: [],
      },
      startupError,
    );
  }
  if (!parsed || !Array.isArray(parsed.testResults)) {
    return withStartupError(
      {
        exitCode,
        reportStatus: "report-invalid-json",
        reportBytes: byteCount,
        failedTestSamples: [],
      },
      startupError,
    );
  }
  const allowed = new Set(RUNTIME_QUALITY_TESTS);
  const safeResults = [];
  let allResultsAllowlisted = true;
  for (const result of parsed.testResults) {
    if (!result || typeof result.name !== "string") {
      return withStartupError(
        {
          exitCode,
          reportStatus: "report-invalid-json",
          reportBytes: byteCount,
          failedTestSamples: [],
        },
        startupError,
      );
    }
    const file = resolveRuntimeTestFile(runtimeRoot, result.name);
    if (!file || !allowed.has(file)) {
      allResultsAllowlisted = false;
      continue;
    }
    safeResults.push({ result, file });
  }
  const samples = [];
  let failedAssertionCount = 0;
  for (const { result, file } of safeResults) {
    if (result.status !== "failed") continue;
    if (!Array.isArray(result.assertionResults)) {
      if (samples.length < RUNTIME_FAILURE_SAMPLE_LIMIT) samples.push({ file });
      continue;
    }
    let resultFailedAssertionCount = 0;
    for (const assertion of result.assertionResults) {
      if (assertion?.status !== "failed") continue;
      failedAssertionCount += 1;
      resultFailedAssertionCount += 1;
      if (samples.length < RUNTIME_FAILURE_SAMPLE_LIMIT) {
        const title =
          typeof assertion.title === "string"
            ? sanitizeRuntimeFailureTitle(assertion.title)
            : undefined;
        samples.push(title ? { file, title } : { file });
      }
    }
    if (resultFailedAssertionCount === 0 && samples.length < RUNTIME_FAILURE_SAMPLE_LIMIT) {
      samples.push({ file });
    }
  }
  const status = samples.length > 0 ? "report-failures-found" : "report-no-allowlisted-failures";
  return withStartupError(
    {
      exitCode,
      reportStatus: status,
      reportBytes: byteCount,
      ...(allResultsAllowlisted
        ? { testResultCount: safeResults.length, failedAssertionCount }
        : {}),
      failedTestSamples: samples,
    },
    startupError,
  );
}

function withStartupError(diagnostics, value) {
  const safe = sanitizeRuntimeStartupError(value);
  return safe && diagnostics.reportStatus !== "report-failures-found"
    ? { ...diagnostics, startupError: safe }
    : diagnostics;
}

/** Select one allowlisted startup line from child output; raw output is never returned. */
export function extractRuntimeStartupError(value) {
  if (typeof value !== "string") return undefined;
  const bounded = value.slice(0, RUNTIME_STARTUP_OUTPUT_LIMIT);
  let generic;
  for (const candidate of bounded.split(/[\r\n]+/)) {
    const line = sanitizeRuntimeStartupError(candidate);
    if (!line) continue;
    if (/\bfailed to load config from\b/i.test(line)) {
      generic ??= line;
      continue;
    }
    if (isSpecificRuntimeStartupError(line)) return line;
    generic ??= line;
  }
  return generic;
}

function isSpecificRuntimeStartupError(line) {
  if (/^error:\s*build failed with \d+ errors?:?$/i.test(line)) return false;
  if (
    /^(?:✘\s*)?(?:\[error\]\s*)?(?:could not (?:resolve|load)\b|failed to resolve import\b|enoent\b)/i.test(
      line,
    )
  )
    return true;
  return (
    /^(?:[A-Za-z]*Error\b|ERR_[A-Z0-9_]+\b|cannot\b|unhandled\b)/i.test(line) ||
    /\bnot defined\b/i.test(line) ||
    /\bfailed to resolve import\b/i.test(line)
  );
}

function sanitizeRuntimeStartupError(value) {
  if (typeof value !== "string") return undefined;
  let line = stripAnsiAndControls(value).trim();
  const stageOnly = line.match(
    /^Error: canonical project and runtime data fallback is forbidden \(target=(canonical-data|canonical-server|canonical-tests|canonical-scripts|canonical-package-manifest|canonical-tsconfig|canonical-vitest-config|canonical-dependency|canonical-other), operation=(readFileSync|readFile|openSync|open|createReadStream|statSync|lstatSync|accessSync|readdirSync|readdir|realpath|copyFileSync|copyFile|realpathSync|realpathSync\.native|promises\.(?:readFile|open|stat|lstat|access|readdir|realpath|copyFile))\)$/,
  );
  if (stageOnly)
    return `Error: canonical project and runtime data fallback is forbidden (target=${stageOnly[1]}, operation=${stageOnly[2]})`;
  if (/canonical project and runtime data fallback is forbidden/i.test(line)) return undefined;
  if (
    !line ||
    (!/^(?:[A-Za-z]*Error\b|ERR_[A-Z0-9_]+\b|failed\b|cannot\b|unhandled\b)/i.test(line) &&
      !/^(?:✘\s*)?(?:\[error\]\s*)?(?:could not (?:resolve|load)\b|failed to resolve import\b|enoent\b)/i.test(
        line,
      ) &&
      !/\bnot defined\b/i.test(line) &&
      !/\b(?:failed to load config|failed to resolve import|error when starting|vite server startup)\b/i.test(
        line,
      ))
  )
    return undefined;
  line = line
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(
      /\b(?:password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted]",
    )
    .replace(QUOTED_ABSOLUTE_PATH, (_match, quote) => `${quote}[path]${quote}`)
    .replace(UNQUOTED_ABSOLUTE_PATH, "[path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RUNTIME_FAILURE_LINE_LIMIT);
  return line || undefined;
}

function resolveRuntimeTestFile(runtimeRoot, name) {
  const resolvedRoot = path.resolve(runtimeRoot);
  const resolvedName = path.resolve(resolvedRoot, name);
  const relative = path.relative(resolvedRoot, resolvedName);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    return undefined;
  const normalized = relative.split(path.sep).join("/");
  return RUNTIME_QUALITY_TESTS.includes(normalized) ? normalized : undefined;
}

function stripAnsiAndControls(value) {
  let output = "";
  for (let index = 0; index < value.length;) {
    const code = value.charCodeAt(index);
    if (code === 0x1b && value.charCodeAt(index + 1) === 0x5b) {
      let cursor = index + 2;
      while (value.charCodeAt(cursor) >= 0x30 && value.charCodeAt(cursor) <= 0x3f) cursor += 1;
      while (value.charCodeAt(cursor) >= 0x20 && value.charCodeAt(cursor) <= 0x2f) cursor += 1;
      const finalCode = value.charCodeAt(cursor);
      if (finalCode >= 0x40 && finalCode <= 0x7e) {
        index = cursor + 1;
        continue;
      }
    }
    output += isControlCodePoint(code) ? " " : value[index];
    index += 1;
  }
  return output;
}

function isControlCodePoint(codePoint) {
  return (codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f);
}

// Quoted paths can contain spaces; unquoted matching stays token based so prose
// containing a slash does not consume the rest of the diagnostic line.
const QUOTED_ABSOLUTE_PATH = /(["'])(?:(?:[A-Za-z]:[\\/]|\\\\|\/)[^"']*)\1/g;
const UNQUOTED_ABSOLUTE_PATH = /(?:[A-Za-z]:\\|\\\\|\/)(?:[^\s"'<>|,;()]+[\\/]?)+/g;

function sanitizeRuntimeFailureTitle(value) {
  const line = stripAnsiAndControls(value)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(
      /\b(?:password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted]",
    )
    .replace(QUOTED_ABSOLUTE_PATH, (_match, quote) => `${quote}[path]${quote}`)
    .replace(UNQUOTED_ABSOLUTE_PATH, "[path]")
    .trim()
    .slice(0, RUNTIME_FAILURE_LINE_LIMIT);
  return line || undefined;
}

// Non-refresh inputs used by the listed suites and their loaders. Their digests pin the
// precise canonical baseline before any byte is copied into the isolated validation root.
export const PINNED_RUNTIME_INPUTS = Object.freeze({
  "data/source/hon-mks202512.csv":
    "6fdb57885ccea31f78d51c6f090df5ad6e6dc8fd80ab95bc32081cf024f403ad",
  "data/source/hon-mks202606.xls":
    "bdb5b5ad4f79030728c89502d1f27c2d3234c30b09a8f287900016eb89ab61c8",
  "data/source/cti-size-composition/production-pi2plus-manifest.json":
    "e002ecec397c07691ccdfe8e69817debb5fc0c9e2a054ca276eaa8eb837a5e00",
  "data/source/cti-size-composition/production-pi2plus.json":
    "f0e716f980a2129df163034b2a480f8e948e0c5f352f1b406ac41a4978d17a63",
  "data/source/cti-size-composition/weights.csv":
    "2098287276fa564d0280c9c7c29a336548d634bd20db739bbd1582ad71e1fcd2",
  "data/source/cti-size-composition/weights-source-manifest.json":
    "2f709fb82b5b974ef0b0463d41689d55c458148e38cfbc4fb12abde14db4dd5c",
  "data/source/cti-size-composition/two-plus-share-backtest/lfs-national-shares.csv":
    "7b2a71c97b4662bdb121246825534051f30b6959f8f3f83b7b74c7374e474c91",
  "data/source/cti-size-composition/two-plus-share-backtest/source-trace.json":
    "eb7d72929443dd984667395b71e2faeb1a9f425f26c4a341e72ecb2d31db087f",
  "data/source/cti-size-composition/raw/lfs-special-jan/2017-setai-n.xls":
    "78dfeb79a9c39495ade1f8dee2469da5e3ba8a94d81c48621590e4c3bc8e7682",
  "data/source/cti-size-composition/raw/lfs-special-jan/2018-setai-n.xls":
    "7032cd9d7b06f26f2cea9b6de00c9a9e22527ae08d98ecfa4a8e2af88a665928",
  "data/source/cti-size-composition/raw/lfs-special-jan/2019-setai-n.xls":
    "52fb89bbf360c5ca72f6cbe65ccf09342736bf0077d3938c7df78ee86ccab1d8",
  "data/source/cti-size-composition/raw/lfs-special-jan/2020-setai-n.xls":
    "b5e541674119e5dfdae8b69c0801bf7561b36bc8567e67ab86f2d1921363e92e",
  "data/source/cti-size-composition/raw/lfs-special-jan/2021-setai-n.xls":
    "558ec9b2abe88e10e6b18cd17d9071efc719d556f5369fbaf5443a3e89398579",
  "data/source/cti-size-composition/raw/lfs-special-jan/2022-setai-n.xls":
    "6bdb29720ded3ce0e6f49a28fdc004af7b67549726b61aae87dc2c73989910e3",
  "data/source/cti-size-composition/raw/lfs-special-jan/2023-setai-n.xls":
    "64101813896c485c4584f1b4881a75435cddb0bfa3b4321367fa727315894e3b",
  "data/source/cti-size-composition/raw/lfs-special-jan/2024-setai-n.xls":
    "ad0c9e8cdc0c3cb04f6d830006ddab7c999840ababd5dd6ada78b6fd9ccb1c46",
  "data/source/cti-size-composition/raw/lfs-special-jan/2025-setai-n.xlsx":
    "6dac12725446a8cf1e8e8325fd0ce7cec3b0f55f897fc9edeb416503631d4a22",
  "tests/fixtures/csv/minkan-extension-raw.csv":
    "1683e03aa9bb0b0e2ed53a470bdf21e78ca3ac65efe7d0b0b1164cf3ee20aacd",
});

// The project clone is intentionally limited to the dependency closure of the quality suites.
// Each source/config/test file is individually hashed so an unreviewed code change cannot alter
// what the staged suites execute.
export const PINNED_PROJECT_FILES = Object.freeze({
  "package.json": "fa7aa0a7ff191d0e76145ced4efc8bbd12c7bae87652f7d37a093e1d118f5931",
  "pnpm-lock.yaml": "286565a22c116351e1fb0623accdba27b213bdd6e5495ac53ce224da1bd97a42",
  "tsconfig.json": "9f3692ef19cf5112726f18e7b095c4b6e53eac251d73687c79135e67f35889c7",
  "vitest.config.ts": "face3801831e94e12e5b6b2ab619df49dbf59333cd0a501b1e5b7cc61c635317",
  "scripts/fetch-cti-basic-series-2025.mjs":
    "5330a7b1ec343d4cf7ada3a8f568ad9a1f2189d2112621f99ee6010424471df0",
  "server/lib/consumptionTotal12Ma.ts":
    "131e7eb594dc33e4550359fbe1fb6b2c26fe5b585499fb1fcbcff15381d2788b",
  "server/lib/ctiAdjustedConnectionEstimate.ts":
    "6af9307392f34eab4f94297b4dd5a5a96f28f0d2e7664fd35165b606774f5cb0",
  "server/lib/ctiAdjustedConnectionEstimateV2.ts":
    "c76da93e63164654f1b0ece5b905e58c1c3bd56d587dbf21ad4690ef65ca8f68",
  "server/lib/ctiAdjustedPublicationGate.ts":
    "22792a46236a2cf177ed39379c934d0ba44409ff943408eda4120707959dcdde",
  "server/lib/ctiAdjustedRollingBacktest.ts":
    "66f7aead91c00101e6ad7732fecf3aedb2ecd08be10b88bb321079d1cc96d38f",
  "server/lib/ctiBasicSeries2025LongTerm.ts":
    "378ed1cfa196a47a48ff49691b9c9f53ad82aff5d4eb50b508155fde96557515",
  "server/lib/data-loader/cache.ts":
    "cf438d8340004453b68b5d25c3f23b41e8556f7f2951fb622f6ebe845386e112",
  "server/lib/data-loader/cpi.ts":
    "671ff69b2b286f86342ba0b74d56313be285552b85475750354a4483579d9510",
  "server/lib/data-loader/cpiLoader.ts":
    "11219c314ed787a8f6f0fd9ac68a2018cc468208289c643cb27d8c8ff0ee3948",
  "server/lib/data-loader/cpiSource.ts":
    "4f0112d0a22e62c5feb8f9633a509b4edafe96c8bebca1a7fb079361587487e0",
  "server/lib/data-loader/cpiValidation.ts":
    "d5810e1f9c608c8f81f33164e9d86b113746c9e3905bfaed9447106374debf3a",
  "server/lib/data-loader/ctiAdjusted.ts":
    "3b25056feb091a914fcf4efd5c8986d663b0506538230f2fe99cd206703ff262",
  "server/lib/data-loader/ctiValidation.ts":
    "2bd130036d9351436933211c54f8d2fc24aadd8c678699a5767aeb1bc7111cc1",
  "server/lib/data-loader/earnings.ts":
    "d38f007baa3474046a62659aa0c90f809be051cf7cc3d6d738dfae92346bc886",
  "server/lib/data-loader/population.ts":
    "19f6fa5ce0d1d1ee73e0500cece46bd7910d51071075b5f70034652bb34b873b",
  "server/lib/dataIo.ts": "8639c37d61f6b6d15aa270fb51810ff6d4bd614aeedce6bdcf681eea867dd51c",
  "server/lib/dataLoader.ts": "2e84d57f5e6850481e4b630a0ca1ae5e8b26b3fcab6731f11ad052a2700e8078",
  "server/lib/dataProcessor.ts": "94b89883dc2db4b6e6c8a98845d12158d6fba241bc81be6179f249e29bb13f10",
  "server/lib/math/movingAverage.ts":
    "dd98ae00c94ac1c55e4f734271a46009565330e4a17ab31493739bc46799340e",
  "server/lib/serverCalculations.ts":
    "c123fb31b739e0ca3be82a3a569784a782e581e18890e2c131ea3dd2d7856a4d",
  "server/lib/view-models/dashboard.ts":
    "3fa933e666789b9bfd8f21054ff005f09077c001ec996176daf5db86c45241ed",
  "server/lib/view-models/quarterlyAggregation.ts":
    "682c913a253513b573c66f2db879f603e31ce8d1513fce2eee583778645376e2",
  "src/lib/chartConstants.ts": "7cf0e8f1700a8ac7ec733fd131c15e38024ec41150aea42e1c63ddc869746f48",
  "src/lib/clientCalculations.ts":
    "ae4d02d14284fd10fc202de7bf95ec3885ec16a1ed2f621f4aca7d8ed9b213e0",
  "src/lib/math/clientCalculations.ts":
    "68d40ebeeec1f7c6dc2595abccf9888e0db381e2e992d10b7824aec064247a20",
  "src/lib/math/quarter.ts": "f866bbf0a3b4ea295b11ec02ca4b7cf71e612d0d6dd01a66193d73100401db46",
  "src/lib/math/quarterlyCompleteness.ts":
    "756050907a879fb5f5715ae04ae044893c7b0e8c2fae574c0f6818b974e54943",
  "src/lib/math/supportSeries.ts":
    "b9078ee6ea6d2651026701ee81622b9c721b3e1c71bf2c8bbc182372ba015c1d",
  "src/lib/quarterlyPublicProjection.ts":
    "479999c2759f45593bad89bcbb47c6321435df45654cc4fed5fdac6a54ceebd8",
  "src/lib/yearMonth.ts": "c1bf9750552d656186d0cbfd32f73a647e9ea16b65feb6128b5b2cc6a496a515",
  "src/types/chart.ts": "bf58649af4649d3f6146f73d9fddf4cad7879e2d1670c90cf95cd41011c2113f",
  "src/types/data.ts": "6994b0f7bd5efee76c75900ce64da3def963f3ef0a50814c45f311356613e2b1",
  "src/types/index.ts": "5e28c21699001dc63aa8a38fd8868164823d4fb7e49d27e71e6684d9a28509a6",
  "tests/data-quality/cpi-data-integrity.test.ts":
    "710da37e1256c08ca2ad897d8a256c34d655b780f2bec7d2a6683c6b84d33005",
  "tests/data-quality/cti-basic-series-2025.test.ts":
    "9d0fe65f2b9816d3bd37cb601666043ed09d5a1f6fc486a87fd946019352edc3",
  "tests/data-quality/cti-data-integrity.test.ts":
    "edee2d3582864ede5bdf504d4a84670b420f18d95673e5b02c262f47c4db590d",
  "tests/data-quality/cti-source-integrity.test.ts":
    "c43d27799c15d0a13c326c6df786b211d7ee97a946ce1ec3fdb0d73830c75b2b",
  "tests/data-quality/cti-source-artifacts.test.ts":
    "6219c833f491db20b7add87c1a729734a81a8e3ac6d67fb23f8f52ad751013de",
  "tests/data-quality/earning-data-integrity.test.ts":
    "b4f547d12599163f99121d8d1b8dfdca778a68ad7b82ba78054b7d077ae31e54",
  "tests/data-quality/population-data-integrity.test.ts":
    "6441a64043461a8b8fa6388dfebc1aeecd47a2668c9ad3ce305ab5527f25e1ad",
  "tests/fixtures/minkan-extension-anchors.json":
    "68809b55b1ed6e98ce0e9a8c87238641135fcb85a56d9d88f1b2cef4e20fa357",
});

const denyCanonicalPreload = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { syncBuiltinESMExports } = require('node:module');
const canonicalRoot = path.resolve(process.env.DATA_REFRESH_CANONICAL_ROOT);
function isCanonicalForbiddenPath(value) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value) && !(value instanceof URL)) return false;
  let filename = value;
  if (value instanceof URL) filename = fileURLToPath(value);
  const resolved = path.resolve(String(filename));
  return ['data', 'results', 'public', 'server', 'src', 'tests', 'scripts'].some((segment) => {
    const blockedRoot = path.join(canonicalRoot, segment);
    return resolved === blockedRoot || resolved.startsWith(blockedRoot + path.sep);
  }) || ['package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'vitest.config.ts'].some((file) => resolved === path.join(canonicalRoot, file));
}
function isCanonicalDataPath(value) {
  if (value instanceof URL) value = fileURLToPath(value);
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) return false;
  const resolved = path.resolve(String(value));
  const dataRoot = path.join(canonicalRoot, 'data');
  return resolved === dataRoot || resolved.startsWith(dataRoot + path.sep);
}
function canonicalArea(file) {
  if (file instanceof URL) file = fileURLToPath(file);
  if (typeof file !== 'string' && !Buffer.isBuffer(file)) return 'canonical-other';
  const resolved = path.resolve(String(file));
  const relative = path.relative(canonicalRoot, resolved);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return 'canonical-other';
  const [area] = relative.split(path.sep);
  if (['data', 'server', 'tests', 'scripts'].includes(area)) return 'canonical-' + area;
  if (area === 'pnpm-lock.yaml' || area === 'node_modules') return 'canonical-dependency';
  if (relative === 'package.json') return 'canonical-package-manifest';
  if (relative === 'tsconfig.json') return 'canonical-tsconfig';
  if (relative === 'vitest.config.ts') return 'canonical-vitest-config';
  return 'canonical-other';
}
function stageOnlyError(file, operation) {
  const target = canonicalArea(file);
  return Object.assign(
    new Error('canonical project and runtime data fallback is forbidden (target=' + target + ', operation=' + operation + ')'),
    { code: 'ESTAGEONLY' },
  );
}
const existsSync = fs.existsSync.bind(fs);
fs.existsSync = (file, ...args) => isCanonicalForbiddenPath(file) ? false : existsSync(file, ...args);
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream', 'statSync', 'lstatSync', 'accessSync', 'readdirSync', 'readdir', 'realpath', 'copyFileSync', 'copyFile']) {
  const original = fs[name].bind(fs);
  fs[name] = function(file, ...args) {
    if (isCanonicalForbiddenPath(file)) throw stageOnlyError(file, name);
    return original(file, ...args);
  };
}
const originalRealpathSync = fs.realpathSync.bind(fs);
const originalRealpathSyncNative = fs.realpathSync.native.bind(fs);
function denyCanonicalRealpath(file, operation) {
  if (isCanonicalForbiddenPath(file)) throw stageOnlyError(file, operation);
}
const guardedRealpathSync = function(file, ...args) {
  denyCanonicalRealpath(file, 'realpathSync');
  const resolved = originalRealpathSync(file, ...args);
  if (isCanonicalDataPath(resolved)) throw stageOnlyError(resolved, 'realpathSync');
  return resolved;
};
const guardedRealpathSyncNative = function(file, ...args) {
  denyCanonicalRealpath(file, 'realpathSync.native');
  const resolved = originalRealpathSyncNative(file, ...args);
  if (isCanonicalDataPath(resolved)) throw stageOnlyError(resolved, 'realpathSync.native');
  return resolved;
};
guardedRealpathSync.native = guardedRealpathSyncNative;
fs.realpathSync = guardedRealpathSync;
for (const name of ['readFile', 'open', 'stat', 'lstat', 'access', 'readdir', 'realpath', 'copyFile']) {
  const original = fs.promises[name].bind(fs.promises);
  fs.promises[name] = function(file, ...args) {
    if (isCanonicalForbiddenPath(file)) throw stageOnlyError(file, 'promises.' + name);
    return original(file, ...args);
  };
}
syncBuiltinESMExports();
`;

export function auditRuntimeQualityCoverage(registry) {
  const outputList = (registry?.sources ?? []).flatMap((source) => source.outputs ?? []);
  const outputs = new Set(outputList);
  const expected = new Set(REQUIRED_RUNTIME_REFRESH_OUTPUTS);
  return {
    missingRefreshOutputs: REQUIRED_RUNTIME_REFRESH_OUTPUTS.filter((file) => !outputs.has(file)),
    unexpectedRefreshOutputs: [...outputs].filter((file) => !expected.has(file)),
    duplicateRefreshOutputs: [
      ...new Set(outputList.filter((file, index) => outputList.indexOf(file) !== index)),
    ],
    testFiles: [...RUNTIME_QUALITY_TESTS],
    pinnedInputCount: Object.keys(PINNED_RUNTIME_INPUTS).length,
    projectFileCount: Object.keys(PINNED_PROJECT_FILES).length,
  };
}

export async function auditQualitySuiteInventory(root, testFiles = RUNTIME_QUALITY_TESTS) {
  const discovered = (await readdir(path.join(root, "tests/data-quality"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => `tests/data-quality/${entry.name}`)
    .sort();
  const configured = [...testFiles].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(configured)) {
    throw new RefreshError(
      "quality-validator-incomplete",
      "The staged quality suite allowlist does not match tests/data-quality inventory.",
    );
  }
  return { testFiles: [...testFiles] };
}

/** Validate the generated data from an empty root, with hash-pinned underlays and no canonical fallback. */
export async function validateStagedRuntimeData({
  root,
  stageRoot,
  registry,
  sourceResults,
  runSuites = runRuntimeQualitySuites,
} = {}) {
  const coverage = auditRuntimeQualityCoverage(registry);
  if (
    coverage.missingRefreshOutputs.length ||
    coverage.unexpectedRefreshOutputs.length ||
    coverage.duplicateRefreshOutputs.length
  ) {
    throw new RefreshError(
      "quality-validator-contract-mismatch",
      "Registry refresh outputs must exactly match the audited runtime output contract.",
    );
  }
  if (!Array.isArray(sourceResults) || sourceResults.length === 0) {
    throw new RefreshError(
      "quality-validator-incomplete",
      "No staged source results were provided to the runtime validator.",
    );
  }
  const registryOutputs = (registry?.sources ?? []).flatMap((source) => source.outputs ?? []);
  const runtimePinOverlap = Object.keys(PINNED_RUNTIME_INPUTS).filter((file) =>
    registryOutputs.includes(file),
  );
  if (runtimePinOverlap.length) {
    throw new RefreshError(
      "quality-validator-contract-mismatch",
      "A runtime refresh output is also declared as a pinned underlay.",
    );
  }
  await auditQualitySuiteInventory(root, RUNTIME_QUALITY_TESTS);
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "data-refresh-runtime-"));
  const canonicalRoot = path.resolve(root);
  const resolvedRuntimeRoot = path.resolve(runtimeRoot);
  if (
    resolvedRuntimeRoot === canonicalRoot ||
    resolvedRuntimeRoot.startsWith(`${canonicalRoot}${path.sep}`) ||
    canonicalRoot.startsWith(`${resolvedRuntimeRoot}${path.sep}`)
  ) {
    await rm(runtimeRoot, { recursive: true, force: true });
    throw new RefreshError(
      "runtime-quality-root-invalid",
      "The isolated runtime root must be outside the canonical project tree.",
    );
  }
  try {
    const stagedPaths = new Set();

    for (const [relative, expectedHash] of Object.entries(PINNED_PROJECT_FILES)) {
      const canonical = assertContainedRuntimePath(root, relative);
      await assertNoSymlinkPath(root, relative, "runtime-quality-project-invalid");
      const stat = await lstat(canonical).catch(() => null);
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        throw new RefreshError(
          "runtime-quality-project-invalid",
          `Pinned runtime project file is missing or unsafe: ${relative}.`,
        );
      }
      const bytes = await readFile(canonical);
      if (sha256(bytes) !== expectedHash) {
        throw new RefreshError(
          "runtime-quality-project-hash-mismatch",
          `Pinned runtime project file changed: ${relative}.`,
        );
      }
      const target = assertContainedRuntimePath(runtimeRoot, relative);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
    }
    const dependencyLink = path.join(runtimeRoot, "node_modules");
    await symlink(path.join(root, "node_modules"), dependencyLink, "dir");

    for (const [relative, expectedHash] of Object.entries(PINNED_RUNTIME_INPUTS)) {
      const target = assertContainedRuntimePath(runtimeRoot, relative);
      const canonical = assertContainedRuntimePath(root, relative);
      await assertNoSymlinkPath(root, relative, "runtime-quality-underlay-invalid");
      const stat = await lstat(canonical).catch(() => null);
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        throw new RefreshError(
          "runtime-quality-underlay-invalid",
          `Pinned runtime input is missing or unsafe: ${relative}.`,
        );
      }
      const bytes = await readFile(canonical);
      if (sha256(bytes) !== expectedHash) {
        throw new RefreshError(
          "runtime-quality-underlay-hash-mismatch",
          `Pinned runtime input hash changed: ${relative}.`,
        );
      }
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
      stagedPaths.add(relative);
    }

    const declaredOutputs = new Set(
      (registry?.sources ?? []).flatMap((source) => source.outputs ?? []),
    );
    let stagedOutputCount = 0;
    for (const { source, result } of sourceResults) {
      if (
        !source ||
        !Array.isArray(source.outputs) ||
        !result ||
        !Array.isArray(result.artifacts)
      ) {
        throw new RefreshError(
          "quality-validator-incomplete",
          "A source result is missing its declared staged outputs.",
        );
      }
      const artifacts = new Map(
        result.artifacts.map((artifact) => [artifact.path, artifact.bytes]),
      );
      if (artifacts.size !== result.artifacts.length || artifacts.size !== source.outputs.length) {
        throw new RefreshError(
          "quality-validator-output-invalid",
          `Source ${source.id} returned duplicate staged paths.`,
        );
      }
      for (const output of source.outputs) {
        if (!declaredOutputs.has(output)) {
          throw new RefreshError(
            "quality-validator-output-invalid",
            `Source ${source.id} returned an undeclared output.`,
          );
        }
        const bytes = artifacts.get(output);
        if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
          throw new RefreshError(
            "quality-validator-incomplete",
            `Runtime validation lacks staged output ${output}.`,
          );
        }
        if (stagedPaths.has(output)) {
          throw new RefreshError(
            "quality-validator-output-collision",
            `Refresh output collides with a pinned runtime input: ${output}.`,
          );
        }
        const target = assertContainedRuntimePath(runtimeRoot, output);
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
        stagedPaths.add(output);
        stagedOutputCount += 1;
      }
    }

    if (stagedPaths.size !== Object.keys(PINNED_RUNTIME_INPUTS).length + declaredOutputs.size) {
      throw new RefreshError(
        "quality-validator-incomplete",
        "Staged runtime inputs do not exactly cover the pinned and declared allowlist.",
      );
    }
    const audit = { ...coverage, stagedOutputCount, stagedInputCount: stagedPaths.size };
    const preloadPath = await writeDenyCanonicalPreload(stageRoot);
    const configPath = await writeVitestWrapper(runtimeRoot);
    await runSuites({
      root,
      runtimeRoot,
      stageRoot,
      testFiles: RUNTIME_QUALITY_TESTS,
      preloadPath,
      configPath,
    });
    return {
      validator: "runtime-data-quality-suites-v1",
      cpi: true,
      cti: true,
      population: true,
      earnings: true,
      qualitySuiteCount: RUNTIME_QUALITY_TESTS.length,
      stagedOutputCount: audit.stagedOutputCount,
      pinnedInputCount: audit.pinnedInputCount,
      projectFileCount: audit.projectFileCount,
    };
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

export function assertContainedRuntimePath(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) {
    throw new RefreshError(
      "quality-validator-path-invalid",
      "Runtime allowlist paths must be relative.",
    );
  }
  const target = path.resolve(root, relative);
  if (target === path.resolve(root) || !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new RefreshError(
      "quality-validator-path-invalid",
      "A runtime allowlist path escaped its root.",
    );
  }
  return target;
}

async function writeDenyCanonicalPreload(stageRoot) {
  const preloadPath = path.join(stageRoot, "deny-canonical-runtime-data.cjs");
  await writeFile(preloadPath, denyCanonicalPreload, { mode: 0o600 });
  return preloadPath;
}

async function writeVitestWrapper(runtimeRoot) {
  const configPath = path.join(runtimeRoot, ".data-refresh-vitest.config.mjs");
  const wrapper = `import path from 'node:path';\nimport { mergeConfig } from 'vitest/config';\nimport base from './vitest.config.ts';\nexport default mergeConfig(base, { cacheDir: path.join(${JSON.stringify(runtimeRoot)}, '.vitest-cache') });\n`;
  await writeFile(configPath, wrapper, { mode: 0o600, flag: "wx" });
  return configPath;
}

async function assertNoSymlinkPath(root, relative, code) {
  const parts = relative.split(/[\\/]/).filter(Boolean);
  let current = path.resolve(root);
  for (const part of parts) {
    current = path.join(current, part);
    const stat = await lstat(current).catch(() => null);
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      throw new RefreshError(code, `Runtime allowlist path contains a symlink: ${relative}.`);
    }
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function runRuntimeQualitySuites({
  root,
  runtimeRoot,
  stageRoot,
  testFiles,
  preloadPath,
  configPath,
  spawnProcess = spawn,
}) {
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    return Promise.reject(
      new RefreshError(
        "quality-validator-incomplete",
        "No runtime data-quality suites are configured.",
      ),
    );
  }
  const testPaths = testFiles.map((file) => assertContainedRuntimePath(runtimeRoot, file));
  const reportPath = path.join(stageRoot, `vitest-${randomUUID()}.json`);
  const args = [
    path.join(runtimeRoot, "node_modules/vitest/vitest.mjs"),
    "run",
    "--root",
    runtimeRoot,
    "--config",
    configPath,
    "--reporter=json",
    `--outputFile.json=${reportPath}`,
    ...testPaths,
  ];
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, args, {
      cwd: runtimeRoot,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        TSX_TSCONFIG_PATH: path.join(runtimeRoot, "tsconfig.json"),
        CTI_BASIC_ARTIFACT_ROOT: path.join(runtimeRoot, "data/source/official-cti-2025-long-term"),
        CTI_ADJUSTED_ARTIFACT_ROOT: path.join(runtimeRoot, "data/source/cti-adjusted"),
        CTI_ADJUSTED_ANALYSIS_ROOT: path.join(runtimeRoot, "results/plan39"),
        DATA_REFRESH_CANONICAL_ROOT: path.resolve(root),
        NODE_OPTIONS: `--require=${preloadPath}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (stream) => {
      let captured = "";
      stream?.on("data", (chunk) => {
        if (captured.length < RUNTIME_STARTUP_OUTPUT_LIMIT) {
          captured += Buffer.from(chunk)
            .toString("utf8")
            .slice(0, RUNTIME_STARTUP_OUTPUT_LIMIT - captured.length);
        }
      });
      return () => captured;
    };
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      void unlink(reportPath).catch(() => {});
      reject(
        new RefreshError(
          "runtime-quality-suite-unavailable",
          "Could not start the required staged data-quality suites.",
          { cause: error },
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const diagnosticExitCode =
          Number.isSafeInteger(code) && code >= 0 && code <= 255 ? code : 255;
        const startupError = extractRuntimeStartupError(`${stderr()}\n${stdout()}`);
        void (async () => {
          let diagnostics;
          try {
            const reportStat = await stat(reportPath);
            if (!reportStat.isFile()) {
              diagnostics = extractRuntimeFailureDiagnostics({
                exitCode: diagnosticExitCode,
                reportStatus: "report-missing",
                startupError,
                runtimeRoot,
                testFiles,
              });
            } else if (reportStat.size > RUNTIME_FAILURE_REPORT_LIMIT) {
              diagnostics = extractRuntimeFailureDiagnostics({
                exitCode: diagnosticExitCode,
                reportStatus: "report-oversize",
                reportBytes: reportStat.size,
                startupError,
                runtimeRoot,
                testFiles,
              });
            } else {
              diagnostics = extractRuntimeFailureDiagnostics({
                exitCode: diagnosticExitCode,
                report: await readFile(reportPath),
                startupError,
                runtimeRoot,
                testFiles,
              });
            }
          } catch (error) {
            if (error?.code === "ENOENT") {
              diagnostics = extractRuntimeFailureDiagnostics({
                exitCode: diagnosticExitCode,
                reportStatus: "report-missing",
                startupError,
                runtimeRoot,
                testFiles,
              });
            } else if (!diagnostics) {
              diagnostics = extractRuntimeFailureDiagnostics({
                exitCode: diagnosticExitCode,
                report: Buffer.alloc(0),
                startupError,
                runtimeRoot,
                testFiles,
              });
            }
          } finally {
            await unlink(reportPath).catch(() => {});
          }
          reject(
            Object.assign(
              new RefreshError(
                "runtime-quality-suite-failed",
                `A staged data-quality suite failed (exit ${code}).`,
              ),
              diagnostics ? { runtimeQualityDiagnostics: diagnostics } : {},
            ),
          );
        })();
        return;
      }
      void unlink(reportPath).catch(() => {});
      resolve();
    });
  });
}
