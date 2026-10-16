import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
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
  "tests/data-quality/cti-gdp-source-integrity.test.ts",
  "tests/data-quality/cti-gdp-source-artifacts.test.ts",
  "tests/data-quality/cti-basic-series-2025.test.ts",
  "tests/data-quality/population-data-integrity.test.ts",
  "tests/data-quality/earning-data-integrity.test.ts",
  "tests/data-quality/plan21-quarterly-gdp.test.ts",
]);

// Non-refresh inputs used by the listed suites and their loaders. Their digests pin the
// precise canonical baseline before any byte is copied into the isolated validation root.
export const PINNED_RUNTIME_INPUTS = Object.freeze({
  "data/source/cti_support_nominal2025.csv":
    "9a6331e1cc0ff0f4acb8da67dbdf5ed0c2b1457122b1a1b8c990911dbce2038f",
  "data/source/cti_support_nominal2025.metadata.json":
    "8e482d34a253360918e0acdd1c2c054e969cc3ff278761b4df9263bebed24d2f",
  "data/source/cti_support_real2025.csv":
    "0c6973e2b4a2686b94a7954a5a55058a5101de05ebed316066f7d0b517e6e744",
  "data/source/cti_support_real2025.metadata.json":
    "b01785b1f7dc7022baddf1628b2fd16e985ef95e308a1bb1c7bb9775b537cb69",
  "data/source/cti-gdp-display-normalization2025.json":
    "359e02b2ac1b46e80de9234ac965f2d41cf915cd039a872baf1713887ad836a9",
  "data/source/cti_support_nominal_quarterly2025.csv":
    "0b5b4b21fcc03071973c96e4c7dfffba02eb63ee600c19de023aef1c345a49a7",
  "data/source/cti_support_nominal_quarterly2025.metadata.json":
    "a10c93720b9beb53b9cf19655313b14fc992d23ac25844db708db10fcd14d694",
  "data/source/cti_support_nominal_quarterly2025.official.csv":
    "0b5b4b21fcc03071973c96e4c7dfffba02eb63ee600c19de023aef1c345a49a7",
  "data/source/cti_support_nominal_quarterly2025.estat.csv":
    "0b5b4b21fcc03071973c96e4c7dfffba02eb63ee600c19de023aef1c345a49a7",
  "data/source/cti_support_real_quarterly2025.csv":
    "4454cc36abdd556210e0bdea1f32055c1716d799d69368e883a39f445f1ef855",
  "data/source/cti_support_real_quarterly2025.metadata.json":
    "b47258a0d7cf836680d40171a2f8bd0beae5044772874187eebe7087ad6c2840",
  "data/source/cti_support_real_quarterly2025.official.csv":
    "4454cc36abdd556210e0bdea1f32055c1716d799d69368e883a39f445f1ef855",
  "data/source/cti_support_real_quarterly2025.estat.csv":
    "4454cc36abdd556210e0bdea1f32055c1716d799d69368e883a39f445f1ef855",
  "data/source/cti-gdp-quarterly-display-normalization2025.json":
    "850c401688d75ab24c9fc726f66fa37e03894f8aabe74ee88dc7e2ef452ad960",
  "data/source/hon-mks202512.csv":
    "6fdb57885ccea31f78d51c6f090df5ad6e6dc8fd80ab95bc32081cf024f403ad",
  "data/source/hon-mks202606.xls":
    "bdb5b5ad4f79030728c89502d1f27c2d3234c30b09a8f287900016eb89ab61c8",
  "tests/fixtures/csv/minkan-extension-raw.csv":
    "1683e03aa9bb0b0e2ed53a470bdf21e78ca3ac65efe7d0b0b1164cf3ee20aacd",
});

// The project clone is intentionally limited to the dependency closure of the quality suites.
// Each source/config/test file is individually hashed so an unreviewed code change cannot alter
// what the staged suites execute.
export const PINNED_PROJECT_FILES = Object.freeze({
  "package.json": "fa7aa0a7ff191d0e76145ced4efc8bbd12c7bae87652f7d37a093e1d118f5931",
  "pnpm-lock.yaml": "9f8f222877a06b72c0448dd01dc1666b70e8c30ca5aad244ac2ba42c0ed6108e",
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
    "24a7f70e89c440bf623b4941c8157028cbce99413cff511e87ce5421c1c0910e",
  "server/lib/data-loader/cache.ts":
    "cf438d8340004453b68b5d25c3f23b41e8556f7f2951fb622f6ebe845386e112",
  "server/lib/data-loader/cpi.ts":
    "01487c045a9ff34a9d4c04060dcac3ef6ca844f9a5d0e42714dbeb64be7e9b3b",
  "server/lib/data-loader/cpiLoader.ts":
    "11219c314ed787a8f6f0fd9ac68a2018cc468208289c643cb27d8c8ff0ee3948",
  "server/lib/data-loader/cpiSource.ts":
    "59badc77cdfbb8ee2f8b6b2cb59b060628fcd5b2ffa735f33394b236dc433a77",
  "server/lib/data-loader/cpiValidation.ts":
    "d5810e1f9c608c8f81f33164e9d86b113746c9e3905bfaed9447106374debf3a",
  "server/lib/data-loader/ctiAdjusted.ts":
    "3b25056feb091a914fcf4efd5c8986d663b0506538230f2fe99cd206703ff262",
  "server/lib/data-loader/ctiValidation.ts":
    "6800b594f791d838832b36d55cad03fdb01f6dea0263c241b185f441a0cb23e5",
  "server/lib/data-loader/earnings.ts":
    "fab285cc37d79800d71c7d356f9b66271ec4a0c21c2f65e04f87e7fc99090f7e",
  "server/lib/data-loader/gdpSupport.ts":
    "e1d1a5016fa6e76bf72c511ab3d10a74a86189916acf6474cfc27db9b1e059bf",
  "server/lib/data-loader/population.ts":
    "19f6fa5ce0d1d1ee73e0500cece46bd7910d51071075b5f70034652bb34b873b",
  "server/lib/dataIo.ts": "635318bf522812234820c60fbc96c20940be7a56c1fde1a4b5125432902c8ced",
  "server/lib/dataLoader.ts": "153317724f9d86199b06e75cf8761c5a797fc227eb63c9d67c7bd96265459ef7",
  "server/lib/dataProcessor.ts": "94b89883dc2db4b6e6c8a98845d12158d6fba241bc81be6179f249e29bb13f10",
  "server/lib/math/movingAverage.ts":
    "dd98ae00c94ac1c55e4f734271a46009565330e4a17ab31493739bc46799340e",
  "server/lib/serverCalculations.ts":
    "c123fb31b739e0ca3be82a3a569784a782e581e18890e2c131ea3dd2d7856a4d",
  "server/lib/view-models/dashboard.ts":
    "d83a62f5ea34d25926d667dd429394fc6c8db77bcbb7ee43df4bb97ffa59b3bb",
  "server/lib/view-models/quarterlyAggregation.ts":
    "ba5ce7c891c37229de6cda162995b8106a1574047de25421611cd17da69a517c",
  "server/lib/view-models/quarterlyGdpTransform.ts":
    "867276118929f75994895e7cc42613fffd4ce713cae4ffdd12ea2a70ec7e509d",
  "src/lib/chartConstants.ts": "d6ef6bbb3e5dad75b298b1992edffa553edac03fce42ee193ad81c0119ea06de",
  "src/lib/clientCalculations.ts":
    "ae4d02d14284fd10fc202de7bf95ec3885ec16a1ed2f621f4aca7d8ed9b213e0",
  "src/lib/math/clientCalculations.ts":
    "68d40ebeeec1f7c6dc2595abccf9888e0db381e2e992d10b7824aec064247a20",
  "src/lib/math/quarter.ts": "f866bbf0a3b4ea295b11ec02ca4b7cf71e612d0d6dd01a66193d73100401db46",
  "src/lib/math/quarterlyCompleteness.ts":
    "756050907a879fb5f5715ae04ae044893c7b0e8c2fae574c0f6818b974e54943",
  "src/lib/math/supportSeries.ts":
    "7d1d5a2569ec46d3633897d9390c749e1b90df9913330c11b0f1528bc269f4bc",
  "src/lib/quarterlyPublicProjection.ts":
    "479999c2759f45593bad89bcbb47c6321435df45654cc4fed5fdac6a54ceebd8",
  "src/lib/yearMonth.ts": "c1bf9750552d656186d0cbfd32f73a647e9ea16b65feb6128b5b2cc6a496a515",
  "src/types/chart.ts": "bf58649af4649d3f6146f73d9fddf4cad7879e2d1670c90cf95cd41011c2113f",
  "src/types/data.ts": "aca5f6232a9410f3e6ada54b22d31038cb4ec0c20bf5b89ed39e57ee8045814f",
  "src/types/index.ts": "5e28c21699001dc63aa8a38fd8868164823d4fb7e49d27e71e6684d9a28509a6",
  "tests/data-quality/cpi-data-integrity.test.ts":
    "710da37e1256c08ca2ad897d8a256c34d655b780f2bec7d2a6683c6b84d33005",
  "tests/data-quality/cti-basic-series-2025.test.ts":
    "9d0fe65f2b9816d3bd37cb601666043ed09d5a1f6fc486a87fd946019352edc3",
  "tests/data-quality/cti-data-integrity.test.ts":
    "35032601930550234be2475e9690057ee7b41890b2bcf2cd7d610d366135717e",
  "tests/data-quality/cti-gdp-source-artifacts.test.ts":
    "78527d6e5856523a4ec1add91a45cf6ac128dda0ea4fb3d9df27e455117f3611",
  "tests/data-quality/cti-gdp-source-integrity.test.ts":
    "4afcf61c67850b24a31c8521acffc6dea31652ad958831636f72567abce28870",
  "tests/data-quality/earning-data-integrity.test.ts":
    "a4884d3e47cf50f9d22fbd60de46768233d508173e5eed7b45eaa7982842e983",
  "tests/data-quality/plan21-quarterly-gdp.test.ts":
    "5c02fcad8c1eb81d39e4879456f2658fcfe1eebe951d1f1cc8b3fda6f5e40873",
  "tests/data-quality/population-data-integrity.test.ts":
    "68da0adf24b44df23fe05c9919515a731038dc71e2f3aad72a22e69eccf47086",
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
const existsSync = fs.existsSync.bind(fs);
fs.existsSync = (file, ...args) => isCanonicalForbiddenPath(file) ? false : existsSync(file, ...args);
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream', 'statSync', 'lstatSync', 'accessSync', 'readdirSync', 'readdir', 'realpathSync', 'realpath', 'copyFileSync', 'copyFile']) {
  const original = fs[name].bind(fs);
  fs[name] = function(file, ...args) {
    if (isCanonicalForbiddenPath(file)) throw Object.assign(new Error('canonical project and runtime data fallback is forbidden'), { code: 'ESTAGEONLY' });
    return original(file, ...args);
  };
}
for (const name of ['readFile', 'open', 'stat', 'lstat', 'access', 'readdir', 'realpath', 'copyFile']) {
  const original = fs.promises[name].bind(fs.promises);
  fs.promises[name] = function(file, ...args) {
    if (isCanonicalForbiddenPath(file)) throw Object.assign(new Error('canonical project and runtime data fallback is forbidden'), { code: 'ESTAGEONLY' });
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
  const runtimeRoot = path.join(stageRoot, "runtime-root");
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
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
    if (!source || !Array.isArray(source.outputs) || !result || !Array.isArray(result.artifacts)) {
      throw new RefreshError(
        "quality-validator-incomplete",
        "A source result is missing its declared staged outputs.",
      );
    }
    const artifacts = new Map(result.artifacts.map((artifact) => [artifact.path, artifact.bytes]));
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

function runRuntimeQualitySuites({ root, runtimeRoot, testFiles, preloadPath, configPath }) {
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    return Promise.reject(
      new RefreshError(
        "quality-validator-incomplete",
        "No runtime data-quality suites are configured.",
      ),
    );
  }
  const testPaths = testFiles.map((file) => assertContainedRuntimePath(runtimeRoot, file));
  const args = [
    path.join(runtimeRoot, "node_modules/vitest/vitest.mjs"),
    "run",
    "--root",
    runtimeRoot,
    "--config",
    configPath,
    ...testPaths,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: runtimeRoot,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        TSX_TSCONFIG_PATH: path.join(runtimeRoot, "tsconfig.json"),
        CTI_BASIC_ARTIFACT_ROOT: path.join(runtimeRoot, "data/source/official-cti-2025-long-term"),
        DATA_REFRESH_CANONICAL_ROOT: path.resolve(root),
        NODE_OPTIONS: `--require=${preloadPath}`,
      },
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.once("error", (error) => {
      clearTimeout(timer);
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
        reject(
          new RefreshError(
            "runtime-quality-suite-failed",
            `A staged data-quality suite failed (exit ${code}).`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}
