import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderBrowserComponent } from "./renderBrowserComponent";

const sharedMock = vi.fn();
const spyTarget = { record: () => "recorded" };
const originalRecord = spyTarget.record;
const sharedSpy = vi.spyOn(spyTarget, "record");

function InteractionFixture() {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setCount((current) => current + 1);
        sharedMock();
        spyTarget.record();
      }}
    >
      Count: {count}
    </button>
  );
}

describe("Browser Mode file-level state isolation", () => {
  it("mutates page, storage, cookie, and mock state through a browser interaction", async () => {
    renderBrowserComponent(<InteractionFixture />);

    document.documentElement.setAttribute("data-theme", "dark");
    window.localStorage.setItem("browser-mode-isolation", "stale");
    document.cookie = "browser-mode-isolation=stale; path=/; SameSite=Lax";

    const button = page.getByRole("button");
    await userEvent.click(button);
    await expect.element(button).toHaveTextContent("Count: 1");

    expect(document.cookie).toContain("browser-mode-isolation=stale");
    expect(sharedMock).toHaveBeenCalledOnce();
    expect(sharedSpy).toHaveBeenCalledOnce();
  });

  it("starts after the prior test's DOM, theme, storage, cookie, and mocks were reset", () => {
    expect(document.body.querySelector("button")).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem("browser-mode-isolation")).toBeNull();
    expect(document.cookie).not.toContain("browser-mode-isolation=stale");
    expect(sharedMock).not.toHaveBeenCalled();
    expect(sharedSpy).not.toHaveBeenCalled();
    expect(spyTarget.record).toBe(originalRecord);
  });
});
