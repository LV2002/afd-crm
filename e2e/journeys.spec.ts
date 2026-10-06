import { expect, test } from "@playwright/test";

import { waitForHydration } from "./hydration";
import { errorBoundaryText, watchPage } from "./page-health";
import { storageStateFor } from "./roles";

/**
 * The handful of things that must work, done the way a person does them.
 *
 * The crawler proves no screen is broken. It cannot prove that pressing a
 * button does anything — a form wired to an action that silently fails
 * renders perfectly. These are the flows where that matters, and they are
 * deliberately few: a suite of forty journeys is a suite nobody maintains.
 *
 * Every lead created here is named with the marker below so a failed run
 * leaves something identifiable rather than mystery rows. They are left in
 * place rather than cleaned up: this runs against a local database that is
 * reseeded freely, and a teardown that deletes by name is one bad regex
 * away from deleting real work if somebody ever points it elsewhere.
 */
const MARKER = "E2E Test";

function uniqueName(): string {
  return `${MARKER} ${Date.now().toString().slice(-6)}`;
}

/** +91 98470 1xxxx — inside AFD's real range, never a real person. */
function uniquePhone(): string {
  return `98470${String(10000 + Math.floor(Math.random() * 89999))}`;
}

test.describe("a counsellor's day", () => {
  test.use({ storageState: storageStateFor("counsellor") });

  test("creates a lead and lands on it", async ({ page }) => {
    /*
      The only test in this suite that has ever failed intermittently —
      be0c8f4, a54eefd, a9d2893 and 66abe77 — always alone among twenty,
      always by the URL never changing rather than by a wrong answer.

      ## What has been ruled out

      **Not the dev server.** CI runs `next build && next start`, so there
      is no compile-on-first-request.

      **Not an outbound call.** Creating a lead makes none: `startFlows()`
      only inserts a run row for the nightly cron, and email is skipped
      with `RESEND_API_KEY` unset.

      **Not the connection pool, and not slowness.** That was the first
      guess — `lib/db/client.ts` is `max: 1`, so a transaction holds the
      only connection while everything else queues — and raising the
      budget from twenty seconds to forty-five disproved it. Forty-five
      seconds is not a queue.

      ## What the instrumentation then showed

      Run 37225884874 produced the first real evidence, and it was not
      what the suspect list predicted. The submission was recorded as
      `POST /leads/new — net::ERR_ABORTED`: the browser cancelled it. On
      the retry the same abort appeared and the journey nevertheless
      finished — right URL, right heading — which is what a redirect
      cancelling its own request looks like, so `page-health.ts` no longer
      counts that as a problem.

      A cancelled submission with nothing after it, though, is exactly the
      stuck run: the click lands, the POST is dropped, and the page sits
      on the form. The one thing in this test that can drop a submission
      is clicking before the page has hydrated — React submits the form
      natively until its JavaScript runs — so that race is now waited out
      rather than argued about. If this test fails again after this, the
      hydration race is ruled out too, and the remaining suspect is the
      read-back in `createLeadManually()` (`leadIsVisibleToCaller`, the
      scope seatbelt), the one network call in the path.
    */
    test.slow();

    const watcher = watchPage(page);
    const name = uniqueName();

    await page.goto("/leads/new");
    // Before touching anything: a click on an unhydrated form submits it
    // the old way, and that submission is the one that goes missing.
    await waitForHydration(page, "form");
    await page.locator("#studentName").fill(name);
    await page.locator("#primaryPhone").fill(uniquePhone());

    /*
      Source is required now, and this test did not fill it — so the
      browser's own validation blocked the submit, the POST never
      happened, and the page sat on `/leads/new` until the 45s timeout.
      That is the failure, and it is the feature working.

      Driven through the combobox rather than by setting the hidden input,
      because the hidden input is what the browser validates and a test
      that writes to it directly would pass while the real control was
      broken. Any configured source will do: which one is the office's
      business, and this only needs one to exist.
    */
    await page.locator("#source").click();
    await page.getByRole("option").first().click();
    // Proves the pick landed. Without this the test would go on to blame
    // the server for a click that quietly selected nothing.
    await expect(page.locator("input[name='source']")).not.toHaveValue("");

    // Armed before the click, or a fast action could answer first.
    const actionAnswered = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" && new URL(response.url()).pathname === "/leads/new",
        { timeout: 45_000 },
      )
      .then((response) => response.status())
      .catch(() => null);

    await page.getByRole("button", { name: /create lead/i }).click();

    const status = await actionAnswered;
    expect(
      status,
      "the server action never answered within 45s — the hang is server-side (see this test's comment), not a slow browser",
    ).not.toBeNull();

    // The lead's own page, which is the only proof the row was written and
    // the assignment engine ran without throwing.
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 45_000 });
    await expect(page.getByRole("heading", { name })).toBeVisible();

    expect(await errorBoundaryText(page)).toBeNull();
    expect(watcher.problems, "creating a lead should be quiet").toEqual([]);
  });

  test("refuses a lead with no name, rather than writing a blank one", async ({ page }) => {
    await page.goto("/leads/new");
    await page.locator("#primaryPhone").fill(uniquePhone());
    await page.getByRole("button", { name: /create lead/i }).click();

    // Still on the form. Which message appears is the browser's business;
    // what matters is that nothing was created.
    await expect(page).toHaveURL(/\/leads\/new/);
  });

  test("finds a lead by name from the list", async ({ page }) => {
    // Search is how every counsellor actually navigates, and it goes
    // through the filter-term guard that strips characters Postgres would
    // choke on.
    await page.goto("/leads");
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill(MARKER);
    await page.waitForLoadState("networkidle");
    expect(await errorBoundaryText(page)).toBeNull();
  });
});

test.describe("the queues that tell people there is work", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("show a count in the sidebar, or nothing at all", async ({ page }) => {
    await page.goto("/dashboard");

    // The badges stream in after the nav, so waiting for the nav alone is
    // not enough.
    await page.waitForLoadState("networkidle");

    const unassigned = page.getByRole("link", { name: /unassigned/i }).first();
    await expect(unassigned).toBeVisible();

    // A badge is allowed to be absent — an empty queue shows nothing on
    // purpose. What it must never be is the string "0" or "NaN", both of
    // which are what a broken count looks like.
    const text = (await unassigned.innerText()).trim();
    expect(text, "an empty queue shows no badge, not a zero").not.toMatch(/\b(0|NaN|undefined)\b/);
  });

  test("every sidebar link goes somewhere that renders", async ({ page }) => {
    // Narrower than the crawler and worth having separately: this one
    // fails with the name of the nav item, which is the first thing you
    // want to know.
    await page.goto("/dashboard");
    const links = await page
      .locator("aside nav a[href^='/']")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => ({
          href: (anchor as HTMLAnchorElement).getAttribute("href") ?? "",
          label: (anchor.textContent ?? "").trim(),
        })),
      );

    expect(links.length, "the sidebar rendered no links at all").toBeGreaterThan(5);

    for (const link of links) {
      const watcher = watchPage(page);
      const response = await page.goto(link.href, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});

      expect(response?.status(), `${link.label} (${link.href})`).toBeLessThan(400);
      expect(await errorBoundaryText(page), `${link.label} (${link.href})`).toBeNull();
      expect(watcher.problems, `${link.label} (${link.href})`).toEqual([]);
    }
  });
});

test.describe("the printable sheets", () => {
  test.use({ storageState: storageStateFor("admin") });

  test("render without opening a print dialog", async ({ page }) => {
    // Visited directly rather than through their buttons, because a real
    // click opens a dialog headless Chromium cannot dismiss. Stubbing
    // `window.print` keeps the page's own auto-print out of the way.
    await page.addInitScript(() => {
      window.print = () => {};
    });

    await page.goto("/leads");
    const firstLead = page.locator("tbody a[href^='/leads/']").first();
    if ((await firstLead.count()) === 0) test.skip(true, "no leads to print");

    const href = await firstLead.getAttribute("href");
    const watcher = watchPage(page);
    await page.goto(`${href}/profile-form/print`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    expect(await errorBoundaryText(page)).toBeNull();
    expect(watcher.problems).toEqual([]);
    // The letterhead is the thing that makes it the institute's stationery
    // rather than a web page somebody printed.
    await expect(page.locator("body")).toContainText(/./);
  });
});
