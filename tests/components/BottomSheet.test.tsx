import { afterEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { BottomSheet } from "../../src/app/components/BottomSheet";

// CpiChart.module.css のモック（CSS Module）
vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_: unknown, key: string) => key }),
}));

function installPointerCapture(
  target: HTMLElement,
  options: { setThrows?: boolean; hasCapture?: boolean; releaseThrows?: boolean } = {},
) {
  const methods = {
    set: vi.fn(() => {
      if (options.setThrows) throw new Error("capture unavailable");
    }),
    has: vi.fn(() => options.hasCapture ?? true),
    release: vi.fn(() => {
      if (options.releaseThrows) throw new Error("capture already released");
    }),
  };
  Object.defineProperties(target, {
    setPointerCapture: { configurable: true, value: methods.set },
    hasPointerCapture: { configurable: true, value: methods.has },
    releasePointerCapture: { configurable: true, value: methods.release },
  });
  return methods;
}

function swipe(
  handle: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  pointerId = 7,
  pointerType: "touch" | "pen" | "mouse" = "touch",
) {
  fireEvent.pointerDown(handle, {
    pointerId,
    pointerType,
    clientX: start.x,
    clientY: start.y,
  });
  fireEvent.pointerUp(handle, {
    pointerId,
    pointerType,
    clientX: end.x,
    clientY: end.y,
  });
}

describe("BottomSheet", () => {
  const title = "テストタイトル";
  const onClose = vi.fn();

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("touch swipe expands, collapses, and closes a compact sheet from its drag handle", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose} compact>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const handle = dialog.firstElementChild as HTMLElement;
    const capture = installPointerCapture(handle);

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 40 });
    expect(dialog.className).toContain("bottomSheetExpanded");
    expect(onClose).not.toHaveBeenCalled();

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 160 });
    expect(dialog.className).not.toContain("bottomSheetExpanded");
    expect(onClose).not.toHaveBeenCalled();

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 160 }, 8, "pen");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(capture.set).toHaveBeenCalledWith(7);
    expect(capture.set).toHaveBeenCalledWith(8);
    expect(capture.release).toHaveBeenCalledTimes(3);
  });

  it("closes a regular sheet on a downward vertical swipe", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const handle = dialog.firstElementChild as HTMLElement;
    const capture = installPointerCapture(handle);

    swipe(handle, { x: 80, y: 100 }, { x: 80, y: 160 });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(capture.release).toHaveBeenCalledWith(7);
  });

  it("ignores mouse, horizontal, short, and scrolled gestures", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose} compact>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const handle = dialog.firstElementChild as HTMLElement;
    installPointerCapture(handle);

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 160 }, 7, "mouse");
    swipe(handle, { x: 100, y: 100 }, { x: 170, y: 150 });
    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 130 });
    Object.defineProperty(dialog, "scrollTop", { configurable: true, value: 12 });
    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 40 });

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.className).not.toContain("bottomSheetExpanded");
  });

  it("ignores a non-compact upward swipe and a pointer-up from a different pointer", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const handle = dialog.firstElementChild as HTMLElement;
    installPointerCapture(handle);

    fireEvent.pointerDown(handle, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerCancel(handle, { pointerId: 9 });
    fireEvent.pointerUp(handle, {
      pointerId: 9,
      pointerType: "touch",
      clientX: 100,
      clientY: 160,
    });
    fireEvent.pointerUp(handle, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 100,
      clientY: 40,
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.className).not.toContain("bottomSheetExpanded");
  });

  it("covers swipe boundaries, repeated upward movement, and a capture already released by the browser", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose} compact>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const handle = dialog.firstElementChild as HTMLElement;
    const capture = installPointerCapture(handle, { hasCapture: false });

    // A 48px vertical delta qualifies; once expanded, another upward swipe is a no-op.
    swipe(handle, { x: 10, y: 100 }, { x: 10, y: 52 });
    expect(dialog.className).toContain("bottomSheetExpanded");
    swipe(handle, { x: 10, y: 100 }, { x: 10, y: 52 });
    expect(dialog.className).toContain("bottomSheetExpanded");

    // 47px is below threshold, and an exactly 1.25:1 diagonal is not vertical.
    swipe(handle, { x: 10, y: 100 }, { x: 10, y: 53 });
    swipe(handle, { x: 10, y: 100 }, { x: 70, y: 52 });
    expect(dialog.className).toContain("bottomSheetExpanded");
    expect(capture.has).toHaveBeenCalledTimes(4);
    expect(capture.release).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("treats a null scroll position as being at the top", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose} compact>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    Object.defineProperty(dialog, "scrollTop", { configurable: true, value: null });
    const handle = dialog.firstElementChild as HTMLElement;
    installPointerCapture(handle);

    swipe(handle, { x: 10, y: 100 }, { x: 10, y: 40 });

    expect(dialog.className).toContain("bottomSheetExpanded");
  });

  it("clears matching swipe state on pointer cancel and lost capture", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const handle = screen.getByRole("dialog").firstElementChild as HTMLElement;
    const capture = installPointerCapture(handle);
    fireEvent.pointerDown(handle, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerCancel(handle, { pointerId: 7 });
    fireEvent.pointerUp(handle, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 100,
      clientY: 180,
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    const lostCapture = new Event("lostpointercapture", { bubbles: true });
    Object.defineProperty(lostCapture, "pointerId", { value: 8 });
    fireEvent(handle, lostCapture);
    fireEvent.pointerUp(handle, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 100,
      clientY: 180,
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(capture.release).toHaveBeenCalledTimes(2);
  });

  it("clears swipe state if capture acquisition fails", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose} compact>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    const handle = dialog.firstElementChild as HTMLElement;
    const capture = installPointerCapture(handle, { setThrows: true });

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 40 });

    expect(capture.set).toHaveBeenCalledWith(7);
    expect(capture.has).not.toHaveBeenCalled();
    expect(dialog.className).not.toContain("bottomSheetExpanded");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tolerates a lost capture when releasing it", () => {
    render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const handle = screen.getByRole("dialog").firstElementChild as HTMLElement;
    const capture = installPointerCapture(handle, { releaseThrows: true });

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 160 });

    expect(capture.release).toHaveBeenCalledWith(7);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not start a swipe while the sheet is in its exit state", () => {
    const { container, rerender } = render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={false} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    const handle = container.querySelector(
      '[role="dialog"] [class*="bottomSheetDragHandle"]',
    ) as HTMLElement;
    const capture = installPointerCapture(handle);

    swipe(handle, { x: 100, y: 100 }, { x: 100, y: 160 });

    expect(capture.set).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the closing sheet mounted for 180ms and removes it when the exit timer ends", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={false} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );

    const exitingDialog = container.querySelector('[role="dialog"]');
    expect(exitingDialog).not.toBeNull();
    expect(exitingDialog?.getAttribute("aria-hidden")).toBe("true");
    expect(exitingDialog?.hasAttribute("inert")).toBe(true);

    act(() => vi.advanceTimersByTime(180));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
  });

  it("cancels the exit timer when the sheet reopens", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={false} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={true} title={title} onClose={onClose}>
        <div>コンテンツ</div>
      </BottomSheet>,
    );

    act(() => vi.advanceTimersByTime(180));

    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-hidden")).toBeNull();
    expect(container.querySelector('[role="dialog"]')?.className).not.toContain(
      "bottomSheetClosing",
    );
    vi.useRealTimers();
  });
});
