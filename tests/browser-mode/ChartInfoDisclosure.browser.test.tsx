import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import ChartInfoContentRenderer from "../../src/app/components/ChartInfoContentRenderer";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("ChartInfoContent disclosure in Chromium", () => {
  it("supports keyboard disclosure, focus, scrolling, and reopening", async () => {
    await page.viewport(375, 480);
    renderBrowserComponent(<ChartInfoContentRenderer chartKey="consumption-expenditure" />);

    const trigger = page.getByRole("button", { name: "データソースの説明を表示" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "データソースの説明を表示" });
    await expect.element(dialog).toBeVisible();

    const details = (await dialog.element()).querySelector("details");
    const summary = (await page.getByText("2016年以前の推計方法").element()) as HTMLElement;
    if (!details) throw new Error("Consumption disclosure details element is missing");
    expect(details.open).toBe(false);

    // The close button and source link precede summary in the dialog's tab order.
    await userEvent.keyboard("{Tab}");
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(summary);
    expect(summary.matches(":focus-visible")).toBe(true);
    const focusStyle = window.getComputedStyle(summary);
    expect(focusStyle.outlineStyle).toBe("solid");
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBe(2);
    expect(focusStyle.outlineColor).not.toBe("transparent");

    await userEvent.keyboard(" ");
    expect(details.open).toBe(true);

    const popup = (await dialog.element()) as HTMLElement;
    expect(window.getComputedStyle(popup).overflowY).toBe("auto");
    expect(popup.scrollHeight).toBeGreaterThan(popup.clientHeight);
    const popupBounds = popup.getBoundingClientRect();
    expect(popupBounds.top).toBeGreaterThanOrEqual(0);
    expect(popupBounds.bottom).toBeLessThanOrEqual(window.innerHeight);

    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    expect(document.activeElement).toBe(await trigger.element());

    await trigger.click();
    await expect.element(dialog).toBeVisible();
    const reopenedDetails = (await dialog.element()).querySelector("details");
    expect(reopenedDetails?.open).toBe(false);
  });
});
