import { expect, test } from "@playwright/test";

import { storageStateFor } from "./roles";

/**
 * The counsellor list under Dashboard.
 *
 * Leon's correction to the first version: counsellors ONLY — no centre
 * headings, no other staff — and inside the left navigation, opening
 * underneath Dashboard, not as chips across the page.
 *
 * Two roles because the rule has two halves: somebody who may look in on a
 * team sees the list; a counsellor, who may not, never does.
 */
test.describe("a centre head", () => {
  test.use({ storageState: storageStateFor("center_head") });

  test("sees the counsellors nested under Dashboard in the sidebar, and only them", async ({ page }) => {
    await page.goto("/dashboard");

    const sidebar = page.locator("aside");
    const list = sidebar.getByRole("list", { name: "Counsellors" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("link", { name: "Kochi Counsellor" })).toBeVisible();

    // Not other staff, and not the centre head themselves.
    await expect(list.getByRole("link", { name: /Accounts User|Academics User|Admin User|Kochi Centre Head/ })).toHaveCount(0);
    // No centre headings: the only text in the list is names.
    await expect(list.getByText(/^(Kochi|Kannur)$/)).toHaveCount(0);

    // And not as a row of chips across the page.
    await expect(page.locator("main").getByRole("navigation", { name: "Counsellors" })).toHaveCount(0);
  });

  test("opens a counsellor's own page from the sidebar, and keeps the list there", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator("aside").getByRole("link", { name: "Kochi Counsellor" }).click();

    await expect(page).toHaveURL(/\/dashboard\/team\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "Kochi Counsellor" })).toBeVisible();

    const current = page.locator("aside").getByRole("link", { name: "Kochi Counsellor" });
    await expect(current).toHaveAttribute("aria-current", "page");
  });

  test("the list is only open while Dashboard is", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.locator("aside").getByRole("list", { name: "Counsellors" })).toHaveCount(0);
  });
});

test.describe("a counsellor", () => {
  test.use({ storageState: storageStateFor("counsellor") });

  test("has no list of colleagues to look in on", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("aside").getByRole("list", { name: "Counsellors" })).toHaveCount(0);
  });
});
