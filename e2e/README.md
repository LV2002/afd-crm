# Clicking through the whole CRM

`npm test` (Vitest) covers the logic with real consequences — assignment,
identity, SLA, money. None of it opens a page. So a button wired to nothing, a
link to a route that no longer exists, or a screen that throws for a counsellor
and not for an admin: all green, all broken.

This is the other half. It drives a real Chromium, signs in as each of the six
roles, and opens every screen each of them can reach.

## It must never run against the live CRM

These tests create leads and click buttons. Pointed at production they would do
that to real students, and some of it cannot be undone — a recorded payment and
its receipt number are append-only by design.

`e2e/guard.ts` refuses any base URL that is not localhost, and refuses a local
server that is pointed at a hosted Supabase. Override it only for a genuinely
throwaway instance, and only on purpose:

```
E2E_ALLOW_NON_LOCAL=1 E2E_BASE_URL=https://staging.example npm run e2e
```

## Running it

**On GitHub, which is the normal way.** Actions → *Browser test* → Run
workflow. It builds a throwaway copy of the whole system — Postgres, a real
Supabase auth server, the six logins — runs against that and throws it away.
The report is an artifact on the run. It also runs on every pull request into
`main`. See `.github/workflows/e2e.yml`.

**On your own machine**, if you want to watch it click. Needs Docker, for
`npx supabase start` — the suite signs in, so it needs a real auth server and
the bare-Postgres shim the other tests use is not enough.

One-time, on a new machine:

```
npm run e2e:install        # downloads the browser (~150 MB)
```

Then, with a local database that has been migrated and seeded:

```
npm run db:migrate
npm run db:seed            # creates the six logins the suite signs in as
npm run e2e
```

It starts `npm run dev` itself if nothing is already listening on port 3000.

| Command | What it does |
|---|---|
| `npm run e2e` | The whole suite, headless. A few minutes. |
| `npm run e2e:ui` | Playwright's inspector — watch it click, step backwards, see the DOM at each step. **Start here if something fails.** |
| `npm run e2e:headed` | Same run, visible browser. |
| `npm run e2e:report` | The HTML report from the last run. |
| `npx playwright test crawl` | Just the crawler. |
| `npx playwright test --project=mobile` | Just the phone tests. |

On a failure the report carries a **trace**: a replay of the clicks, the network
and the DOM at each step, plus a screenshot and a video. That is the difference
between "a test failed" and knowing why.

## What it covers

**`crawl.spec.ts`** — the one that answers "click everything". Starting from the
dashboard it discovers links on each page and follows them, for every role,
up to 60 screens each. A screen fails if it returns an HTTP error, renders an
error boundary, logs a console error, or makes a request that fails.

Two deliberate choices:

- **It discovers rather than lists.** A screen added next month is covered the
  day it gets a link, and a link to a deleted route fails here.
- **"Access denied" is not a failure.** It is the permission system working. A
  crawler that treated it as a bug could not test a counsellor at all.

It will not follow anything destructive, anything off-site, print pages (the
dialog cannot be dismissed headlessly) or exports (they download a file).

**`journeys.spec.ts`** — the handful of things that must actually *do*
something. The crawler proves no screen is broken; it cannot prove a button
works, because a form wired to a failing action renders perfectly. Creating a
lead, refusing a blank one, searching, the sidebar queue counts, the printable
sheet.

**`mobile.spec.ts`** — a Pixel viewport. The sidebar is hidden below `md` and
everything goes through the drawer, which is a different set of elements and
has been missing entirely before. Also checks the lead list does not scroll
sideways, which is invisible on a desktop run.

## What it does not cover, and why

- **Webhooks and cron.** No browser involved. They have Vitest suites.
- **Anything that charges money or messages a real person.** Recording a
  payment is append-only and WhatsApp sends to a real number, so neither is
  driven here. Both are covered by Vitest against the database.
- **How it looks.** This finds broken, not ugly. Visual regression is a
  separate thing and not worth its maintenance cost at this size.

## Adding a test

Put it in the file it belongs to rather than making a new one. Prefer
`getByRole`/`getByLabel` over CSS classes — those survive a restyle, and a
suite that breaks every time somebody changes a class is a suite that gets
deleted.

Keep journeys few. Forty of them is a suite nobody maintains, and the crawler
already covers "does this screen work".
