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

    /**
     * The drawer has to be the height of the screen, not merely present.
     *
     * This test already opened the drawer and clicked a link in it, and it
     * passed while the drawer was **55px tall** — a sliver across the top
     * of the screen that no human could use. `toBeVisible()` is true of a
     * sliver, and Playwright scrolls a link into view inside the drawer's
     * own scroll container before clicking it, so both assertions held.
     * The test proved the links were reachable by a robot, which is not
     * what it was written to mean.
     *
     * The cause was `position: fixed` resolving against the app header
     * instead of the viewport, because that header carries `backdrop-blur`
     * and a backdrop-filter makes an element the containing block for its
     * fixed descendants. So the assertion is dimensional: anything that
     * puts the drawer back inside a containing block fails here.
     */
    const box = await drawer.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.height).toBeGreaterThan(viewport!.height * 0.9);
    // And wide enough to read a label in, rather than a hairline.
    expect(box!.width).toBeGreaterThan(200);

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

      /*
        The number AND what caused it.

        This reported "overflows by 173px" and nothing else, which cost two
        rounds of guessing at CSS from a transcript: with no element named,
        the only way to find the culprit was to rebuild candidate layouts
        offline and hope one of them reproduced.

        ## Why the ranking is what it is

        Reaching past the right edge is not the same as CAUSING the page to
        scroll. An element inside an ancestor with `overflow: hidden` or
        `auto` is clipped, so its geometry is a red herring — the first
        version of this listed three clipped table cells and sent the
        search in exactly the wrong direction. So: anything with a
        clipping ancestor is dropped, and the rest are ranked by their
        right edge, because the element sitting at the document's own
        scrollWidth is by definition the one setting it.

        Ancestors are reported too rather than filtered out. An
        overflowing child does drag its parents out with it, but which of
        the two is holding the width is the actual question — a parent
        that is too wide and a child that will not shrink need opposite
        fixes — and the chain reads it off at a glance.
      */
      const measured = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth - limit;

        const clipped = (el: Element) => {
          for (let node = el.parentElement; node; node = node.parentElement) {
            const { overflowX } = getComputedStyle(node);
            if (overflowX !== "visible") return true;
          }
          return false;
        };

        const culprits = Array.from(document.querySelectorAll("body *"))
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter((row) => row.rect.right > limit + 2 && !clipped(row.el))
          .sort((a, b) => b.rect.right - a.rect.right)
          .slice(0, 4)
          .map(
            (row) =>
              `<${row.el.tagName.toLowerCase()}` +
              `${row.el.id ? ` id="${row.el.id}"` : ""}` +
              ` class="${(row.el.getAttribute("class") ?? "").slice(0, 120)}">` +
              ` ${Math.round(row.rect.width)}px wide, right edge ${Math.round(row.rect.right)}px`,
          );
        return { overflow, culprits };
      });

      // Two pixels of slack for sub-pixel rounding on borders, which is
      // not a layout anybody can see.
      if (measured.overflow > 2) {
        tooWide.push(
          [`${path} overflows by ${measured.overflow}px`, ...measured.culprits.map((c) => `    ${c}`)].join(
            "\n",
          ),
        );
      }

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
