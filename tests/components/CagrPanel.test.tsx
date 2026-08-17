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

  it("T1: 初期状態でシートは閉じ、3 select および「計算する」ボタンが DOM に存在しない", () => {
    render(<CagrPanel {...defaultProps} />);
    expect(screen.queryByLabelText("開始年:")).toBeNull();
    expect(screen.queryByLabelText("終了年:")).toBeNull();
    expect(screen.queryByLabelText("評価月:")).toBeNull();
    expect(screen.queryByRole("button", { name: "計算する" })).toBeNull();
  });

  it("T2: トリガーが「年率上昇率（CAGR）を計算」で描画され、aria-label に現在値を含む", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2010} cagrEndYear={2025} cagrMonth={3} />);
    const trigger = screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    expect(trigger.textContent).toContain("年率上昇率（CAGR）を計算");
    expect(trigger.getAttribute("aria-label")).toContain("2010年03月");
    expect(trigger.getAttribute("aria-label")).toContain("2025年03月");
  });

  it("T3: トリガークリックで3 select と「計算する」ボタンが同時に表示される", () => {
    render(<CagrPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    expect(screen.getByLabelText("開始年:")).not.toBeNull();
    expect(screen.getByLabelText("終了年:")).not.toBeNull();
    expect(screen.getByLabelText("評価月:")).not.toBeNull();
    expect(screen.getByRole("button", { name: "計算する" })).not.toBeNull();
  });

  it("T4: シート内 select 変更で setter が呼ばれ、シートは開いたまま", () => {
    render(<CagrPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    fireEvent.change(screen.getByLabelText("開始年:"), { target: { value: "2010" } });
    expect(defaultProps.setCagrStartYear).toHaveBeenCalledWith(2010);
    // シートは開いたまま: select がまだ DOM にある
    expect(screen.getByLabelText("終了年:")).not.toBeNull();
  });

  it("T5: 開始年 select で cagrEndYear より後の年が disabled になる", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2015} cagrEndYear={2020} />);
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    const startSelect = screen.getByLabelText("開始年:");
    const options = Array.from(startSelect.querySelectorAll("option"));
    const disabledYears = options.filter((o) => o.disabled).map((o) => o.textContent);
    expect(disabledYears).toContain("2021年");
    expect(disabledYears).toContain("2022年");
    expect(disabledYears).not.toContain("2019年");
  });

  it("T6: 「計算する」はシート内にあり、cagrStartYear === cagrEndYear のとき disabled", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2020} cagrEndYear={2020} />);
    // シートを開く
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    const calcBtn = screen.getByRole("button", { name: "計算する" });
    expect(calcBtn).not.toBeNull();
    expect(calcBtn.getAttribute("disabled")).not.toBeNull();
  });

  it("T6b: cagrStartYear !== cagrEndYear のとき「計算する」は enabled", () => {
    render(<CagrPanel {...defaultProps} cagrStartYear={2015} cagrEndYear={2020} />);
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    const calcBtn = screen.getByRole("button", { name: "計算する" });
    expect(calcBtn.getAttribute("disabled")).toBeNull();
  });

  it("T15: cagrResult が非 null のときシート内に結果が表示され、シート外には表示されない", () => {
    render(<CagrPanel {...defaultProps} cagrResult={0.0523} />);
    // シート外に結果がない
    expect(screen.queryByText("5.23%")).toBeNull();
    // シートを開く
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    // シート内に結果がある
    expect(screen.getByText("5.23%")).not.toBeNull();
  });

  it("T16: cagrError が非 null のときシート内にエラーが表示される", () => {
    render(<CagrPanel {...defaultProps} cagrError="期間を選択してください" />);
    // シート外にエラーがない
    expect(screen.queryByText("期間を選択してください")).toBeNull();
    // シートを開く
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    // シート内にエラーがある
    expect(screen.getByText("期間を選択してください")).not.toBeNull();
  });

  it("T17: sectionId prop を渡さなくても型・描画が成立する", () => {
    // sectionId なしでレンダリング（型エラーがあればコンパイル時に失敗）
    const { container } = render(<CagrPanel {...defaultProps} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("T19: トリガーの可視テキストが「年率上昇率（CAGR）を計算」のままであること", () => {
    render(<CagrPanel {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    // textContent に SVG の invisible テキストが含まれないことを確認
    expect(trigger.textContent?.trim()).toBe("年率上昇率（CAGR）を計算");
  });

  it('T20: アイコン <svg> が aria-hidden="true" を持ち、アクセシブル名に混入しないこと', () => {
    render(<CagrPanel {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    const svg = trigger.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });
});
