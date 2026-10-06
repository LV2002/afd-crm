import { expect, test } from "@playwright/test";

import { describeProblems, errorBoundaryText, watchPage } from "./page-health";
import { ROLES, storageStateFor } from "./roles";

/**
 * Open every screen this person can reach, and prove none of them is broken.
 *
 * This is the test Leon asked for: the one that clicks everything so nobody
 * has to remember to. It discovers links rather than listing them, so a
 * screen added next month is covered the day it gets a link, and a link to
 * a route that no longer exists fails here rather than in front of staff.
 *
 * ## What counts as broken
 *
 * Four things, all in `page-health.ts`: an HTTP error, an error boundary
 * (Next renders a thrown Server Component with a 200, so the status alone
 * is not enough), a console error, and a failed network request.
 *
 * "Access denied" is explicitly NOT broken. It is the permission system
 * working, and a crawler that treated it as a failure could not test a
 * counsellor at all.
 *
 * ## Why it stays inside the app
 *
 * Only same-origin, non-destructive URLs are followed. A crawler that
 * clicked "Delete lead" would be a crawler that empties the database, and
 * one that followed an outbound link would be testing Meta's website.
 */

/** Routes a crawler must not walk into. */
const SKIP = [
  /\/logout/i,
  /\/auth\//i,
  // Printing opens a dialog the browser cannot dismiss headlessly. The
  // print pages are visited directly in their own test instead.
  /\/print$/i,
  // Downloads a file rather than rendering a page. Links marked
  // `download` are skipped by the selector below without needing an
  // entry here; these are the ones that are not.
  /\/export/i,
];

const MAX_PAGES_PER_ROLE = 60;

function isCrawlable(href: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (!url.pathname.startsWith("/")) return false;
  return !SKIP.some((pattern) => pattern.test(url.pathname));
}

/** Path plus query, since `/insights?platform=meta` is a different screen. */
function keyOf(href: string, origin: string): string {
  const url = new URL(href, origin);
  return `${url.pathname}${url.search}`;
}

for (const role of ROLES) {
  test.describe(`every screen ${role.describes} can reach`, () => {
    test.use({ storageState: storageStateFor(role.key) });

    test("opens without an error, a console error or a failed request", async ({ page, baseURL }) => {
      // Generous: this walks dozens of server-rendered pages in one test,
      // and a per-page timeout is what actually catches a hang.
      test.slow();

      const origin = new URL(baseURL!).origin;
      const seen = new Set<string>();
      const queue: string[] = ["/dashboard"];
      const broken: string[] = [];
      const visited: string[] = [];

      while (queue.length > 0 && visited.length < MAX_PAGES_PER_ROLE) {
        const path = queue.shift()!;
        if (seen.has(path)) continue;
        seen.add(path);

        const watcher = watchPage(page);
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        // Server Components stream, so the error boundary may not be in the
        // DOM when `domcontentloaded` fires.
        await page.waitForLoadState("networkidle").catch(() => {});

        if (response && response.status() >= 400) {
          watcher.problems.push({ kind: "status", detail: `HTTP ${response.status()}` });
        }
        const boundary = await errorBoundaryText(page);
        if (boundary) watcher.problems.push({ kind: "boundary", detail: boundary });

        if (watcher.problems.length > 0) broken.push(describeProblems(path, watcher.problems));
        visited.push(path);

        // Only follow links from a page that rendered; a broken page's
        // links are noise.
        if (watcher.problems.length === 0) {
          /*
            `a[href]:not([download])` rather than every anchor.

            A link marked `download` hands the browser a file, and
            `page.goto` on one throws "Download is starting" rather than
            navigating — which fails the crawl on a link that is working
            exactly as intended. That happened the moment the lead-import
            template got a download link.

            Reading the attribute beats listing the paths: the SKIP list
            below needs editing every time somebody adds an endpoint, and
            the person adding it has no reason to think about this file.
            The markup already says what the link does.
          */
          const hrefs = await page.locator("a[href]:not([download])").evaluateAll((anchors) =>
            anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute("href") ?? ""),
          );
          for (const href of hrefs) {
            if (!href || href.startsWith("#")) continue;
            if (!isCrawlable(href, origin)) continue;
            const next = keyOf(href, origin);
            if (!seen.has(next)) queue.push(next);
          }
        }
      }

      // Said out loud, because a crawl that silently covered four pages
      // would pass and mean nothing.
      console.log(`${role.key}: visited ${visited.length} screens`);
      expect(visited.length, `${role.key} reached almost nothing — is the nav rendering?`)
        .toBeGreaterThan(3);

      expect(broken.join("\n\n"), `broken screens for ${role.key}`).toBe("");
    });
  });
}
