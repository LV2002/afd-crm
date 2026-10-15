import { expect, test } from "@playwright/test";

import { errorBoundaryText, watchPage } from "./page-health";
import { storageStateFor } from "./roles";

/**
 * "N more →" on the Your day card, and the temperatures on a counsellor's
 * pipeline, open the leads list filtered to what they counted — not the whole
 * database. The data a CI run has is thin, so this proves the plumbing: each
 * link's target loads, says what it is showing, and does not fall over.
 */
test.describe("dashboard links into the leads list", () => {
  test.use({ storageState: storageStateFor("counsellor") });

  for (const [key, label] of [
    ["overdue", "Overdue"],
    ["due_today", "Due today"],
    ["new", "New"],
    ["at_risk", "At risk"],
  ] as const) {
    test(`?queue=${key} says which bucket it is showing`, async ({ page }) => {
      const watcher = watchPage(page);
      await page.goto(`/leads?queue=${key}`);
      await expect(page.getByText(`Showing ${label} from your day`, { exact: false })).toBeVisible();
      await expect(page.getByRole("link", { name: /show every lead/i })).toBeVisible();
      expect(await errorBoundaryText(page)).toBeNull();
      expect(watcher.problems).toEqual([]);
    });
  }

  test("an unknown bucket is ignored rather than breaking the list", async ({ page }) => {
    await page.goto("/leads?queue=nonsense");
    await expect(page.getByText(/showing .* from your day/i)).toHaveCount(0);
    expect(await errorBoundaryText(page)).toBeNull();
  });

  test("a temperature filter link loads the list", async ({ page }) => {
    await page.goto("/leads?f_temperature=not_contacted");
    expect(await errorBoundaryText(page)).toBeNull();
  });
});
