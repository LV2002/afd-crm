# AFD India CRM — Technical Handbook

**Who this is for:** whoever maintains, deploys or extends this system.

Assumes working knowledge of TypeScript, React and SQL. Assumes **no**
knowledge of this codebase.

Read `CLAUDE.md` first — it is the architectural contract, and several
decisions below only make sense in light of it. This document is the
operational companion to it.

---

## 1. The shape of the thing

```
Next.js 15 (App Router, TypeScript strict)   ── hosted on Vercel
        │
        ├── Server Components read data directly
        ├── Server Actions perform mutations
        └── Route handlers serve webhooks + cron
        │
Supabase ─┬── Postgres          the database, and the authorization layer
          ├── Auth              email + password
          ├── Storage           private buckets, signed URLs
          └── Realtime          postgres_changes
        │
External ─┬── Meta Graph API    Lead Ads, ad spend, Custom Audiences, WhatsApp
          ├── Google Ads API    Lead Forms, spend, Customer Match, conversions
          └── Gemini            the /ask analyst
```

**The one thing to internalise: authorization lives in Postgres, not in
application code.** Every table with lead data has Row Level Security policies.
The app queries as the signed-in user with the anon key plus their JWT, and the
database decides what comes back. If you add a table with personal data on it
and no RLS policy, you have created a hole that no amount of careful query
writing will close.

---

## 2. Getting it running

```bash
npm install
cp .env.example .env.local        # fill it in — see §3
npm run db:migrate                # apply migrations
npm run db:seed                   # roles, permissions, stages, dropdowns…
npm run dev
```

```bash
npm run build       # production build — must pass before any merge
npm run lint        # eslint
npx tsc --noEmit    # types
npm test            # vitest — needs a real Postgres, see §8
```

---

## 3. Environment

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. Public, RLS-bound. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses RLS.** Webhooks and cron only. |
| `DATABASE_URL` | Postgres. Use the **pooler** string in production. |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts stored third-party credentials. |
| `CRON_SECRET` | Bearer token every cron route checks. |
| `GEMINI_API_KEY` | The `/ask` analyst. |

Two traps worth knowing in advance:

- **`DATABASE_URL` must be the pooler string in production.** Supabase's direct
  hostname resolves IPv6-only in many regions, which Vercel functions cannot
  reach. The symptom is not an error — it is a request that hangs until the
  function is killed. `src/lib/db/client.ts` sets `connect_timeout: 8` precisely
  so this fails *inside* the function's lifetime and produces a readable error.
- **The service-role key must never appear in a route a browser can reach.**
  Webhook handlers and cron jobs only.

---

## 4. Where things live

```
src/
  app/
    (auth)/login/
    (app)/…                 every signed-in screen
    f/[token]/              public profile form — no login, token is the auth
    api/
      webhooks/{whatsapp,meta-leads,google-leads,website}/
      cron/…                every scheduled job
      ai/query/
  lib/
    db/schema/              Drizzle tables, one file per domain
    db/migrations/          hand-written SQL + Drizzle journal
    auth/                   session, permissions, nav
    assignment/             the rules engine
    identity/               dedup + merge
    whatsapp/               audience, personalisation, flows, opt-out
    integrations/           Meta, Google, WhatsApp clients
    enrolment/ finance/     fees, ledger, discounts, promos
    reports/                pure reporting logic
    ai/tools/               the ONLY things the analyst can call
  components/
docs/
tests/
```

**A pattern you will see everywhere and should keep:** anything with real logic
lives in a **pure module** with no database and no `server-only`, and is unit
tested. The database access sits in a thin layer above it. `reminder-schedule.ts`,
`flow-engine.ts`, `promos.ts`, `gate-lag.ts`, `personalise.ts` and
`discount-authority.ts` are all this shape. It is why the suite runs in seconds
and why the arithmetic is trustworthy.

---

## 5. Authorization, properly

### Permissions

- **Permission primitives are fixed in code** (`lib/auth/permissions.ts`).
  Each one is an enforcement point that must exist somewhere.
- **Roles are database rows.** An admin can create, rename and re-bundle them
  with no deploy. Only `admin` is protected.
- A role is a bundle of primitives, each with a **scope**: `own`, `center`, `all`.

### In the database

Policies call helper functions, never a role name:

```sql
using (can_access_center('lead.read', center_id, assigned_to))
using (auth_scope('report.org') = 'all')
```

`role = 'admin'` must never appear in a policy. Roles are editable rows; a
policy written against one breaks the moment somebody renames it.

### In the application

```ts
const user = await getCurrentUser();
if (!user || !can(user, "batch.manage")) return { error: "…" };
```

This is **defence in depth, not the defence**. RLS is the defence.

### The exception, and its price

Some code uses the direct `db` client, which **bypasses RLS entirely**: cron
jobs, webhook handlers, and a handful of Server Actions that need to read across
tables RLS would fragment.

**Every one of those re-implements the scope check in code**, and says so in a
comment. If you write one, do the same. `batches/actions.ts` and
`fee-actions.ts` are the examples to copy.

---

## 6. The data model, in brief

Read `docs/01-DATA-MODEL.md` for the full thing. The five facts that matter:

1. **`leads` is the sales object** and stops changing after Gate 1.
2. **`students` is the academic object**, created at Gate 2, linked back by
   `lead_id`. Academics must never have to query the sales table.
3. **`enrolments` is the commercial record** — course, fee, discount, plan. It
   carries both gate timestamps.
4. **`payments` and `receipts` are append-only.** No UPDATE, no DELETE. A
   correction is a reversal row referencing the original. Receipt numbers come
   from a gapless database sequence.
5. **Money is `bigint` paise.** Never a float. One `formatINR()` helper.

### Configuration is data

Stages, temperatures, SLA policies, dropdowns, custom fields, assignment rules,
notification events, fee structures, promos, discount limits, terminology — all
rows with admin screens. The test in CLAUDE.md is the right one: *could this be
deployed for a different company by changing only database contents?*

### What is deliberately fixed in code

Permission primitives · the object model and its two gates · identity
resolution · ledger immutability · dashboard widget implementations · audit
logging · the AI's tool set · notification event keys · WhatsApp flow step kinds
and triggers · merge variables.

Each is an *enforcement or computation point* — something that cannot be
invented at runtime. `amount_due` is an allocation across an instalment
schedule, not a column somebody could point at.

---

## 7. Migrations

Hand-written SQL, not generated. To add one:

1. Write `src/lib/db/migrations/00NN_name.sql`. Separate statements with
   `--> statement-breakpoint`.
2. Append an entry to `migrations/meta/_journal.json`.
3. Copy the previous `meta/00NN-1_snapshot.json` to `00NN_snapshot.json` with a
   fresh `id` and the old `id` as `prevId`.
4. Update the Drizzle table definition in `db/schema/`.
5. `npm run db:migrate` against local Postgres and **verify the effect**, not
   just the exit code.

### Two traps that have already bitten

- **drizzle-kit runs every pending migration in ONE transaction.** So a
  migration cannot *use* an enum value a previous pending migration added.
  Migration `0054` works around this by comparing `status::text` instead of the
  enum literal. If you add an enum value and then reference it, you will hit
  this on the first run — the only run that matters.
- **drizzle-kit swallows the error.** A failed migration exits non-zero and
  prints nothing useful. To see the real error, run the SQL through `psql`
  directly with `ON_ERROR_STOP=1`.

### RLS on a new table

Always. Copy the shape from a comparable table:

- Lead-derived data → `can_access_center(...)` via a subquery on `leads`
  (see `enrolments` in `0017`).
- Org-wide admin config → `auth_scope('settings.manage') = 'all'`
  (see `fee_structures`).
- Org-wide reporting → `auth_scope('report.org') = 'all'`
  (see `ad_spend_daily`).

---

## 8. Tests

Vitest. `npm test`.

- **Pure logic** — no database. Most of the suite.
- **DB-backed** — real Postgres with migrations applied and the seed run. They
  create and delete `auth.users` rows and roles.

> **Never point the test suite at production.** It creates and deletes roles and
> auth users. `scripts/local-supabase-shim.sql` exists to make a plain Postgres
> look enough like Supabase to run them, and must **never** be run against a
> real Supabase project.

`fileParallelism: false` is set deliberately: several suites scan whole tables,
and in parallel one file's cleanup deletes rows another is mid-scan over.

`server-only` is aliased to a stub (`tests/stubs/server-only.ts`) — it exists to
fail a *build* that would ship server code to a browser, and a Node test run has
no browser to protect. Next.js still enforces the real check.

---

## 9. Integrations

### The ingestion rule

**Every lead entering the system goes through `resolveOrCreateLead()` then
`applyAssignment()`.** Webhook, CSV import, manual entry, public form — no
source gets a shortcut. In the previous version the Meta webhook wrote leads
directly, and the highest-volume paid source produced unassigned, unowned leads.

### The webhook rule

**Verify, persist, then process.** Check the HMAC signature before parsing.
Write the raw payload to `webhook_events` before doing anything with it. Return
non-2xx on genuine failure so the platform retries. The previous version caught
everything and returned 200, so failures were invisible.

### WhatsApp

One Business API number for the whole institute. A number registered to the
Cloud API can no longer be used in the WhatsApp Business app, so per-counsellor
numbers were ruled out — counsellors keep those on their own phones.

- Outside the 24-hour window, **only approved templates**. Broadcasts, flows and
  fee reminders are therefore all template sends.
- Templates are **not** mirrored locally. Meta owns approval state and it
  changes without telling us.
- Media is uploaded **once per broadcast** and the media id reused; Meta keeps
  it 30 days.
- Inbound button taps arrive as `type: "button"` or `interactive.button_reply` —
  `mapMessageContent` normalises them to the button's text.

### Google

Ad spend sync, Customer Match, Lead Forms, and **offline conversion upload** —
which reports paid admissions back against their GCLID so Smart Bidding
optimises for students rather than form fills. Requires a conversion action of
type *Import — from clicks*, pasted into Settings → Integrations → Google.

---

## 10. Scheduled work — read this before touching `vercel.json`

**The hosting plan allows one cron a day.** That single constraint shapes the
whole scheduling story, and there are currently three consequences:

| Job | Runs |
|---|---|
| `whatsapp-broadcast-sweep` | Weekly, Sunday 01:00 UTC |
| `payment-reminders` | Daily |
| SLA, temperature, ad spend, retargeting | Weekly, spread across days |
| **`whatsapp-flows`** | **Not scheduled** — called by the broadcast sweep |
| **`google-conversions`** | **Not scheduled** — called by the Google spend sync |

The last two are real routes with real auth; they are simply not in
`vercel.json` because there is no slot. Their work is idempotent and guarded by
`wake_at` / a unique index, which is what makes the piggybacking safe.

**The right fix, and the top item on the backlog, is a single
`/api/cron/tick` route that calls every sweep in sequence** — then one daily
cron drives the entire system and nothing piggybacks. Until then, be aware that
a broadcast scheduled for Tuesday 10am actually leaves the following Sunday, and
that `SWEEP_CADENCE_NOTE` in `lib/whatsapp/schedule.ts` is the one sentence on
screen that must be updated when the schedule changes.

Every cron route checks `Authorization: Bearer ${CRON_SECRET}` and returns 401
without it.

---

## 11. Performance — what was wrong and what to watch

The application was slow for three compounding reasons, all now fixed. Knowing
them will stop you reintroducing them.

**1. The session was fetched dozens of times per page.** `getCurrentUser()` is
called from ~165 places, and each call made *four* network round trips —
`auth.getUser()` is an HTTP call to Supabase's auth server, not a local token
decode — plus the profile, the role's permissions and the user's centres. Five
callers on one page meant twenty round trips before any real data was fetched.

> It is now wrapped in React's `cache()`: once per request, free thereafter.
> **Per request only** — nothing is cached across requests, because stale
> permissions are a security bug. `createClient()` and `getTerminologyMap()` are
> cached the same way. If you add a widely-called request-scoped helper, cache
> it.

**2. The connection pool was `max: 1`.** Every direct-`db` query serialised
behind every other, so a `Promise.all` of six queries executed strictly one at a
time. Now 5, with a 20s idle timeout.

**3. The database had almost no indexes.** Every foreign key and every hot
filter was unindexed — `leads` had three indexes, all unique constraints — so
every list, board and join was a sequential scan *with an RLS function call per
row*. Migration `0058` adds them, and `ANALYZE`s afterwards so the planner uses
them immediately.

**4. There were no loading states.** Clicking a link left the old page frozen
until the server finished. `(app)/loading.tsx` is a skeleton shown instantly on
every navigation. If you add a route group, give it one.

**When adding a screen:**

- Use `Promise.all` for independent queries. Never `await` them in sequence.
- Index what you filter and sort on, and make it partial on `deleted_at is null`
  — nothing hard-deletes, so dead rows accumulate forever.
- Avoid `select("*")` on `leads`/`students` unless you genuinely need every
  column (the audience resolver does, because custom fields are configuration).
- Put anything slow and non-essential behind `<Suspense>` so it cannot block the
  rest of the page.

---

## 12. Privacy and search engines

Three independent layers keep this out of search indexes, and each covers what
the others cannot:

| Layer | Covers |
|---|---|
| `robots` metadata in the root layout | Every HTML page |
| `src/app/robots.ts` | Crawlers that read `robots.txt` before fetching |
| `X-Robots-Tag` header in `next.config.ts` | Everything else — PDFs, JSON, files |

"It needs a login anyway" is not sufficient: `/f/<token>` is reachable without
one, and a crawled token would sit in an index.

`next.config.ts` also sets `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.

Not yet done, and worth doing: **rate-limit `/f/*` at the edge** (Cloudflare
Turnstile or a WAF rule). It has a honeypot and no rate limit, and that belongs
in front of the application rather than inside it.

---

## 13. Runbook

**A cron didn't run.** Check the Vercel cron log, then hit the route by hand
with the `CRON_SECRET` bearer token. Every one is idempotent and safe to re-run.

**WhatsApp sends are failing.** Check `whatsapp_broadcast_recipients.error_message`
and `whatsapp_flow_run_events`. Usually the template (rejected or paused at
Meta) or the 24-hour window. Failed sends are recorded, **not** retried — the
same template will be refused identically tomorrow and every attempt costs money.

**A webhook delivery went missing.** Everything is in `webhook_events`, raw,
with its signature-verification result and processing status.

**Somebody says they were messaged after opting out.** `whatsapp_suppressions`
keeps `released_at` rather than deleting, so the full history is there. Check
`audit_log` for who released it.

**A fee balance looks wrong.** Look for a reversal. The ledger is append-only,
so the current figure is always the sum of the lines — nothing was edited.

**A migration fails on deploy.** Run the SQL through `psql` with
`ON_ERROR_STOP=1` to see the actual error (drizzle-kit hides it). Check §7 for
the enum-in-one-transaction trap.

**The site hangs with no error.** Almost certainly `DATABASE_URL` pointing at
the non-pooler hostname. See §3.

---

## 14. Extending it

**A new screen** → `src/app/(app)/<name>/page.tsx`, gate on a permission with
`can(user, …)`, add it to `lib/auth/nav.ts` and its icon in `sidebar.tsx`.

**A new table** → schema file, hand-written migration **with RLS**, export it
from `db/schema/index.ts`.

**A new integration** → credentials through `integration_credentials`
(encrypted), a client in `lib/integrations/`, a webhook that verifies-persists-
processes, a settings screen.

**New logic** → a pure module with tests, and a thin database layer above it.

**A new automation step or merge variable** → add it to the fixed catalogue in
`flow-engine.ts` / `merge-variables.ts` and implement it in the runner. These
are code, not configuration, on purpose.

**Before merging anything:** `npx tsc --noEmit`, `npm run lint`, `npm test`,
`npm run build` — all clean. Update `docs/PROGRESS.md`. Record any assumption
in `docs/DECISIONS.md`.

---

## 15. The known gaps

Honest list, in the order I would close them:

1. **The cron budget** (§10). Three features have no schedule of their own.
2. **Inbound WhatsApp media** is recorded by Meta's media id and never
   downloaded, so it cannot be viewed in the CRM. The raw delivery is in
   `webhook_events`, so nothing is lost.
3. **Rate-limiting on `/f/*`** (§12).
4. **Telephony** — the whole of Phase 6 is blocked on choosing a vendor.
5. **Opening balances** must be set before any finance figure means anything.

`docs/BACKLOG.md` is the maintained list; this is the subset a maintainer
inherits rather than a feature request.
