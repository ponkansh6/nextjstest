import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BottomSheet } from "../../src/app/components/BottomSheet";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("BottomSheet focus containment in Chromium", () => {
  it("keeps real browser Tab navigation inside the open sheet", async () => {
    renderBrowserComponent(
      <>
        <button type="button">Outside action</button>
        <BottomSheet open title="Focus trap fixture" onClose={() => {}}>
          <button type="button">First sheet action</button>
          <button type="button">Last sheet action</button>
        </BottomSheet>
      </>,
    );

    const dialog = page.getByRole("dialog", { name: "Focus trap fixture" });
    await expect.element(dialog).toBeVisible();
    const dialogElement = await dialog.element();
    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    expect(document.activeElement).toBe(await closeButton.element());

    // The actual BottomSheet hook wraps forward browser Tab navigation at the last control.
    for (let index = 0; index < 3; index += 1) {
      await userEvent.keyboard("{Tab}");
      expect(dialogElement.contains(document.activeElement)).toBe(true);
    }
    expect(document.activeElement).toBe(await closeButton.element());
  });
});
