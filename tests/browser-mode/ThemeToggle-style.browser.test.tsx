import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../../src/app/components/ThemeToggle";

describe("ThemeToggle Chromium CSS layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("loads the component CSS module into Chromium's computed style", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    const styles = window.getComputedStyle(button);
    const bounds = button.getBoundingClientRect();

    expect(styles.minHeight).toBe("44px");
    expect(styles.minWidth).toBe("44px");
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
  });
});
