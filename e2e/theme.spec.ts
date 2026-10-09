import { expect, test } from "@playwright/test";

import { storageStateFor } from "./roles";

/**
 * The dark mode switch, and the two ways it can be wrong.
 *
 * It can fail to flip, which anybody would notice. And it can flip and
 * then forget — or remember and apply too late, which shows as a white
 * flash on every navigation and is exactly the thing somebody enables
 * dark mode to avoid. The flash is a timing bug and a test that only
 * checks the end state will never see it, so the third assertion reads
 * the class on the FIRST paint of a fresh page rather than after
 * hydration: if the theme came from React instead of the inline script
 * in the root layout, the class is absent at that moment.
 */
test.use({ storageState: storageStateFor("counsellor") });

test.describe("the theme switch", () => {
  test("turns dark mode on, and keeps it on across a navigation", async ({ page }) => {
    await page.goto("/dashboard");

    const toggle = page.getByRole("button", { name: /switch to (dark|light) mode/i });
    await expect(toggle).toBeVisible();

    // Start from light whatever the machine's own preference is, so the
    // test asserts the same thing on a developer's dark laptop as in CI.
    if (await page.getByRole("button", { name: /switch to light mode/i }).isVisible()) {
      await toggle.click();
    }
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // The hard part. `domcontentloaded` is before React has hydrated, so a
    // theme applied from an effect would not be here yet — which is the
    // white flash, caught as a failing assertion instead of as a
    // complaint from somebody using the app at night.
    await page.goto("/leads", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/dark/);

    // And back, so the switch is not a one-way door.
    await page.getByRole("button", { name: /switch to light mode/i }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
