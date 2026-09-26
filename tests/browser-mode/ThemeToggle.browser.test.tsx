import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ThemeToggle } from "../../src/app/components/ThemeToggle";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("ThemeToggle in a real Chromium page", () => {
  it("cycles themes through a real browser click and persists each state", async () => {
    renderBrowserComponent(<ThemeToggle />);

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
