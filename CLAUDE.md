# AFD India CRM — Claude Code Context

Read this file completely before writing any code. Then read `docs/01-DATA-MODEL.md`
before touching the schema, `docs/02-BUILD-PHASES.md` before starting a task, and
`docs/03-V1-AUDIT.md` before building anything that ingests data or checks access —
it lists the specific bugs in the previous version that must not be repeated.

---

## What this is

A custom CRM for **AFD India**, a 25-year-old design & architecture entrance-exam
coaching institute in Kerala. Students prepare for NID, NIFT, UCEED, CEED, NATA and
JEE Paper 2. Two centres today (Kochi, Kannur), expanding. ~200 leads/month.

The CRM is the single source of truth for every lead from first touch to enrolment,
and it is where all sales work happens — calls, WhatsApp, follow-ups, fee collection.

There is a **previous version** (FastAPI + MongoDB + CRA) that was abandoned for being
inflexible. Do not port its code. Its field taxonomy is reused and is already captured
in the seed data. Its architectural mistakes are listed under "Non-negotiables" below.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| DB | Postgres via Supabase |
| ORM | Drizzle |
| Auth | Supabase Auth (email+password), `profiles` table extends `auth.users` |
| Authorization | **Postgres Row Level Security** — not app code |
| Realtime | Supabase Realtime (postgres_changes) |
| Files | Supabase Storage, private buckets, signed URLs |
| UI | Tailwind + shadcn/ui + lucide-react |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| Background jobs | Vercel Cron → route handlers under `/api/cron/*` |
| AI | `@anthropic-ai/sdk`, `claude-sonnet-4-6`, tool-use only |
| Hosting | Vercel |

Timezone is **Asia/Kolkata** everywhere user-facing. Store all timestamps as `timestamptz` in UTC.
Currency is INR, stored in **paise as `bigint`**. Never use floats for money.

---

## Non-negotiables

These are the specific failures of v1. Violating any of them means the rebuild was pointless.

1. **Stage and temperature are separate columns.** `stage_id` is funnel position;
   `temperature` is a separate configurable dimension. A lead can be Hot at
   Demo-Scheduled. Never merge these, and never derive one from the other.

2. **Never reject a duplicate.** Always create, then link or merge. See "Identity" below.
   `throw new Error('phone exists')` on lead creation is forbidden.

3. **Authorization lives in RLS policies**, not in query builders. Every table with lead
   data gets a policy. App code must never be the only thing standing between a counsellor
   and another counsellor's leads. Use the anon/authenticated key with the user's JWT for
   all normal reads and writes. The service-role key is used **only** in webhook handlers
   and cron jobs, never in a route reachable by a browser session.

4. **Assignment is a rules engine**, one table with JSONB conditions and a priority order.
   Adding "assign Kannur + Meta + NIFT to Athira" must require zero schema changes.

5. **Every mutation writes to `audit_log`.** Every export writes to `audit_log`.
   Nothing is hard-deleted; use `deleted_at`.

6. **Every read of a lead list must not expose full phone numbers to counsellors in bulk.**
   Masked in list view (`+91 98••••3456`), full on the detail page, and revealing writes an
   audit row. Counsellors leave and take databases with them.

7. **Financial rows are append-only.** `payments` and `receipts` are never updated or
   deleted. A correction is a reversal entry referencing the original. Receipt numbers come
   from a gapless database sequence, never generated in application code. This becomes an
   accounting system later; retrofitting an append-only ledger onto a year of mutable
   transactions is not something you want to do.

8. **One ingestion path.** Every lead entering the system — webhook, CSV import, manual
   entry, inbound WhatsApp, inbound call — goes through `resolveOrCreateLead()` then
   `applyAssignment()`. No source gets its own shortcut. In v1 the Meta webhook wrote leads
   directly, so the highest-volume paid source produced unassigned, unowned leads.

9. **Webhooks: verify, persist, then process.** Check the HMAC signature before parsing.
   Write the raw payload to `webhook_events` before doing anything with it. Return non-2xx
   on genuine failure so the platform retries. V1 caught every exception and returned 200,
   so failures were invisible and unrecoverable.

10. **Configuration is data, not code.** Before hardcoding any list, label, threshold,
   stage, role, field, or rule — check whether an admin would ever reasonably want it
   different. If yes, it is a database row with an admin UI. The test: *could this system
   be deployed for a completely different company by changing only database contents?*
   See "What is configurable" below.

## What is configurable

**Admin-editable at runtime, no deploy:**

| Area | What can change |
|---|---|
| Organisation | Name, logo, colours, timezone, currency, locale, fiscal year |
| Terminology | The words for lead, student, counsellor, centre, course, exam |
| Centres | Add, rename, deactivate, set timezone and catchment |
| Users | Add, deactivate, assign to centres, change role |
| Roles | Create, rename, change permission bundle, delete (except `admin`) |
| Pipeline | Stages: add, rename, reorder, recolour, set type, probability, per-stage SLA |
| Temperature | The temperature values themselves, and the rules that assign them |
| SLA | Multiple policies, per-source/centre/stage targets, escalation ladders, business hours |
| Lead fields | Add custom fields of any supported type — no migration |
| Dropdowns | Every enumerated list in the system |
| Assignment | Rules, conditions, priority, strategy |
| Scoring | Which signals count and their weights |
| Forms | Registration and intake form fields |
| Notifications | Which events notify which roles, on which channels, with what copy |
| Dashboards | Which registered widgets appear for which role |
| Fees | Structures, promos, discount authority limits, instalment templates |
| Templates | WhatsApp and email message templates |

**Fixed in code, deliberately:**

- Permission primitives — each one is an enforcement point that must exist in the codebase
- The object model: lead → enrolment → student, and the two gates between them
- Identity resolution and merge logic
- Ledger immutability
- Dashboard widget implementations (admin composes them; doesn't author new ones)
- Audit logging

The second list is short on purpose. If you find yourself wanting to add to it, that's
usually a sign the thing belongs in the first list instead.

## Plug-and-play test

The system must support **config export/import**: dump every configuration table to a
single JSON bundle, import it into a fresh instance, get a working CRM shaped the same way
with no data. This is both the multi-company story and your own staging→production path.
Build the export in Phase 1 even though nothing needs it yet — it forces the discipline of
keeping configuration genuinely separate from data.

---

## Roles

## Roles and permissions — dynamic

**Roles are database rows, not a TypeScript enum.** An admin can create a role, rename it,
change what it can do, and assign it to people, with no code change and no deploy.

What *is* fixed in code is the list of **permission primitives** — the named things the
system knows how to enforce. Each primitive corresponds to an actual check somewhere in
the codebase, so it cannot be invented at runtime. A role is a bundle of primitives plus
a data scope.

```
permission primitive   e.g. lead.read, lead.assign, payment.record, settings.manage
data scope             own | center | all
role                   a named bundle of primitives, each with a scope
```

RLS policies call `auth_has('lead.read','center')`, never `role = 'admin'`.
See `docs/01-DATA-MODEL.md` § Permissions.

Six roles ship as seed data — `admin`, `co_admin`, `center_head`, `counsellor`,
`accounts`, `academics` — but they are ordinary editable rows. Only `admin` is protected:
it holds every primitive and cannot be deleted or stripped, so the system can't be locked
out of itself.

A user may be assigned to multiple centres via `user_centers`.

## The lifecycle chain

This system is stage one of a four-department pipeline. Build with the whole chain in mind
even though only the first two stages are in scope now.

```
Marketing  →  Sales  →  Accounts  →  Academics
 (lead in)   (admission  (fees,      (course, batch,
             confirmed)  payments)   exams, delivery)
```

Two named gates, both timestamped, both irreversible without an admin override:

- **`sales_to_accounts_at`** — counsellor confirms the admission. Lead work stops.
- **`accounts_to_academics_at`** — first payment cleared. A `students` row is created.

Measure the lag between them; it's a real operational metric.

**`leads` is the sales object and stops changing after the first gate.** `students` is the
academics object, created at the second gate, linked back via `lead_id`. Do not model a
student as "a lead with a flag" — academics must never have to query the sales table.
See `docs/01-DATA-MODEL.md` § Students.

---

## Domain vocabulary

- **Lead** — a prospective student. Identity is the *person*, not the enquiry.
- **Enquiry** — one inbound event (a form fill, an ad lead, a walk-in). Many enquiries → one lead.
  This is how the same person arriving from Meta then walking in stays one record.
- **Centre** — a physical branch. Kochi, Kannur.
- **Counsellor** — sales rep. Owns leads, makes calls, sends WhatsApp.
- **Stage** — funnel position. See `pipeline_stages`.
- **Temperature** — hot/warm/cold/dead. Independent of stage.
- **Enrolment** — the commercial record: course, fee, discount, payment plan. Owned by accounts.
- **Student** — the academic record, created at the accounts→academics gate. Owned by academics.
- **Handoff** — one of the two named gates above. Always specify which.
- **First-touch source** — the source of the *first* enquiry. Never overwrite it.
- **Last-touch source** — the source of the most recent enquiry before conversion.

Exams: NID, NIFT UG, NIFT MDes, UCEED, CEED, NATA, JEE Paper 2.
Courses: Foundation, DWO, DAO, DRH, Crash, Repeat Batch, MDes, Consultancy.
These live in `dropdown_options` and are admin-editable. Never hardcode them.

---

## Directory layout

```
src/
  app/
    (auth)/login/
    (app)/
      dashboard/          role-aware landing
      my-day/             counsellor work queue — the default screen for counsellors
      leads/
        page.tsx          list + filters
        [id]/             detail: profile, timeline, whatsapp, files, payments
      pipeline/           kanban
      reports/            prebuilt dashboards
      ask/                AI analyst chat
      settings/
        centers/ users/ stages/ rules/ dropdowns/ forms/ fees/ templates/ integrations/
    api/
      webhooks/
        whatsapp/         Meta WABA inbound + status
        meta-leads/       Lead Ads
        website/          your existing site forms
        knorish/          course purchase events
      cron/
        sla-sweep/ recompute-temperature/ ad-spend-sync/ digest/
      ai/query/           tool-use endpoint
  lib/
    db/schema/            drizzle table definitions, one file per domain
    db/queries/           typed query helpers
    auth/                 session, role guards
    assignment/           rules engine
    identity/             dedup + merge
    whatsapp/             WABA client
    ai/tools/             the ONLY things the AI can call
  components/
```

---

## AI analyst rules

The `/ask` feature must **never** generate SQL against the live database.

Implement a fixed set of parameterised tools in `lib/ai/tools/` — e.g. `leads_by_source`,
`conversion_by_counsellor`, `funnel_snapshot`, `sla_breaches`, `roas_by_campaign`,
`cohort_conversion`, `lost_reason_breakdown`. Each takes typed args (date range, centre,
source) and returns aggregated rows. Register them as Anthropic tool definitions and let
Claude compose an answer plus suggested actions.

Every tool must receive the caller's `user_id` and apply the same centre scoping as RLS.
A centre head asking "how did Kochi do" when they only own Kannur must get nothing.

---

## Conventions

- Server Components by default. `'use client'` only for interactivity.
- Mutations are Server Actions, except webhooks and cron which are route handlers.
- All input validated with zod at the boundary; infer types from zod, don't duplicate.
- Money: `bigint` paise. Format with a single `formatINR()` helper.
- Phone numbers: normalise to E.164 (`+91XXXXXXXXXX`) on write, always.
- Dates: `date-fns-tz`, `Asia/Kolkata` for display.
- No `any`. No `@ts-ignore`.
- Tests: Vitest for the assignment engine, identity/dedup, and SLA logic. These three
  have real logic and real consequences; the rest can lean on types.

---

## Working style

- Build in the phase order in `docs/02-BUILD-PHASES.md`. Do not start Phase 3 work while
  Phase 1 is incomplete.
- After each task, update `docs/PROGRESS.md` with what shipped and what's stubbed.
- When a requirement is ambiguous, write down the assumption in `docs/DECISIONS.md`
  and proceed. Don't stall.
- Prefer boring, obvious code. This system will be maintained by whoever comes next.
