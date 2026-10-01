import { defineConfig, devices } from "@playwright/test";

/**
 * Clicking through the whole CRM, the way a person would.
 *
 * Vitest covers the logic with real consequences — assignment, identity,
 * SLA, money. None of it opens a page. So a button wired to nothing, a link
 * to a route that no longer exists, a server component that throws on a
 * lead with no centre: all green, all broken. This is the other half.
 *
 * ## It must never run against the live CRM
 *
 * These tests create leads, confirm admissions and delete things. Pointed
 * at production they would do all of that to real students. `e2e/guard.ts`
 * refuses any base URL that is not local unless `E2E_ALLOW_NON_LOCAL=1` is
 * set deliberately, and the same guard refuses a Supabase URL that is not
 * the local stack.
 *
 * ## Running it
 *
 *   npm run e2e           headless, the whole suite
 *   npm run e2e:ui        the Playwright inspector, to watch it click
 *   npm run e2e:report    the HTML report from the last run
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  // The suite shares one database. Two workers creating leads at once make
  // "how many leads are there" unanswerable, and the failures look like
  // application bugs rather than like a test-harness choice.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // On a failure you want to SEE it. The trace opens in a viewer that
    // replays the clicks, the network and the DOM at each step — which is
    // the difference between "a test failed" and knowing why.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    // India, so dates and currency in assertions match what staff see.
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },

  projects: [
    // Signs in once per role and saves the cookies. Every other project
    // reuses them, so the suite logs in six times rather than once per test.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      // Counsellors work from phones. The sidebar is hidden below `md` and
      // everything goes through the drawer, which is a different set of
      // elements and has been broken before.
      name: "mobile",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],

  // Starts `next dev` unless something is already listening. Deliberately
  // not `next build && next start`: a dev server surfaces the React and
  // hydration warnings that a production build swallows, and those are
  // exactly the bugs a click-through finds.
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
