import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import ChartInfoButton from "../../src/app/components/ChartInfoButton";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("ChartInfoButton Escape dismissal in Chromium", () => {
  it("closes the opened dialog when Escape is pressed", async () => {
    renderBrowserComponent(
      <ChartInfoButton>
        <p>Static source information.</p>
      </ChartInfoButton>,
    );

    const trigger = page.getByRole("button", {
      name: "データソースの説明を表示",
    });
    const dialog = page.getByRole("dialog", {
      name: "データソースの説明を表示",
    });

    await trigger.click();
    await expect.element(dialog).toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
