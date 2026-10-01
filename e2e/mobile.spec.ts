import { expect, test } from "@playwright/test";

import { errorBoundaryText, watchPage } from "./page-health";
import { storageStateFor } from "./roles";

/**
 * The phone. Where the counsellors actually are.
 *
 * Below `md` the sidebar is hidden entirely and everything goes through a
 * drawer — a different set of elements, which has been completely missing
 * before. A desktop-only suite would have called that application healthy.
 */
test.describe("on a phone", () => {
  test.use({ storageState: storageStateFor("counsellor") });

  test("the menu opens and takes you somewhere", async ({ page }) => {
    const watcher = watchPage(page);
    await page.goto("/dashboard");

    // The sidebar is genuinely gone, not merely narrow — if it is visible
    // here the breakpoint has regressed.
    await expect(page.locator("aside nav")).toBeHidden();

    await page.getByRole("button", { name: /open menu/i }).click();
    const drawer = page.getByRole("dialog", { name: /menu/i });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", { name: /leads/i }).first().click();
    await expect(page).toHaveURL(/\/leads/);
    // Closing on navigation is the bit that reads as "the tap didn't work"
    // when it regresses.
    await expect(drawer).toBeHidden();

    expect(await errorBoundaryText(page)).toBeNull();
    expect(watcher.problems).toEqual([]);
  });

  test("the lead list does not scroll sideways", async ({ page }) => {
    // A table wider than the phone is the single most common way a
    // responsive layout breaks, and it is invisible on a desktop run.
    await page.goto("/leads");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the page scrolls sideways on a phone").toBeLessThanOrEqual(2);
  });
});
