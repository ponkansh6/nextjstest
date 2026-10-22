import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BottomSheet } from "../../src/app/components/BottomSheet";
import DialogOptionsDemo from "../../src/app/ui-experiments/DialogOptionsDemo";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("BottomSheet focus containment in Chromium", () => {
  it("keeps real browser Tab navigation inside the open sheet", async () => {
    const { unmount } = renderBrowserComponent(
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

    unmount();
    await page.viewport(390, 844);
    renderBrowserComponent(<DialogOptionsDemo />);

    const trigger = page.getByRole("button", { name: "Drawerを開く" });
    const triggerElement = await trigger.element();

    await trigger.click();
    const drawerDialog = page.getByRole("dialog", { name: "シート型のドロワー" });
    await expect.element(drawerDialog).toBeVisible();
    const drawerDialogElement = await drawerDialog.element();
    await expect.poll(() => drawerDialogElement.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    await expect.element(drawerDialog).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(triggerElement);

    await trigger.click();
    await expect.element(drawerDialog).toBeVisible();
    const reopenedDialogElement = await drawerDialog.element();
    await expect.poll(() => reopenedDialogElement.contains(document.activeElement)).toBe(true);

    const backdrop = document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]');
    expect(backdrop).not.toBeNull();
    if (!backdrop) throw new Error("Base UI Drawer backdrop is unavailable");
    const hitTarget = document.elementFromPoint(10, 10);
    expect(hitTarget).not.toBeNull();
    if (!hitTarget) throw new Error("The (10,10) point has no outside hit target");
    await userEvent.click(hitTarget);

    await expect.element(drawerDialog).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(triggerElement);
  });
});
