import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import UIExperimentsPage from "../../src/app/ui-experiments/page";
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
