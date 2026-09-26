import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "../../src/app/components/ThemeToggle";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("ThemeToggle Chromium CSS layout", () => {
  it("loads the component CSS module into Chromium's computed style", () => {
    renderBrowserComponent(<ThemeToggle />);

    const button = screen.getByRole("button");
    const styles = window.getComputedStyle(button);
    const bounds = button.getBoundingClientRect();

    expect(styles.minHeight).toBe("44px");
    expect(styles.minWidth).toBe("44px");
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
  });
});
