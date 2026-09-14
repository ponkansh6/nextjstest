// @bun-environment happy-dom
import { createElement } from "react";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import independentFixture from "../fixtures/chart-parity-independent.json";
import CpiChart from "@/app/components/CpiChart";
import { ChartExportButton } from "@/app/components/ChartExportButton";
import { setupUiMocks } from "../utils/ui-mocks";
import "../utils/recharts-mock";

vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const params = new URLSearchParams(window.location.search);
    return {
      get: (key: string) => params.get(key),
    };
  },
}));

setupUiMocks();

type FixtureSection = {
  keys: string[];
  headers: string[];
  rows: Record<string, unknown>[];
  expected: string[][];
};
const matrix = independentFixture.matrix as Record<string, FixtureSection>;
const publicQuarterly = (section: FixtureSection): FixtureSection => ({
  ...section,
  expected: section.expected.map((row) =>
    row[0] === "2017年10-12月"
      ? ["2017Q4", ...row.slice(1)]
      : row[0] === "2018年1-3月"
        ? ["2018Q1", ...row.slice(1)]
        : row,
  ),
});
const CONTRACT = {
  ids: [
    "section-cpi-major",
    "section-stacked",
    "section-consumption-nominal",
    "section-consumption-real",
    "section-earnings",
    "section-residual",
    "section-new-graph",
  ],
  sections: [
    matrix.cpi,
    matrix.stacked,
    publicQuarterly(matrix.nominal),
    publicQuarterly(matrix.real),
    matrix.earnings,
    matrix.residual,
    matrix.comparison,
  ],
} as const;
const input = () => {
  const quarterly = (rows: Record<string, unknown>[]) =>
    rows.map((row) => {
      const label = row.label;
      const publicLabel =
        typeof label === "string" && label.includes("年")
          ? label.replace(
              /^([0-9]{4})年(1-3|4-6|7-9|10-12)月$/,
              (_, year, months) =>
                `${year}Q${({ "1-3": 1, "4-6": 2, "7-9": 3, "10-12": 4 } as Record<string, number>)[months]}`,
            )
          : label;
      return { ...row, label: publicLabel, 年月: publicLabel };
    });
  return {
    data: matrix.cpi.rows,
    // Spending quarterly props expose only the regular public keys.
    quarterlyNominalData: quarterly(matrix.nominal.rows),
    quarterlyRealData: quarterly(matrix.real.rows),
    totalEarningData: matrix.earnings.rows,
  };
};

function normalizeMissingCell(value: string): string {
  return value === "-" ? "" : value;
}

async function renderChart() {
  window.__MOUNT_ALL__ = true;
  const rendered = render(
    createElement(CpiChart, { ...input(), maxCpiDate: { year: 2018, month: 1 } } as never),
  );
  await waitFor(() =>
    expect(rendered.container.querySelectorAll('[data-testid="chart-data-contract"]')).toHaveLength(
      7,
    ),
  );
  return rendered;
}

function contractFor(container: HTMLElement, id: string): HTMLElement {
  const section = container.querySelector(`#${id}`);
  const contract = section?.querySelector('[data-testid="chart-data-contract"]');
  if (!contract) throw new Error(`Missing chart contract for ${id}`);
  return contract as HTMLElement;
}

function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  if (!text.endsWith("\r\n")) throw new Error("CSV must end with CRLF");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  const push = () => {
    if (row.length === 0 && cell === "") throw new Error("CSV contains an empty row");
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
    afterQuote = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else if (c === "\r") {
        if (text[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        cell += "\r\n";
        i++;
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else cell += c;
    } else if (afterQuote) {
      if (c === ",") {
        row.push(cell);
        cell = "";
        afterQuote = false;
      } else if (c === "\r") {
        if (text[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        i++;
        push();
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else throw new Error("invalid character after quote");
    } else if (c === '"') {
      if (cell !== "") throw new Error("quote in an unquoted CSV field");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r") {
      if (text[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
      i++;
      push();
    } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
    else cell += c;
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (rows.some((r) => r.length === 0 || r.every((v) => v === "")))
    throw new Error("extra empty row");
  const columns = rows[0]?.length ?? 0;
  if (columns === 0 || rows.some((r) => r.length !== columns))
    throw new Error("CSV column count mismatch");
  return rows;
}

describe("Phase 4-4 real chart/table/CSV parity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  it("compares all seven public key sets, periods, and every table/CSV cell", async () => {
    const { container } = await renderChart();
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blobs.push(b as Blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    for (let i = 0; i < CONTRACT.ids.length; i++) {
      const table = container.querySelector(`#data-table-${CONTRACT.ids[i]}`) as HTMLElement;
      const contract = contractFor(container, CONTRACT.ids[i]);
      const section = CONTRACT.sections[i];
      expect(contract).toBeTruthy();
      expect(JSON.parse(contract.dataset.series ?? "[]")).toEqual(section.keys);
      expect(contract.querySelectorAll("[data-chart-data-row]").length).toBe(
        section.expected.length,
      );
      expect(
        [...contract.querySelectorAll("[data-chart-data-row]")].map((row) => [
          row.getAttribute("data-period") ?? "",
          ...[...row.querySelectorAll("[data-series-key]")].map((cell) =>
            cell.getAttribute("data-value-type") === "number"
              ? Number(cell.getAttribute("data-value")).toFixed(2)
              : "",
          ),
        ]),
      ).toEqual(section.expected);
      (table.querySelector("summary") as HTMLElement).click();
      const rows = within(table).getAllByRole("row");
      expect(
        rows.every(
          (r) =>
            within(r).getAllByRole(r === rows[0] ? "columnheader" : "cell").length ===
            section.keys.length + 1,
        ),
      ).toBe(true);
      expect(
        within(rows[0])
          .getAllByRole("columnheader")
          .map((cell) => cell.textContent),
      ).toEqual(["年月", ...section.headers]);
      expect(
        rows.slice(1).map((r) =>
          within(r)
            .getAllByRole("cell")
            .map((c) => normalizeMissingCell(c.textContent ?? "")),
        ),
      ).toEqual(section.expected);
      (within(table).getByRole("button", { name: /CSVでダウンロード/ }) as HTMLElement).click();
    }
    expect(blobs).toHaveLength(7);
    for (let i = 0; i < blobs.length; i++) {
      const raw = await blobs[i].text();
      expect(raw.replace(/^\uFEFF/, "").endsWith("\r\n")).toBe(true);
      expect([...raw.matchAll(/\r\n|\r|\n/g)].every(([ending]) => ending === "\r\n")).toBe(true);
      const rows = parseCsv(raw);
      const section = CONTRACT.sections[i];
      expect(rows[0]).toEqual(["年月", ...section.headers]);
      expect(rows.slice(1)).toEqual(section.expected);
      expect(rows.every((r) => r.length === section.keys.length + 1)).toBe(true);
    }
  });
  it("keeps raw quarterly keys private and publishes YYYYQn boundary labels", async () => {
    const { container } = await renderChart();
    for (const mode of ["nominal", "real"] as const) {
      const table = container.querySelector(
        `#data-table-section-consumption-${mode}`,
      ) as HTMLElement;
      const section = matrix[mode];
      const rows = [...table.querySelectorAll("tbody tr")].map((row) =>
        [...row.querySelectorAll("th,td")].map((cell) =>
          normalizeMissingCell(cell.textContent?.trim() ?? ""),
        ),
      );
      expect(rows).toEqual(publicQuarterly(section).expected);
      expect(rows.map((row) => row[0])).toEqual(["2017Q4", "2018Q1"]);
    }
  });

  it("records the independent edge-case basis without deriving expectations from app constants", () => {
    expect(matrix.cpi.rows.some((row) => row["残差"] === null)).toBe(true);
    expect(
      independentFixture.cases["nominal-real"].boundary.map((label) =>
        label === "2017年10-12月" ? "2017Q4" : label === "2018年1-3月" ? "2018Q1" : label,
      ),
    ).toEqual(["2017Q4", "2018Q1"]);
  });

  it("round-trips the independent CSV special-character value through the real export button", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const value = independentFixture.cases["csv-special"].value;
    render(
      createElement(ChartExportButton, {
        title: "特殊文字",
        data: [{ 年月: value, 特殊文字: 1 }],
        keys: ["特殊文字"],
        headers: ["特殊文字"],
      }),
    );
    (
      within(document.body).getByRole("button", { name: /CSVでダウンロード/ }) as HTMLElement
    ).click();
    expect(blobs).toHaveLength(1);
    const raw = await blobs[0].text();
    expect(raw.replace(/^\uFEFF/, "").endsWith("\r\n")).toBe(true);
    expect(parseCsv(raw)).toEqual([
      ["年月", "特殊文字"],
      [value, "1.00"],
    ]);
  });

  it("adv=1 keeps the unsupported Spending extension private", async () => {
    const modes = ["nominal", "real"] as const;
    const regular: Record<string, { contract: string[][]; table: string[][]; csv: string[][] }> =
      {};
    const surface = (container: HTMLElement, mode: "nominal" | "real") => {
      const contract = contractFor(container, `section-consumption-${mode}`);
      const rows = [...contract.querySelectorAll("[data-chart-data-row]")].map((row) => [
        row.getAttribute("data-period") ?? "",
        ...[...row.querySelectorAll("[data-series-key]")].map((cell) =>
          cell.getAttribute("data-value-type") === "number"
            ? Number(cell.getAttribute("data-value")).toFixed(2)
            : "",
        ),
      ]);
      const table = container.querySelector(
        `#data-table-section-consumption-${mode}`,
      ) as HTMLElement;
      (table.querySelector("summary") as HTMLElement).click();
      const tableRows = [...table.querySelectorAll("tr")].map((row) =>
        [...row.querySelectorAll("th,td")].map((cell) => cell.textContent?.trim() ?? ""),
      );
      return { contract: rows, table: tableRows.slice(1), csv: [] };
    };
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    window.history.replaceState({}, "", "/");
    let rendered = await renderChart();
    for (let i = 0; i < modes.length; i++) {
      regular[modes[i]] = surface(rendered.container, modes[i]);
      (
        rendered.container
          .querySelector(`#data-table-section-consumption-${modes[i]}`)!
          .querySelector('button[aria-label*="CSV"]') as HTMLElement
      ).click();
    }
    for (let i = 0; i < modes.length; i++) regular[modes[i]].csv = parseCsv(await blobs[i].text());
    cleanup();
    blobs.length = 0;
    window.history.replaceState({}, "", "/?adv=1");
    rendered = await renderChart();
    for (let i = 0; i < modes.length; i++) {
      const current = surface(rendered.container, modes[i]);
      const fixture = matrix[modes[i]];
      expect(current.contract).toEqual(regular[modes[i]].contract);
      expect(current.table.map((row) => row.map(normalizeMissingCell))).toEqual(
        regular[modes[i]].table.map((row) => row.map(normalizeMissingCell)),
      );
      expect(
        JSON.parse(
          contractFor(rendered.container, `section-consumption-${modes[i]}`).getAttribute(
            "data-series",
          )!,
        ),
      ).toEqual(fixture.keys);
      (
        rendered.container
          .querySelector(`#data-table-section-consumption-${modes[i]}`)!
          .querySelector('button[aria-label*="CSV"]') as HTMLElement
      ).click();
    }
    expect(blobs).toHaveLength(2);
    for (let i = 0; i < modes.length; i++) {
      const raw = await blobs[i].text();
      expect(raw.replace(/^\uFEFF/, "").endsWith("\r\n")).toBe(true);
      const rows = parseCsv(raw);
      expect(rows).toEqual(regular[modes[i]].csv);
    }
  });

  it("rejects LF, missing final CRLF, malformed quotes, mismatched columns, and empty rows", () => {
    expect(() => parseCsv("a,b\na,b\n")).toThrow();
    expect(() => parseCsv("a,b\r\na,b")).toThrow();
    expect(() => parseCsv('a,b\r\n"unterminated,b\r\n')).toThrow();
    expect(() => parseCsv('a,b\r\n"bad"x,c\r\n')).toThrow();
    expect(() => parseCsv("a,b\r\na\r\n")).toThrow();
    expect(() => parseCsv("a,b\r\na,b\r\n\r\n")).toThrow();
  });
});
