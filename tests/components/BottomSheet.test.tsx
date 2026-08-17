import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomSheet } from "../../src/app/components/BottomSheet";

// CpiChart.module.css のモック（CSS Module）
vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_: unknown, key: string) => key }),
}));

describe("BottomSheet", () => {
  const title = "テストタイトル";
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it("T7: open=false のとき何もレンダリングされない", () => {
    const { container } = render(
      <BottomSheet open={false} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("T8a: 背景クリックで onClose が呼ばれる", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const backdrop = screen.getByRole("dialog").previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T8b: ✕ クリックで onClose が呼ばれる", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T9: Escape キー押下で onClose が呼ばれる", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("role=dialog と aria-modal が設定されている", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(title);
  });
});
