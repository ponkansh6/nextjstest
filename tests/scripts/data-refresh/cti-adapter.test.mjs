import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { ctiAdapter } from "../../../scripts/data-refresh/adapters/cti.mjs";
import {
  CTI_INPUT_IDENTITIES,
  CTI_OUTPUTS,
  CTI_SOURCE_CONTRACT,
} from "../../../scripts/data-refresh/registry/cti-contract.mjs";
import {
  SERIES,
  parseOfficialFile,
  parseCtiCurrentHouseholdMonthly,
} from "../../../scripts/fetch-cti-basic-series-2025.mjs";

const repo = process.cwd();
const roots = [];
const source = {
  id: "cti-official",
  identity: { kind: "file", statInfId: "000040499070", format: "xlsx" },
  inputIdentities: CTI_INPUT_IDENTITIES,
  outputs: CTI_OUTPUTS,
  title: CTI_SOURCE_CONTRACT.title,
  classifications: CTI_SOURCE_CONTRACT.classifications,
  filters: CTI_SOURCE_CONTRACT.filters,
  period: { from: "2002-01", through: "latest-published" },
  frequency: "monthly",
  unit: "指数",
  baseline: CTI_SOURCE_CONTRACT.filters.baseline,
  fileCandidateIdentities: [
    {
      statInfId: "000040499070",
      format: "XLSX",
      query: { searchWord: "070 fixture", dataType: "XLS" },
      titleIncludes: ["世帯消費動向指数", "二人以上の世帯"],
      directUrl:
        "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499070",
    },
    {
      statInfId: "000040499082",
      format: "XLSX",
      query: { searchWord: "082 fixture", dataType: "XLS" },
      titleIncludes: ["世帯消費動向指数", "季節調整値"],
      directUrl:
        "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499082",
    },
    {
      statInfId: "000040499028",
      format: "XLSX",
      query: { searchWord: "028 fixture", dataType: "XLS" },
      titleIncludes: ["世帯消費動向指数", "分布調整値"],
      directUrl:
        "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499028",
    },
    {
      statInfId: "000040499069",
      format: "XLSX",
      query: { searchWord: "069 fixture", dataType: "XLS" },
      titleIncludes: ["世帯消費動向指数", "基本系列"],
      directUrl:
        "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499069",
    },
    {
      statInfId: "000040499087",
      format: "XLSX",
      query: { searchWord: "087 fixture", dataType: "XLS" },
      titleIncludes: ["世帯消費動向指数", "分布調整値"],
      directUrl:
        "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499087",
    },
  ],
};
for (const contract of source.fileCandidateIdentities)
  Object.assign(contract, {
    datasetIncludes: [contract.titleIncludes[0]],
    resourceIncludes: [contract.titleIncludes[1]],
    tableIncludes: [contract.titleIncludes[0]],
    categoryIncludes: [contract.titleIncludes[1]],
    periodIncludes: ["月次"],
    yearIncludes: ["2025"],
  });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const fixtureCtiAdapter = (options) =>
  ctiAdapter({
    ...options,
    getDataCatalog:
      options.getDataCatalog ||
      (async (_query, contract) => ({
        datasets: [
          {
            TITLE: [
              ...contract.datasetIncludes,
              ...contract.tableIncludes,
              ...contract.categoryIncludes,
              ...contract.periodIncludes,
              ...contract.yearIncludes,
            ].join(" "),
            RELEASE_DATE: "2026-09-01",
            LAST_MODIFIED_DATE: "2026-10-01",
            RESOURCE: {
              "@id": `fixture-${contract.statInfId}`,
              TITLE: `世帯消費動向指数 ${contract.resourceIncludes.join(" ")} 月次 2025 CTI ${contract.format}`,
              FORMAT: contract.format,
              URL: contract.directUrl,
            },
          },
        ],
      })),
  });

async function makeRoot(withPins = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-refresh-cti-"));
  roots.push(root);
  const files = [
    ...["000040499070", "000040499082", "000040499028"].flatMap((id) => [
      `data/source/official-cti-2025-long-term/${id}.raw`,
      `data/source/official-cti-2025-long-term/${id}.normalized.csv`,
      `data/source/official-cti-2025-long-term/${id}.metadata.json`,
    ]),
    "data/source/cti_data2025.csv",
    "data/source/cti_data2025.metadata.json",
    "data/source/cti_data2025_distribution_adjusted.csv",
    "data/source/cti_data2025_distribution_adjusted.metadata.json",
    "data/source/cti-2025-series-map.csv",
    "data/source/cti-2025-official-series.csv",
    "data/source/official-cti-2025/cti-basic-000040499069.xlsx",
    "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx",
  ];
  if (withPins)
    files.push(
      "data/source/cti-adjusted/L.json",
      "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv",
      "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.metadata.json",
      "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.csv",
      "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.metadata.json",
    );
  for (const file of files) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(path.join(repo, file)));
  }
  return root;
}

afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

async function longTermFixtures() {
  const sources = Object.fromEntries(
    await Promise.all(
      SERIES.map(async ({ statInfId }) => [
        statInfId,
        await readFile(path.join(repo, `data/source/official-cti-2025-long-term/${statInfId}.raw`)),
      ]),
    ),
  );
  sources["000040499069"] = await readFile(
    path.join(repo, "data/source/official-cti-2025/cti-basic-000040499069.xlsx"),
  );
  sources["000040499087"] = await readFile(
    path.join(repo, "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx"),
  );
  return sources;
}

function withoutLastCurrentMonth(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer", raw: false, WTF: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["総・月(原)"], {
    header: 1,
    raw: false,
    defval: "",
  });
  const lastIndex = rows.findLastIndex((row) => String(row[0]).trim() === "00401");
  rows.splice(lastIndex, 1);
  workbook.Sheets["総・月(原)"] = XLSX.utils.aoa_to_sheet(rows);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function reviseWorkbookValue(bytes, sheetName, rowMatches, columnIndex) {
  const workbook = XLSX.read(bytes, { type: "buffer", raw: false, WTF: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
  const row = rows.find(rowMatches);
  if (!row || !Number.isFinite(Number(row[columnIndex])))
    throw new Error("fixture target value not found");
  row[columnIndex] = String(Number(row[columnIndex]) + 1);
  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function dropWorkbookRow(bytes, sheetName, rowMatches) {
  const workbook = XLSX.read(bytes, { type: "buffer", raw: false, WTF: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
  const index = rows.findIndex(rowMatches);
  if (index < 0) throw new Error("fixture target row not found");
  rows.splice(index, 1);
  workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function repackagedWorkbookPreservingRawValues(bytes) {
  const repackaged = Buffer.from(bytes);
  const minimumOffset = Math.max(0, repackaged.length - 0xffff - 22);
  let endRecordOffset = -1;
  for (let offset = repackaged.length - 22; offset >= minimumOffset; offset -= 1) {
    if (repackaged.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = repackaged.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === repackaged.length) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0 || repackaged.readUInt16LE(endRecordOffset + 20) !== 0) {
    throw new Error("fixture XLSX must have an un-commented ZIP end record");
  }
  repackaged.writeUInt16LE(1, endRecordOffset + 20);
  return Buffer.concat([repackaged, Buffer.from([0x52])]);
}

function rawWorkbookRows(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer", raw: false, WTF: true });
  return Object.fromEntries(
    workbook.SheetNames.map((sheetName) => [
      sheetName,
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" }),
    ]),
  );
}

describe("CTI refresh adapter", () => {
  it("parses all 22 series per long-term table and returns staged artifacts with hashes and source lineage", async () => {
    const root = await makeRoot();
    const stageRoot = path.join(root, "stage");
    const fixtureBytes = await longTermFixtures();
    for (const item of SERIES)
      expect(parseOfficialFile(fixtureBytes[item.statInfId], item).series).toHaveLength(22);
    const currentBasic = parseCtiCurrentHouseholdMonthly(fixtureBytes["000040499069"], {
      kind: "basic",
      now: new Date("2026-10-16T00:00:00.000Z"),
    });
    expect(currentBasic.observations).toHaveLength(115);
    expect(currentBasic.observations[0].values).toEqual([
      "95.1549",
      "23.3393",
      "6.0544",
      "7.9983",
      "3.3921",
      "4.2682",
      "4.0147",
      "14.8125",
      "2.4025",
      "9.2614",
      "-",
      "110.9031",
      "30.2322",
      "7.0482",
      "9.9979",
      "4.2243",
      "4.9745",
      "4.3355",
      "14.872",
      "2.1355",
      "11.0254",
      "-",
    ]);
    expect(
      parseCtiCurrentHouseholdMonthly(fixtureBytes["000040499087"], {
        kind: "distributionAdjusted",
        now: new Date("2026-10-16T00:00:00.000Z"),
      }).observations,
    ).toHaveLength(115);
    const requested = [];
    const result = await fixtureCtiAdapter({
      source,
      root,
      stageRoot,
      now: () => new Date("2026-10-16T00:00:00.000Z"),
      fetchFile: async ({ url }) => {
        const id = new URL(url).searchParams.get("statInfId");
        requested.push(id);
        return {
          bytes: fixtureBytes[id],
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      },
    });
    expect(requested).toEqual([
      "000040499070",
      "000040499082",
      "000040499028",
      "000040499069",
      "000040499087",
    ]);
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "data/source/official-cti-2025-long-term/000040499070.normalized.csv",
        }),
        expect.objectContaining({ path: "data/source/cti-adjusted/manifest.json" }),
        expect.objectContaining({
          path: "data/source/cti_data2025_distribution_adjusted_quarterly.csv",
        }),
        expect.objectContaining({ path: "data/source/cti_data2025.csv" }),
        expect.objectContaining({ path: "data/source/cti-2025-series-map.csv" }),
        expect.objectContaining({ path: "data/source/cti-2025-official-series.csv" }),
        expect.objectContaining({ path: "data/source/cti_data2025_distribution_adjusted.csv" }),
      ]),
    );
    for (const artifact of result.artifacts) expect(Buffer.isBuffer(artifact.bytes)).toBe(true);
    const normalized = result.artifacts
      .find(({ path: output }) => output.endsWith("000040499070.normalized.csv"))
      .bytes.toString();
    expect((normalized.split("\n").length - 2) % 22).toBe(0);
    const metadata = JSON.parse(
      result.artifacts
        .find(({ path: output }) => output.endsWith("000040499070.metadata.json"))
        .bytes.toString(),
    );
    expect(metadata.statInfId).toBe("000040499070");
    expect(metadata.sourceIdentity).toMatchObject({
      kind: "estat-catalog-resource",
      catalogResourceId: "fixture-000040499070",
      legacyStatInfId: "000040499070",
      format: "XLSX",
      title: expect.stringContaining("世帯消費動向指数"),
      releaseDate: "2026-09-01",
      lastModifiedDate: "2026-10-01",
    });
    expect(metadata.sourceIdentity.downloadUrlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(metadata.sourceIdentity)).not.toContain("https://");
    expect(metadata.rawSha256).toBe(hash(fixtureBytes["000040499070"]));
    expect(metadata.latestPublishedMonth).toBe("2026-07");
    expect(metadata.series).toHaveLength(22);
    expect(metadata.revisionAudit.changedObservationCount).toBeGreaterThan(0);
    expect(metadata.revisionAudit.changedValueCount).toBeGreaterThanOrEqual(
      metadata.revisionAudit.changedObservationCount,
    );
    expect(metadata.revisionAudit.changedSample.length).toBeGreaterThan(0);
    expect(metadata.revisionAudit.changedSample.length).toBeLessThanOrEqual(10);
    expect(metadata.revisionAudit.changedSample[0]).toMatchObject({
      month: expect.stringMatching(/^\d{4}-\d{2}$/),
      seriesIndex: expect.any(Number),
      before: null,
      after: expect.any(Number),
    });
    expect(metadata.revisionAudit.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized.split("\n")[1]).toContain(",2005-01,");
    const basicManifest = JSON.parse(
      result.artifacts
        .find(({ path: output }) => output.endsWith("official-cti-2025-long-term/manifest.json"))
        .bytes.toString(),
    );
    expect(
      basicManifest.files.find(({ statInfId }) => statInfId === "000040499070").rawSha256,
    ).toBe(hash(fixtureBytes["000040499070"]));
    expect(basicManifest.revisionAudit["000040499070"].sourceSha256).toBe(
      hash(fixtureBytes["000040499070"]),
    );
    expect(basicManifest.derivedFiles.map(({ file }) => file)).toEqual([
      "series-map.csv",
      "representative-snapshot.csv",
    ]);
    const manifest = JSON.parse(
      result.artifacts
        .find(({ path: output }) => output === "data/source/cti-adjusted/manifest.json")
        .bytes.toString(),
    );
    expect(manifest.artifacts.quarterlyNominal.sourceSha256).toBe(
      hash(fixtureBytes["000040499087"]),
    );
    expect(result.semanticValue.pinnedSemantic.map(({ sha256: value }) => value)).toEqual([
      "175dd6a00a17dfdc9cfbedb397e76965ab95d272ee6784a3e1187e432c939b9d",
      "898b42896823e6ab3de2c9a45b03b8903e0e5bf58d5b28c978977ccc4f595fe4",
      "6d0c1b40674a566a64e23a985456362a4f6950370783c6d37f025934b519e92d",
      "e61853588b29e0f02f0fd63cf1e380334783adba7d23c858fb888c31dfe865d0",
    ]);
    for (const [metadataPath, statInfId] of [
      ["data/source/cti_data2025.metadata.json", "000040499069"],
      ["data/source/cti_data2025_distribution_adjusted.metadata.json", "000040499087"],
    ]) {
      const currentMetadata = JSON.parse(
        result.artifacts.find(({ path: output }) => output === metadataPath).bytes.toString(),
      );
      expect(currentMetadata.sourceFileSha256).toBe(hash(fixtureBytes[statInfId]));
    }
    expect(
      result.artifacts.find(({ path: output }) =>
        output.endsWith("000040499070.2004-prehistory.csv"),
      ).bytes,
    ).toEqual(
      await readFile(
        path.join(root, "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv"),
      ),
    );
    for (const [artifact, canonical] of [
      ["data/source/cti_data2025.csv", "data/source/cti_data2025.csv"],
      ["data/source/cti-2025-series-map.csv", "data/source/cti-2025-series-map.csv"],
      ["data/source/cti-2025-official-series.csv", "data/source/cti-2025-official-series.csv"],
      [
        "data/source/cti_data2025_distribution_adjusted.csv",
        "data/source/cti_data2025_distribution_adjusted.csv",
      ],
    ]) {
      expect(result.artifacts.find(({ path: output }) => output === artifact).bytes).toEqual(
        await readFile(path.join(repo, canonical)),
      );
    }
    const basicMetadata = JSON.parse(
      result.artifacts
        .find(({ path: output }) => output === "data/source/cti_data2025.metadata.json")
        .bytes.toString(),
    );
    expect(basicMetadata.period).toEqual({
      start: "2017年1月",
      end: "2026年7月",
      monthlyRows: 115,
    });
    expect(basicMetadata.csvSha256).toBe(
      hash(
        result.artifacts.find(({ path: output }) => output === "data/source/cti_data2025.csv")
          .bytes,
      ),
    );
    expect(basicMetadata.officialSeriesMapSha256).toBe(
      hash(
        result.artifacts.find(
          ({ path: output }) => output === "data/source/cti-2025-series-map.csv",
        ).bytes,
      ),
    );
    expect(basicMetadata.officialSeriesSnapshotSha256).toBe(
      hash(
        result.artifacts.find(
          ({ path: output }) => output === "data/source/cti-2025-official-series.csv",
        ).bytes,
      ),
    );
    expect(basicMetadata.officialSeriesSnapshotSourceStatInfId).toBe("000040499069");
    expect(basicMetadata.officialSeriesSnapshotSourceSha256).toBe(
      hash(fixtureBytes["000040499069"]),
    );
    expect(result.validationSummary.revisionAuditDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.reportSummary.fileCandidates).toHaveLength(5);
    expect(
      result.reportSummary.fileCandidates.map(({ identityStatInfId }) => identityStatInfId).sort(),
    ).toEqual(["000040499028", "000040499069", "000040499070", "000040499082", "000040499087"]);
    expect(result.reportSummary).toMatchObject({
      candidateCount: 5,
      coverage: { start: "2002-01", monthCount: 115, seriesCount: 66 },
      validationResult: "passed",
    });
    expect(result.reportSummary.revisionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.reportSummary.outputHashes).toHaveLength(result.artifacts.length);
    expect(result.reportSummary.fileCandidates[0]).toMatchObject({
      catalogResourceId: "fixture-000040499070",
      format: "XLSX",
      candidateCount: 1,
    });
    expect(JSON.stringify(result.reportSummary)).not.toContain("https://");
  }, 30_000);

  it("selects newer semantically equivalent CTI resources after catalog and legacy IDs change", async () => {
    const root = await makeRoot();
    const stageRoot = path.join(root, "stage-new-id");
    const fixtureBytes = await longTermFixtures();
    const logicalIds = [
      "000040499070",
      "000040499082",
      "000040499028",
      "000040499069",
      "000040499087",
    ];
    const selectedResources = [];
    let downloadIndex = 0;
    const result = await ctiAdapter({
      source,
      root,
      stageRoot,
      now: () => new Date("2026-10-16T00:00:00.000Z"),
      getDataCatalog: async (_query, contract) => {
        const baseTitle = [
          ...contract.datasetIncludes,
          ...contract.tableIncludes,
          ...contract.categoryIncludes,
          ...contract.periodIncludes,
          ...contract.yearIncludes,
        ].join(" ");
        const resourceTitle = `世帯消費動向指数 ${contract.resourceIncludes.join(" ")} 月次 2025 CTI ${contract.format}`;
        const make = (resourceId, legacyId, updated) => ({
          TITLE: baseTitle,
          RELEASE_DATE: "2026-09-01",
          LAST_MODIFIED_DATE: updated,
          RESOURCE: {
            "@id": resourceId,
            TITLE: resourceTitle,
            FORMAT: contract.format,
            URL: `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${legacyId}`,
          },
        });
        return {
          datasets: [
            make(`resource-old-${contract.statInfId}`, contract.statInfId, "2026-09-15"),
            make(`resource-latest-${contract.statInfId}`, "999999999999", "2026-10-01"),
          ],
        };
      },
      fetchFile: async ({ url, allowedHosts }) => {
        expect(allowedHosts).toEqual(["www.e-stat.go.jp"]);
        selectedResources.push(new URL(url).searchParams.get("statInfId"));
        const logicalId = logicalIds[downloadIndex++];
        return {
          bytes: fixtureBytes[logicalId],
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      },
    });
    expect(selectedResources).toEqual(Array(5).fill("999999999999"));
    const metadata = JSON.parse(
      result.artifacts
        .find(({ path: output }) => output.endsWith("000040499070.metadata.json"))
        .bytes.toString(),
    );
    expect(metadata.statInfId).toBe("000040499070");
    expect(metadata.legacyStatInfId).toBe("999999999999");
    expect(metadata.sourceIdentity).toMatchObject({
      catalogResourceId: "resource-latest-000040499070",
      legacyStatInfId: "999999999999",
    });
    expect(
      result.reportSummary.fileCandidates.every(
        (item) =>
          item.catalogResourceId.startsWith("resource-latest-") && item.candidateCount === 2,
      ),
    ).toBe(true);
  });

  it("keeps the semantic fingerprint stable across XLSX repackaging and changes it when an observation changes", async () => {
    const root = await makeRoot();
    const fixtureBytes = await longTermFixtures();
    const run = (bytes) =>
      fixtureCtiAdapter({
        source,
        root,
        stageRoot: path.join(root, `stage-${hash(bytes["000040499069"]).slice(0, 8)}`),
        now: () => new Date("2026-10-16T00:00:00.000Z"),
        fetchFile: async ({ url }) => ({
          bytes: bytes[new URL(url).searchParams.get("statInfId")],
        }),
      });
    const original = await run(fixtureBytes);
    const repackaged = {
      ...fixtureBytes,
      "000040499069": repackagedWorkbookPreservingRawValues(fixtureBytes["000040499069"]),
    };
    expect(hash(repackaged["000040499069"])).not.toBe(hash(fixtureBytes["000040499069"]));
    expect(rawWorkbookRows(repackaged["000040499069"])).toEqual(
      rawWorkbookRows(fixtureBytes["000040499069"]),
    );
    expect(
      parseCtiCurrentHouseholdMonthly(repackaged["000040499069"], {
        kind: "basic",
        now: new Date("2026-10-16T00:00:00.000Z"),
      }).observations,
    ).toEqual(
      parseCtiCurrentHouseholdMonthly(fixtureBytes["000040499069"], {
        kind: "basic",
        now: new Date("2026-10-16T00:00:00.000Z"),
      }).observations,
    );
    const repacked = await run(repackaged);
    expect(repacked.semanticValue).toEqual(original.semanticValue);

    const revised = {
      ...fixtureBytes,
      "000040499069": reviseWorkbookValue(
        fixtureBytes["000040499069"],
        "総・月(原)",
        (row) => String(row[0]).trim() === "00401",
        2,
      ),
    };
    const revisedResult = await run(revised);
    expect(revisedResult.semanticValue).not.toEqual(original.semanticValue);
  }, 30_000);

  it("fails closed when an input identity is unknown or a pinned dependency is absent/changed", async () => {
    const root = await makeRoot(false);
    const stageRoot = path.join(root, "stage");
    const bytes = await longTermFixtures();
    const fetchFile = async ({ url }) => ({
      bytes: bytes[new URL(url).searchParams.get("statInfId")],
    });
    await expect(
      fixtureCtiAdapter({
        source: { ...source, identity: { ...source.identity, statInfId: "000000000000" } },
        root,
        stageRoot,
        fetchFile,
      }),
    ).rejects.toMatchObject({ code: "cti-identity-mismatch" });
    await expect(fixtureCtiAdapter({ source, root, stageRoot, fetchFile })).rejects.toMatchObject({
      code: "cti-pinned-dependency-missing",
    });
    const changedRoot = await makeRoot();
    await writeFile(path.join(changedRoot, "data/source/cti-adjusted/L.json"), "unexpected");
    await expect(
      fixtureCtiAdapter({
        source,
        root: changedRoot,
        stageRoot: path.join(changedRoot, "stage"),
        fetchFile,
      }),
    ).rejects.toMatchObject({ code: "cti-pinned-dependency-changed" });
  }, 30_000);

  it("fails closed if registry output allowlist differs from the complete adapter artifact contract", async () => {
    const root = await makeRoot();
    const bytes = await longTermFixtures();
    const fetchFile = async ({ url }) => ({
      bytes: bytes[new URL(url).searchParams.get("statInfId")],
    });
    await expect(
      fixtureCtiAdapter({
        source: { ...source, outputs: source.outputs.slice(1) },
        root,
        stageRoot: path.join(root, "stage"),
        fetchFile,
      }),
    ).rejects.toMatchObject({ code: "cti-registry-output-mismatch" });
  });

  it("fails closed if canonical current source bytes do not match their declared source hash", async () => {
    const root = await makeRoot();
    const metadataPath = path.join(root, "data/source/cti_data2025.metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.sourceFileSha256 = "0".repeat(64);
    await writeFile(metadataPath, JSON.stringify(metadata));
    const bytes = await longTermFixtures();
    const fetchFile = async ({ url }) => ({
      bytes: bytes[new URL(url).searchParams.get("statInfId")],
    });
    await expect(
      fixtureCtiAdapter({ source, root, stageRoot: path.join(root, "stage"), fetchFile }),
    ).rejects.toMatchObject({ code: "cti-canonical-hash-mismatch" });
  });

  it("fails closed on derived map/snapshot hash tampering", async () => {
    const root = await makeRoot();
    const metadataPath = path.join(root, "data/source/cti_data2025.metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.officialSeriesMapSha256 = "f".repeat(64);
    await writeFile(metadataPath, JSON.stringify(metadata));
    const bytes = await longTermFixtures();
    const fetchFile = async ({ url }) => ({
      bytes: bytes[new URL(url).searchParams.get("statInfId")],
    });
    await expect(
      fixtureCtiAdapter({ source, root, stageRoot: path.join(root, "stage"), fetchFile }),
    ).rejects.toMatchObject({ code: "cti-canonical-hash-mismatch" });
  });

  it("records overlap revisions with changed counts, samples, and source digests for all current and long-term inputs", async () => {
    const root = await makeRoot();
    const bytes = await longTermFixtures();
    for (const series of SERIES) {
      const monthColumn = series.monthColumn;
      const valueColumn = series.valueStart;
      bytes[series.statInfId] = reviseWorkbookValue(
        bytes[series.statInfId],
        series.sheet,
        (row) => /^2020[-年/]0?1月?$/.test(String(row[monthColumn] ?? "").trim()),
        valueColumn,
      );
    }
    for (const id of ["000040499069", "000040499087"]) {
      bytes[id] = reviseWorkbookValue(
        bytes[id],
        "総・月(原)",
        (row) =>
          String(row[0]).trim() === (id === "000040499069" ? "00401" : "00501") &&
          String(row[8]).trim() === "2025年1月",
        9,
      );
    }
    const fetchFile = async ({ url }) => ({
      bytes: bytes[new URL(url).searchParams.get("statInfId")],
    });
    const result = await fixtureCtiAdapter({
      source,
      root,
      stageRoot: path.join(root, "stage"),
      fetchFile,
      now: () => new Date("2026-10-16T00:00:00Z"),
    });
    for (const id of [
      "000040499070",
      "000040499082",
      "000040499028",
      "000040499069",
      "000040499087",
    ]) {
      expect(result.revisionAudit[id].changedValueCount).toBeGreaterThan(0);
      expect(result.revisionAudit[id].changedSample.length).toBeGreaterThan(0);
      expect(result.revisionAudit[id].previousSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.revisionAudit[id].sourceSha256).toBe(hash(bytes[id]));
      expect(result.revisionAudit[id].sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(result.validationSummary.revisedSourceCount).toBe(5);
  });

  it("fails closed when canonical history has an internal monthly gap or drops an old overlap month", async () => {
    const root = await makeRoot();
    const bytes = await longTermFixtures();
    bytes["000040499069"] = dropWorkbookRow(
      bytes["000040499069"],
      "総・月(原)",
      (row) => String(row[0]).trim() === "00401" && String(row[8]).trim() === "2025年2月",
    );
    const fetchFile = async ({ url }) => ({
      bytes: bytes[new URL(url).searchParams.get("statInfId")],
    });
    await expect(
      fixtureCtiAdapter({
        source,
        root,
        stageRoot: path.join(root, "stage"),
        fetchFile,
        now: () => new Date("2026-10-16T00:00:00Z"),
      }),
    ).rejects.toThrow(/periods are not continuous/);
  });

  it("rejects incomplete current monthly coverage instead of treating 114 months as current", async () => {
    const bytes = await longTermFixtures();
    bytes["000040499069"] = withoutLastCurrentMonth(bytes["000040499069"]);
    expect(() =>
      parseCtiCurrentHouseholdMonthly(bytes["000040499069"], {
        kind: "basic",
        now: new Date("2026-10-16T00:00:00.000Z"),
      }),
    ).toThrow(/coverage regressed/);
  });

  it("rejects malformed/missing source workbook bytes without contacting a live endpoint", async () => {
    const root = await makeRoot();
    const stageRoot = path.join(root, "stage");
    let requests = 0;
    await expect(
      fixtureCtiAdapter({
        source,
        root,
        stageRoot,
        fetchFile: async () => {
          requests += 1;
          return { bytes: Buffer.from("not an xlsx") };
        },
      }),
    ).rejects.toThrow();
    // The first source is invalid, so later source URLs must not be requested.
    expect(requests).toBe(1);
  });
});
