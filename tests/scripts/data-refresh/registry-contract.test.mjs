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
    expect(cpi.candidateQuery.searchWord).toBe("消費者物価指数");
    expect(cpi.distributionCandidateIdentity.yearIncludes).toEqual(["2025"]);
    const cti = byId.get("cti-official");
    expect(cti.fileCandidateIdentities).toHaveLength(5);
    expect(
      cti.fileCandidateIdentities.every(
        ({ datasetIncludes, resourceIncludes, periodIncludes, yearIncludes }) =>
          datasetIncludes.length &&
          resourceIncludes.length &&
          periodIncludes.length &&
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
