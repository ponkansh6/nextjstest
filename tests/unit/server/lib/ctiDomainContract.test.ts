import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  haveMatchingAnnualArtifactSchemas,
  resolveAnnualInputContract,
  resolveAnnualInputContractOptions,
  resolveAnnualArtifactSchema,
  resolveQuarterlyNominalArtifactSchema,
} from "../../../../server/lib/ctiDomainContract";

describe("CTI domain contract identifiers", () => {
  it("maps only the declared legacy and canonical annual schema values", () => {
    expect(resolveAnnualArtifactSchema("plan39-annual-v1")).toBe("adjusted-cti-annual-v1");
    expect(resolveAnnualArtifactSchema("adjusted-cti-annual-v1")).toBe("adjusted-cti-annual-v1");
    expect(resolveAnnualArtifactSchema("plan39-quarterly-nominal-v1")).toBeNull();
    expect(resolveAnnualArtifactSchema("adjusted-cti-annual-v2")).toBeNull();
  });

  it("accepts only the annual and quarterly nominal schema families", () => {
    expect(resolveQuarterlyNominalArtifactSchema("plan39-quarterly-nominal-v1")).toBe(
      "adjusted-cti-quarterly-nominal-v1",
    );
    expect(resolveQuarterlyNominalArtifactSchema("adjusted-cti-quarterly-nominal-v1")).toBe(
      "adjusted-cti-quarterly-nominal-v1",
    );
    expect(resolveQuarterlyNominalArtifactSchema("plan39-annual-v1")).toBeNull();
    expect(resolveQuarterlyNominalArtifactSchema("unknown-v1")).toBeNull();
  });

  it("fails closed when temporary annual or quarterly reader fixtures declare mutated schemas", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cti-domain-schema-reader-"));
    const fixtureSchema = (name: string, schemaVersion: string) => {
      const fixturePath = path.join(root, name);
      writeFileSync(fixturePath, JSON.stringify({ metadata: { schemaVersion } }));
      const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
        metadata: { schemaVersion: unknown };
      };
      return fixture.metadata.schemaVersion;
    };

    try {
      const unsupportedAnnual = fixtureSchema("annual.json", "adjusted-cti-annual-v999");
      const unsupportedQuarterly = fixtureSchema(
        "quarterly.json",
        "adjusted-cti-quarterly-nominal-v999",
      );
      const annualWithQuarterlySchema = fixtureSchema(
        "annual-family-mismatch.json",
        "adjusted-cti-quarterly-nominal-v1",
      );
      const quarterlyWithAnnualSchema = fixtureSchema(
        "quarterly-family-mismatch.json",
        "adjusted-cti-annual-v1",
      );

      expect(resolveAnnualArtifactSchema(unsupportedAnnual)).toBeNull();
      expect(resolveQuarterlyNominalArtifactSchema(unsupportedQuarterly)).toBeNull();
      expect(resolveAnnualArtifactSchema(annualWithQuarterlySchema)).toBeNull();
      expect(resolveQuarterlyNominalArtifactSchema(quarterlyWithAnnualSchema)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows old/new annual schema spellings only when they resolve to the same schema", () => {
    expect(haveMatchingAnnualArtifactSchemas("plan39-annual-v1", "adjusted-cti-annual-v1")).toBe(
      true,
    );
    expect(haveMatchingAnnualArtifactSchemas("plan39-annual-v1", "unknown-v1")).toBe(false);
    expect(haveMatchingAnnualArtifactSchemas("plan39-annual-v1", "plan39-analysis-v1")).toBe(false);
  });

  it("keeps annual input contract separate from the artifact schema", () => {
    expect(resolveAnnualInputContract("plan39")).toBe("annual-public");
    expect(resolveAnnualInputContract("annual-public")).toBe("annual-public");
    expect(resolveAnnualInputContract("plan40")).toBe("quarterly-annual-anchor");
    expect(resolveAnnualInputContract("quarterly-annual-anchor")).toBe("quarterly-annual-anchor");
    expect(resolveAnnualInputContract("plan39-annual-v1")).toBeNull();
    expect(resolveAnnualInputContract("future-contract")).toBeNull();
  });

  it.each([
    [undefined, undefined, "annual-public", true, undefined],
    ["annual-public", undefined, "annual-public", true, undefined],
    ["quarterly-annual-anchor", undefined, "quarterly-annual-anchor", true, undefined],
    [undefined, "plan39", "annual-public", true, undefined],
    [undefined, "plan40", "quarterly-annual-anchor", true, undefined],
    ["annual-public", "plan39", "annual-public", true, undefined],
    ["quarterly-annual-anchor", "plan40", "quarterly-annual-anchor", true, undefined],
    ["annual-public", "plan40", "annual-public", false, "input_contract_conflict"],
    ["quarterly-annual-anchor", "plan39", "annual-public", false, "input_contract_conflict"],
    ["unknown", undefined, "annual-public", false, "unknown_input_contract"],
    [undefined, "unknown", "annual-public", false, "unknown_input_contract"],
    ["annual-public", "unknown", "annual-public", false, "unknown_input_contract"],
  ])(
    "resolves input-contract option pair (%s, %s) without conflating schema identifiers",
    (inputContract, legacyContract, contract, valid, reason) => {
      expect(resolveAnnualInputContractOptions(inputContract, legacyContract)).toEqual({
        contract,
        valid,
        ...(reason ? { reason } : {}),
      });
    },
  );
});
