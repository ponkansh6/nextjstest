import { describe, expect, it } from "vitest";
import {
  registry,
  registryOutputInventory,
} from "../../../scripts/data-refresh/registry/index.mjs";
import { CTI_OUTPUTS } from "../../../scripts/data-refresh/registry/cti-contract.mjs";
import { adapters } from "../../../scripts/data-refresh/adapters/index.mjs";

const byId = new Map(registry.sources.map((source) => [source.id, source]));

describe("registry contract", () => {
  it("matches output inventory to the declared source artifact contracts", () => {
    expect(byId.get("cpi-long").outputs).toEqual(registryOutputInventory.cpi);
    expect(byId.get("cti-official").outputs).toEqual(CTI_OUTPUTS);
    expect(CTI_OUTPUTS).toHaveLength(31);
    expect(new Set(CTI_OUTPUTS).size).toBe(CTI_OUTPUTS.length);
    expect(byId.get("earnings-family").outputs).toEqual(registryOutputInventory.earnings);
    expect(byId.get("population-statistics").outputs).toEqual(registryOutputInventory.population);

    const everyOutput = registry.sources.flatMap(({ outputs }) => outputs);
    expect(new Set(everyOutput).size).toBe(everyOutput.length);
  });

  it("declares candidate-search identities without conflating API and file IDs", () => {
    const cpi = byId.get("cpi-long");
    expect(cpi.identity).toEqual({ kind: "api", statsDataId: "0004052037" });
    expect(cpi.candidateIdentity.expectedStatsDataId).toBe(cpi.identity.statsDataId);
    expect(cpi.candidateIdentity.expectedTitle).toBe("消費者物価指数（2025年基準）");
    expect(cpi.candidateIdentity.expectedStatisticsName).toBe("消費者物価指数");
    expect(cpi.candidateQuery.searchWord).toBe("消費者物価指数");
    expect(cpi.candidateQuery.statsField).toBe("0703");
    expect(cpi.distributionCandidateQuery.statsCode).toBe("00200573");
    expect(cpi.candidateIdentity.fileStatInfId).toBe(cpi.distributionIdentity.statInfId);
    expect(cpi.distributionCandidateIdentity.yearIncludes).toEqual(["2025"]);
    expect(cpi.distributionCandidateIdentity.datasetIncludes).toEqual(["2025年基準消費者物価指数"]);
    expect(cpi.distributionCandidateIdentity.tableIncludes).toEqual([
      "品目別価格指数（1970年1月～最新月）",
    ]);
    const cti = byId.get("cti-official");
    expect(cti.fileCandidateIdentities).toHaveLength(5);
    expect(cti.fileCandidateIdentities.map(({ datasetIncludes }) => datasetIncludes)).toEqual([
      ["2025年基準消費動向指数"],
      ["2025年基準消費動向指数", "最新結果"],
      ["2025年基準消費動向指数", "統計表_月次"],
      ["2025年基準消費動向指数", "最新結果"],
      ["2025年基準消費動向指数", "最新結果"],
    ]);
    expect(cti.fileCandidateIdentities[0]).toMatchObject({
      statInfId: "000040499070",
      resourceIncludes: ["二人以上の世帯"],
      tableIncludes: ["基本系列（原数値）"],
    });
    expect(
      cti.fileCandidateIdentities.find(({ statInfId }) => statInfId === "000040499082"),
    ).toMatchObject({
      datasetIncludes: ["2025年基準消費動向指数", "最新結果"],
      resourceIncludes: ["季節調整値"],
      tableIncludes: ["基本系列（季節調整値）"],
      categoryIncludes: ["世帯消費動向指数"],
      subCategory1Includes: ["二人以上の世帯"],
      periodIncludes: [],
      yearIncludes: ["2025"],
    });
    expect(
      cti.fileCandidateIdentities.find(({ statInfId }) => statInfId === "000040499028"),
    ).toMatchObject({
      datasetIncludes: ["2025年基準消費動向指数", "統計表_月次"],
      tableIncludes: ["調整系列 分布調整値（原数値）"],
      categoryIncludes: ["世帯消費動向指数"],
      subCategory1Includes: ["総世帯、総世帯のうち勤労者世帯"],
    });
    expect(
      cti.fileCandidateIdentities.find(({ statInfId }) => statInfId === "000040499069"),
    ).toMatchObject({
      datasetIncludes: ["2025年基準消費動向指数", "最新結果"],
      resourceIncludes: ["基本系列"],
      tableIncludes: ["基本系列（原数値）"],
      categoryIncludes: ["世帯消費動向指数"],
      subCategory1Includes: ["総世帯、総世帯のうち勤労者世帯"],
      periodIncludes: [],
    });
    expect(
      cti.fileCandidateIdentities.find(({ statInfId }) => statInfId === "000040499087"),
    ).toMatchObject({
      datasetIncludes: ["2025年基準消費動向指数", "最新結果"],
      tableIncludes: ["調整系列 分布調整値（原数値）"],
      categoryIncludes: ["世帯消費動向指数"],
      subCategory1Includes: ["総世帯、総世帯のうち勤労者世帯"],
      periodIncludes: [],
    });
    expect(
      cti.fileCandidateIdentities.every(
        ({ datasetIncludes, resourceIncludes, periodIncludes, yearIncludes }) =>
          datasetIncludes.length &&
          resourceIncludes.length &&
          Array.isArray(periodIncludes) &&
          yearIncludes.length,
      ),
    ).toBe(true);
  });

  it("registers the verified earnings adapter alongside other required sources", () => {
    const earnings = byId.get("earnings-family");
    expect(earnings.required).toBe(true);
    expect(earnings.blockedReason).toBeUndefined();
    expect(adapters.has(earnings.adapterId)).toBe(true);

    const population = byId.get("population-statistics");
    expect(population.required).toBe(true);
    expect(population.blockedReason).toBeUndefined();
    expect(adapters.has(population.adapterId)).toBe(true);

    expect(adapters.has("cpi")).toBe(true);
    expect(adapters.has("cti")).toBe(true);
  });

  it("keeps pinned wage runtime input outside refresh outputs", () => {
    const earnings = byId.get("earnings-family");
    expect(earnings.pinnedRuntimeInputs).toEqual([
      "data/source/hon-mks202512.csv",
      "data/source/hon-mks202606.xls",
    ]);
    expect(earnings.pinnedRuntimeInputs.some((input) => earnings.outputs.includes(input))).toBe(
      false,
    );

    const cti = byId.get("cti-official");
    expect(cti.rawSourceOutputs).toHaveLength(5);
    expect(cti.unchangedVerifiedOutputs).toHaveLength(4);
    expect(cti.rawSourceOutputs.every((output) => cti.outputs.includes(output))).toBe(true);
    expect(cti.unchangedVerifiedOutputs.every((output) => cti.outputs.includes(output))).toBe(true);
    expect(
      cti.rawSourceOutputs.some((output) => cti.unchangedVerifiedOutputs.includes(output)),
    ).toBe(false);
  });
});
