import { describe, it, expect, vi } from "vitest";
import React from "react";
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

  it("T10: open になると最初のフォーカス可能要素（✕ ボタン）にフォーカスが当たる", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    // useFocusTrap が開いたとき最初のフォーカス可能要素にフォーカスする
    // ダイアログ内の最初の button は ✕ ボタン
    const dialog = screen.getByRole("dialog");
    const closeButton = dialog.querySelector("button") as HTMLElement;
    expect(document.activeElement).toBe(closeButton);
  });

  it("T11: Tab キーでフォーカスがダイアログ内で循環する", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <button type="button">子ボタン</button>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const closeButton = dialog.querySelector("button") as HTMLElement;
    const childButton = screen.getByRole("button", { name: "子ボタン" });
    // 初期フォーカスは ✕ ボタン
    expect(document.activeElement).toBe(closeButton);
    // Tab → 子ボタン
    fireEvent.keyDown(document, { key: "Tab" });
    // Tab → 最後なので ✕ ボタンへ循環する
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    // Shift+Tab → 最後（子ボタン）へ
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(childButton);
  });

  it("T12: open → close でフォーカスがトリガー要素へ戻る", () => {
    // フォーカス復帰テスト: ボタンにフォーカスしてから開く
    const Trigger = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            開く
          </button>
          <BottomSheet open={open} title={title} onClose={() => setOpen(false)}>
            <div>コンテンツ</div>
          </BottomSheet>
        </>
      );
    };
    render(<Trigger />);
    const triggerBtn = screen.getByRole("button", { name: "開く" });
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);
    fireEvent.click(triggerBtn);
    // シートが開く（✕ にフォーカス）
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toBeNull();
    // Escape で閉じる
    fireEvent.keyDown(document, { key: "Escape" });
    // フォーカスがトリガーへ戻る
    expect(document.activeElement).toBe(triggerBtn);
  });

  it("T18: compact 指定時に bottomSheetCompact クラスが付与され、非指定時は付かない", () => {
    const { rerender } = render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).not.toContain("bottomSheetCompact");

    rerender(
      <BottomSheet open={true} title={title} onClose={onClose} compact>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialogCompact = screen.getByRole("dialog");
    expect(dialogCompact.className).toContain("bottomSheetCompact");
  });
});
