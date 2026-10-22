import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const motionPreference = vi.hoisted(() => ({ reduced: false as boolean | null }));

vi.mock("motion/react", async () => {
  const ReactModule = await import("react");
  const MotionDiv = ReactModule.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      onAnimationComplete?: () => void;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }
  >(({ onAnimationComplete, initial: _initial, animate: _animate, transition, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      data-motion-duration={String((transition as { duration?: number } | undefined)?.duration)}
      onAnimationEnd={onAnimationComplete}
    />
  ));
  return {
    MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MotionDiv },
    useReducedMotion: () => motionPreference.reduced,
  };
});

vi.mock("../../src/app/ui-experiments/page.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock("../../src/app/ui-experiments/dialog-options.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock("../../src/app/ui-experiments/base-drawer.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));

import UIExperimentsPage from "../../src/app/ui-experiments/page";
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from "../../src/app/ui-experiments/BaseDrawer";
import DialogOptionsDemo from "../../src/app/ui-experiments/DialogOptionsDemo";
import MotionDemo from "../../src/app/ui-experiments/MotionDemo";

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("UI experiments page interactions", () => {
  beforeEach(() => {
    motionPreference.reduced = false;
    setReducedMotion(false);
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      }),
    });
    Reflect.deleteProperty(document, "startViewTransition");
  });

  it("切替ボタンでカード領域を広く/狭くできる", () => {
    render(<UIExperimentsPage />);
    const wide = screen.getByRole("button", { name: "広い領域" });
    const narrow = screen.getByRole("button", { name: "狭い領域" });
    expect(wide.getAttribute("aria-pressed")).toBe("true");
    expect(narrow.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(narrow);
    expect(narrow.getAttribute("aria-pressed")).toBe("true");
    expect(wide.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(wide);
    expect(wide.getAttribute("aria-pressed")).toBe("true");
  });

  it("native dialogを開き、閉じるボタンで閉じる", async () => {
    render(<UIExperimentsPage />);
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "ドロワーを開く" }));
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("closed dialogのhidden close controlはopen guardで何もしない", () => {
    render(<UIExperimentsPage />);
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    const closeButton = dialog.querySelector("button") as HTMLButtonElement;
    expect(dialog.hasAttribute("open")).toBe(false);
    fireEvent.click(closeButton);
    expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled();
  });

  it("Escapeのcancelを処理してdialogを閉じる", async () => {
    render(<UIExperimentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "ドロワーを開く" }));
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    const cancel = new Event("cancel", { bubbles: false, cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("dialog backdrop click closes, while dialog content click does not", async () => {
    render(<UIExperimentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "ドロワーを開く" }));
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(true));
    fireEvent.click(screen.getByRole("heading", { name: "フォーカスをここに移動しました" }));
    expect(dialog.hasAttribute("open")).toBe(true);
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("View Transition対応時はtransition callbackで表示を切り替える", () => {
    const transition = vi.fn((callback: () => void) => {
      callback();
      return {};
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: transition,
    });
    render(<UIExperimentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "表示を切り替える" }));
    expect(transition).toHaveBeenCalledTimes(1);
    expect(document.body.contains(screen.getByText("詳細"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "表示を切り替える" }));
    expect(transition).toHaveBeenCalledTimes(2);
    expect(document.body.contains(screen.getByText("概要"))).toBe(true);
  });

  it("View Transition非対応時は即時に表示を切り替える", () => {
    render(<UIExperimentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "表示を切り替える" }));
    expect(document.body.contains(screen.getByText("詳細"))).toBe(true);
  });

  it("reduced motion時はView Transition APIを使わず即時に切り替える", () => {
    setReducedMotion(true);
    const transition = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: transition,
    });
    render(<UIExperimentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "表示を切り替える" }));
    expect(transition).not.toHaveBeenCalled();
    expect(document.body.contains(screen.getByText("詳細"))).toBe(true);
  });

  it("Motion animation completion updates the parent live status", () => {
    render(<UIExperimentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "表示する" }));
    fireEvent.animationEnd(screen.getByText("Motionのデモを表示しました。"));
    expect(document.body.contains(screen.getByText("状態: 完了"))).toBe(true);
  });
});

describe("Motion demo interactions", () => {
  beforeEach(() => {
    motionPreference.reduced = false;
  });

  it("plays the motion, reports completion, and can replay", () => {
    const onFinishedChange = vi.fn();
    render(<MotionDemo onFinishedChange={onFinishedChange} />);
    const button = screen.getByRole("button", { name: "表示する" });
    fireEvent.click(button);
    expect(onFinishedChange).toHaveBeenLastCalledWith(false);
    expect(document.body.contains(screen.getByRole("button", { name: "もう一度表示する" }))).toBe(
      true,
    );
    const animation = screen.getByText("Motionのデモを表示しました。");
    fireEvent.animationEnd(animation);
    expect(onFinishedChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "もう一度表示する" }));
    expect(onFinishedChange).toHaveBeenLastCalledWith(false);
  });

  it("reduced motionでは静的に表示して完了状態を返す", () => {
    motionPreference.reduced = true;
    const onFinishedChange = vi.fn();
    render(<MotionDemo onFinishedChange={onFinishedChange} />);
    expect(document.body.contains(screen.getByText(/動きを減らす設定が有効/))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "表示する" }));
    expect(onFinishedChange).toHaveBeenCalledWith(true);
    expect(document.body.contains(screen.getByText("Motionのデモを表示しました。"))).toBe(true);
  });

  it("reduced motion preferenceがnullなら0秒durationでmotion経路を通る", () => {
    motionPreference.reduced = null;
    const onFinishedChange = vi.fn();
    render(<MotionDemo onFinishedChange={onFinishedChange} />);
    fireEvent.click(screen.getByRole("button", { name: "表示する" }));
    expect(onFinishedChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByText("Motionのデモを表示しました。").getAttribute("data-motion-duration"),
    ).toBe("0");
    expect(onFinishedChange).toHaveBeenLastCalledWith(true);
  });
});

describe("dialog implementation comparison interactions", () => {
  it("Radix Dialogはaccessible name付きで開き、閉じるボタンで閉じる", () => {
    render(<DialogOptionsDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Radixを開く" }));

    const dialog = screen.getByRole("dialog", { name: "汎用ダイアログ" });
    expect(dialog).toBeTruthy();
    const closeButtons = screen.getAllByRole("button", { name: "閉じる" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(screen.queryByRole("dialog", { name: "汎用ダイアログ" })).toBeNull();
  });

  it("Radix DialogはEscapeで閉じ、起動ボタンへfocusを戻す", async () => {
    render(<DialogOptionsDemo />);
    const trigger = screen.getByRole("button", { name: "Radixを開く" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "汎用ダイアログ" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "汎用ダイアログ" })).toBeNull(),
    );
  });

  it("Radix Dialogはoverlay上のoutside pointerdownで閉じ、起動ボタンへfocusを戻す", async () => {
    const user = userEvent.setup();
    render(<DialogOptionsDemo />);
    const trigger = screen.getByRole("button", { name: "Radixを開く" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "汎用ダイアログ" })).toBeTruthy();

    await user.click(document.querySelector(".dialogOverlay")!);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "汎用ダイアログ" })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Base UI Drawerはaccessible name付きで開き、閉じるとtriggerへfocusを戻す", async () => {
    render(<DialogOptionsDemo />);
    const trigger = screen.getByRole("button", { name: "Drawerを開く" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "シート型のドロワー" });
    expect(dialog).toBeTruthy();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "シート型のドロワー" })).toBeNull(),
    );
  });

  it("Base UI DrawerはEscapeで閉じ、triggerへfocusを戻す", async () => {
    render(<DialogOptionsDemo />);
    const trigger = screen.getByRole("button", { name: "Drawerを開く" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "シート型のドロワー" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "シート型のドロワー" })).toBeNull(),
    );
  });

  it("Base UI Drawerはbackdropへのoutside pointerdownで閉じる", async () => {
    const user = userEvent.setup();
    render(<DialogOptionsDemo />);
    const trigger = screen.getByRole("button", { name: "Drawerを開く" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "シート型のドロワー" })).toBeTruthy();

    await user.click(document.querySelector('[data-slot="drawer-overlay"]')!);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "シート型のドロワー" })).toBeNull(),
    );
  });
});

describe("Base UI Drawer wrapper contract", () => {
  it("defaults to a modal bottom drawer without snap points", () => {
    render(
      <DrawerRoot defaultOpen>
        <DrawerContent>
          <DrawerTitle>既定のDrawer</DrawerTitle>
          <DrawerDescription>既定値を確認</DrawerDescription>
        </DrawerContent>
      </DrawerRoot>,
    );

    expect(screen.getByRole("dialog", { name: "既定のDrawer" })).toBeTruthy();
    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeTruthy();
    expect(
      document.querySelector('[data-slot="drawer-viewport"]')?.getAttribute("data-modal"),
    ).toBe("true");
    const popup = document.querySelector('[data-slot="drawer-popup"]');
    expect(popup?.getAttribute("data-swipe-direction")).toBe("down");
    expect(popup?.getAttribute("data-swipe-axis")).toBe("y");
    expect(popup?.hasAttribute("data-snap-points")).toBe(false);
  });

  it("passes snap point state to the modal backdrop", () => {
    render(
      <DrawerRoot defaultOpen snapPoints={[0.5]}>
        <DrawerContent>
          <DrawerTitle>Snap point付きDrawer</DrawerTitle>
        </DrawerContent>
      </DrawerRoot>,
    );

    const backdrop = document.querySelector('[data-slot="drawer-overlay"]');
    expect(backdrop?.getAttribute("data-snap-points")).toBe("");
  });

  it("uses the vertical swipe axis for an upward drawer", () => {
    render(
      <DrawerRoot defaultOpen swipeDirection="up">
        <DrawerContent>
          <DrawerTitle>上向きDrawer</DrawerTitle>
        </DrawerContent>
      </DrawerRoot>,
    );

    const popup = document.querySelector('[data-slot="drawer-popup"]');
    expect(popup?.getAttribute("data-swipe-direction")).toBe("up");
    expect(popup?.getAttribute("data-swipe-axis")).toBe("y");
  });

  it("supports nonmodal horizontal drawers with snap points and wrapper parts", () => {
    render(
      <DrawerRoot modal={false} defaultOpen snapPoints={[0.5]} swipeDirection="right">
        <DrawerTrigger render={<button type="button" />}>カスタムDrawerを開く</DrawerTrigger>
        <DrawerContent className="custom-popup">
          <DrawerHandle />
          <DrawerTitle>カスタムDrawer</DrawerTitle>
          <DrawerDescription>水平スワイプ設定の確認</DrawerDescription>
          <DrawerClose render={<button type="button" />}>閉じる</DrawerClose>
        </DrawerContent>
      </DrawerRoot>,
    );

    expect(screen.getByRole("button", { name: "カスタムDrawerを開く" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "カスタムDrawer" })).toBeTruthy();
    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
    expect(
      document.querySelector('[data-slot="drawer-viewport"]')?.getAttribute("data-modal"),
    ).toBe("false");

    const popup = document.querySelector('[data-slot="drawer-popup"]');
    expect(popup?.getAttribute("data-swipe-direction")).toBe("right");
    expect(popup?.getAttribute("data-swipe-axis")).toBe("x");
    expect(popup?.hasAttribute("data-snap-points")).toBe(true);
    expect(popup?.className).toContain("custom-popup");
    expect(document.querySelector('[aria-hidden="true"].handle')).toBeTruthy();
  });

  it("throws when DrawerContent is used outside DrawerRoot", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<DrawerContent>orphan content</DrawerContent>)).toThrow(
        "DrawerContent must be used inside DrawerRoot.",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
