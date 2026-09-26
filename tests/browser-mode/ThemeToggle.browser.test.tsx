import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ThemeToggle } from "../../src/app/components/ThemeToggle";

describe("ThemeToggle in a real Chromium page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("cycles themes through a real browser click and persists each state", async () => {
    render(<ThemeToggle />);

    const button = page.getByRole("button", { name: /テーマ:/ });
    await expect
      .element(button)
      .toHaveAttribute("aria-label", "テーマ: システム設定に従う（タップでライトモードに切替）");

    await button.click();
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    await expect.element(button).toHaveTextContent("☀️");
    await expect
      .element(button)
      .toHaveAttribute("aria-label", "テーマ: ライトモード（タップでダークモードに切替）");

    await button.click();
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await expect.element(button).toHaveTextContent("🌙");
    await expect
      .element(button)
      .toHaveAttribute("aria-label", "テーマ: ダークモード（タップでシステム設定に従うに切替）");
  });
});
