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

    // The drawer is a client component, so the button does nothing until
    // React has hydrated — and Playwright will happily click a button that
    // is visible but not yet listening. Without this the test passed on the
    // first attempt and failed on the retry, which is the signature of a
    // race rather than a bug.
    await page.waitForLoadState("networkidle").catch(() => {});

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

/**
 * Every screen an administrator can reach, at phone width.
 *
 * Two pages were covered before — the dashboard and the lead list — which
 * is how the settings menu went unnoticed: twenty-five links stacked above
 * the content on every one of twenty-five screens, none of them tested.
 * This walks the application the way `crawl.spec.ts` does and asks one
 * question of each page, the one that cannot be answered from a desktop
 * run: does it fit?
 *
 * Admin rather than counsellor, deliberately. An administrator reaches the
 * most screens, and the settings area — the part that was actually broken
 * — is invisible to everybody else.
 */
test.describe("at phone width", () => {
  test.use({ storageState: storageStateFor("admin") });

  const SKIP = [/\/logout/i, /\/auth\//i, /\/print$/i, /\/export/i];
  const MAX_PAGES = 45;

  test("no screen scrolls sideways", async ({ page, baseURL }) => {
    test.slow();

    const origin = new URL(baseURL!).origin;
    const seen = new Set<string>();
    const queue: string[] = ["/dashboard", "/settings"];
    const tooWide: string[] = [];
    let visited = 0;

    while (queue.length > 0 && visited < MAX_PAGES) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      seen.add(path);

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      visited++;

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // Two pixels of slack for sub-pixel rounding on borders, which is
      // not a layout anybody can see.
      if (overflow > 2) tooWide.push(`${path} overflows by ${overflow}px`);

      const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute("href") ?? ""),
      );
      for (const href of hrefs) {
        if (!href || href.startsWith("#")) continue;
        let url: URL;
        try {
          url = new URL(href, origin);
        } catch {
          continue;
        }
        if (url.origin !== origin) continue;
        if (SKIP.some((pattern) => pattern.test(url.pathname))) continue;
        const next = `${url.pathname}${url.search}`;
        if (!seen.has(next)) queue.push(next);
      }
    }

    console.log(`phone: measured ${visited} screens`);
    expect(visited, "reached almost nothing — is the nav rendering on a phone?").toBeGreaterThan(5);
    expect(tooWide.join("\n"), "screens wider than the phone").toBe("");
  });

  test("the settings menu is one row until you open it", async ({ page }) => {
    // The actual bug: the settings nav is a sidebar from `lg` up and was a
    // 25-item list below it, so the content of every settings screen
    // started a full screen-height down the page.
    await page.goto("/settings/health");
    await page.waitForLoadState("networkidle").catch(() => {});

    // By id rather than by role: the application has several navs and the
    // point of this test is this one specifically.
    const list = page.locator("#settings-nav-list");
    await expect(list).toBeHidden();

    const toggle = page.locator('button[aria-controls="settings-nav-list"]');
    await expect(toggle).toContainText(/health/i);
    await toggle.click();
    await expect(list).toBeVisible();

    // And it goes somewhere.
    await list.getByRole("link", { name: /centres/i }).first().click();
    await expect(page).toHaveURL(/\/settings\/centers/);
    await expect(list).toBeHidden();
  });
});
