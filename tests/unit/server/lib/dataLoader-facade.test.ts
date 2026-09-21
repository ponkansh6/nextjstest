import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  internalLoadCpiData,
  internalLoadCtiData,
  internalLoadPopulationData,
  internalLoadTotalEarningData,
} = vi.hoisted(() => ({
  internalLoadCpiData: vi.fn(),
  internalLoadCtiData: vi.fn(),
  internalLoadPopulationData: vi.fn(),
  internalLoadTotalEarningData: vi.fn(),
}));

vi.mock("../../../../server/lib/data-loader/cpi", async () => {
  const actual = await vi.importActual<typeof import("../../../../server/lib/data-loader/cpi")>(
    "../../../../server/lib/data-loader/cpi",
  );
  return {
    ...actual,
    loadCpiDataInternal: internalLoadCpiData,
    loadCtiDataInternal: internalLoadCtiData,
  };
});

vi.mock("../../../../server/lib/data-loader/population", () => ({
  loadPopulationDataInternal: internalLoadPopulationData,
}));

vi.mock("../../../../server/lib/data-loader/earnings", () => ({
  loadTotalEarningDataInternal: internalLoadTotalEarningData,
}));

import * as facade from "../../../../server/lib/dataLoader";
import * as cpi from "../../../../server/lib/data-loader/cpi";

const expectedRuntimeExports = [
  "clearTestCache",
  "getCpiDataStatus",
  "getCpiMajorWeightTotal",
  "getCtiDataStatus",
  "getCtiBasicConsumptionStatus",
  "getGdpSupportStatus",
  "getQuarterlyGdpSupportStatus",
  "loadCtiAdjustedConnectionEstimate",
  "loadCtiAdjustedData",
  "loadCtiAdjustedV2Estimate",
  "loadCpiData",
  "loadCtiData",
  "loadPopulationData",
  "loadQuarterlyGdpData",
  "loadTotalEarningData",
  "validateQuarterlyGdpSupport",
].sort();

describe("server/lib/dataLoader public facade", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exposes exactly the approved runtime API and no internal loader names", () => {
    expect(Object.keys(facade).sort()).toEqual(expectedRuntimeExports);
    expect(Object.keys(facade).some((name) => /Internal$/.test(name))).toBe(false);
  });

  it("keeps direct CPI/CTI/GDP exports identical to the domain loader entry points", () => {
    expect(facade.getCpiDataStatus).toBe(cpi.getCpiDataStatus);
    expect(facade.getCpiMajorWeightTotal).toBe(cpi.getCpiMajorWeightTotal);
    expect(facade.getCtiDataStatus).toBe(cpi.getCtiDataStatus);
    expect(facade.getCtiBasicConsumptionStatus).toBeDefined();
    expect(facade.getGdpSupportStatus).toBe(cpi.getGdpSupportStatus);
    expect(facade.getQuarterlyGdpSupportStatus).toBe(cpi.getQuarterlyGdpSupportStatus);
    expect(facade.loadQuarterlyGdpData).toBe(cpi.loadQuarterlyGdpData);
    expect(facade.validateQuarterlyGdpSupport).toBe(cpi.validateQuarterlyGdpSupport);
  });

  it("delegates successful CPI and CTI loads through the dynamic wrappers", async () => {
    const cpiData = [{ 年月: "2025年1月", 総合: 100 }];
    const ctiData = [{ 年月: "2025年1月", 総合: 101 }];
    const options = { source: "rollback-2020" as const };
    internalLoadCpiData.mockResolvedValue(cpiData);
    internalLoadCtiData.mockResolvedValue(ctiData);

    await expect(facade.loadCpiData()).resolves.toBe(cpiData);
    await expect(facade.loadCtiData(options)).resolves.toBe(ctiData);
    expect(internalLoadCpiData).toHaveBeenCalledOnce();
    expect(internalLoadCpiData).toHaveBeenCalledWith();
    expect(internalLoadCtiData).toHaveBeenCalledOnce();
    expect(internalLoadCtiData).toHaveBeenCalledWith(options);
  });

  it("delegates successful population and total earning loads through the dynamic wrappers", async () => {
    const populationData = [{ 年月: "2025年1月", 総数: 100 }];
    const totalEarningData = [{ 年月: "2025年1月", 総合: 101 }];
    const options = { source: "rollback-2020" as const };
    internalLoadPopulationData.mockResolvedValue(populationData);
    internalLoadTotalEarningData.mockResolvedValue(totalEarningData);

    await expect(facade.loadPopulationData()).resolves.toBe(populationData);
    await expect(facade.loadTotalEarningData(options)).resolves.toBe(totalEarningData);
    expect(internalLoadPopulationData).toHaveBeenCalledOnce();
    expect(internalLoadPopulationData).toHaveBeenCalledWith();
    expect(internalLoadTotalEarningData).toHaveBeenCalledOnce();
    expect(internalLoadTotalEarningData).toHaveBeenCalledWith(options);

    internalLoadTotalEarningData.mockClear();
    internalLoadTotalEarningData.mockResolvedValue(totalEarningData);
    await expect(facade.loadTotalEarningData()).resolves.toBe(totalEarningData);
    expect(internalLoadTotalEarningData).toHaveBeenCalledWith(undefined);
  });

  it.each([
    ["CPI", () => facade.loadCpiData(), internalLoadCpiData, []],
    ["CTI", () => facade.loadCtiData(), internalLoadCtiData, [undefined]],
    ["population", () => facade.loadPopulationData(), internalLoadPopulationData, []],
    [
      "total earning",
      () => facade.loadTotalEarningData(),
      internalLoadTotalEarningData,
      [undefined],
    ],
  ])(
    "preserves the %s loader empty-array failure result and argument forwarding",
    async (_name, load, internal, expectedArgs) => {
      internal.mockResolvedValue([]);
      await expect(load()).resolves.toEqual([]);
      expect(internal).toHaveBeenCalledWith(...expectedArgs);
    },
  );

  it.each([
    ["CPI", () => facade.loadCpiData(), internalLoadCpiData, []],
    ["CTI", () => facade.loadCtiData(), internalLoadCtiData, [undefined]],
    ["population", () => facade.loadPopulationData(), internalLoadPopulationData, []],
    [
      "total earning",
      () => facade.loadTotalEarningData(),
      internalLoadTotalEarningData,
      [undefined],
    ],
  ])(
    "preserves the %s loader rejection and undefined contracts with argument forwarding",
    async (_name, load, internal, expectedArgs) => {
      const error = new Error(`${_name} failed`);
      internal.mockRejectedValueOnce(error);
      await expect(load()).rejects.toBe(error);
      expect(internal).toHaveBeenCalledWith(...expectedArgs);

      internal.mockClear();
      internal.mockResolvedValueOnce(undefined);
      await expect(load()).resolves.toBeUndefined();
      expect(internal).toHaveBeenCalledWith(...expectedArgs);
    },
  );

  it("forwards total earning options and omitted options in rejection and undefined cases", async () => {
    const options = { source: "rollback-2020" as const };
    const error = new Error("total earning failed");
    internalLoadTotalEarningData.mockRejectedValueOnce(error);

    await expect(facade.loadTotalEarningData(options)).rejects.toBe(error);
    expect(internalLoadTotalEarningData).toHaveBeenCalledWith(options);

    internalLoadTotalEarningData.mockClear();
    internalLoadTotalEarningData.mockResolvedValueOnce(undefined);
    await expect(facade.loadTotalEarningData()).resolves.toBeUndefined();
    expect(internalLoadTotalEarningData).toHaveBeenCalledWith(undefined);
  });

  it("forwards omitted population arguments in rejection and undefined cases", async () => {
    const error = new Error("population failed");
    internalLoadPopulationData.mockRejectedValueOnce(error);

    await expect(facade.loadPopulationData()).rejects.toBe(error);
    expect(internalLoadPopulationData).toHaveBeenCalledWith();

    internalLoadPopulationData.mockClear();
    internalLoadPopulationData.mockResolvedValueOnce(undefined);
    await expect(facade.loadPopulationData()).resolves.toBeUndefined();
    expect(internalLoadPopulationData).toHaveBeenCalledWith();
  });

  function extractModuleSources(sourceText: string): string[] {
    const sourceFile = ts.createSourceFile(
      "loader-import-contract.tsx",
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const sources: string[] = [];
    const addStringLiteral = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) sources.push(node.text);
    };

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) addStringLiteral(node.moduleSpecifier);
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        addStringLiteral(node.moduleReference.expression);
      }
      // Dynamic import/require calls with non-string expressions are intentionally ignored.
      if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === "require") ||
          node.expression.kind === ts.SyntaxKind.ImportKeyword)
      ) {
        sources.push(node.arguments[0].text);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        addStringLiteral(node.argument.literal);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return sources;
  }

  function isDirectLoaderSource(source: string, targetFile: string): boolean {
    if (!source.startsWith(".")) return false;

    const resolvedSource = path.resolve(path.dirname(targetFile), source);
    const loaderDirectory = path.resolve("server/lib/data-loader");
    const facadePath = path.resolve("server/lib/dataLoader");
    return (
      resolvedSource.startsWith(`${loaderDirectory}${path.sep}`) && resolvedSource !== facadePath
    );
  }

  it("keeps page and quarterly projection loader imports on the facade only", () => {
    const page = fs.readFileSync("src/app/page.tsx", "utf8");
    const quarterlyProjection = fs.readFileSync(
      "server/lib/view-models/quarterlyProjection.ts",
      "utf8",
    );

    const pagePath = "src/app/page.tsx";
    const quarterlyProjectionPath = "server/lib/view-models/quarterlyProjection.ts";
    const pageSources = extractModuleSources(page);
    const quarterlyProjectionSources = extractModuleSources(quarterlyProjection);

    expect(pageSources).toContain("../../server/lib/dataLoader");
    expect(quarterlyProjectionSources).toContain("../dataLoader");
    expect(pageSources.some((source) => isDirectLoaderSource(source, pagePath))).toBe(false);
    expect(
      quarterlyProjectionSources.some((source) =>
        isDirectLoaderSource(source, quarterlyProjectionPath),
      ),
    ).toBe(false);
  });

  it("only flags relative server/lib/data-loader imports, excluding package names and non-string dynamic imports", () => {
    const sources = extractModuleSources(`
      import "some-data-loader-package";
      import("some-data-loader-package");
      import(loaderName);
      require(loaderName);
      import "../../server/lib/data-loader/cpi";
      import "../../server/lib/dataLoader";
    `);

    expect(sources).toContain("some-data-loader-package");
    expect(sources).not.toContain("loaderName");
    expect(isDirectLoaderSource("some-data-loader-package", "src/app/page.tsx")).toBe(false);
    expect(isDirectLoaderSource("../../server/lib/data-loader/cpi", "src/app/page.tsx")).toBe(true);
    expect(isDirectLoaderSource("../../server/lib/dataLoader", "src/app/page.tsx")).toBe(false);
  });
});
