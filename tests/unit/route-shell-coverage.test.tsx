import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../../src/app/error";
import Loading from "../../src/app/loading";

vi.mock("../../src/app/page.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));

describe("route error and loading UI", () => {
  it("renders the error message and invokes retry when requested", () => {
    const retry = vi.fn();
    render(<ErrorBoundary error={new Error("load failed")} retry={retry} />);

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("heading", { name: "データを表示できませんでした" })).toBeDefined();
    expect(
      screen.getByText(
        "読み込みに失敗しました。通信やデータソースを確認して、もう一度お試しください。",
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("announces loading status and marks the skeleton as decorative", () => {
    const { container } = render(<Loading />);

    expect(container.querySelector("main")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("経済指標データを読み込み中です");
    expect(screen.getByRole("heading", { name: "物価・賃金・消費の推移" })).toBeDefined();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[aria-hidden="true"] span').length).toBeGreaterThan(0);
  });
});
