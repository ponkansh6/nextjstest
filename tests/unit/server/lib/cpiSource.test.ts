import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import {
  buildCpiSourceCandidates,
  selectCpiPair,
  validate2025Metadata,
} from "../../../../server/lib/data-loader/cpiSource";
import { getCpiDataStatus } from "../../../../server/lib/data-loader/cpi";
import { loadCpiData } from "../../../../server/lib/dataLoader";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

function build2025Fixture() {
  const series = ["総合", ...Array.from({ length: 77 }, (_, index) => `系列${index + 1}`)];
  const rows = ["年月," + series.join(",")];
  for (let offset = 0; offset < 679; offset += 1) {
    const date = new Date(Date.UTC(1970, offset, 1));
    rows.push(
      `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月,${series.map(() => "100").join(",")}`,
    );
  }
  const csv = rows.join("\n");
  return {
    csv,
    contribution: `類・品目,${series.join(",")}\nウエイト(2025年指数以降),10000,${series
      .slice(1)
      .map(() => "100")
      .join(",")}`,
    metadata: JSON.stringify({
      status: "ready",
      baseYear: 2025,
      indexFile: "cpi_data2025_long.csv",
      contributionFile: "contribution2025.csv",
      csvSha256: createHash("sha256").update(csv).digest("hex"),
      period: { start: "1970年1月", end: "2026年7月", monthlyRows: 679 },
      seriesCount: 78,
    }),
  };
}

describe("cpiSource boundary", () => {
  beforeEach(() => vi.resetAllMocks());

  it("builds the 2025 candidate before the 2020 fallback candidate", () => {
    const source = buildCpiSourceCandidates();

    expect(
      source.pairs.map(({ pair, mainPath, contributionPath }) => [
        pair,
        mainPath,
        contributionPath,
      ]),
    ).toEqual([
      [
        "2025",
        expect.stringContaining("cpi_data2025_long.csv"),
        expect.stringContaining("contribution2025.csv"),
      ],
      [
        "2020",
        expect.stringContaining("cpi_data.csv"),
        expect.stringContaining("contribution.csv"),
      ],
    ]);
    expect(source.metadata).toContain("cpi_data2025_long.metadata.json");
  });

  it.each([
    ["missing", undefined],
    ["invalid", "not json"],
  ])("rejects %s 2025 metadata", (_label, content) => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(content !== undefined);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(content);

    expect(validate2025Metadata("metadata.json")).toEqual(
      content === undefined ? "missing 2025 metadata" : "invalid 2025 metadata",
    );
  });

  it("selects a valid 2025 pair before consulting the fallback", () => {
    const fixture = build2025Fixture();
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if (filePath.includes("cpi_data2025_long.csv")) return fixture.csv;
      if (filePath.includes("contribution2025.csv")) return fixture.contribution;
      return fixture.metadata;
    });

    expect(selectCpiPair()).toMatchObject({ pair: { pair: "2025", baseYear: 2025 } });
    expect(fs.readFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining("cpi_data.csv"),
      "utf8",
    );
  });

  it("falls back to a valid 2020 pair when the 2025 pair is invalid", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if (filePath.includes("cpi_data2025_long.metadata.json")) return "invalid";
      if (filePath.includes("cpi_data.csv")) return "年月,総合\n2020年1月,100";
      if (filePath.includes("contribution.csv"))
        return "類・品目,総合\nウエイト(2020年指数以降),10000";
      return "年月,総合\n2025年1月,100";
    });

    expect(selectCpiPair()).toMatchObject({ pair: { pair: "2020", baseYear: 2020 } });
  });

  it("fails closed when both pairs are invalid", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("invalid");

    expect(selectCpiPair()).toMatchObject({ baseYear: null, pair: null, valid: false });
  });

  it("keeps the public CPI loader and status aligned for a valid 2025 source", async () => {
    const fixture = build2025Fixture();
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if (filePath.includes("cpi_data2025_long.csv")) return fixture.csv;
      if (filePath.includes("contribution2025.csv")) return fixture.contribution;
      return fixture.metadata;
    });

    const [data, status] = await Promise.all([loadCpiData(), getCpiDataStatus()]);

    expect(data).not.toEqual([]);
    expect(status).toMatchObject({ baseYear: 2025, pair: "2025", valid: true });
  });

  it("keeps the public CPI loader and status aligned on invalid 2025 to 2020 fallback", async () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
      if (filePath.includes("cpi_data2025_long.metadata.json")) return "invalid";
      if (filePath.includes("cpi_data2025_long.csv")) return "年月,総合\n2025年1月,100";
      if (filePath.includes("contribution2025.csv"))
        return "類・品目,総合\nウエイト(2025年指数以降),10000";
      if (filePath.includes("cpi_data.csv")) return "年月,総合\n2020年1月,100";
      if (filePath.includes("contribution.csv"))
        return "類・品目,総合\nウエイト(2020年指数以降),10000";
      return "";
    });

    const [data, status] = await Promise.all([loadCpiData(), getCpiDataStatus()]);

    expect(data).toMatchObject([{ 年月: "2020年1月", 総合: 100 }]);
    expect(data).not.toEqual([]);
    expect(status).toMatchObject({ baseYear: 2020, pair: "2020", valid: true });
  });

  it("returns empty public CPI data with an invalid status when neither source is valid", async () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("invalid");

    const [data, status] = await Promise.all([loadCpiData(), getCpiDataStatus()]);

    expect(data).toEqual([]);
    expect(status).toMatchObject({ baseYear: null, pair: null, valid: false });
  });
});
