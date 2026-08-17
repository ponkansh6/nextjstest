import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CagrPanel } from "../../src/app/components/CagrPanel";

vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_: unknown, key: string) => key }),
}));

vi.mock("../../src/lib/chartConstants", () => ({
  MIN_DISPLAY_YEAR: 2005,
}));

const allYears = Array.from({ length: 22 }, (_, i) => i + 2005);

const defaultProps = {
  allYears,
  cagrStartYear: 2000,
  cagrEndYear: 2025,
  cagrMonth: 1,
  cagrResult: null as number | null,
  cagrError: null as string | null,
  setCagrStartYear: vi.fn(),
  setCagrEndYear: vi.fn(),
  setCagrMonth: vi.fn(),
  calculateCAGR: vi.fn(),
};

describe("CagrPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T1: 初期状態でシートは閉じており、開始年/終了年/評価月のselectがDOMに存在しない", () => {
    render(<CagrPanel {...defaultProps} />);
    expect(screen.queryByLabelText("開始年:")).toBeNull();
    expect(screen.queryByLabelText("終了年:")).toBeNull();
    expect(screen.queryByLabelText("評価月:")).toBeNull();
  });

  it("T2: トリガーボタンのラベルが現在値を反映する", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2000} cagrEndYear={2025} cagrMonth={1} />);
    const trigger = screen.getByRole("button", { name: /CAGRの期間・評価月を変更/ });
    expect(trigger.textContent).toContain("2000年01月");
    expect(trigger.textContent).toContain("2025年01月");
  });

  it("T3: トリガーボタンをクリックすると3つのselectが表示される", () => {
    render(<CagrPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /CAGRの期間・評価月を変更/ }));
    expect(screen.getByLabelText("開始年:")).not.toBeNull();
    expect(screen.getByLabelText("終了年:")).not.toBeNull();
    expect(screen.getByLabelText("評価月:")).not.toBeNull();
  });

  it("T4: シート内の開始年select変更でsetCagrStartYearが呼ばれ、シートは開いたままである", () => {
    render(<CagrPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /CAGRの期間・評価月を変更/ }));
    fireEvent.change(screen.getByLabelText("開始年:"), { target: { value: "2010" } });
    expect(defaultProps.setCagrStartYear).toHaveBeenCalledWith(2010);
    // シートは開いたまま: selectがまだDOMにある
    expect(screen.getByLabelText("終了年:")).not.toBeNull();
  });

  it("T5: 開始年selectでcagrEndYearより後の年がdisabledになる", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2015} cagrEndYear={2020} />);
    fireEvent.click(screen.getByRole("button", { name: /CAGRの期間・評価月を変更/ }));
    const startSelect = screen.getByLabelText("開始年:");
    const options = Array.from(startSelect.querySelectorAll("option"));
    const disabledYears = options.filter((o) => o.disabled).map((o) => o.textContent);
    expect(disabledYears).toContain("2021年");
    expect(disabledYears).toContain("2022年");
    expect(disabledYears).not.toContain("2019年");
  });

  it("T6: 「計算する」ボタンはシート外に常時表示され、cagrStartYear === cagrEndYearのときdisabled", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2020} cagrEndYear={2020} />);
    const calcBtn = screen.getByRole("button", { name: "計算する" });
    expect(calcBtn).not.toBeNull();
    expect(calcBtn.getAttribute("disabled")).not.toBeNull();
  });

  it("T6b: cagrStartYear !== cagrEndYearのとき「計算する」はenabled", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2015} cagrEndYear={2020} />);
    const calcBtn = screen.getByRole("button", { name: "計算する" });
    expect(calcBtn.getAttribute("disabled")).toBeNull();
  });
});
