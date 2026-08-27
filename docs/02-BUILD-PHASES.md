# Build Phases

Ship each phase to production and use it before starting the next. The failure mode for a
project this size is building all of it and using none of it.

---

## Phase 0 — Foundation (2–3 sessions)

Scaffold, auth, dynamic permissions, RLS, reference data. Nothing user-visible except login
and settings.

- Next.js 15 + TS + Tailwind + shadcn, Supabase project, Drizzle configured
- `org_settings`, `terminology`, `centers`, `profiles`, `user_centers`
- `permissions`, `roles`, `role_permissions` — dynamic role model
- `dropdown_categories`, `dropdown_options`, `pipeline_stages`, `field_definitions`,
  `audit_log`
- `auth_center_ids()`, `auth_scope(perm)`, `can_access_center(...)` SQL functions
- Lockout-protection triggers
- RLS on all of the above, branching on `auth_scope`
- Login, session, permission-gated layout, sidebar driven by the caller's permissions
- **Settings screens, working, this phase**: centres, users, roles & permissions,
  pipeline stages, dropdowns, custom fields, organisation & terminology
- Seed: 2 centres, 6 roles, 6 users, full taxonomy, 14 stages, core field definitions
- `tests/rls.spec.ts` — including the runtime-created-role test

Settings comes early rather than late on purpose. If the configuration layer is bolted on
after the features, the features will have hardcoded the things it was meant to control.

**Done when:** you can create a brand new role in the UI, give it narrow permissions,
create a user with it, log in as them, and see exactly the access you granted — and the
RLS test suite is green.

---

## Phase 1 — Lead core (the phase that actually matters)

This is the minimum system that beats what you have today.

- `leads`, `lead_identifiers`, `enquiries`, `interactions`, `stage_history`, `tasks`, `notifications`
- **Identity service**: normalise → match → attach or create → flag for merge review
- **Assignment engine**: `assignment_rules` table, JSONB evaluator, `assignment_history`
- **Custom field engine**: `getFieldSchema('lead')` drives the form, the list columns,
  the filter bar and the export — one schema source, no duplicated field lists.
  Lead detail tabs are generated from the distinct `section` values, not hardcoded
- Port `indianStatesDistricts.js` from v1 verbatim — state list with district cascade
- `lead_promos`: apply a discount during counselling, before any enrolment exists
- Trigger on `leads.stage_id` writing `stage_history`
- Lead list: filters, saved views, masked phones, CSV export (audited)
- Lead detail: profile, editable fields, timeline, tasks, notes
- Kanban pipeline with drag-to-stage, lost-reason modal driven by `requires_reason`
- **Mandatory next action** on every interaction log
- CSV/XLSX import with column mapping, dry-run preview, dedupe report
- Manual lead creation
- In-app notifications + realtime
- **Config export/import** — the plug-and-play test

**Done when:** you can add a custom field in Settings and see it appear in the lead form,
the list, the filters and the export without touching code — and you can import your
existing Sheets.

---

## Phase 2 — Ingestion, SLA and dashboards

- `webhook_events` table: signature check → persist raw → process → mark done.
  Dead-letter rows stay for replay. HMAC verification is mandatory on every source
- Webhooks: Meta Lead Ads, website forms, Knorish/Edbound, Google Ads bridge
- Nightly reconciliation sync (webhooks drop messages; always reconcile)
- Email parser for database enquiries
- **My Day** screen: overdue → due today → new assignments → at-risk
- SLA cron: evaluates `sla_policies` per lead, honours business hours, runs the
  escalation ladder, flags breaches, requeues where the policy says so
- Orphan queue for centre heads
- Temperature recompute job driven by `temperature_rules` + lead scoring from
  `scoring_rules` — neither hardcoded
- Prebuilt dashboards: leads by source, funnel, counsellor scorecard, centre performance
- Generic pivot widget: lead counts by source / city / state / district / exam / stage /
  year / course / centre over a date range — one widget, nine reports
- Export to CSV, styled XLSX, and PDF; downloadable import template with a sample row
- Daily digest to admin
- Merge review UI

**Done when:** a Meta lead lands in the CRM within seconds, gets assigned, and nobody
touches it for 25 hours — and the centre head knows.

---

## Phase 3 — WhatsApp

- Two WABA numbers registered, `whatsapp_accounts` configured
- Inbound webhook → identity resolution → thread on lead record
- Outbound send with service-window enforcement and countdown UI
- Template library synced from Meta
- Campaigns: segment builder, preview, send, per-recipient status
- Suppression list, opt-out keyword handling
- Counsellor number migration (people problem — plan the cutover carefully; migrating a
  number to API removes it from the WhatsApp Business app permanently and the counsellor
  loses her existing chat history)

---

## Phase 4 — Fees, enrolment, payments, handoff

- Fee structure master, promos, discount approval workflow
- Registration form builder + tokenised public link + file upload to private bucket
- Payment plan generator → PDF agreement with reference number
- Signed-copy upload and permanent attachment
- **Gate 1**: sales → accounts. Accounts queue, notification, counsellor loses edit rights
- **Append-only payment ledger** with reversal entries and gapless receipt sequence
- Instalment tracking (derived balances, not stored counters), ageing buckets,
  overdue reminders, collection dashboard
- **Gate 2**: accounts → academics. `students` + `batches` tables, student record created,
  batch assignment, academics read view
- Gate-lag reporting, revenue and finance reports

This phase is the foundation of the future accounting module. Get the ledger shape right
here and the accounting system later is additive rather than a migration.

---

## Phase 5 — Intelligence

- Ad spend sync (Meta + Google), `ad_spend_daily`
- CPL / cost-per-admission / ROAS / LTV:CAC dashboards
- First-touch vs last-touch comparison
- Google offline conversion upload (GCLID → admission)
- Cohort conversion curves
- Geographic heatmap, school-level analytics
- Targets and weighted pipeline forecast
- **AI analyst** (`/ask`) with the fixed tool set

> The AI analyst is in Phase 5 not because it's unimportant but because it has nothing
> useful to say until there's a quarter of clean data behind it. Build the tools early if
> you like; the answers only get good later.

---

## Phase 6 — Telephony

- Exotel/Ozonetel click-to-call, masked number
- Auto-logged direction, duration, disposition, recording
- Missed-call → lead + callback task
- Transcription (Whisper handles Malayalam/Manglish acceptably) → AI call scoring against
  a rubric: budget discussed, objection handled, next step set, close attempted
- Call QA dashboard for centre heads

---

# Session plan

Eleven sessions gets you a system your counsellors can use. Everything after that is
improvement on something working, which is a much safer place to be.

| # | Task | You verify by |
|---|---|---|
| 1 | Phase 0 scaffold + auth + dynamic permissions + RLS | Log in as two roles, different nav |
| 2 | Settings UI: org, centres, users, roles, stages, dropdowns, custom fields | Create a role in the UI, log in as it |
| 3 | RLS test suite incl. runtime-created role | `npm test` green, fails when you break a policy |
| 4 | Identity module + tests | Same phone twice → one lead, two enquiries |
| 5 | Assignment engine + tests | Rule fires, dry-run preview counts match |
| 6 | Custom field engine + lead list | Add a field in Settings, it appears everywhere |
| 7 | Lead detail + timeline | Log an interaction, next-action enforced |
| 8 | Kanban + lost reason | Can't reach Lost without a reason |
| 9 | CSV import + column mapper | Import 50 real rows, dedupe report is right |
| 10 | Config export/import | Export → fresh DB → same shaped CRM |
| 11 | Deploy + import real data | It's live with your data in it |

Full prompts for sessions 1–3 are below. After that, use the template in
`docs/GETTING-STARTED.md` § Part 3 with the task from this table.

### Session 1
```
Read CLAUDE.md, docs/01-DATA-MODEL.md and docs/02-BUILD-PHASES.md in full
before writing anything.

Build Phase 0 schema and auth only. No settings UI yet — that is session 2.

Scaffold:
- Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui
- Drizzle against DATABASE_URL
- Three separate Supabase client modules (browser / server / service-role) in
  separate files, so service-role cannot be imported into a client component

Schema:
- org_settings, terminology, centers, profiles, user_centers
- permissions, roles, role_permissions  (dynamic role model per the data model doc)
- dropdown_categories, dropdown_options, pipeline_stages, field_definitions, audit_log
- Seed the permission primitives from a single constant in
  src/lib/auth/permissions.ts — that constant is the source of truth
- SQL functions: auth_center_ids(), auth_scope(perm), can_access_center(...)
- Lockout-protection triggers per the data model doc
- RLS on every table, branching on auth_scope — never on a role name

Auth & shell:
- Email/password login via Supabase Auth
- Session handling, permission-gated layout
- Sidebar built from the caller's permissions, not a hardcoded role check
- Stub pages are fine

Seed:
- 2 centres (Kochi, Kannur), 6 roles, 6 users, full dropdown taxonomy,
  14 pipeline stages, core field definitions

Stop there. Update docs/PROGRESS.md and tell me exactly how to verify it.
```

### Session 2
```
Read CLAUDE.md and docs/PROGRESS.md.

Phase 0, part B — the settings layer. This is what makes the system configurable,
so build it now rather than after the features.

Screens under /settings, each permission-gated:
- Organisation: name, logo, colours, timezone, currency, locale
- Terminology: rename lead / student / counsellor / centre / course / exam
- Centres: create, edit, deactivate, assign users
- Users: create, deactivate, assign role, assign centres
- Roles & permissions: create a role, edit its permission bundle with scope per
  permission, delete (block deleting protected roles)
- Pipeline stages: add, rename, reorder by drag, colour, type, probability, SLA hours,
  required fields to enter the stage
- Temperatures: manage the values, colours, order, and the rules that assign them
- SLA policies: create policies with conditions, targets and escalation ladders;
  per-centre business hours and holidays
- Dropdowns: manage categories and options
- Custom fields: add a field to lead/student/enrolment, pick type, options,
  validation, which roles see it, whether it shows in list and filters

All labels in the app must read through a t() helper backed by the terminology table.
No hardcoded user-facing entity names anywhere.

Done when I can create a role in the UI, assign it to a new user, log in as them,
and see exactly the access I granted.
```

### Session 3
```
Read CLAUDE.md and docs/PROGRESS.md.

Write tests/rls.spec.ts.

For each seeded role: log in, query every table with no filter, assert the row counts
match what that role should see.

Then the important one: create a NEW role at runtime with a narrow permission bundle,
create a user with it, log in, and assert the RLS boundary holds. Dynamic roles that
only work for the seeded six aren't dynamic.

Also assert:
- payments and receipts reject UPDATE and DELETE for every role including admin
- the lockout triggers prevent removing the last settings.manage user
- audit_log rejects UPDATE and DELETE

Then show me how to make the suite fail on purpose so I can confirm it works.
```

---

# Migration from the old system

1. Export current Sheets and any v1 Mongo data to CSV.
2. Map columns using the import mapper — v1's field names carry over almost 1:1.
3. Import in source-batches so `first_touch_source` is set correctly per batch, oldest first.
4. Expect the dedupe report to surface real duplicates that v1 hid by rejecting them.
   Review the merge queue before going live.
5. Run both systems in parallel for two weeks. Webhooks write to both.
6. Cut over once SLA and dashboards are trusted.

Keep the existing Apps Script pipeline as a fallback writer until Phase 2 webhooks have
run clean for a fortnight.
