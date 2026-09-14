import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../../src/app/components/ThemeToggle";

vi.mock("../../src/app/components/CpiChart.module.css", () => ({
  default: { themeToggleButton: "themeToggleButton" },
}));

describe("ThemeToggle theme storage contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it.each([
    ["dark", "🌙", "ダークモード"],
    ["light", "☀️", "ライトモード"],
  ] as const)("restores a saved %s theme", (savedTheme, icon, label) => {
    window.localStorage.setItem("theme", savedTheme);

    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.textContent).toContain(icon);
    expect(button.getAttribute("aria-label")).toBe(
      `テーマ: ${label}（タップで${savedTheme === "dark" ? "システム設定に従う" : "ダークモード"}に切替）`,
    );
  });

  it("uses system as the initial state without storage and leaves the theme attribute unset", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.textContent).toContain("💻");
    expect(button.getAttribute("aria-label")).toBe(
      "テーマ: システム設定に従う（タップでライトモードに切替）",
    );
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("persists light, dark, then removes storage for system", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    fireEvent.click(button);
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(button);
    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("does not fail during SSR-equivalent initial evaluation without window", () => {
    vi.stubGlobal("window", undefined);

    try {
      const html = renderToString(<ThemeToggle />);

      expect(html).toContain("💻");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows the current undefined result for an invalid legacy value after the type assertion", () => {
    // The saved value is asserted to Theme, so this legacy value intentionally
    // renders with an undefined label/icon; no fallback is applied.
    window.localStorage.setItem("theme", "legacy");

    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.textContent).toBe("");
    expect(button.getAttribute("aria-label")).toBe(
      "テーマ: undefined（タップでライトモードに切替）",
    );
  });

  it("throws storage read exceptions during initial theme evaluation", () => {
    vi.restoreAllMocks();
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => render(<ThemeToggle />)).toThrow("storage unavailable");
  });

  it("absorbs storage write exceptions when changing theme", () => {
    vi.restoreAllMocks();
    vi.spyOn(window.localStorage, "getItem").mockReturnValue(null);
    render(<ThemeToggle />);

    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByRole("button").textContent).toContain("☀️");
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "テーマ: ライトモード（タップでダークモードに切替）",
    );
  });

  it("absorbs removeItem exceptions while changing to system theme", () => {
    vi.restoreAllMocks();
    vi.spyOn(window.localStorage, "getItem").mockReturnValue("dark");
    render(<ThemeToggle />);

    const removeItem = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(removeItem).toHaveBeenCalledWith("theme");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("💻");
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "テーマ: システム設定に従う（タップでライトモードに切替）",
    );
  });
});
