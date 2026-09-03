# Decisions

Two kinds of entry live here.

**Section A** is for Leon. These are business decisions Claude Code will otherwise invent
defaults for, and you'll be stuck with them. Fill them in before Session 3.

**Section B** is for Claude Code. Any time a requirement is ambiguous, write the assumption
here with a date and move on. Do not stall waiting for an answer.

---

## A. Decisions Leon must make

### A1. Pipeline stages — final names and order
Proposed in `00-PRD.md` §4. Edit this list to match how AFD actually works.

| # | Stage | Type | Keep / change |
|---|---|---|---|
| 1 | New | new | |
| 2 | Assigned | normal | |
| 3 | Attempted | normal | |
| 4 | Connected | normal | |
| 5 | Qualified | normal | |
| 6 | Counselling Scheduled | scheduled | |
| 7 | Counselling Done / Visited | normal | |
| 8 | Fee Discussed | normal | |
| 9 | Registration Form Sent | enrolment_form | |
| 10 | Form Submitted | normal | |
| 11 | Payment Pending | payment | |
| 12 | Enrolled | won | |
| 13 | Lost | lost | |
| 14 | Nurture / Dormant | parked | |

**Decision:**

### A2. Stage probabilities (for weighted forecast)
Rough is fine. What % of leads at each stage historically end up enrolling?

**Decision:**

### A3. Lost reasons — final list
Proposed: Fee too high · Joined competitor · Chose different career · Distance ·
Parent declined · Wrong exam year · Not eligible · Unreachable · Duplicate · Other

**Decision:**

### A4. Mandatory fields on lead creation
Be strict. Loose data now is unfixable later. Suggested minimum: student name, phone,
source. Consider also: district, exam year, education status.

**Decision:**

### A5. SLA hours
Default: first response 24h, escalate at 12 / 24 / 48. Right for AFD?

**Decision:**

### A6. Lead score weightings
See `01-DATA-MODEL.md` § Lead score. Which signals matter most for AFD?

**Decision:**

### A7. Who holds which role
Name real people. Note that `co_admin` sees everything across all centres.

| Person | Role | Centres |
|---|---|---|
| Leon | admin | all |
| | | |

**Decision:**

### A8. Discount authority limits
Above what discount does a counsellor need approval? Centre head? Who approves?

**Decision:**

### A9. Courses × fee structure
Course list is in the seed data. Fee per course × centre × mode × academic year is not.
Needed before Phase 4, not before Phase 1.

**Decision:**

### A10. Bulk lead databases + wider integration ingestion (raised 2026-08-29, deferred)
Leon's stated future scope, explicitly not being built yet — captured here so it isn't lost
before we get back to it:

- **More ingestion sources than Phase 2 currently lists**, each polled/synced roughly every
  10 minutes so the CRM stays current: Meta Lead Ads, website activity webhooks, and a Google
  Sheets bridge (leads landing in a Sheet — presumably from a source that isn't a direct
  webhook target — should flow into the CRM automatically rather than needing a manual CSV
  export/import each time).
- **Bulk purchased/partner databases** (school databases, etc.) need a genuinely different
  path from a normal lead: upload the whole raw database into the CRM into some kind of
  staging area, have someone manually filter/review it, then promote only the relevant rows
  into the real leads list — where counsellors and everyone else's normal views only ever see
  promoted leads, not the raw uploaded pile.
- **The non-promoted rows are not meant to be discarded.** The actual end goal: get every
  database Leon has ever collected into the CRM as the single source of truth, promoted or
  not, so all of it (not just active leads) can drive **retargeting audiences on Meta and
  Google Ads** and **periodic WhatsApp Business API broadcast messaging** — i.e. a bulk-upload
  row has a real, ongoing purpose even if a counsellor never works it as a lead.

**Open design tension to resolve when we build this** (not decided, don't assume an answer):
this doesn't fit cleanly into the current "one ingestion path" model (CLAUDE.md non-negotiable
#8 — everything goes through `resolveOrCreateLead()` then `applyAssignment()`, on the premise
that every ingested row is a real lead someone will work). A bulk-uploaded row that's
deliberately *not* a worked lead until promoted, but still wants to exist in the CRM for ad
audience/WhatsApp targeting purposes, is a different lifecycle than today's `leads` table
assumes. Whether that means a genuinely separate table (e.g. something like a
`lead_database_rows` staging area, with promotion being its own explicit action that then
*does* go through the normal identity/assignment path) or a flag/stage on `leads` itself that
hides a row from every counsellor-facing view until promoted is an actual design decision to
make deliberately when this is scoped, not something to default on quietly.

**Decision:** deferred — Leon will revisit this when ready to scope it properly.

---

## B. Assumptions made during the build

Format: `YYYY-MM-DD · [area] assumption · why · how to reverse`

<!-- Claude Code appends here -->

2026-08-27 · [roles] Seeded default permission bundles for the 5 non-admin roles (co_admin,
center_head, counsellor, accounts, academics) · the data model doc specifies the role model
and the permission primitive list but not which primitives each seeded role should hold ·
reverse by editing `ROLE_SEEDS` in `src/lib/db/seed.ts` (or, once Session 2 ships, in the
Roles & Permissions settings screen — role_permissions is an ordinary editable table).
Bundles chosen: `co_admin` = everything at `all` (deputy admin, matches "Admin/co-admin
only" language in the assignment-rules section of the data model doc); `center_head` = most
operational permissions at `center` scope, including `users.manage` (can manage staff in
their own centre); `counsellor` = lead/interaction/whatsapp/enrolment/payment.read/report
at `own` scope only, deliberately no `lead.export` or `lead.reveal_phone` in bulk beyond
their own leads; `accounts` = payment.*/discount.approve/enrolment.read/student.read at
`center`; `academics` = student.*/batch.manage/enrolment.read/report at `center`.

2026-08-27 · [schema] `profiles` has no `deleted_at` column · the data model doc's blanket
"soft delete via deleted_at" rule doesn't fit profiles cleanly — users are deactivated
(`is_active = false`), never removed, and "Users: Add, deactivate" in the configurable-areas
table only ever mentions deactivation · reverse by adding the column + updating RLS/queries
to filter it if a real user-deletion flow is ever needed.

2026-08-27 · [schema] `org_settings` singleton enforced with a unique index on `((true))`,
not application logic · RLS controls *who* can write to the table but nothing stops a second
row otherwise, and the doc calls it "a singleton row" · reverse by dropping
`org_settings_singleton_idx` if the table is ever meant to hold more than one row (it
shouldn't be).

2026-08-27 · [schema] `field_definitions` seeded now (Session 1) against `entity = 'lead'`
even though the `leads` table itself doesn't exist until Phase 1 · field_definitions is pure
metadata with no FK to `leads`, and the Session 1 prompt explicitly asks for "core field
definitions" in the seed · no reversal needed, this is intentional sequencing.

2026-08-27 · [dropdowns] "Full dropdown taxonomy" (Session 1) was scoped to the reference
lists named in CLAUDE.md's domain vocabulary and the v1 field taxonomy (temperature,
lead_source, exam, course, education_status, preferred_mode, gender, lost_reason,
consent_status, payment_method) · the Indian states/districts cascade
(`indianStatesDistricts.js`) is explicitly a Phase 1 item ("port verbatim") and is its own
dataset, not a `dropdown_options` category, so it was left out of this seed · pick it up in
Phase 1 per docs/02-BUILD-PHASES.md and docs/03-V1-AUDIT.md § Part 1.

2026-08-27 · [gotcha, not a decision] Inserting into `audit_log` with `.select()`/`RETURNING`
fails RLS for a caller who lacks `audit.read`, even though the insert itself is allowed for
everyone — Postgres checks the table's SELECT policies against rows returned by
`INSERT ... RETURNING`. Confirmed against a local Postgres instance during this session.
Whatever helper writes audit rows in Phase 1 (e.g. `writeAuditLog()`) must not chain
`.select()` on the insert unless it also holds `audit.read`.

2026-08-27 · [settings nav] Each settings screen is gated on the specific RLS-relevant
permission its mutations actually need (`settings.manage` for org/terminology/centres/
pipeline-stages/dropdowns/fields, `users.manage` for Users, `roles.manage` for Roles &
Permissions, `rules.manage` for SLA Policies, `settings.manage` OR `rules.manage` for
Temperatures since it has both a values section and a rules section) rather than one
blanket permission for the whole /settings section · the Session 2 prompt says "each
permission-gated" without naming which permission per screen, and gating everything on
`settings.manage` alone would hide the Users screen from a `center_head`-shaped role that
holds `users.manage` at `center` scope but not `settings.manage` · reverse by collapsing
`SETTINGS_NAV`'s per-item `permissions` arrays in `src/lib/settings/nav.ts` back to a single
shared permission if a simpler model is preferred later.

2026-08-27 · [users] `createUser` (`src/app/(app)/settings/users/actions.ts`) is the one
deliberate, narrow exception to CLAUDE.md non-negotiable #3 in this codebase — it calls
`createServiceRoleClient()` to provision the Supabase Auth user (there is no
RLS-scoped/anon-key equivalent to "create another user with a password, as an admin";
`auth.admin.createUser` inherently requires the service role). The exception is bounded
three ways: the caller's own RLS-bound session is checked for `users.manage` *before*
service-role is touched; service-role is used for exactly that one call; the profile row,
centre assignments and audit log entry all go back through the normal RLS-bound client.
Every other settings mutation in this session uses the anon/authenticated client. Reverse
by moving user provisioning to a queued/reviewed flow if even this narrow exception turns
out to be too much surface area.

2026-08-27 · [pipeline stages] "Reorder by drag" implemented as up/down move buttons
(`moveStage` swaps `sort_order` with the adjacent row) instead of a drag-and-drop UI · same
functional outcome (an admin can reorder stages) without adding a drag-and-drop library
this pass · reverse/upgrade by swapping `StageRowActions`' buttons for a drag handle backed
by a library like `@dnd-kit/sortable`, calling the same `moveStage`-style persistence.

2026-08-27 · [SLA] `sla_policies.applies_to`/`escalations` and `temperature_rules.conditions`
are edited as raw JSON textareas, not a visual condition builder · the visual builder with
"dry-run preview: this rule would have matched 43 of the last 200 leads" described in
`01-DATA-MODEL.md` § Assignment rules engine needs a `leads` table to preview against, which
doesn't exist until Phase 1, and assignment_rules (the third consumer of this same condition
grammar) is explicitly Phase 1 work · the JSON textarea stores the identical shape the
future builder would write, so nothing needs to migrate later, just a better editor on top ·
revisit once Phase 1's lead core and assignment engine ship.

2026-08-27 · [SLA] Business hours and holidays render as one block per centre, stacked
vertically on a single page, rather than behind a centre picker · fine at 2 centres; will
want a picker/tabs once there are enough centres that the page gets unwieldy — not a data
model concern, purely a `src/app/(app)/settings/sla/page.tsx` layout change.

2026-08-27 · [tests/rls.spec.ts] The suite drives RLS/triggers directly over a Postgres
connection (`SET LOCAL ROLE authenticated` + `select set_config('request.jwt.claims', ...)`
inside a transaction that's always rolled back) rather than signing in real users through
`@supabase/supabase-js` · this is exactly the role-switch + JWT claim PostgREST performs per
request — same policies, same triggers — but needs no live network calls, no provisioned
Supabase Auth users, and no service-role key in CI, and every write-boundary assertion is
provably non-destructive by construction (rollback, not "remember to clean up"). Confirmed
against a real local Postgres 16 instance, including two deliberately-broken runs (dropped
`profiles_select`, disabled `settings_admin_invariant_profiles`) that each failed exactly the
tests that name the mechanism they broke, and nothing else · reverse by rewriting `asUser()`
to `supabase.auth.signInWithPassword()` against real seeded/created test accounts if a future
maintainer wants the test to exercise PostgREST/Supabase Auth itself, not just Postgres.

2026-08-27 · [tests/rls.spec.ts] The suite creates its own fixture profiles (one per seeded
role, inserted straight into `auth.users`/`profiles` via the DATABASE_URL connection) rather
than depending on the seed script's optional auth-user step · `npm run db:seed` only creates
real Supabase Auth users when `SUPABASE_SERVICE_ROLE_KEY` is set, so a self-contained test
that only needs `npm run db:migrate && npm run db:seed` to pass was worth the extra fixture
code. A consequence: on a database with **no** real active `settings.manage='all'` holder
(a fresh local Postgres where that optional step never ran), `safeDeleteFixtureUsers()`
deliberately leaves exactly one fixture admin profile behind after the suite finishes —
deleting it would trip the very lockout invariant being tested. It's tagged
`...@rls-spec.afd-crm.test` and gets swept away automatically by the next run once a real
admin exists (e.g. after running the seed's auth-user step, or on a real Supabase project
that already has one). Not a bug — the lockout protection working exactly as designed.

2026-08-27 · [payments/receipts test] `docs/02-BUILD-PHASES.md`'s Session 3 prompt asks the
suite to assert "payments and receipts reject UPDATE and DELETE for every role including
admin," but those tables are Phase 4 ("Fees, enrolment, payments, handoff") and don't exist
in this schema · written as a `describe.skip` block with the real assertions commented in
against the exact column names `01-DATA-MODEL.md` § Financial ledger specifies, so unskipping
it once migration + RLS for `payments`/`receipts` land should need no rewrite, just deleting
`.skip`. This is the same category of doc/reality mismatch as Session 2's Temperatures/SLA
tables — documented and proceeded, per the working-style note in CLAUDE.md, rather than
building a financial ledger subsystem to satisfy one test assertion.

2026-08-27 · [identity] `resolveOrCreateLead()` (`src/lib/identity/`) runs against the direct
Drizzle `db` client, not an RLS-bound Supabase client · Session 4 explicitly says not to wire
it to a real ingestion path yet — there is no real caller to decide "which client" for.
Webhooks (Phase 2) will call it under the service-role client per CLAUDE.md non-negotiable
#3; UI-triggered manual creation (a later Lead core session) will call it under the caller's
own RLS-bound session. Deciding that now, with no real caller, would be speculative. RLS on
`leads`/`enquiries`/etc. is still fully enforced regardless (verified against a local
Postgres instance — see docs/PROGRESS.md) — this only affects which connection the identity
service itself uses internally. Revisit when Phase 2 wiring gives it a real caller.

2026-08-27 · [identity] "Ambiguous match → merge_review_queue" is scoped narrowly to one
concrete case: the incoming phone matches lead A and the incoming email matches a
*different* lead B. `01-DATA-MODEL.md` doesn't fully specify the matching grammar beyond
"normalise → match → attach or create → flag for merge review," and a fuzzy name+district
heuristic (the kind that needs a real scoring/threshold design and a `leads` table full of
real data to tune against) is out of scope for the session that's laying down the schema.
The phone-vs-email cross-match case is well-defined, testable, and covers a real scenario
(a parent's phone reused across siblings, a shared family email) · extend
`resolveOrCreateLead()`'s matching step when fuzzy matching is actually needed — the
`merge_review_queue` table and its RLS already support arbitrary future match sources.

2026-08-27 · [identity] "Notify the owner" (docs/01-DATA-MODEL.md § Identity, and CLAUDE.md
non-negotiable #2) isn't implemented — there is no `notifications` table yet (it's later in
Phase 1's table list, not part of Session 4's identity-module scope). Attaching a new
enquiry to an existing lead updates `last_touch_source`/`last_activity_at` only; no
notification is sent. Wire this in once the notifications table + delivery mechanism exist.

2026-08-27 · [identity] A newly-created lead gets `stage_id` set to the `pipeline_stages` row
with `stage_type = 'new'` (lowest `sort_order` if more than one is somehow marked `new`), and
`temperature`/`score` are left null · stage assignment is a reasonable, low-risk default
(a lead needs to land somewhere in the funnel); temperature/score are explicitly Phase 2
work ("Temperature recompute job driven by temperature_rules... lead scoring from
scoring_rules") and computing them here would duplicate logic that job will own.

2026-08-27 · [identity] `leads`/`enquiries`/etc.'s RLS was verified manually against a local
Postgres instance this session (own/center/all visibility, the create-as-own-scope
ownership check, the stage_history trigger's insert-only enforcement, the
`lead_identifiers` uniqueness constraint) with the same rigor as Sessions 1-2, but — unlike
those sessions — wasn't added to the automated `tests/rls.spec.ts` suite. That suite's scope
was Session 3's; extending it to cover the Lead core tables as they land is worth doing in a
future pass rather than growing that file unboundedly in every subsequent session.

2026-08-27 · [lockout triggers] Found while actually running `npm run db:seed` twice in a
row on a real local database (not caught by the automated suite, which only ever seeds
once per run): `protect_admin_role_permissions()` rejected *any* UPDATE or DELETE on a
protected role's `role_permissions` row, including a no-op re-upsert that sets the scope to
the value it already has. Since `seed.ts`'s `onConflictDoUpdate` re-asserts every seeded
role's permissions on every run — that's what "safe to re-run" means — this broke re-seeding
the moment a database already had the admin role's permissions seeded once. Separately,
`check_settings_admin_invariant()` (a deferred AFTER trigger) fires on *any*
`role_permissions` UPDATE, including other roles' idempotent re-upserts, and its check
("at least one active user must hold `settings.manage` at scope `all`") is unsatisfiable by
construction on a database with zero profiles — the common case when config is seeded before
any real auth user exists. That blocked re-seeding forever on a freshly migrated database,
before the system had ever been bootstrapped with an admin.

Fixed in `migrations/0006_fix_protect_admin_role_permissions_idempotency.sql`:
`protect_admin_role_permissions()` now only raises on DELETE, or on an UPDATE that actually
changes `scope` — re-asserting the same scope is a no-op, not a violation.
`check_settings_admin_invariant()` now early-exits (no-op) when `profiles` is empty — there's
nothing to lock anyone out of yet. Neither fix weakens the real protections: verified by hand
that deactivating the sole real admin, narrowing `admin`'s `settings.manage` scope, and
deleting it outright are all still rejected once a real admin profile exists (also covered by
the updated/added tests in `tests/rls.spec.ts`'s "lockout protection triggers" group).
`tests/rls.spec.ts`'s old "removed or narrowed" combined-message assertion was split to match
the two distinct error messages the fixed trigger now raises.

2026-08-28 · [assignment] `applyAssignment()` takes a `DbExecutor` (either the top-level `db`
or a `tx` from inside a `db.transaction()`) rather than opening its own transaction, and
`src/lib/db/client.ts` now exports that type for reuse. `db`'s postgres.js connection pool is
`max: 1`; a nested `db.transaction()` call from inside `resolveOrCreateLead()`'s own
transaction would try to acquire a second connection from the same one-connection pool that
the outer transaction is already holding, and deadlock forever. Passing the caller's `tx`
through keeps everything on the one connection and one transaction, so a lead's creation and
its auto-assignment commit or roll back together. A standalone caller (a future webhook, a
test) is expected to wrap its own call in `db.transaction(tx => applyAssignment(tx, leadId))`.

2026-08-28 · [assignment] "source" in a rule's `conditions` resolves to `leads.last_touch_source`,
not `first_touch_source`. The data model doc's example condition just says `"field": "source"`
without specifying which; last-touch is the more currently-accurate attribution value, and for
a brand-new lead (the only trigger actually wired up this session) first-touch and last-touch
are identical anyway, so today's behavior is unaffected either way. Revisit if `applies_on:
['update']` (reassignment triggers) is ever wired to a real call site — a re-evaluation on
lead update is exactly the case where first-touch vs last-touch stops being the same value.

2026-08-28 · [assignment] Round-robin availability is `profiles.is_active` only. The data
model doc's assignment section says round-robin should skip "inactive/on-leave" users, but
there is no separate "on leave" concept anywhere in the schema — no such column, no
lightweight leave-request table, nothing Phase 0-1 defined. Modeling one now, with no caller
that sets it, would be speculative. `is_active` is the one real signal that exists; extend
`pickRoundRobinUser()`'s query when an actual on-leave mechanism gets built.

2026-08-28 · [assignment] Priority order is ascending (lower number evaluated first, first
match wins) — the data model doc says rules are "evaluated in priority order, first match
wins" without stating the direction. Ascending matches the convention already used for
`pipeline_stages.sort_order` elsewhere in this codebase, so a lower number reads as "comes
first" consistently across the app rather than assignment rules being the one place a bigger
number means higher precedence.

2026-08-28 · [assignment] No settings UI for assignment rules this session — same call Session
4 made for the identity module, and for the same reason: the session-plan table's own "you
verify by" column for this row is "Rule fires, dry-run preview counts match," which is
backend-testable, not a UI-clickable criterion like the settings-screen rows in Phase 0.
CLAUDE.md's configurability table does list assignment rules as admin-editable, so a rule
builder screen is still owed — `assignment_rules`/`assignment_history` and the RLS gating
them exist now specifically so that screen is additive, not a migration, whenever it lands.

2026-08-28 · [assignment] `applies_on: ['update']` (reassignment triggers, per the data model
doc) has full schema and evaluator support — `applyAssignment()` takes a `trigger` option and
filters rules on it — but nothing calls it with `trigger: 'update'` yet. There is no lead-edit
call site to trigger a reassignment from in this session's scope (lead detail/edit is Session
7+), and Phase 2's SLA cron (`reassign_sla` is already a value in the `assignment_reason`
enum) is the other obvious future caller. Wiring either up now, with no real caller, would be
speculative — the enum value and the `applies_on` filter exist so neither needs a migration
when that caller shows up.

2026-08-28 · [assignment] Found by actually running `npm test` against a real Supabase
project (not caught by my own sandbox verification, which happened to run the test files
sequentially): `tests/rls.spec.ts`'s `beforeAll` inserts a real, persistent `assignment_rules`
fixture row (`rls_test.marker`) to test table-level RLS visibility. It was left `is_active`
(the column's default) with empty conditions and a dummy, non-existent `assignTo` UUID.
Vitest runs test files in parallel by default, all against the same live database — so for
the whole window that file's fixtures were alive, that row was a real, active, priority-0,
matches-everything assignment rule, and every lead any *other* test file created via
`resolveOrCreateLead()` (now that Session 5 wires `applyAssignment()` into it) tried to get
assigned to that nonexistent user and failed its foreign key constraint. 11 unrelated tests
in `tests/identity-resolve.spec.ts` and `tests/assignment-apply.spec.ts` failed as a result.

This was a test-fixture bug, not a production code gap — a real rule's `assignTo` will always
be a real profile, authored through the eventual rule-builder UI. Fixed by inserting the
fixture row with `is_active: false` explicitly; it still exists for the visibility check
(select/insert policies don't look at `is_active`) but `applyAssignment()`'s `WHERE
is_active = true` filter never picks it up. Re-verified 4 consecutive full `npm test` runs
against a fresh local Postgres with all 5 spec files present — clean every time.

2026-08-28 · [fields] `indian-states-districts.ts` is a freshly-assembled reference dataset,
not a byte-for-byte port of v1's `frontend/src/data/indianStatesDistricts.js`
(docs/03-V1-AUDIT.md) — that file wasn't available to read in this environment. Blocking the
whole session on recovering a file from an abandoned codebase would have cost more than the
gap is worth: India's states and districts are public geographic fact, so a fresh, carefully
assembled 28-states + 8-UTs dataset serves the same purpose (a state->district cascade
source) that a literal port would have. Revisit only if the original file turns up and its
exact district list/spelling matters for matching historical v1 data.

2026-08-28 · [fields] Saved views (listed in the same Phase 1 bullet as the lead list) are
deferred, not built this session. It's a real feature, not a nice-to-have — but it needs its
own table (a saved view is per-user state: name, filter values, maybe column selection) and
its own save/list/apply/delete UI, which is a distinct unit of work from "make the existing
filters schema-driven." Squeezing it in would have meant either a rushed schema or a rushed
UI. `docs/02-BUILD-PHASES.md`'s own verification method for this session's row — "Add a field
in Settings, it appears everywhere" — doesn't depend on saved views existing, so nothing about
proving this session's actual deliverable required it.

2026-08-28 · [fields] The `district` filter is a flat, non-cascading dropdown (every Indian
district, alphabetical, regardless of the `state` filter's value) rather than the real
state->district cascade. The cascade is inherently a *form* interaction (pick a state, the
district list narrows) — there is no lead create/edit form yet for it to belong to (that's
Session 7). Building the cascade widget now, with nowhere real to use it, would have meant
either wiring it into the filter bar in a way the actual form will need to duplicate, or
building UI Session 7 would immediately have to touch again. The full dataset
(`indian-states-districts.ts`) is already in place either way — Session 7's form is additive,
not a rework.

2026-08-28 · [fields] CSV export masks phone numbers unless the exporter holds
`lead.reveal_phone`, even though CLAUDE.md's non-negotiable #6 only explicitly names "list
view" and "detail page" as the two display contexts. A bulk export is closer to "list view at
scale" than to a single detail page a counsellor is actively working — the harm of a leaked
phone-number column in an export file (which can leave the building, get forwarded, sit in a
Downloads folder) is exactly the "counsellors leave and take databases with them" scenario the
non-negotiable exists to prevent, arguably more so than an on-screen list. Treating export as
requiring the same permission as an individual reveal, rather than inventing a third
permission primitive, keeps the enforcement points to the ones CLAUDE.md's permission table
already lists.

2026-08-28 · [fields] Two seeded core `lead` field_definitions rows (`lead_source`,
`sub_source`) don't correspond to any real `leads` column of the same name — see
`src/lib/fields/field-column.ts` and the matching docs/PROGRESS.md entry. This is a latent
inconsistency in Session 1's seed data (the field was seeded as if a plain `source` column
existed, but the schema only ever had `first_touch_source`/`last_touch_source`), not something
introduced this session. Worked around with an explicit key->column override map rather than
adding the columns or renaming the seed, since renaming would touch Session 1's already-shipped
seed contract and adding a redundant `source` column would duplicate data the first/last-touch
columns already hold accurately.

2026-08-28 · [fields] This session's actual data-fetching code (`getFieldSchema`,
`resolveFieldOptions`, the `/leads` page) could not be run end-to-end in the sandbox it was
built in, unlike Sessions 4-5. Those sessions' core logic (`resolveOrCreateLead`,
`applyAssignment`) runs on Drizzle's direct Postgres connection, which a local Postgres
instance serves just fine. Everything in this session instead goes through the RLS-bound
Supabase JS client (the established pattern from Session 2's settings pages,
`createClient()` from `@/lib/supabase/server`), which requires Supabase's actual hosted REST
API (PostgREST) and Auth service (GoTrue) — infrastructure a raw local Postgres instance
doesn't provide, and installing/configuring a local PostgREST+GoTrue stack just for this one
session's verification was judged not worth the added scope. Verification for this session is
therefore: full typecheck/lint/build (structural correctness) plus unit tests for every piece
of pure logic (masking, formatting, the states/districts dataset) — but the actual list
rendering, filtering, phone reveal and CSV export have only been verified by reading the code,
not by running it against real data. Flagged explicitly in docs/PROGRESS.md as unverified;
this needs the user's own Supabase project and a browser before being called done.

2026-08-28 · [fields] Found while the user was actually trying Session 6's own acceptance
test (add a field in Settings, confirm it shows up in the list): creating ANY new custom
field whose type wasn't `select`/`multiselect` failed with a bare "Invalid input", form
values discarded. Root cause was in Session 2's `settings/fields/actions.ts`, not this
session's code: the "Options" textarea only renders in the form for `select`/`multiselect`
types (`field-form.tsx`), so for every other type — `text`, the one both the user and I
tried — that input doesn't exist in the DOM, the browser submits nothing for it, and
`FormData.get("options")` returns `null`. The schema (`z.string().trim().optional().or(z.literal(""))`)
only accepted a string or the literal `""`, never `null`, and a zod union failure's own
top-level message is literally the string "Invalid input" — exactly what showed on screen.
Confirmed by extracting the exact schema and running it against `null`/`""`/`undefined`
outside the app before touching anything. Fixed by changing `.optional()` to `.nullish()`
so the schema accepts `null` the same as `undefined`; `parseOptionLines()` already treated
falsy input as "no options" so no other change was needed. This bug predates Session 6 —
it would have blocked creating a plain text/number/date/etc. custom field since Session 2
shipped — but it surfaced now because this was the first time anyone actually tried to add
a non-select field through the UI after Session 2 built the form.

2026-08-28 · [fields] A real Session 6 bug, found the moment the user actually added a
custom field through the (now-fixed) form and visited `/leads`: "column leads.leon_test does
not exist". `fieldColumn()`/the list and export queries assumed every `field_definitions` row
is a real `leads` column, which is only true for `is_core: true` rows — a genuinely custom
field (anything an admin adds through Settings, always `is_core: false`) has no column of its
own at all; its value lives inside `leads.custom` jsonb, keyed by the field's `key`
(`schema/leads.ts`'s own comment already said as much: "escape hatch for custom fields ...
no migration needed" — I read that and still wrote the query as if every field had a column).
Fixed in `src/lib/fields/field-column.ts`: `fieldFilterExpression()` returns the real column
for a core field or `custom->>key` for a non-core one (PostgREST supports jsonb-path filter
expressions directly), and `getRawFieldValue()` reads a core field off the row or a non-core
one out of `row.custom`. The list page and CSV export both select `custom` once whenever any
field they're showing is non-core, instead of trying to select a column named after the
custom key. `apply-filters.ts`'s multiselect branch also had to split by core/non-core: a
core array field uses Postgres array containment on its own column, a custom one uses jsonb
containment against the whole `custom` column with a matching nested shape. Added unit tests
(`tests/field-column.spec.ts`) pinning down both the core and custom paths for
`fieldFilterExpression`/`getRawFieldValue` so this can't silently regress.

2026-08-28 · [activity] `interactions` select is gated on the dedicated `interaction.read`
permission primitive, not `lead.read` like `tasks`/`stage_history`/`assignment_history` are.
`src/lib/auth/permissions.ts` already defines `interaction.read` ("See call/WhatsApp/note
history on a lead") as its own primitive, distinct from `lead.read` — using `lead.read`
instead would make that primitive mean nothing (every role holding `lead.read` would see
interactions regardless of whether they hold `interaction.read`). Checked the seed data:
admin/co_admin/center_head/counsellor hold both; accounts/academics hold neither — so this
is a real, currently-meaningful distinction, not a hypothetical one. `tasks` has no equivalent
dedicated primitive, so it stays on `lead.read`, same as the other lead-adjacent tables.

2026-08-28 · [activity] Editing a lead's phone number is out of scope this session — the
lead-detail edit form renders every phone-type field (however `is_editable` is set) through
the same masked/audited-reveal control the list uses, never as an editable input. A phone
number is duplicated into `lead_identifiers` for dedup matching (`resolveOrCreateLead()`'s
whole reason for existing); editing `leads.primary_phone` directly through the generic field
editor without also updating/re-normalising the matching `lead_identifiers` row would silently
desync the dedup index — the exact kind of split-brain state the identity module exists to
prevent. A dedicated "change phone number" flow (re-normalise, update the identifier row,
probably re-check for a resulting collision) is real work belonging to its own pass, not a
side effect of the generic editor.

2026-08-28 · [activity] `resolveOrCreateLead()` is invoked from a real user-facing UI for the
first time this session (`/leads/new`). It runs on the direct Drizzle client and bypasses RLS
by design (Session 4's decision, made when there was no real caller yet to decide otherwise)
— which means, uniquely among this codebase's mutations, RLS is NOT the backstop for this
write. `createLeadManually()` (`src/app/(app)/leads/new/actions.ts`) is the deliberate,
single enforcement point instead: it reads the caller's `lead.create` scope
(`own`/`center`/`all`) and re-implements the same rule `can_access_center()` would apply in
SQL — forcing self-assignment and skipping the assignment engine for `own` scope (matching
resolveOrCreateLead's own "an explicit assignedTo is never overridden" behavior), rejecting a
centre outside the caller's own centres for `center` scope. This is the same pattern Phase
2's webhook handlers will need for the same reason (they also call resolveOrCreateLead()
under the service-role client, bypassing RLS) — this session establishes what that pattern
looks like.

2026-08-28 · [activity] The manual lead-creation form only renders core fields — a brand-new
custom field's value has no meaningful default at creation time anyway, and requiring every
admin-added field to be filled in (or explicitly skippable) at the moment of first contact
would make the form grow unpredictably as the field list grows. A custom field's value is
added afterward via the edit page, which does render every editable field regardless of
core/custom, once the lead actually exists.

2026-08-28 · [activity] `lead_ref` and `file` field types render read-only in the edit form —
no lead-picker UI and no file upload/storage flow exist yet (the latter is explicitly
Supabase Storage + private buckets work, out of scope here). Showing the raw stored value
disabled beats hiding the field entirely; revisit once either UI exists for real.

2026-08-28 · [activity] "Who can be assigned to a lead" (`user_ref` field options) is resolved
as "whoever holds `lead.read` at scope `'own'`", not "whoever holds a permission literally
named `lead.assign`" or similar — because no such primitive exists, and inventing one just for
this list would duplicate the meaning `lead.read`/`'own'` already carries ("this role works its
own leads"). Deliberately a `role_permissions` lookup, never a role-code comparison, so an
admin can grant a new or renamed role that same scope and it becomes assignable with no code
change — this resolves to `counsellor` today purely as a consequence of the seed data, not
because the code knows the word "counsellor".

2026-08-28 · [centers] The oldest row (by `created_at`) is treated as canonical when merging
duplicate-named centres in migration 0011, not the newest. Every real reference accumulated
against a centre — leads, business hours, holidays, user assignments — was almost certainly
written against whichever row existed first (a second seed run's duplicate is typically
untouched dead weight), so keeping the oldest row preserves the most existing state and moves
the least data. This can't be proven in general (nothing timestamps *when a reference was
created relative to which duplicate*), but it's the safer default, and the migration is
run once, not a mechanism an admin will ever invoke themselves.

2026-08-28 · [tooling] `src/lib/db/load-env.ts` exists as its own file, rather than inlining a
`loadEnv()` call at the top of `seed.ts`, specifically so it can be imported (not called) as
`seed.ts`'s first import statement. This matters because esbuild hoists every `require()` from
an `import` above ordinary top-level statements, in declaration order — so a `loadEnv()`
function call sitting after other code in `seed.ts` would run *after* a sibling import like
`./client` has already evaluated (and already thrown, if `DATABASE_URL` wasn't loaded yet). A
side-effecting module, imported first, participates in that same hoisted-and-ordered
require() sequence instead of losing the race.

2026-08-28 · [activity] The Preferences-tab "Saved, but shows the old value" report turned out
not to be a data-loss bug at all — the write always succeeded. It's a React uncontrolled-input
remount gotcha: `defaultValue`/`defaultChecked` only apply once, at mount, and a Server
Component re-render after `revalidatePath()` doesn't remount an already-mounted client
component just because its props changed. Fixed with `key={String(row.updated_at)}` on
`<LeadEditForm>` rather than converting the form to controlled inputs — `leads.updated_at`
already changes on every real save via the existing `set_updated_at` trigger, so this is a
one-line fix that forces exactly the remount needed, without rewriting a large uncontrolled
form (17+ field types across `DynamicFieldInput`) into controlled state management it doesn't
otherwise need.

2026-08-28 · [kanban] Drag-and-drop on the pipeline board uses the native HTML5 drag events
(`draggable`, `onDragStart`/`onDragOver`/`onDrop`), not a library — no `dnd-kit`,
`react-beautiful-dnd`, or similar. The interaction is one flat list of columns with no nesting,
no virtualization, no touch-reordering-with-animation requirement; native events cover that
completely, and CLAUDE.md's own working style ("Don't add features, refactor, or introduce
abstractions beyond what the task requires") argues against a dependency whose extra
capabilities (sortable lists, keyboard reordering, animated transitions) aren't asked for here.
Revisit only if a real requirement shows up that native events can't reasonably cover — e.g.
drag reordering *within* a column, which this session doesn't need.

2026-08-28 · [kanban] `enforce_lost_reason` (migration 0012) also auto-clears
`lost_reason`/`lost_reason_detail`/`lost_at` whenever a lead moves out of a `requires_reason`
stage, not just enforces the requirement going in. Without this, re-opening a mistakenly-lost
lead (drag it back to "Contacted") would leave a stale "Budget Constraint" reason sitting on an
active lead — a small but real data-integrity gap a naive CHECK-constraint-shaped trigger
(reject-only) wouldn't have caught. Since this can't be a CHECK constraint anyway (it needs to
look up `pipeline_stages.requires_reason`), doing the clear in the same trigger costs nothing
extra and closes a gap the "just enforce it" version would have left open.

2026-08-28 · [kanban] The kanban board's own Server Action (`moveLeadStage`) does not
re-implement own/center/all scope logic the way `createLeadManually()` (Session 7) had to.
That was only necessary because `resolveOrCreateLead()` runs on the direct Drizzle client and
bypasses RLS by design. `moveLeadStage()` runs a plain `.update()` through the normal
RLS-bound Supabase client, so `leads_update`'s existing `can_access_center('lead.update', ...)`
policy is the only authorization check that needs to exist — adding a second, app-level copy
of the same scope logic here would be exactly the kind of drift CLAUDE.md's RLS non-negotiable
(#3) is meant to prevent.

2026-08-28 · [import] The CSV column mapper deliberately never offers `assigned_to` or
`stage_id` as a mapping target, even though both are ordinary `field_definitions` rows the
generic field engine otherwise treats like any other. Offering them would let a spreadsheet
column silently opt a bulk import out of two things every other ingestion path goes through
without exception: `applyAssignment()` (non-negotiable #8) and entering the funnel at
`stage_type = 'new'`. This isn't a gap to fill in later — allowing either would be reintroducing
docs/03-V1-AUDIT.md's D2 ("the highest-volume source bypassed the assignment engine") on
purpose, just through a different door (a spreadsheet column instead of a webhook shortcut).

2026-08-28 · [import] `lead_source`/`sub_source` are mappable, but route into
`resolveOrCreateLead()`'s `source`/`subSource` parameters, not the generic post-creation field
update every other mapped field goes through. `field-column.ts` already establishes that
`lead_source` has no column of its own — it's an alias for `last_touch_source` — and
`resolveOrCreateLead()` sets both first- and last-touch source from `source` on every write,
new lead or existing. Routing it through the generic path instead would silently update
`last_touch_source` while never touching `first_touch_source`, corrupting first-touch
attribution on brand-new leads for no reason.

2026-08-28 · [import] An unmapped or unrecognised value never fails a row outright — only a
missing/unparseable `student_name` or `primary_phone` does. Every other field's coercion
failure becomes "field not provided" plus a warning surfaced in the results table. This mirrors
`resolveOrCreateLead()`'s own philosophy (never reject a duplicate) at the field level: a
messy "Temperature" column full of typos shouldn't cost you 40 real leads just because their
temperature couldn't be parsed — it should cost you 40 rows with a blank temperature and a
visible note, which a human can go fix in five minutes from the lead list instead of re-running
the whole import.

2026-08-28 · [import] The styled `.xlsx` export-with-guidelines-sheet + downloadable import
template docs/03-V1-AUDIT.md calls out as worth keeping from v1 is deliberately NOT built this
session. Plain CSV with a column mapper that auto-suggests matches does the same underlying
job (get the institute's existing spreadsheet into the system) without committing to a styling
library (`exceljs` or similar) for a nice-to-have. Revisit if real usage shows the column
mapper's auto-suggestion isn't good enough on its own — the v1 audit's instinct that this
"materially reduces support load" is worth taking seriously, just not worth the added
dependency before there's evidence the mapper alone doesn't already cover it.

2026-08-28 · [config] Config import is a CLI tool (`npm run db:config-import`), not a web
Server Action, even though export is. The reason is structural, not a time-boxing shortcut:
`profiles.role_id` is `onDelete: restrict`, so an already-authenticated admin's own profile
always references the very `roles` row an import would need to remove before inserting the
bundle's version. There is no logged-in web caller this could ever succeed for — the emptiness
guard (`GUARD_TABLES`, checking every target table has zero rows) will always reject them, by
construction, since being authenticated with `config.import` in the first place already proves
`roles`/`role_permissions` aren't empty. A CLI script run before anyone has logged in (same
trust model as `npm run db:seed` — no permission check, shell access is the trust boundary)
sidesteps the paradox entirely rather than working around it with special-casing.

2026-08-28 · [config] `permissions` and `assignment_rules` are the two real exclusions from the
bundle beyond docs/01-DATA-MODEL.md's own example list (which also predates `centers`,
`business_hours`, and `holidays` existing as tables — those three ARE included here, since
they're plainly admin-editable configuration per CLAUDE.md's "What is configurable" table, and
their absence from the doc's list looks like it just predates them, not a deliberate call).
`permissions` is fixed in code (CLAUDE.md's own "Fixed in code" list) — never a company's
config, always re-seeded from the `PERMISSIONS` constant regardless of which company's bundle
gets imported. `assignment_rules` is excluded because its `action` payload
(`assignTo: uuid`/`userIds: uuid[]`) and `created_by` name specific PEOPLE — data, not
configuration, and people don't transfer between companies or Supabase projects. Carrying those
rows over as-is would either dangle (the referenced person doesn't exist in the target instance)
or, worse, silently succeed by pointing at whatever unrelated person happens to hold that same
UUID in the target instance. A future version could export a rule's portable shape (name,
priority, conditions) while dropping/re-prompting for its action target; this session doesn't
attempt that.

2026-08-28 · [config] Import refuses to run unless every target table is completely empty,
rather than something more permissive like "unless `leads` has rows" or an upsert-by-id merge.
Read CLAUDE.md's own words literally — "Import into an empty instance" — rather than trying to
also solve the harder "push my staging config onto an already-live production instance" half of
the same paragraph's framing. That harder case needs real conflict resolution (what happens
when both sides have a role named "Counsellor" with different permissions? which one wins, and
what happens to profiles already pointing at the losing one?) that's genuinely separate,
larger work — see the CLI-vs-web-action decision above for why the two problems compound rather
than one subsuming the other. Building a convincing "merge" story without solving that honestly
would be worse than not building it at all.

2026-08-28 · [tooling] Found by actually running `npm run db:seed` after refactoring its
permission-seeding logic into a shared `ensurePermissionsSeeded()` (used by both `seed.ts` and
config import): the extracted module had `import "server-only"` at the top, copying the
convention from everything else in `src/lib/auth/`. That package's real (non-browser) module
entry throws unconditionally under plain `require()` — the no-op version only exists via
webpack's package.json "browser" field swap, which only applies inside an actual Next.js
bundle. Both `seed.ts` and the new `db:config-import` CLI script run via plain `tsx`, so this
broke `db:seed` outright — a real regression `tsc --noEmit` and `eslint` both passed cleanly
through, since it's a runtime-only failure mode neither static check catches. The fix
(`seed-permissions.ts` and `import-config.ts` both drop the `server-only` import, with a
comment explaining why) is narrow, but the lesson is broader: any module intended to be
imported from a plain-Node script must never carry `import "server-only"`, no matter how
consistent that looks with its neighbours — and the only way this class of bug surfaces at all
is actually running the script, not just type-checking and linting it.

2026-08-28 · [ops] `package.json` gained a `vercel-build` script
(`drizzle-kit migrate && next build`) so Vercel runs pending migrations automatically on every
deploy, instead of `npm run db:migrate` being a separate manual step someone has to remember to
run from a local terminal against production. Vercel uses `vercel-build` in place of `build`
when it's present, so local `npm run build` (and this sandbox's own verification runs) are
completely unaffected — only real Vercel deploys pick this up. `drizzle-kit migrate` already
tracks which migrations are applied and skips the rest, so this is safe to run on every deploy
even when nothing changed, and a broken migration now fails the deploy outright rather than
shipping code the database can't yet support. Adopted after the user's local git/Xcode Command
Line Tools installation turned out to be broken in a way that silently prevented `git pull` (and
therefore every "pull latest and re-run the migration" instruction) from ever taking effect —
removing the manual local step removes that whole failure class, not just this one instance of
it.

2026-08-29 · [settings] `deleteStage()`/`deleteOption()`/`deleteField()` now soft-delete
(`deleted_at = now()`, `is_active = false`) instead of issuing a real `DELETE`, closing a real
gap against CLAUDE.md non-negotiable #5: `pipeline_stages`, `dropdown_options`, and
`field_definitions` already carried a `deleted_at` column via the shared `softDelete()`
helper, but nothing ever wrote to it — the "delete" action a user actually triggers was a hard
delete the whole time. No new migration: the existing `*_delete` RLS policies and the
`protect_core_field_definitions` DELETE trigger are simply no longer exercised by any code
path (left in place rather than dropped — removing an unused, already-correctly-scoped policy
isn't worth a migration on a live database for this pass). `deleteField()` re-implements the
core-field guard in its `UPDATE`'s `WHERE is_core = false` clause instead, since the DB trigger
only fires on a real `DELETE`. Functional read paths (kanban columns, filter/option lists,
`getFieldSchema`) needed no changes — they already filtered `is_active = true`, so a
soft-deleted row (which also gets `is_active = false`) disappears from them automatically; only
the settings screens that deliberately list inactive-but-not-yet-deleted rows needed an added
`deleted_at is null` filter. Point-lookups by a lead's own already-stored `stage_id` (the lead
detail page's current-stage display, `moveLeadStage`'s target-stage validation) are
deliberately left unfiltered by `deleted_at` — a lead that already sits in a since-deleted
stage should keep resolving that stage's name, same as it already did (with no guard at all)
for a *deactivated* stage before this session.

2026-08-29 · [testing] This sandbox's local Postgres 16 instance needed a hand-built stand-in
for the pieces of a real Supabase project the migrations/RLS policies/`tests/rls.spec.ts`
assume exist — schema `auth` with a `users(id uuid, email text)` table, an `auth.uid()`
function reading `sub` out of the `request.jwt.claims` GUC (exactly what `tests/rls.spec.ts`'s
`asUser()` sets before each simulated request), and the `authenticated`/`anon`/`service_role`
roles with the broad default table grants Supabase provisions automatically on every real
project (RLS policies are meant to be the only real gate on top of those grants, same as
production). Never written into a migration file — a real Supabase project already has the
genuine versions of all of this, and shipping a fake `auth` schema into a real project's
migration history would be actively harmful. Purely a one-time local environment setup step,
same as previous sessions' "verified against a real local Postgres 16 instance" runs.

2026-08-29 · [testing] Running the full `npm test` suite with Vitest's default file
parallelism against one shared database produced one flaky failure
(`tests/identity-resolve.spec.ts`'s "never rejects a duplicate even across many repeats",
an FK violation on `assignment_rules`) that did not reproduce when the same file ran alone,
or when the full suite ran with `--no-file-parallelism`. Root cause: independent spec files
share one physical database and at least one other file inserts/deletes an `assignment_rules`
fixture row around the same window `applyAssignment()` (called from inside
`resolveOrCreateLead()`) reads the table — a cross-file race, not a bug in the identity or
assignment code itself. Pre-existing limitation of the current test setup (each spec file
manages its own fixtures/cleanup independently, with no shared locking), not something this
session's changes touch or fix. `npx vitest run --no-file-parallelism` is the reliable way to
get a real full-suite signal locally until the suite's fixtures are made cross-file-safe.

2026-08-29 · [my-day] "At risk" (docs/02-BUILD-PHASES.md § Phase 2's "overdue → due today →
new assignments → at-risk") has no real SLA-breach signal to key off yet — `leads.sla_breached`
exists as a column but nothing computes it; that's the SLA cron, still later in Phase 2. Rather
than leave the bucket empty or invent a fake breach calculation, it uses the honest signal
already available: a **hot** lead with no `next_followup_at` scheduled at all. That's a real,
meaningful "about to fall through the cracks" condition on its own (a counsellor's hottest
leads should never be sitting with no planned next step), and the bucket already checks
`sla_breached` first so it becomes the real thing for free the moment the SLA cron starts
setting that column — no My Day code changes needed then.

2026-08-29 · [my-day] Each lead lands in **exactly one** bucket — overdue, due-today, new
assignment, at-risk, in that priority order — never more than one, and never split across two.
The alternative (showing a lead in every bucket whose condition happens to be true) would let
the same lead double- or triple-count toward "how much is on my plate today," which defeats
the point of a prioritized work queue. A lead that's both overdue and technically a "new
assignment" (never contacted, but with an overdue task) is shown once, under Overdue — that's
the more urgent framing and the one that should get worked first.

2026-08-29 · [my-day] A task's due date and a lead's own `next_followup_at` are two independent
"when do I need to act" signals for the same lead (a task might be assigned by someone else,
e.g. a centre head asking a counsellor to send a document, entirely separate from the
counsellor's own logged follow-up plan). My Day treats whichever is earlier as the lead's
reason for showing up — never shows both, never picks the follow-up over an equally-relevant
overdue task. Only tasks assigned to the viewing user are considered (not every open task on
the lead), matching "my queue," not "everything happening on this lead."

2026-08-29 · [sla] The SLA sweep cron implements `sla_breached` (measures, business hours,
priority-ordered policy matching) but deliberately stops there — it does not run the
`escalations` array's `notify_roles`/`notify_owner`/`unassign`/`requeue` side effects. There is
still no `notifications` table (the same gap already noted against the assignment engine's
"notify the owner" action), so "notify" has nowhere real to go yet; `unassign`/`requeue` are
real behavioural changes to a lead's ownership that deserve their own audit-logged, deliberately
reviewed implementation rather than being bolted onto this session's cron as an afterthought.
`flag_breach` is the one escalation action delivered for real, since it's exactly what setting
`sla_breached` already is. Extending this sweep to walk the full `escalations` array once
notifications exist is additive — the per-lead evaluation this session built doesn't need to
change, only what happens after a breach is detected.

2026-08-29 · [sla] `first_response_at` is stamped by `logInteraction()` on ANY interaction
logged for a lead — not filtered to `direction = 'outbound'` or a specific `type`. The column
and the SLA measure it drives are both named after "the first time someone worked this lead,"
and the first interaction of any kind logged (even one entered as a record of an inbound call)
is real, honest evidence of that. Splitting hairs over direction would need a call server-side
before there's ever a real telephony integration (Phase 6) generating inbound-vs-outbound data
worth splitting on.

2026-08-29 · [sla] `in_stage` measures from the most recent `stage_history` row for a lead,
falling back to `leads.created_at` when none exists yet. A lead can theoretically have zero
`stage_history` rows (the trigger writing that table fires on a stage *change*, not the initial
insert — see migration 0005) even though it already has a `stage_id` from creation; treating
"no history yet" as "has been in its current stage since creation" is the only sensible
baseline, and matches what's actually true for a brand-new, never-moved lead.

2026-08-29 · [sla] `/api/cron/sla-sweep` fetches every non-deleted, non-terminal lead and every
active policy/business-hours/holiday row in a handful of queries, then evaluates and batches
the updates in application code, rather than pushing the per-lead measure computation into SQL.
Same reasoning already applied to the CSV export row cap and the stage_history "keep the first
occurrence per lead" lookup: AFD's real volume (~200 leads/month, so a few thousand active
leads at any one time for years to come) fits comfortably in one function's memory, and a plain
TypeScript loop calling the same `evaluateConditions()`/`evaluateLeadSla()` the rest of the app
already uses (and already unit-tests) is far easier to get right and to keep right than a
hand-written SQL translation of the same business-hours-aware logic. Revisit if lead volume
ever grows by an order of magnitude.

2026-08-29 · [sla] Corrected a real priority-direction bug in `evaluateLeadSla()` (shipped last
session): it sorted `sla_policies` ascending (ties going to the lowest priority number first),
but docs/01-DATA-MODEL.md § SLA policies states the opposite explicitly — "Highest `priority`
whose `applies_to` matches wins." Both the SLA and temperature settings screens already order
their policy/rule lists `priority DESC`, which was the signal that should have caught this the
first time. Fixed the sort direction, and separately fixed the two tests in
`tests/sla-evaluate.spec.ts` that encoded the same wrong assumption (a "specific" policy given
a *lower* priority number than a catch-all, which happened to still pass under the bug — not
because the test was checking the right thing, but because ascending-sort coincidentally picked
the specific one first anyway at those exact numbers). Both temperature_rules and sla_policies
now consistently use "highest number = highest priority" — the opposite of assignment_rules'
"lowest number = highest priority" — documented directly in `evaluateLeadSla()`'s own comment
this time, not just in the data model doc, so the next reader doesn't have to go find it.

2026-08-29 · [temperature] The condition grammar `evaluateLeadTemperature()` reuses from the
assignment engine (`evaluateConditions()`/`FIELD_MAP`) cannot express
docs/01-DATA-MODEL.md § Temperature's own illustrative rule example — "replied within 48h AND
stage rank >= 5 → hot" — since there's no whitelisted field for a *derived* value like "hours
since last activity" or "current stage's rank/probability" in a straight `lead[column]`
lookup. Shipping temperature_rules with only the fields already whitelisted (source, district,
city, state, exam year, centre, temperature itself, interested exams/courses, preferred mode)
is still real, useful capability — an admin can build genuine rules like "source=Referral →
hot" or "district=Kannur AND exam_year=2027 → warm" today. Extending the grammar with
time-based/derived comparisons (new condition ops, or precomputing derived fields onto a
lead-like object before evaluation) is real additional engine work, not a quick add-on, and is
deliberately left for when it's actually needed rather than guessed at now.

2026-08-29 · [temperature] `org_settings.temperature_override_days` (migration 0015, default
3) is the config column docs/01-DATA-MODEL.md § Temperature always referenced
("`org_settings.temperature_override_days`") but that never actually existed in the schema —
completing it now rather than hardcoding a number, since CLAUDE.md's own test ("would an admin
ever want this different?") clearly answers yes, and the doc had already committed to this
being configurable. `updateLead()` reads it fresh on every manual temperature change rather
than caching it, matching this codebase's existing pattern of trusting a cheap singleton-row
read over any caching layer.

2026-08-29 · [temperature] The recompute cron only implements the nightly batch half of
"evaluated nightly and on activity" (docs/01-DATA-MODEL.md § Temperature). An immediate
recompute triggered by a specific activity (a new interaction, a stage move) would mean calling
`evaluateLeadTemperature()` synchronously from inside those write paths (`logInteraction()`,
`moveLeadStage()`, ...) — real additional wiring, and arguably needs its own decision about
which activities should trigger it, rather than bolting it onto this session's cron as a
guess. A lead's temperature is at most one nightly cycle stale in the meantime, which is a
reasonable interim behaviour, not a broken one.

2026-08-29 · [merge] `merge_review_queue.lead_id` is always treated as the survivor and
`candidate_lead_id` as the one merged away, matching how `resolveOrCreateLead()` already
creates the row: `lead_id` is the phone-matched lead (the identifier every lead is guaranteed
to have), `candidate_lead_id` is the email-matched one. No UI choice to swap which side
survives — if a reviewer determines the *candidate* is actually the "more real" record (more
history, earlier creation, whatever), rejecting this pairing and doing the reverse merge
manually via a second, deliberate action is the honest way to handle that, not a "flip
survivor" toggle that would need its own careful reasoning about what "more real" even means.

2026-08-29 · [merge] The merge-review screen only surfaces a link to itself when there's at
least one pending pairing (a count badge on the leads list, gated on `lead.merge`) — no
permanent sidebar entry for what should be, in steady state, an empty queue. A user with
`lead.merge` but zero pending reviews can still navigate to `/leads/merge-review` directly
(it's a real page, not hidden), they just won't see an entry point for it until there's
something to act on. Revisit if that turns out to hide the page too well in practice.

2026-08-29 · [merge] `mergeLeads()`'s snapshot column stores the merged lead's full Drizzle row
object directly (cast through `Record<string, unknown>`) rather than hand-picking fields.
`lead_merges.snapshot` exists specifically so a wrong merge can be manually reversed by someone
reading the JSON and re-entering what's needed — trimming it down to "the fields someone
guessed might matter" would defeat that purpose the first time the guess was wrong.

2026-08-29 · [reports] `/reports` reads `leads` through the direct db client and
re-implements its own scope check, rather than the RLS-bound client every other page uses —
the one deliberate exception to "RLS is the backstop" outside the already-documented identity/
merge/config-import list. Reason: `leads`' RLS (`leads_select`) is gated on `lead.read`, but
`report.read`/`report.center`/`report.org` are meant to grant *aggregate counts* to roles that
don't hold `lead.read` at all — `accounts` and `academics` both have `report.read`+
`report.center` without `lead.read`, per seed.ts. Going through the RLS-bound client would
have silently shown these roles zero data on every widget (RLS quietly returning nothing,
never an error) instead of the real aggregate counts they're supposed to see. The page only
ever selects `id`/`assigned_to`/`center_id`/`stage_id`/`first_touch_source` — deliberately
never a name, phone, or email — so the privacy boundary `lead.read` exists for (browsing
individual records) still holds; only counts cross this door, same as every other permission
primitive in this system is scoped to one specific thing.

2026-08-29 · [reports] `report.read`/`report.center`/`report.org` are three independent
permission codes, not one permission carrying an own/center/all `scope` value the way every
other permission in this system does (each still has a `scope` column in `role_permissions`,
but every seeded grant for these three sets it uniformly across the whole grant call, so it
carries no extra information here — the code chosen tells you the tier). The reports page
computes its effective scope by checking which of the three the caller holds, widest wins
(`report.org` > `report.center` > `report.read`), not via `scopeFor()`. Worth knowing before
adding a fourth report screen: don't call `scopeFor(user, "report.read")` expecting it to
reflect the org/center tier — it won't.

2026-08-29 · [reports] Charts use the theme's own `--primary` CSS variable as the single
magnitude hue for both bar charts, rather than introducing a new brand colour. This app has no
real brand hue chosen yet (`org_settings.primary_color` defaults to a dark slate,
`--primary` in the shadcn theme is a neutral near-black/white) — inventing a colourful chart
palette ahead of an actual brand decision would need re-doing once one exists. Revisit once
Leon picks real brand colours in Settings → Organisation; at that point a real categorical
palette (for a chart that needs one — none of the four dashboards here do, since none encode a
second variable by colour) would go through the dataviz skill's validator, not get eyeballed.

2026-08-29 · [orphans] `assignment_history.reason` is a Postgres enum
(`rule | manual | round_robin | reassign_sla`), not free text — the orphan queue's manual
assignment uses the existing `'manual'` value rather than a new one like `'manual_orphan_assign'`
would have been. Worth a wider note: this is the third bug this session where a Supabase-JS
`.insert()`/`.update()` call — an untyped plain object, unlike Drizzle's schema-typed query
builder — passed an invalid enum/wrong-direction value that neither `tsc` nor `eslint` could
catch, only a real write against live Postgres. (The other two: the SLA priority-direction bug
and, more mildly, the general pattern noted throughout this session of the Supabase client not
being generated against a `Database` type.) If this keeps recurring, generating real Supabase
types (`supabase gen types typescript`) and threading them through `createClient<Database>()`
would close this whole class of bug at compile time — not attempted this session, but worth
raising as real, scoped follow-up work rather than continuing to catch each instance by hand.

2026-08-29 · [orphans] The orphan queue's "assignable counsellors" list is anyone with an
active `user_centers` row at the lead's centre — not filtered to roles whose `lead.read` scope
is `own` (`getAssignableUsers()` in `resolve-field-options.ts` does that narrower filter for a
different purpose, the user_ref field type). Reusing that narrower helper would have meant a
center_head could only assign to counsellor-shaped roles; not reusing it means they could
technically pick another center_head or even themselves via the dropdown (redundant with the
dedicated Claim button, but not blocked). Left broad deliberately for a first pass — a
centre's real membership list is small and human-reviewed at assignment time, so the practical
risk of picking the "wrong" role from the dropdown is low; tighten later if it turns out to
matter in practice.

2026-08-29 · [phase4] Phase 4's foundation pass deliberately scopes down from the full doc.
Built for real: `fee_structures`, `enrolments`, `payments`, `receipts`, `students`, both named
gates, the accounts queue, and a fee structures settings screen. Deferred, not built at all
this session: promos/`lead_promos`, `discount_approvals` (the `discount.approve` permission
exists and is enforced nowhere — a counsellor can set any discount at Gate 1 today, there is
no approval-authority-limit check), instalment templates/tracking/ageing (an enrolment's
balance is computed live from summing the ledger on the detail page, not tracked as scheduled
due dates), documents/enrolment agreements, the registration/enrolment form builder
(`enrolment_forms`/`form_tokens`/`form_submissions`), refunds (`payment.refund` exists and is
unused — a correction today would be a manually-inserted reversal payment row via direct DB
access, not a UI action), and batch management (the `batches`/`student_batches` tables exist
with full RLS, but no screen creates a batch, so `batch_id` stays null on every enrolment/
student). Revisit in the order Leon actually needs them, not necessarily this order.

2026-08-29 · [phase4] "Lead work stops" after Gate 1 (CLAUDE.md non-negotiable) is implemented
by moving the lead into the seeded `stage_type='won'` pipeline stage, not by adding a check to
the `leads_update` RLS policy. That stage was already excluded from My Day's queue, the SLA
sweep, the temperature recompute cron, and the reports page (all four already special-case won/
lost stages) — so this reuses an existing exclusion rather than adding a new one to the most
security-sensitive policy in the schema. Consequence worth knowing: a counsellor with
`lead.update` can still technically edit a won-stage lead's fields through the normal lead
edit form — nothing in RLS blocks it. Revisit if that turns out to matter in practice; the
safer fix (a genuine `leads_update` policy carve-out for won/lost stages) was judged too risky
to add in the same pass as everything else in this session.

2026-08-29 · [phase4] Gate 1's fee lookup key is (course, centre, mode, academic year) against
`fee_structures`, with a manual total-fee override accepted when no row matches — deliberately,
since `fee_structures` coverage is entirely admin-maintained and won't have a row for every
combination from day one. `confirmAdmission()` throws rather than silently defaulting to zero
or refusing the admission outright; the calling Server Action surfaces that error to the
counsellor as "provide totalFeePaiseOverride" (rendered as the "Manual fee override" field).
No UI currently distinguishes "used the fee structure" from "used a manual override" on the
resulting enrolment — both look identical afterward. Add an `enrolments.fee_source` column
if that distinction ever needs to be reportable.

2026-08-29 · [phase4] `recordPayment()`'s Gate 2 trigger is "this is the first CREDIT payment
with no `reverses_payment_id`, for this enrolment" — checked by counting matching `payments`
rows after the insert, not by any flag on the enrolment. A debit (reversal) recorded before any
credit would not itself trigger Gate 2 (a reversal only exists to correct a prior credit, so
this case shouldn't arise in practice, but the guard is written to require a credit
specifically rather than "any payment row exists" to be safe against it). Chose "first
payment, however small" as the Gate 2 trigger — not "payment covers the full fee" or "payment
meets some configurable minimum" — because CLAUDE.md's own lifecycle description says the gate
fires on "first payment cleared," and instalment plans aren't built yet to define what a
"first instalment amount" would even mean. Revisit once instalment templates exist.

2026-08-29 · [phase4] `students` profile fields (name, phone, parent phone, email, DOB, target
exams, target exam year) are copied from the lead at Gate 2 and never synced again — a
deliberate one-time copy, not a live reference. This is CLAUDE.md's own instruction taken
literally: "academics must never have to query the sales table." A phone number corrected on
the lead after Gate 2 does NOT propagate to the student record; whoever notices the mismatch
has to fix both records by hand. No reconciliation tooling built for this — flag as real,
scoped follow-up work if it turns out to matter operationally (most students won't have their
lead record touched again after admission anyway, since "lead work stops" at Gate 1).

2026-08-29 · [phase4] Real migration-authoring bug, caught and fixed before it shipped: hand-
writing an RLS-only migration's snapshot by literally `cp`-ing the previous migration's
snapshot file (as this session initially did for 0016→0017) copies that file's `id` AND
`prevId` verbatim, producing two snapshots that claim the identical migration-history node.
`drizzle-kit migrate` never validates this and applies the SQL fine regardless — the corruption
is silent until the next `drizzle-kit generate` call, which refused outright with "pointing to
a parent snapshot ... which is a collision." The correct way to hand-write an RLS-only
snapshot (confirmed against how Sessions 3–7's own migrations 0005/0008/0010/0012/0014 did it):
copy the file's contents for the table/policy shape, but always mint a fresh `id` and set
`prevId` to the immediately-prior migration's `id` — never copy both fields verbatim. Anyone
hand-writing a future RLS-only migration should check this specifically, since nothing short
of running `generate` again will reveal the mistake.

2026-08-29 · [phase4] `students.student_code`'s default (`'STU' || lpad(nextval(...), 6, '0')`)
is a raw SQL expression set directly in the RLS migration (0017), not something Drizzle's
column builders (unlike `bigserial`, used for `leads.lead_number`/`receipts.receipt_no`) can
express natively — so it was initially left off the Drizzle schema definition entirely, which
made `tsc` correctly reject every `.insert(students, {...})` call for missing a required field.
Fixed by adding the identical default expression to the schema column via
`.default(sql\`...\`)` (migration 0018 — a genuine no-op against the database, which already
had this default from 0017; it exists only so `drizzle-kit`'s own migration history matches
what schema.ts now declares). Pattern worth remembering: any column whose default is a raw SQL
expression needs that expression mirrored in the Drizzle schema too, or every caller gets a
spurious "required field" type error despite the column being genuinely optional at the
database level.

2026-08-29 · [phase4] `fee_structures` was added to the config export/import bundle
(`bundle-schema.ts`/`export-config.ts`/`import-config.ts`), bumping `CONFIG_BUNDLE_VERSION`
from `1` to `2` — the first real version bump this bundle has had. Justification: CLAUDE.md's
own "What is configurable" table lists "Fees: Structures ..." explicitly, so per the doc's own
plug-and-play test this table has to travel with the rest of an instance's configuration, not
be left to re-enter by hand on every new deployment. `center_id` carries over unchanged on
import — no remapping needed — because `importConfig()` re-inserts `centers` rows with their
original ids into what must be a freshly-migrated, empty instance; the same reasoning already
applied to `business_hours`/`holidays`, which also carry a bare `center_id`.

2026-08-29 · [departments] Leon asked for "a whole different experience" per department
(sales/accounts/academics), each seeing only what they should of each other's leads. Decision:
one app, one codebase, department-shaped *screens and permissions*, not three separate
front ends — a role-aware `/dashboard` plus each department's own workspace (`/accounts`,
now `/students`), gated on the permission primitives that already exist, never a role name.
Three real front ends would mean three places to fix the same bug; this gets the same felt
separation (a counsellor never sees an accounts screen, an academics user never sees a payment
number) for a fraction of the build and maintenance cost. Revisit only if a department's needs
genuinely diverge in ways that don't fit the shared shell — nothing so far has.

2026-08-29 · [departments] Fixed a real Session 18 gap: the `accounts` role never held
`lead.read`, so `/accounts/[id]`'s `leads(student_name, primary_phone)` embed was silently
returning `null` for every accounts user (RLS enforces each embedded table's own SELECT
policy — `leads_select` needs `lead.read`, and `enrolments`'/`payments`' own policies don't
substitute for it). Granted `accounts` `lead.read` + `lead.reveal_phone` + `interaction.read`
at scope `center` — matches Leon's explicit ask that "accounts and sales should see everything
about each other's leads." Side effect worth knowing: this also puts `/leads` and `/my-day` in
an accounts user's sidebar (both nav items are gated on the bare `lead.read` permission, with
no finer-grained "lead.read but only via an enrolment" primitive). Left as-is rather than
inventing role-specific nav suppression — `/leads` filtered to their own centre is genuinely
useful for cross-referencing before an enrolment exists, and My Day just shows an empty queue
for a role nothing gets assigned to, which is harmless. Did NOT make the equivalent change for
`academics` — CLAUDE.md already gives academics everything the phrase "core lead details"
promises via the `students` table itself (name, phone, course, exams targeted, all copied at
Gate 2), which is the entire point of that denormalisation; adding `lead.read` for academics
would let them browse the sales pipeline, which is the thing being scoped away, not toward.

2026-08-29 · [dashboard] `/dashboard`'s five widgets are gated on the permission each actually
needs (`lead.read` at scope `own` for "Your day", `lead.assign` for "Pipeline",
`payment.read`/`student.read`/`settings.manage` for the other three) rather than checked
against a role code — a role holding several of these bundles (center_head; admin/co_admin)
sees several widgets, which is correct: CLAUDE.md describes center_head as running their
centre end to end, not just its sales pipeline, so seeing accounts+academics summaries too is
the intended behaviour, not scope creep to fix later. "Your day" specifically checks
`scopeFor(user, 'lead.read') === 'own'`, not `can(user, 'lead.read')` — at scope
`center`/`all` the underlying query (`assigned_to = user.id`) would only ever return zero
rows, since nothing gets assigned directly to accounts/center_head/admin, so gating on scope
avoids shipping a widget that would always render empty for those roles.

2026-08-29 · [my-day] Factored the My Day page's fetch-and-build logic out into
`getMyDayQueueForUser()` (`src/lib/my-day/get-queue.ts`) so the dashboard's "Your day" widget
and the full `/my-day` page share one query instead of two copies drifting apart. The full
page still owns its own `batchNameLookup()` call (the widget only needs counts, not centre
names), so the split is at "fetch + bucket the queue," not the whole page.

2026-08-29 · [students] The students list (`/students`) masks phone numbers the same way the
leads list does (CLAUDE.md non-negotiable #6's "list view... in bulk" concern applies to any
scrollable list of contact numbers, not specifically to leads) — but the student *detail*
page shows the phone in full immediately, with no reveal-audit step, unlike a lead's. Reasons
this is a deliberate difference rather than an oversight: (1) there's no
`lead.reveal_phone`-equivalent primitive for students, and inventing one plus its audit
plumbing wasn't asked for and wasn't built; (2) the underlying risk `lead.reveal_phone` exists
for — a counsellor building a personal database of prospects to poach — doesn't really apply
to an already-enrolled, already-paying student academics is delivering a course to. Revisit if
this turns out to matter in practice; the fix would be a `student.reveal_phone` primitive
mirroring the lead one exactly.

2026-08-29 · [students] No edit capability on the student detail page this pass — Leon's ask
was specifically "should be able to see," and `student.update` (already held by the academics
role since Phase 4's seed) stays unused by any UI until a future session builds it. Batch
assignment specifically can't be built yet regardless, since there's still no batch-management
screen (Session 18 deferred it; `batches`/`student_batches` are schema-only).

2026-08-29 · [tags] Lead tagging is `tags` (admin-configurable definitions, same
list/new/`[id]`/active-toggle shape as Centres/Fee Structures, gated on `settings.manage`) +
`lead_tags` (the many-to-many join). Deliberately did NOT add a new permission primitive for
applying/removing a tag — it reuses `lead.update`, since tagging a lead is a lightweight edit
of that lead, not a distinct capability CLAUDE.md's "each primitive is an enforcement point"
principle would justify a new one for. `lead_tags` has no UPDATE policy at all (only
SELECT/INSERT/DELETE) — a tag application is either present or absent, never edited in place;
removing and re-adding is the only "change" that makes sense. Deactivating a tag definition
hides it from the "+ Add tag" picker on new tagging but does NOT retroactively strip it from
leads that already carry it — same "deactivate ≠ remove usages" precedent already established
for pipeline stages and dropdown options.

2026-08-29 · [tags] The leads list's tag filter is a bespoke `tag` query param resolved to a
plain lead-id list (`leads.page.tsx` queries `lead_tags` directly, then `.in("id", ...)`),
NOT wired into the generic field-schema-driven filter engine (`applyLeadFilters`/
`readFilterValues`/`filterParamKey`) every other lead filter uses. Reason: that engine is
built around `field_definitions` — one column, one value — and a tag is a many-to-many
relationship with no backing column on `leads` at all. Forcing tags through that engine would
mean either inventing a fake field_definitions row for something that isn't a field, or
teaching the engine about join-table filters generally; neither was worth it for one filter.
Revisit if a second non-column filter shows up and the duplication starts to hurt.

2026-08-29 · [tags] `tags` was added to the config export/import bundle
(`CONFIG_BUNDLE_VERSION` bumped `2` → `3`), same reasoning as `fee_structures` in Session 18:
an admin-editable label list is configuration, and CLAUDE.md's plug-and-play test says
configuration travels with the instance. `lead_tags` (which leads carry which tags) is
correctly excluded — it's data, same bucket as leads/students/payments themselves, never
exported. No retargeting sync exists yet to consume these tags (Meta/Google/WhatsApp audience
sync is the integration work in docs/DECISIONS.md § A10, still deferred) — this session only
builds the tag itself and the ability to apply it; where a tagged segment goes is future work.

2026-08-29 · [testing] Adding RLS test coverage for a permission boundary sometimes requires
giving a fixture user real centre membership it doesn't have by default (`accounts_a`/
`academics_a` start with none, specifically so other tests can assert "sees nothing, not even
its own profile's centre"). Giving them global membership in the outer `beforeAll` to test
Phase 4 boundaries broke an earlier, unrelated `users.manage` visibility assertion that
depends on those two fixtures having zero centres. Fixed by scoping the membership to a local
`beforeAll`/`afterAll` on a wrapping `describe` around just the tests that need it, instead of
the file's global fixture setup — the correct pattern for "this fixture needs different state
for just this group of tests" going forward, rather than mutating shared fixture state and
hoping nothing downstream depends on its old shape.

2026-08-29 · [testing] `fee_structures` was missing from `tests/rls.spec.ts`'s
`UNIVERSALLY_READABLE_TABLES` list despite being select-all-authenticated (Session 18 added
the RLS policy but not the corresponding test-suite entry) — added it alongside the new
`tags` entry while touching that list for this session's work. A small, easy-to-miss class of
gap worth watching for: adding a new select-all config table needs both the migration AND this
list updated, and nothing currently forces the second half to happen.

2026-08-29 · [integrations] WhatsApp will be **one verified number per counsellor**, not the
shared-number-with-per-message-attribution model this session recommended (cheaper, one
business verification, one bill). Leon's explicit call, made after hearing the tradeoff —
each counsellor already texts leads from what amounts to a personal WhatsApp identity today,
so continuity mattered more than the cost/complexity difference. Consequence for the actual
WhatsApp build (queued, not started): `whatsapp_accounts` (docs/01-DATA-MODEL.md) needs an
`assigned_to` (profile id) column that doesn't exist in the doc's current sketch, and the
onboarding flow is "add a counsellor → they go through Meta's WhatsApp Business number
verification → paste their number's credentials into a per-counsellor Settings screen," not
a single org-wide setup. `integration_credentials.scope_id` (this session) exists specifically
so that per-counsellor credential storage doesn't need a schema change when this gets built.

2026-08-29 · [integrations] "Plug and play" for Meta (and every integration after it) means
every credential lives in `integration_credentials`, encrypted, entered through a Settings
form — never an env var, since an env var needs a deploy and the whole point is that
connecting a new ad account or WhatsApp number doesn't. The one deliberate exception:
`INTEGRATION_ENCRYPTION_KEY` itself, which cannot be a database row without becoming
circular (it's what the database rows are encrypted under). Generated once with
`openssl rand -base64 32` and set in the deploy environment; rotating it means re-encrypting
every stored credential, not attempted by any code this session — treat it as a one-time
setup value, same category as `DATABASE_URL`.

2026-08-29 · [integrations] `integration_credentials` has literally zero RLS policies for any
authenticated role, on any command — not "settings.manage can read, nobody else can," zero.
Same reasoning as the `permissions` table: a credential should never be readable through the
browser at all, encrypted or not, so there's no RLS-bound path that should exist for it in
the first place. Every read/write goes through `src/lib/integrations/credentials.ts` on the
direct db client, and that module's own functions are the only enforcement point — the
calling Server Action (gated on `settings.manage`) is what actually stands between a browser
session and a credential ever being touched.

2026-08-29 · [integrations] `src/lib/integrations/credentials.ts` deliberately has NO
`import "server-only"`, for the same documented reason as `seed-permissions.ts`/
`import-config.ts`: that package throws under a plain Node process (confirmed — both `tsx`
and a bare Vitest run hit it), not just under webpack's client/server boundary check, and
this module's own tests need to import it directly. The real security boundary is RLS (see
above) plus always running on the direct db client, not the presence of this lint-time
marker — so omitting it here costs nothing real and buys testability.

2026-08-29 · [integrations] The Meta Lead Ads webhook fetches each lead's actual answers from
the Graph API rather than trusting the webhook payload itself — Meta's `leadgen` webhook
event carries only a `leadgen_id`, never the submitted name/phone/email, by design (their
docs call this out explicitly: the webhook is a notification, not the data). This means
every real lead requires one extra network call per webhook delivery, and that call can fail
independently of signature verification — handled by giving each `leadgen_id` its own
`webhook_events` row with its own status, so a Graph API outage marks exactly the affected
leads `failed` (for Meta's own retry to pick up) without blocking or duplicate-processing
anything else in the same delivery.

2026-08-29 · [integrations] Ad spend sync assumes the Meta ad account is INR-denominated —
`spend` comes back from the Insights API as a decimal string in whatever currency the ad
account itself uses, and this session's mapper (`mapMetaInsightsRow`) multiplies it by 100
and rounds, with no currency conversion. Correct today (AFD India's ad accounts are INR) and
wrong the moment any ad account isn't — if that ever happens, `ad_spend_daily` needs its own
currency column and the mapper needs to stop assuming. Not built defensively against that
possibility now since it isn't a real scenario yet, per CLAUDE.md's own steer against
building for hypothetical requirements.

2026-08-29 · [integrations] The retargeting/Custom Audience upload — the actual "send every
lead back to Meta for retargeting automatically" half of Leon's ask — is NOT built this
session. Only inbound ingestion (the webhook) and ad spend reporting exist so far, neither of
which uploads any lead's PII anywhere. Flagged once already (before this session started) as
a real DPDP Act / consent question that needs an explicit answer, not an assumption, before
an automated daily upload of hashed phone numbers to an ad platform ships — still open.
Whoever picks this up next should get that answer before writing the sync, not after,
precisely because by then the rest of the Meta plumbing will already exist and make the
upload job look like a trivial extension of it.

2026-08-29 · [integrations] Leon confirmed explicitly ("yes everyone is consenting") that
every lead in the CRM has given consent for retargeting — this is the answer the entry above
said was required before building the Custom Audience upload, so it's built this session.
Eligibility (`isRetargetingEligible` in `src/lib/integrations/audience-sync.ts`) still checks
`consentStatus === "given"` per-lead rather than skipping the check organisation-wide: a lead
with `consentStatus: null` (never asked) or `"withdrawn"` is excluded regardless of Leon's
blanket confirmation, and `doNotContact`/any non-empty `optedOutChannels` also excludes. This
is deliberate — Leon's answer establishes the *policy* (consent has been sought and given as
a matter of practice), not a licence to upload leads whose own record says otherwise or who
opt out later. No per-channel opt-out vocabulary is seeded yet, so `optedOutChannels` is
treated as all-or-nothing (any entry excludes from every platform) until that's built out.

2026-08-29 · [integrations] The retargeting sync is a genuine two-way diff, not an
add-only job — `ad_audience_members` tracks current platform membership per
`(platform, lead_id)`, and each run computes `eligibleLeadIds` vs
`currentlySyncedLeadIds` and both adds and removes. This matters specifically because
consent is revocable: a lead who withdraws consent (or gets marked do-not-contact) after
already being uploaded must be actively removed from the ad platform's audience, not just
excluded from future adds — an add-only sync would leave a withdrawn lead sitting in Meta's
Custom Audience indefinitely. Verified with a real test
(`tests/meta-retargeting-sync.spec.ts`) that flips a synced lead's `consentStatus` to
`"withdrawn"` and confirms `removeUsersFromAudience` is called and the `ad_audience_members`
row is deleted in the same run.

2026-08-29 · [integrations] Google's Lead Form webhook has no HMAC signature header at all
— the shared secret (`google_key`) is a plain field inside the JSON body itself, verified by
constant-time string comparison after parsing, not before. This is a real, documented
deviation from CLAUDE.md non-negotiable #9's literal phrasing ("check the signature before
parsing") — there is no signature to check pre-parse in Google's design, only a field inside
the body. The underlying intent (never trust the body until its authenticity is checked, and
persist it regardless) is preserved: the raw payload is stored in `webhook_events` whether or
not `google_key` matches, exactly like a bad-signature Meta request. `JSON.parse` on an
untrusted string is not itself a security boundary crossing (no code execution, no side
effects) — the actual boundary crossed is "believe this payload enough to create a lead,"
which still only happens after the key check passes.

2026-08-29 · [integrations] A Google Lead Form webhook delivery with `is_test: true`
(triggered by clicking "Send test lead" in Google Ads' own UI) is persisted to
`webhook_events` and marked `done`, but deliberately never reaches `resolveOrCreateLead()`.
Without this, every click of that button — something an admin might do repeatedly while
verifying the webhook is wired up — would create a real fake lead in the live sales
pipeline. Meta has no equivalent concept (its webhook only fires on genuine form
submissions), so this branch has no Meta counterpart.

2026-08-29 · [integrations] Google Ads' `metrics.conversions` (used as `leadsReported` in
`ad_spend_daily` for the Google platform) counts every conversion action on the account, not
specifically lead-form submissions — unlike Meta's Insights `actions` array, which lets the
mapper filter to just the known lead action types. Isolating "only the lead-form conversion"
on the Google side would need a specific conversion action id configured per-account ahead of
time, which nothing in this system does yet. Treated as correct for AFD's actual accounts
(single-purpose, lead-generation-only) and flagged rather than built around, per CLAUDE.md's
steer against solving a hypothetical requirement — the day an account also tracks e.g.
page-view conversions, this number silently overstates lead volume and needs revisiting.

2026-08-29 · [integrations] Meta Custom Audiences and Google Customer Match hash phone
numbers under genuinely different normalisation rules — Meta wants digits-only with country
code and no leading `+`, Google wants strict E.164 with the `+` kept. Both platforms silently
accept a wrongly-normalised hash rather than erroring; it just never matches anyone, so this
would have been a silent no-op retargeting sync rather than a visible bug if shipped wrong.
Kept as two separate functions (`hashPhone`/`normalizePhoneForHash` for Meta,
`hashPhoneE164`/`normalizePhoneE164ForHash` for Google) rather than one shared "normalize
phone for retargeting" that would necessarily be wrong for one of the two platforms.

2026-08-29 · [integrations] `ads_access_token` (Marketing API — Insights, Custom Audiences)
and `page_access_token` (Graph API — fetching a submitted lead's own answers) are stored and
tested as two separate credentials, not one. They require different Meta permission scopes
(`ads_read`/`ads_management` vs page-scoped lead-retrieval permissions) and are typically
issued to different token types (System User vs Page token) — conflating them was an actual
bug caught mid-session (the ad-spend-sync cron originally reused `page_access_token`) before
it shipped. `testMetaConnection` now checks each token independently against Meta's
`/debug_token` and reports both, since "the Meta integration is connected" isn't a single
yes/no when the two halves (lead ingestion vs. spend/retargeting) can be configured, valid,
or broken independently of each other.

2026-08-29 · [whatsapp] "One number per counsellor" (Leon's confirmed decision, overriding
this session's own shared-number-with-attribution recommendation) is implemented as ONE
org-wide `access_token` credential plus a PER-COUNSELLOR `phone_number_id` credential
(`scope_id` = the counsellor's profile id) — not N separate access tokens. This is how Meta's
WhatsApp Cloud API actually works: a single System User token with
`whatsapp_business_messaging` can act on any phone number in the WhatsApp Business Account,
so "one number per counsellor" only requires N distinct `phone_number_id`s, not N distinct
credentials of every kind. Routing (which counsellor "owns" an inbound message, which number
an outbound send goes out from) is entirely about which `phone_number_id` is used per call —
`findScopeIdByCredentialValue()` (new in `credentials.ts`) does the reverse lookup for the
inbound direction.

2026-08-29 · [whatsapp] An inbound WhatsApp message to a specific counsellor's number sets
`assignedTo` explicitly on `resolveOrCreateLead()`'s input, bypassing `applyAssignment()`
entirely (same short-circuit `resolveOrCreateLead()` already documents for "a counsellor
manually creating a lead for themselves"). Reasoning: a customer messaging one specific
counsellor's personal WhatsApp number is a stronger, more specific routing signal than any
generic assignment rule (source/centre/exam) could produce — the customer already has (or
found) a relationship with that person. If this ever needs to be overridable per-rule, that's
a real future ask, not assumed here.

2026-08-29 · [whatsapp] WhatsApp's Lead Form-equivalent has no HMAC signature to check before
parsing at all for the *handshake* concern Meta's Lead Ads/Google both have, but it DOES have
one for message delivery: `X-Hub-Signature-256`, verified with `verifyMetaSignature()` reused
directly, unmodified — WhatsApp Business webhooks are the same Meta Graph webhooks product as
Lead Ads, just a different field subscription. This is different from the Google Lead Form
webhook (Session 22), which has no signature header at all and authenticates via a plain
`google_key` field inside the JSON body — worth noting since it would be easy to assume "no
signature header" is the norm for a non-Meta-Ads webhook, when actually it's WhatsApp that's
the same Meta product family and Google that's the outlier here.

2026-08-29 · [whatsapp] Inbound media (image/document/audio/video/sticker) is recorded by its
Meta media id and mime type only — NOT downloaded into Supabase Storage this session. A real,
deliberately deferred gap: nothing is lost (the raw webhook delivery is still in
`webhook_events` and the message row still exists with its media id), a counsellor just can't
view the attachment inline in the chat panel yet, and the media id itself expires eventually
per Meta's own retention rules if never fetched. Downloading requires an additional Graph API
call (`GET /{media_id}` for a temporary URL, then a fetch of that URL) plus a private Storage
bucket and signed-URL viewer — real, scoped work for a future session, not attempted here to
keep this session's already-large scope from growing further.

2026-08-29 · [whatsapp] The 1:1 chat panel's template-send path (used to message a lead
outside Meta's 24-hour customer service window) takes a template name/language/parameter
typed in by the counsellor, not a picker fetched from Meta's Message Templates API. A real,
documented gap for the same reason as media download above — fetching and caching the
account's actually-approved templates is its own small feature, not attempted this session.
The counsellor has to already know the exact approved template name; a wrong one is rejected
by Meta with a clear error, not silently dropped.

2026-08-29 · [whatsapp] The marketing broadcast feature sends each recipient from THEIR OWN
LEAD'S assigned counsellor's WhatsApp number, not a separate dedicated "marketing" number —
deliberate, not an oversight. No such credential exists (by design: "one number per
counsellor" was Leon's whole model, and inventing a marketing-specific number would be a
second, competing identity). Sending through the recipient's existing counsellor keeps the
broadcast inside a thread the customer already recognises rather than arriving from a
stranger number — arguably a better outcome for a template message than a generic company
broadcast number would produce. The real cost: a lead with no assigned counsellor, or whose
counsellor has no number configured, can't receive a broadcast at all — the sweep marks that
one recipient `failed` with a clear reason rather than silently skipping it or attempting a
fallback send from an arbitrary other number.

2026-08-29 · [whatsapp] The broadcast audience is deliberately filtered to exclude
`do_not_contact` leads (same as the retargeting sync) but does NOT check
`consent_status`/`opted_out_channels` the way the ad-platform retargeting sync does — those
fields govern ad-platform retargeting consent specifically, a different, narrower consent
question than "can we message this person on WhatsApp at all." `do_not_contact` is the one
flag clearly meant to be a blanket suppression regardless of channel, so it's the one checked
here. Worth revisiting once (if) WhatsApp-specific opt-in/opt-out tracking exists as its own
concept — flagged rather than conflated with the retargeting consent fields on a guess.

2026-08-29 · [whatsapp] A WhatsApp broadcast is always template-based, with no "draft, review,
then send" step — creating a broadcast immediately snapshots its recipient list and sets
`status = 'sending'`, and the cron sweep starts draining it on its very next run. There is no
in-between "queued but not yet sending" state a human reviews before commit. This was a
scope call, not a considered design decision: a review/approval step is real, sensible future
work (a broadcast reaching the wrong audience is hard to partially undo — Meta doesn't support
recalling a sent WhatsApp message), flagged here so it doesn't get mistaken for "this is how
it should stay."

2026-08-30 · [students] Leon shared AFD's actual paper intake form (a PDF export of a Google
Sheet) — the earlier placeholder print layout (Session 19) never matched it, since no real
template existed to build against yet. Rather than hardcoding the ~20 fields it asks for
(mother/father details, academic history, art teacher, design discipline, hobbies, a photo)
as new `students` columns, they're wired through the SAME admin-editable custom-fields system
(`field_definitions`, `entity='student'`) leads already use — a different design institute's
intake form asks different questions, so CLAUDE.md's plug-and-play test ("could this be
deployed for a different company by changing only database contents") applies here exactly
as much as it does to lead fields. `students` gained a `custom` jsonb column (migration 0029)
mirroring `leads.custom` exactly. The whole custom-fields pipeline
(`get-field-schema.ts`/`field-column.ts`/`resolve-field-options.ts`) turned out to already be
100% entity-generic — including the Settings → Custom Fields UI's entity picker, which
already listed "student" as a choosable option with zero code behind it. This is the same
pattern as this session's WhatsApp work: a real feature turned out to already be half-built
as unused-but-correct scaffolding from Phase 1, just never given real data to prove it out.

2026-08-30 · [students] `getFieldSchema`'s `sort_order` (drives the edit form's section tabs)
and the print page's field ORDER/PAIRING are deliberately two separate concerns, not one. The
edit form groups fields by topic for usability (Personal / Parents / Program / Academic
History / Interests & Notes); the print page reproduces the physical paper form's exact
row-by-row layout, which interleaves those same topics in a specific sequence a real form
just has (Name, then Program+Batch, then DOB+Mode, ...). `PRINT_ROWS` in
`students/[id]/print/page.tsx` is a small hardcoded array of field-key pairs — the one part of
this feature that ISN'T config-driven, because a physical form's fixed layout is a genuine
one-time design decision, not admin-configurable data the way its field LABELS are (which
still come from `field_definitions` and do change if edited in Settings).

2026-08-30 · [students] The print page's photo box is positioned as an absolutely-positioned
overlay outside the table's own column grid, not as an HTML rowSpan cell inside it — an
earlier draft used rowSpan and got the column count wrong (a row spanned by a rowSpan cell
above it must NOT also declare a cell for that column, and getting this wrong desyncs the
whole table's implied column count for every row below it). Overlaying avoids the whole class
of rowSpan/colSpan bookkeeping bugs for what's fundamentally just "the photo lives in this
corner," at the cost of not being pixel-identical to the original PDF's exact grid lines
around the photo — an acceptable trade for a working, correct print page over a
visually-perfect but fragile one.

2026-08-30 · [students] Student photo is a plain URL field (`photo_url`, admin pastes a
link — e.g. from wherever the counsellor already stores it), not a real upload flow into
Supabase Storage. CLAUDE.md names Storage/signed-URLs as the stack's intended file-handling
approach, but nothing in this codebase has ever actually built that yet (`"file"` has been a
listed field TYPE since Phase 1 with zero implementation behind it — same "reserved hook,
never used" pattern as several WhatsApp permissions/columns turned out to be). Building real
upload (a private bucket, storage RLS policies, an upload widget, signed URLs for the print
view) is legitimate, separate work — deferred here for the same reason WhatsApp inbound media
download was deferred: honest, complete as far as it goes, not a half-finished pretense of
more.

2026-08-30 · [students] The academics detail page (`students/[id]/page.tsx`) previously had no
edit capability at all — read-only fields, even though the `academics` role has held
`student.update` (at centre scope) since it was seeded. `dynamic-field-input.tsx` moved from
`leads/[id]/` to `src/components/fields/` since it was already 100% entity-agnostic (reads
only `field.type`, nothing lead-specific) and is now genuinely shared between the lead and
student edit forms — a real, justified relocation once a second real caller existed, not a
speculative "might reuse someday" abstraction.

2026-08-30 · [tests] Fixed a real, reproducible test-isolation bug: `tests/whatsapp-webhook.spec.ts`
and `tests/whatsapp-broadcast-sweep.spec.ts` both registered a `phone_number_id` credential
using the exact same literal string (`"test-phone-number-id"`) for two DIFFERENT counsellor
fixtures. `findScopeIdByCredentialValue()` does a reverse lookup by decrypted VALUE across
every scoped credential for `(provider, key)` — under Vitest's parallel file execution
against one shared local Postgres, whichever row happened to be returned first would "win,"
occasionally routing one file's inbound-webhook test to the OTHER file's counsellor id
(caught as an intermittent `expected X to be Y` UUID mismatch, not a deterministic failure).
Fixed by making each file's test value unique to its own `MARKER`. Separately observed (not
fixed): the Meta/Google retargeting-sync test suites can occasionally hit a foreign-key
violation under the same parallel-execution conditions, because their production code
deliberately scans the *entire* `leads` table (a correct, intentional design for AFD's real
volume — see that route's own comment) rather than filtering to just that test file's
fixtures; a lead can very rarely be deleted by another file's cleanup between that scan and a
later write in the same request. Not chased down further — it didn't reproduce on a second
run, and forcing serial test-file execution to eliminate it entirely would slow down the
whole suite for a flake that has never been observed twice in a row.

2026-09-03 · [insights] Renamed the `/reports` route (and its nav entry) to `/insights`,
after the client reported the page silently failing to load — in every browser including
Incognito, on both his local dev server AND the live Vercel production deployment. Since
local dev and Vercel production share no backend infrastructure, and the failure mode
(devtools showing 0 bytes transferred / a network-level error, not an application error)
was identical on both, the common factor had to be client-side: something on the client's
machine or network blocking any request whose URL contains the literal word "reports."
This is a known false-positive pattern — some antivirus "web shield" products and
system-wide ad/tracker blockers filter URLs matching common analytics-beacon path patterns
(e.g. CSP `report-uri`/`report-to`, telemetry `/report` endpoints), and such filters
typically inspect traffic below the browser (a system network extension or DNS-level
filter), which is why disabling one browser's extensions or using Incognito didn't help.
Rather than asking a non-technical client to diagnose or disable security software on his
own machine, renamed the *browser-visible* route/link/label from "Reports" to "Insights"
site-wide (`src/app/(app)/reports/` → `src/app/(app)/insights/`, `nav.ts`, `sidebar.tsx`
icon map, the dashboard admin widget's link). Deliberately left untouched: the
`report.read`/`report.center`/`report.org` permission codes (`src/lib/auth/permissions.ts`)
and the `src/lib/reports/aggregate-leads.ts` module path — neither is ever a browser URL,
so neither can trigger this class of filter, and renaming them would just be churn (plus,
for the permission codes, a values a role's `role_permissions` rows already reference).

2026-09-03 · [insights] **The client-side-filter theory above was WRONG.** The rename changed
nothing, which is what forced a real diagnosis. Actual root cause: `insights/page.tsx` is the
only *page* in the app that reads over a direct Postgres socket (`@/lib/db/client`) — grep
confirms every other importer of it is an `api/cron/*` route, an `api/webhooks/*` route, or an
`actions.ts` Server Action, none of which run on a browser GET. Every other page reads through
Supabase's HTTP API. So this is the only screen that fails when `DATABASE_URL` is wrong or
points at a host the environment can't route to — which is precisely the IPv6-only Supabase
direct hostname, in BOTH of the client's environments (his home network locally, Vercel's
functions in production). That is why it failed in both places at once while every other page
looked fine, and why it looked like a client-side problem: the two environments were failing
for the same *class* of reason, not a shared backend.

The failure was invisible rather than loud because of a timeout interaction, measured
directly rather than assumed: a *refused* connection throws in ~7ms, but an *unreachable*
host (packets dropped, no RST) doesn't error at all — postgres.js stalls for its
`connect_timeout`, which defaults to **30s**. Locally that meant the dev server printed
"✓ Compiled /reports" and then never a GET line, because the request genuinely hadn't
finished. On Vercel it was worse: functions are killed at ~10-15s, well before 30s, so the
function died mid-request and the browser got a bare "network error" with **0 bytes
transferred** and nothing in the server logs — the exact symptom screenshotted, and one that
looks nothing like a database problem.

Two fixes, both about making this legible rather than papering over it:
1. `connect_timeout: 8` in `client.ts`. The specific number matters — it must fail *inside*
   a Vercel function's lifetime so the app can render an error page, rather than being killed
   mid-response and returning nothing. Verified empirically: 8.0s, code `CONNECT_TIMEOUT`.
2. `isDatabaseUnreachable()` + a `DatabaseUnreachable` panel on the Insights page naming
   `DATABASE_URL` and the pooler string. Deliberately matches *socket* errors only, never
   SQLSTATE query errors (`42703` undefined column, `23505` unique violation, `42501` RLS
   denial) — a config message shown in place of a real bug would be worse than the crash it
   replaced. Pinned by `tests/db-unreachable.spec.ts`.

Not done, considered: moving this page onto the Supabase HTTP client to remove the direct
socket entirely. Rejected because the direct client is a deliberate design choice here (the
page must serve aggregate counts to roles like accounts/academics that don't hold `lead.read`,
without exposing per-lead PII — see the page's own header comment), and the service-role key
is forbidden in browser-reachable routes by CLAUDE.md § Non-negotiables 3. The connection is
the right architecture; it just needed to fail honestly.

2026-09-03 · [insights] **Resolved.** With per-query deadlines in place the page finally named
its own failure: `Insights "leads" query exceeded 8000ms` — the FIRST query in the sequence —
after which a reload rendered the page fine in milliseconds. So `DATABASE_URL` was correct all
along and the database was never unreachable; the earlier diagnosis above was right about the
mechanism (only this page uses a direct socket, and a stalled render returns nothing) but wrong
about the cause.

The real cause is cold-connection cost. postgres.js connects lazily, so whichever query runs
first also pays for the TCP connect, TLS handshake and pooler auth. The client's dev server was
reporting `Network: http://172.20.10.5:3000` — the 172.20.10.x subnet an iPhone Personal
Hotspot hands out — so that setup was crossing a tethered mobile link to an AWS region. Over
that, connection establishment alone outlasted a timeout sized for a warm connection, while
every subsequent query on the now-warm connection returned instantly. Hence the maddening
"fails once, then works" behaviour, and hence its appearance on both local and production: the
same laptop, the same link, in both cases.

Fixed by tolerance rather than by raising a number and hoping: per-query timeout 8s → 10s, plus
one retry on a timeout or socket error. The retry is what actually matters — it converts a
first-query cold start into a warm second attempt, and it is safe here specifically because
these are read-only SELECTs, so re-running one cannot double-apply anything. A write path must
not copy this pattern without idempotency. Also set `maxDuration = 30` on the route: Vercel
kills a function at its plan limit and the browser then gets a bare network error with no server
log, which is the single thing that made this so hard to see.

Worth keeping in mind for later: any page whose first database read happens on a cold
connection inherits this, and the same first-query cost applies to cron and webhook handlers
(where a retry is NOT automatically safe). A connection warmed at process start would remove
the class entirely; not built now because one retry solves the observed problem and a
keep-warm mechanism has its own failure modes on serverless.

2026-09-03 · [files] Real file upload, replacing the pasted-URL stub. Attachments hang off a
lead or a student via two nullable FKs with a check constraint (exactly one parent), not a
polymorphic `(entity, entity_id)` pair. A polymorphic pair would have needed the owning centre
denormalised onto the attachment row for RLS to scope it, and that copy goes stale the moment a
lead moves centres — a quiet way to leak a document across centres. Real FKs keep referential
integrity and let every policy resolve the centre from the parent, so it is always current.

Access is enforced twice in Postgres, on the row and on the object, because those are two
different things a user could reach: `attachments` RLS governs the metadata, and Storage
policies on `storage.objects` govern the bytes. Both call the same two helpers
(`can_access_lead_files` / `can_access_student_files`), which are `security definer` for a
specific reason: without it the `leads` lookup inside a policy is itself filtered by leads' RLS,
so accounts and academics — which legitimately hold `file.read` but NOT `lead.read` — would find
no parent row and be denied their own files. Object keys are `<kind>/<parent id>/<uuid>-<name>`
because the Storage policies parse those first two segments; `buildStoragePath` and migration
0031 must therefore change together, and `tests/attachments.spec.ts` pins the shape.

The bucket and its object policies are wrapped in a guard on the `storage` schema existing. The
test suite runs the same migration chain against a plain local Postgres with no Supabase
Storage, and skipping there is correct rather than a compromise — there are no objects to
protect on a database with no object store, and the `attachments` policies the tests actually
exercise still apply.

Two things found by testing rather than by reading. First, the soft-delete UPDATE returns rows,
and Postgres applies the SELECT policy to the NEW row of a returning UPDATE — so with a select
policy of plain `deleted_at is null`, removing a file failed with "new row violates row-level
security policy". Fixed by making removed files visible to `file.delete` holders specifically,
which is also the better rule: whoever can remove a document should be able to see what they
removed, and the removal stays reversible. Second, the upload UI is a client component and
needed the size limit and accepted extensions, so the constants and pure helpers live in
`shared.ts` while `attachments.ts` keeps `server-only` — one number, used by both the form and
the server-side check, that cannot drift.

Counsellors get `file.read` + `file.upload` but deliberately NOT `file.delete`: dropping a
signed agreement off a lead is not a counsellor's call. Nothing is ever hard-deleted — there is
no DELETE policy on `attachments` at all, and removing a file only sets `deleted_at`, leaving
the bytes in Storage. Signed URLs are minted per click rather than rendered into the list,
because a signed URL is a bearer token: putting one in the markup would hand a working link to
every document to anyone who views source, and leave them live in history.

2026-09-03 · [registration] Public tokenised registration form. Submissions go through
`resolveOrCreateLead()` then `applyAssignment()` like every other source (CLAUDE.md
§ Non-negotiables 8) — it is a new front door, not a second ingestion route. That is what makes
a student who fills the form twice, or who already exists from a Meta ad, one lead with several
enquiries rather than a duplicate, and it means the form never decides who owns the lead.

Which questions get asked is `field_keys`, naming `field_definitions` rows, so an admin adds a
question by picking an existing lead field — including a custom one they invented — with no
migration. The form's own key order is preserved rather than the field definitions' sort order:
on a registration form the order is content, since it reads as a conversation.

The security shape needed care, because this is the only unauthenticated write path a stranger
can reach with nothing but a URL. Three things carry it. The token is 32 CSPRNG bytes, never
derived from the form name, and is a capability to SUBMIT only — the page renders nothing about
existing leads, so a leaked link exposes no data. `PUBLIC_CORE_FIELDS` is an allow-list mapping
snake_case field keys to Drizzle column properties, so a submission can only ever reach the
columns named there — never `stage_id`, `assigned_to`, `center_id` or `temperature`, even if an
admin mistakenly adds one of those keys to a form. And answers are written onto a NEWLY created
lead only: a second fill must not overwrite a counsellor's corrections, and the enquiry row
keeps the full submission either way, so nothing the applicant typed is lost.

Like the webhook handlers, this runs on the direct db connection rather than an RLS-bound
client — an anonymous visitor has no session for a policy to bind to. RLS on
`registration_forms` therefore protects the table from signed-in users who shouldn't manage
forms; the token is what protects the public path.

Known gap, stated rather than hidden: there is a honeypot but NO rate limiting. A determined
script could still create many leads with fabricated phone numbers. Real protection belongs at
the edge (Vercel WAF, Cloudflare Turnstile) rather than in a per-request database check, which
would be both slower and easy to defeat; worth adding before the link is published widely.

2026-09-03 · [tests] Switched Vitest to serial file execution (`fileParallelism: false`).
The earlier entry accepted the cross-file race on the grounds it "has never been observed twice
in a row" — it since has, and the registration suite (which creates and deletes leads) makes it
likelier. Root cause is unchanged and is not a bug: the retargeting syncs scan the whole `leads`
table because that is correct for AFD's volume, so a concurrent file's cleanup can delete a row
mid-scan. Serial costs ~16s (9s → 25s). These suites are what prove the RLS boundaries hold, and
a result that can't be trusted is worth less than the time saved.

2026-09-03 · [ai] The `/ask` analyst. CLAUDE.md § AI analyst rules is the whole design: it must
never generate SQL against the live database, and every tool must apply the same centre scoping
as RLS. Both are structural here rather than instructed. The model chooses which of eight fixed
tools to call and with what typed arguments; it never supplies a query, a table or a column, so
the worst a hostile question can achieve is calling the wrong tool and getting a number back.
`tests/ai-analyst.spec.ts` asserts that no tool exposes an argument named sql/query/table/column/
where/filter/expression/raw, and that every schema sets `additionalProperties: false` — a
guarantee about the surface, not a hope about the prompt.

Scoping is derived by `analystScope()` exactly as the Insights page derives it (widest of the
three `report.*` codes held), and `leadScopeWhere()` is written once and used by every tool: a
scoping rule written five times is one that will eventually be written four times.
`allowedCenterIds()` narrows a caller-supplied centre filter to what they may see, which is the
specific hole the CLAUDE.md sentence warns about — the model passes a centre because the user
named it, and without that narrowing the tool would answer. The Kannur-head-asking-about-Kochi
case is a test.

Tools return aggregates only — counts, rates, group labels. No name, phone or email can enter a
tool result, so the analyst cannot become a route around the bulk-PII rule (§ Non-negotiables 6).
Every question is written to `audit_log` for the same reason exports are.

`scope.ts` reads the permission map directly instead of importing `can()`, because that module is
`server-only` and a value import would make the scoping rules — the part most worth testing —
untestable under Vitest. Same reasoning as `credentials.ts`.

Model choice deliberately differs from CLAUDE.md's stack table, which names `claude-sonnet-4-6`.
That entry predates the current model line-up, so the code defaults to `claude-opus-5` and reads
`ANTHROPIC_MODEL` from the environment — configuration, not code (§ Non-negotiables 10), so Leon
can trade quality for cost without a deploy. Flagged to him rather than silently chosen. The
route returns a clear 503 when `ANTHROPIC_API_KEY` is unset, and the page says how to set it,
rather than failing as a broken feature.

2026-09-03 · [ai] Swapped the analyst from Anthropic to Google Gemini's free tier — Leon's
explicit call: this feature must not generate per-query charges. Only the driver changed. The
tool set and the scoping in `lib/ai/tools` are provider-agnostic and untouched, so the security
properties (fixed tools, no SQL, same centre scoping as RLS, aggregates only) hold regardless of
who serves the model. Raw REST rather than an SDK: the request shape is the whole integration.
Two shape differences are normalised in `gemini-schema.ts` — Gemini rejects
`additionalProperties` and rejects an object schema with an empty `properties` map — kept out of
the tool definitions so those stay provider-neutral, and pinned by tests. Model is
`GEMINI_MODEL`-configurable (default `gemini-2.0-flash`) because these names change faster than
the code and a wrong one is a 404 an operator should fix without a deploy; a 404 is reported
with that instruction rather than as a generic failure.

2026-09-03 · [profile-form] **Replaced** the generic public registration form with a per-lead
student profile form. Leon's correction: this is not lead capture — it goes to students sales
have already confirmed are joining, and completing it is step one of admission (fees are step
two). The old `registration_forms` table, its settings screens and its `/r/<token>` route are
deleted rather than left alongside; two ways to do this would have meant two things to keep
right. Its migrations (0032/0033 as first written) had never run outside the sandbox, so they
were removed rather than superseded by a drop.

The token now lives on the lead (`leads.profile_form_token`), minted on demand by the
counsellor. That is a better shape than the generic one it replaces: the form arrives already
bound to the person it is about, so there is no identity matching and no way for an answer to
land on the wrong record. Minting is idempotent — pressing the button twice returns the same
link, because the counsellor may already have sent the first one and regenerating would silently
break a link sitting in a student's WhatsApp. The form renders the STUDENT field definitions
(the real AFD intake form seeded from the paper original), so it and the print profile stay the
same document.

Answers land in `leads.profile_form_data` as jsonb, deliberately NOT on the lead's own columns:
what the student said about themselves is kept distinct from what the counsellor recorded, so
neither silently overwrites the other and a counsellor can see both when they differ.
Resubmission is refused rather than overwriting — once a counsellor has worked from these
answers, a second submission from a forwarded link would change the record under them.

2026-09-03 · [fees] Fee and instalment plan on the lead page, and the printable agreement.
Written onto the lead's existing `enrolments` row rather than a parallel record: the enrolment
IS the commercial record, and duplicating fee figures would give accounts two numbers to
reconcile. Instalments are a table (`enrolment_instalments`), not four pairs of columns — the UI
offers four slots because AFD's paper form does, but four is a property of today's form, not of
the business, and rows make "what is overdue" an ordinary query. Saving replaces the rows
wholesale rather than diffing: a renegotiated plan is a new plan, and matching old rows to new
by position would mis-assign due dates. This is the AGREED schedule; money received stays in the
append-only `payments` ledger, and a balance is derived by comparing the two.

`validatePlan` deliberately allows a part-scheduled plan — a student pays something now and the
rest is agreed later is real, and refusing it would push counsellors into entering a fake
instalment; the UI shows the shortfall instead. It does reject scheduling MORE than is payable,
which is always a typo and would print an agreement overcharging a student. Printing is gated on
the plan being complete AND the signed copy being on file, because a half-entered agreement in a
student's hands is worse than none.

The print page matches the real form (landscape A5, two columns, numbered sections, blue
accents) with two deliberate departures: it draws four instalment rows where the paper has three
(Leon asked for four slots; unused rows still print so it looks familiar), and the Receipt No
column stays blank because a receipt number is issued by the ledger when money actually arrives,
not when the plan is agreed. `down_payment_paise` was added to `enrolments` because the paper
form carries it as its own line, separate from the instalments.

2026-09-03 · [print] Two corrections to the above, both from Leon.

The print gate was backwards. Printing had been gated on the signed copy already being
uploaded, which makes the actual workflow impossible: the counsellor PRINTS the agreement, the
student signs it on paper, and the signed sheet is scanned back in. Printing is now available as
soon as the plan is complete, and the panel says what happens next. The remaining gate — the
instalments having to add up — is a different thing and stays: a half-entered schedule would
print an agreement whose numbers don't add up, and that is the copy the student keeps.

Everything printable is now explicitly A4, set in one place (`lib/print/page-css.ts`) rather
than per page. Without a `@page` rule browsers fall back to whatever the print dialog last used,
which is how a form silently comes out on Letter. A4 is the paper AFD's offices have, and every
one of these documents is printed to be signed and scanned back — a document that prints at
another size returns cropped or rescaled, and the signed copy on file no longer matches the one
issued. The instalment agreement uses A4 *landscape*: its original is A5 landscape and the
two-column design needs the width, so printing the same layout on A4 keeps the proportions and
makes it markedly more legible, which matters on a document someone signs. Type sizes were
raised accordingly — they had been set for the smaller sheet.

2026-09-03 · [bug] `INSTALMENT_SLOTS` was exported from `fee-actions.ts`, which carries
`"use server"`. Next.js rewrites EVERY export of such a file into a server-action stub, so the
client received something that was not an array. It reached the client's browser as two errors
that name neither the file nor the real cause — `A "use server" file can only export async
functions, found object` and `..._WEBPACK_IMPORTED_MODULE__.INSTALMENT_SLOTS.map is not a
function` — and neither `tsc` nor `next build` catches it, because the types are entirely
consistent and the directive's constraint is invisible to both.

Fixed by moving the constant to `instalment-plan.ts`, the pure module, where it belonged anyway.
Added `tests/use-server-exports.spec.ts`, which scans every `"use server"` file for a non-async
export — type-only exports are erased before the directive matters, so they are not flagged. The
guard was verified by deliberately reintroducing the bug and watching it fail, then removing it;
a scan that has never been seen to fail is not evidence of anything.

2026-09-03 · [ux] Added a pointer on the Student Profile Forms page saying the questions are
edited in Settings → Custom Fields. Leon went looking for a "student profile form" entry in
Settings and found the deleted Registration Forms gone — reasonable, since nothing said where
the questions actually live. They are the student `field_definitions`, shared with the printed
profile, which is why there is no separate form builder: one definition, one form, one printout.

2026-09-03 · [ux] Reversing the entry above: there IS a separate form builder now —
Settings → Student Profile Form. Leon asked for one after the pointer went in, which is the
answer to the question the pointer was dodging. The previous reasoning ("one definition, one
form, one printout") was right about the data and wrong about the screen: the student field
definitions are still the single source of truth, and the new screen edits exactly those rows.
What changed is that composing a questionnaire and adding a column to a record are different
jobs, and a screen listing lead, student and enrolment fields together serves neither well. The
builder shows order, required, and on/off the form; it hides entity, list and filter visibility.
Custom Fields still exists and still edits the same rows.

2026-09-03 · [schema] Added `field_definitions.on_profile_form`. Until now the public form
rendered every student field definition, which meant it asked a sixteen-year-old to set their own
batch id, centre, enrolment status and joining date. Those are real fields — staff fill them in —
so deactivating them was not an option, and that is exactly why the flag is separate from
`is_active`: "live in the CRM" and "asked of the student" are different questions and were being
answered by the same column.

Migration 0035 backfills every student field to true except the institute-assigned ones, so an
existing install keeps a working form rather than silently getting an empty one on deploy. The
seed carries the same exclusion list, and `tests/profile-sheet.spec.ts` asserts the two lists
agree — two installs of the same CRM showing different forms is the failure worth catching. The
seed's upsert deliberately no longer overwrites `sort_order` or `on_profile_form`: both are
things an admin changes on the builder screen, and re-running the seed must not quietly undo a
reordered form.

A new student field created from Settings → Custom Fields defaults to being ON the form, since
"Add a question" is overwhelmingly why one gets created. Not offered as a checkbox: that generic
form cannot reliably render a control keyed to the entity dropdown's live value (the existing
options textarea has the same limitation), and the builder shows the placement plainly with one
switch to change it.

2026-09-03 · [print] A lead's submitted profile form now prints on the same paper sheet as the
student record, at `/leads/[id]/profile-form/print`. Leon asked for the printout to come out with
the exact fields from the sheet he uploaded, and it does — the layout is unchanged, because it is
now literally the same component. `PRINT_ROWS` and the sheet markup moved to
`lib/print/profile-sheet.ts` and `components/print/profile-sheet.tsx`; when the row order lived
inside the students page, a second printer of the same form could only have copied it and started
drifting the day either one changed.

The lead-side page exists because a student's answers arrive months before the `students` row
does — that record is created at the accounts→academics gate — and the office wants the sheet in
the file from the day the form comes back. An unsubmitted form still prints, as the blank sheet a
walk-in fills in by hand. `tests/profile-sheet.spec.ts` pins the row order against the uploaded
PDF and checks every key names a field that actually exists: a misspelt key does not crash, it
prints a blank column with a raw key as its label, and nobody notices until it is on paper in
front of a parent.
