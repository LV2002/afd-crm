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

2026-09-03 · [bug] The analyst's model name was hardcoded as `gemini-2.0-flash`, and Google
retired it: Leon set a valid API key and got "Gemini doesn't recognise the model". Nothing was
wrong with his key.

The fix is not a newer name — that is the same bug with a later expiry date. The driver now asks
the API which models the key can call `generateContent` on and picks the best one: newest, Flash
by preference (the free tier's workhorse, and fast enough that a counsellor waits a second rather
than ten), stable over preview, and the unsuffixed alias over a pinned `-001` build, since the
alias keeps tracking the current build while the pinned one is what eventually 404s. Resolved
once per process, and forgotten on a 404 so the next question re-resolves rather than repeating a
dead name.

`GEMINI_MODEL` still works and now means what it says — an explicit override that skips discovery.
A hardcoded fallback remains for the case where the listing call itself fails, but only so the
generate call can report the real problem (bad key, exhausted quota) in Google's own words instead
of being masked. When the model genuinely is not recognised, the error now lists the names the
operator's own key accepts rather than telling them to go and find one.

`tests/gemini-model.spec.ts` covers the selection with a stubbed fetch: no database, no network.

2026-09-03 · [bug] With the model now discovered rather than hardcoded, the analyst landed on
`gemini-3.8-flash` — a thinking model — and every question failed with:

  Function call is missing a thought_signature in functionCall parts.

The tool loop echoed the model's turn back as `{ functionCall }` rebuilt from the name and args.
That is enough for a non-thinking model and not enough for a thinking one: each `functionCall`
arrives with a `thoughtSignature`, which is how the model resumes its own reasoning across the
tool round trip, and rebuilding the part drops it. Fixed by returning the model's parts exactly as
they arrived and pushing those back verbatim.

`GeminiPart` is deliberately an open shape rather than a union of the three parts this code
constructs. A turn that has to be handed back unchanged will keep growing fields this code never
writes, and a closed union would silently drop each new one — this bug, again, on a delay.

Thought parts are filtered out of the answer text but kept in the echoed turn: they are the
model's reasoning, not its answer, and showing them would put half-formed working in front of a
counsellor. `tests/gemini-model.spec.ts` covers both, including several calls in one turn each
carrying its own signature.

2026-09-03 · [feature] Notifications, and the end of the inert escalation ladder.

Until now the CRM could not tell anyone anything. `sla_policies.escalations` had stored
`notify_roles` and `notify_owner` since Phase 2, an admin could edit them in Settings → SLA
Policies, and nothing whatsoever happened — the sweep's own comment admitted it. The same gap left
accounts finding out about a confirmed admission by refreshing a page.

The events are FIXED IN CODE (`lib/notifications/events.ts`), on the same discipline as the
permission primitives: a key exists because there is a real `notify()` call behind it, and one
without a call site would be a switch in the admin UI that silently does nothing — which is
precisely the bug being fixed. Six events ship, each with a genuine emit site: lead assigned, SLA
breached, SLA escalation step, admission confirmed, profile form submitted, payment recorded.

What IS configurable, per event, with no deploy: whether it fires, which roles hear it, whether
the lead's owner hears it, and the exact copy. That is CLAUDE.md § What is configurable —
"Notifications: which events notify which roles, on which channels, with what copy" — with one
honest omission: only `in_app` is delivered. The `channels` column exists and defaults to
`{in_app}`, but no channel picker is shown, because offering WhatsApp as a checkbox that does
nothing would repeat the exact failure this work exists to correct. When a second channel actually
delivers, the control goes in.

Recipients are resolved with a rule worth stating: nobody is told about something they could not
open anyway. The copy carries a student's name, so a Kannur centre head hearing about every Kochi
breach is both noise and a quiet leak of the per-centre data the RLS policies spend their whole
existence enforcing. Org-wide readers are recognised by their role's own `lead.read` scope, never
by a role name (CLAUDE.md § Roles). The lead's owner is exempt from the centre test — it is their
lead — and nobody is ever notified of their own action.

`notifications` has a SELECT policy of `recipient_id = auth.uid()` and NO INSERT POLICY AT ALL.
Notifications are written by the system on the direct connection, exactly as audit_log and lead
assignment already are, so a browser session cannot manufacture a message that appears to come
from the CRM. There is deliberately no centre- or all-scoped read path, not even for an admin: a
notification is mail addressed to a person, and "the admin reads everyone's messages" is a
surveillance feature nobody asked for. What an admin genuinely needs is already in audit_log.

`notify()` never throws. A notification is a courtesy attached to some other piece of work — an
admission being confirmed, a student submitting their form — and failing that work because the
courtesy failed would be the wrong trade every time.

Emission happens strictly AFTER the surrounding transaction commits, never inside it. `db`'s pool
is `max: 1`, so a second connection opened while a transaction still holds the first would
deadlock; and a notification about an admission that then rolls back would be a lie. That is why
`resolveOrCreateLead()` was split into a transaction body and a thin wrapper.

2026-09-03 · [schema] Added `leads.sla_escalated_at_hours` (migration 0038): the highest
escalation rung a lead has already reached. Without it the hourly sweep would notify the same
centre head about the same lead every hour until somebody touched it, which trains people to
ignore notifications and is worse than having none. Cleared when the SLA clears, so a rescued lead
that goes bad again climbs the ladder from the bottom. When several rungs come due at once — a
lead untouched over a weekend crossing 24h, 48h and 72h — only the highest fires: the lower ones
are implied by it, and three messages about one lead say nothing the last one doesn't.

The ladder's `unassign` action is now implemented too (the lead returns to the orphan queue).
`requeue` is still not, deliberately and on the record: the data model defines no queue for it to
mean anything against, and implementing a guess would be worse than the honest gap.

2026-09-04 · [feature] The finance workbook, rebuilt inside the CRM.

Leon shared AFD's live Google Sheet and its Apps Script — a genuinely well-built append-only
ledger with intake forms, per-account balances, collections, timeliness and a full set of reports.
The brief was to reproduce it here, editable, visible only to centre heads, accounts and
admin/co-admins.

**Its core design is kept, because it is the right one.** One ledger records every rupee; every
balance, statement and report is a derived view of it; nothing is ever edited or deleted; a
mistake is corrected by appending a mirrored negative row so totals net out on their own. That is
the same rule `payments` already followed (CLAUDE.md § 7), now extended from student fees to the
whole business.

**Two departures, both deliberate.**

The workbook kept a `Status` column it rewrote in place when a transaction was reversed — the one
spot where it broke its own append-only rule. Here "reversed" is DERIVED: a row is reversed when
another row points at it via `reverses_transaction_id`. So there is no UPDATE policy on
`finance_transactions` for anybody, admin included, and nothing to rewrite. A partial unique index
allows exactly one reversal per entry, because two people hitting reverse at once would otherwise
each append a mirror row and take the account down twice.

The workbook wrote allocation rows joining payments to instalments, and had to unwind them on
every reversal. Here allocation is computed at read time from the two append-only tables
(`allocatePayments()`), oldest-instalment-first, with reversals as negative amounts. A reversed
payment therefore un-settles the instalment it covered with no cleanup step to forget.

**Fee payments post to the same ledger, in the same database transaction as the receipt.** One
write or neither: a receipt without a cash entry is not a state the database can be left in. That
is strictly better than the spreadsheet, which had the same coupling with none of the guarantee.
`accountId` is optional on `recordPayment()` so payments recorded before the ledger existed stay
valid history; those appear on the reports under an explicit "not attributed to an account" line
rather than quietly missing.

**Transfers are excluded from income AND expenses**, which is the single most important rule in
the module and the easiest to get wrong. Moving ₹50,000 from the bank to the cash box is the same
money in a different drawer; counting it would inflate both halves of every report and make the
profit figure meaningless.

**The GST memo back-calculates** the tax already inside gross collections — gross × r / (1 + r),
not gross × r. Getting that backwards overstates the liability by the rate squared, which at 18%
is a 3% error on a figure a CA will read. It remains a memo: not a return, no input credit, no
record of what has been remitted, exactly as the workbook said.

**Every breakdown carries an "other / uncategorised" reconciling line.** It looks like pedantry
until the month somebody renames a category, at which point it is the only thing standing between
a tidy-looking report and a wrong one.

**Access.** Three new primitives: `finance.read`, `finance.record`, `finance.manage` — separate
from `payment.*`, which is about one student's fees and which a counsellor legitimately holds.
Centre heads get read + record at centre scope; accounts gets all three; admin and co-admin hold
everything. Counsellors and academics hold none, so the nav item is absent and the RLS policies
return them nothing. `own` scope cannot match, on purpose: "your own bank account" is not a
meaningful idea, and a role configured that way should see nothing rather than everything.

This is the part the spreadsheet could not do. Its own comment admits it: "protection blocks
editing, not viewing. Staff can still read every sheet and can copy the file."

**Not carried over.** The workbook's Config had an "Active Centre" filter that scoped every report
globally; here the centre boundary is RLS, so a centre head simply cannot see another centre and
needs no filter to say so. The three fixed ledgers became rows in `finance_accounts`, so a second
bank or a new centre is data rather than a code change. Admission intake is not duplicated — the
CRM already has enrolments, and a second door into the same record is how a receipt ends up
without a payment behind it.

2026-09-04 · [schema] `org_settings.gst_rate` as `numeric(6,4)`, not a float. A rate that drifts by
1e-16 changes a printed total on a fee agreement. It comes back from both postgres-js and PostgREST
as a string precisely so nobody loses that precision silently; `getFinanceConfig()` parses it once.

2026-09-04 · [ux] Leon asked whether Accounts and Finance both need to exist. They do, but the
naming was wrong and one screen was missing what it needed.

They are two different jobs. **Admissions** (formerly "Accounts", `/accounts`) is the per-student
fee-collection queue — one row per confirmed admission, and the question on each is "has this fee
arrived?". **Finance** is the institute's own books — expenses, cash position, profit and loss. A
centre head reads both; nobody would want them merged, because a page that mixes one student's
instalment with the electricity bill answers neither question.

What WAS wrong: three different things were called "accounts" — the queue, the section, and the
bank accounts inside Finance. Renamed to Admissions, Finance, and "Bank & cash accounts".

The workflow Leon described was, on inspection, already the one that is built: the counsellor
confirms an admission (Gate 1), it lands in the accounts queue, accounts is notified, accounts
records the payment, the first payment creates the `students` row (Gate 2) and academics can see
them. Academics genuinely cannot see an unpaid student — the row does not exist until Gate 2, so
it is structural rather than a filter someone could get wrong. The Students page now says so out
loud, because a rule nobody can see reads as a bug.

The real gap was on the enrolment screen: accounts saw the total fee, the discount and the net,
but NOT the instalment schedule, down payment, discount name or notes the counsellor agreed. They
were being asked "has the fee been collected?" without being shown what was supposed to be
collected. Added a read-only `AgreedPlan` panel showing each instalment with what has been
received against it, using the same `allocatePayments()` the collections report uses — so the two
screens cannot disagree.

Read-only on purpose. Accounts records payments against the plan; they do not renegotiate it.
Changing the terms stays with the counsellor on the lead, which keeps two people from editing the
same agreement from two screens.

The queue also splits into "New admissions" (awaiting first payment, the default) and "All",
which is what Leon asked for and what the job actually looks like.

## 2026-09-04 — Insights: a pivot instead of report templates

Phase 2 asked for a "generic pivot widget over nine dimensions"; what shipped was four fixed
reports and a note saying so. Leon asked for the original thing, in his own words: "adjust the
parameters ... like Google Sheets where I can filter each variable of a column."

Built as one grammar (`lib/reports/pivot.ts`) rather than more reports: every lead variable is a
filter, any one of them is the breakdown, and both go through the same bucketing — so a filter
always matches exactly what the chart would have drawn. The four old reports are now settings of
it. `aggregate-leads.ts` stays because the AI analyst's tools use it.

**Which variables count as dimensions, and why it matters here more than elsewhere.** The page
reads over the direct Postgres connection, bypassing RLS, because `report.read` is meant to give
aggregate counts to roles that do not hold `lead.read` at all. The old page was safe because it
selected five hardcoded columns. It now selects whatever an admin has configured, so the
guarantee had to become a rule: phone, email, URL, file, long text, currency and lead_ref are
never dimensions, and neither are the four fields whose value simply *is* the person
(`student_name`, `father_name`, `mother_name`, `address_line`), however they are typed. City,
school, state, exam year and every custom select stay available — a group label like "Ernakulam,
42" is an aggregate; "Anjali Menon, 1" is just the lead with extra steps.

Dates bucket to months rather than days: a per-day breakdown of ~200 leads a month is a list, not
a report. Multiselect variables put a lead in every bucket it belongs to, which is the honest
reading of "leads by exam" and does mean the column sums past the lead count — the page says so
when it happens rather than quietly under-counting.

Filtering happens in memory over the scoped rows; only the date range is pushed into SQL, because
that is what actually bounds how many rows come back. At AFD's volume this is the cheaper and
simpler side of the trade, and it keeps the whole grammar testable without a database.

## 2026-09-04 — Profile form answers as sortable columns

Leon wanted to search a student's name and sort the sheet by batch, city, state. The list had
search over everything and sorting over three fixed columns.

The columns are the questions: any question the form asks can be ticked on as a column, sorted,
and filtered from its own control. Nothing in the code names a question, so rewriting the form in
Settings brings its own columns. The opening column set is the "Show in list" tick that already
exists on every field definition — reusing it beat inventing a second preference, and it means
the default is admin-editable like everything else.

Three judgement calls:

- **Sorting compares what is displayed.** A batch is stored as a uuid; sorting by uuid would look
  random. Option-backed answers sort by their resolved label; numbers sort numerically and dates
  chronologically, which string sorting gets wrong.
- **Unanswered always sinks to the bottom**, in both directions. A blank is missing, not smallest,
  and flipping the sort to hunt for it is nobody's intent — so "Not answered" is a filter value
  instead.
- **Phone-typed answers cannot be columns.** A sheet of them is precisely the bulk contact export
  CLAUDE.md non-negotiable #6 exists to prevent. They stay on the expanded row, and are now masked
  there unless the viewer holds `lead.reveal_phone` — which was a real leak: the expanded row had
  been printing all four numbers in full to anyone with `lead.read`.

## 2026-09-04 — "Dropped" is a timestamp on the enrolment, not a status

Leon asked for a way to mark a student dropped so they drop out of reports and show as dropped to
sales, accounts and admissions.

**Where it lives: `enrolments.dropped_at`**, with `dropped_by` and `drop_reason` — not a fifth
value on `enrolment_status`. The two are orthogonal: someone can drop having paid in full
(`active`) or having paid nothing (`pending_payment`), and folding them into one column loses
which. Same shape as `leads.lost_at` and the derived "reversed" on `finance_transactions`: the
state is `dropped_at is not null`, and there is no second column that can disagree with it.

It is on the **enrolment**, not the student, because a drop can happen before Gate 2 — admission
confirmed, never paid, student changes their mind — when no `students` row exists yet. The
enrolment is the only record that exists across the whole window.

**It is reversible.** The two gates are one-way because they are handoffs; a drop is a fact about
a person that can be recorded against the wrong one. Restoring puts the student back as `active`
rather than to whatever they were before — a drop is not meant to be a way to park somebody
(`on_hold` exists for that), so storing the prior status would be a column serving a workflow the
system deliberately doesn't have.

**A new permission, `enrolment.drop`.** Retiring a conversion and calling off a fee chase is not
the same authority as correcting a fee, so it is not folded into `enrolment.update`. Seeded to
admin, co-admin, centre head and accounts — not counsellors, who should not be able to quietly
retire their own conversion. Roles are editable rows, so an institute that disagrees changes it in
Settings.

**Written on the direct db client, in one transaction**, with the permission and own/center/all
scope re-checked in the Server Action — the same shape as `recordPayment()`/`confirmAdmission()`
and for the same reason: the write spans `enrolments` and `students`, and the person recording a
drop is usually accounts, who hold `enrolment.drop` but not `student.update`. Splitting it to
satisfy RLS would allow an admission that is dropped while the student record still says active.

**What "omitted from reports" turned out to mean**, once each report was looked at:

- **Collections and the ageing buckets**: excluded. You do not chase a leaver.
- **The finance reports (monthly, yearly, cash flow)**: unchanged. They are the ledger, and a fee
  that was received was received. A refund is a reversal entry someone decides on; it is not
  implied by the student leaving.
- **Insights**: they stop counting as Won and get a Dropped column of their own. Removing them
  from the lead count altogether would have been the other reading, but it is the wrong one — the
  lead came in and the work happened, and hiding it would flatter cost-per-lead. Dropped is also
  not folded into Lost, which would put a reason nobody gave into the lost-reason breakdown.
- **Dashboard admission counts**: excluded, same reasoning as Collections.

## 2026-09-04 — The AI analyst tries more than one model

Leon: `503 … "This model is currently experiencing high demand"`, on every question, for two days.

The driver resolved a single best model and used only it, so the feature was exactly as available
as that one model. Google's newest Flash model is the least available thing on the free tier
precisely because it is the newest, while the one below it answers instantly.

`resolveModelCandidates()` now keeps the whole ranked list and `generateWithTools()` steps down
through it on 429/500/502/503, then sticks with whichever answered for the rest of the process so
the remaining tool round trips don't keep knocking on the busy door. A 429 is worth stepping down
for too: the free tier's quota is per model, so another model has its own. A 400/403 still fails
immediately — a malformed request or a bad key works no better on a second model, and trying three
just delays the real message.

This is preferred to switching provider. The 503 is one model shedding load, not Gemini failing,
and the analyst never sends lead data to the model anyway — the tools return aggregates, scoped to
the caller, and only those aggregates reach the API.

## 2026-09-04 — WhatsApp: the inbox, and the number question underneath it

Leon asked for a WhatsApp tab in the left menu and asked whether a lead's chat panel shows that
lead's messages or the counsellor's whole account.

**It is per-lead, and always was.** The Cloud API delivers every message to our webhook tagged
with the contact's number; the webhook resolves it to a lead through `resolveOrCreateLead()`. So
a thread is a property of the lead, not a slice of an account someone has to filter.

**The inbox needed no new access model.** RLS on `whatsapp_messages` already scopes rows through
the lead, so "the threads you can see" is exactly "the leads you can see". A counsellor picker for
centre heads — which Leon floated — would have been a second, weaker copy of that: it is not
needed, and the inbox is identical whether AFD runs one number or ten.

**The composer stays on the lead page** as well as in the inbox, at Leon's call. Same API either
way; the inbox is for working down a list, the lead page is for when you are already there.

### The unresolved part: which numbers go on the API

A phone number is registered to the WhatsApp Business **app** or to the **Cloud API**, never both.
Registering a number to the API ends its use in the app. There is no supported way to read a
counsellor's WhatsApp Business app conversations into a CRM, and unofficial ones get the number
banned.

The schema was built to Leon's earlier "one number per counsellor" call — a `phone_number_id`
credential per counsellor under one WhatsApp Business Account, sharing a single system-user token.
That still works, but it means each of those numbers leaves the app, which Leon has now said he
does not want.

Recommended instead: **one institute number on the Cloud API**, with counsellors' own numbers left
alone in the app. Every CRM message — templates, broadcasts, the inbox, the lead panel — runs on
that one number and is attributed in-app to the counsellor who sent it, so AFD owns the history
instead of it walking out with whoever leaves (the concern behind CLAUDE.md non-negotiable #6).
The cost is that students see an institute number rather than their counsellor's personal one,
which the message body and the WhatsApp display name can address.

No code change is needed to take that option: "one number per counsellor" and "one number for the
institute" differ only in how many `phone_number_id` credential rows exist. Left as Leon's
decision; nothing in the CRM assumes either.

## 2026-09-04 — One WhatsApp number for the institute

The CRM had been built to "one number per counsellor". That is buildable, but it takes each of
those numbers out of the WhatsApp Business app on the counsellor's phone — a number belongs to the
app or to the Cloud API, never both — and Leon wants those apps kept. Per-counsellor API numbers
would have meant a second SIM each, and in practice students messaging whichever number they
happened to have, leaving half the history off the CRM.

So: **one org-level `phone_number_id`**. Consequences, each of which was a real code change rather
than a setting:

- The inbound webhook can no longer infer an owner from the number a message arrived on. It
  resolves the lead first and files the message to the lead's own counsellor — which is also what
  RLS scopes the thread by, so ownership has one definition instead of two.
- `resolveOrCreateLead()` no longer gets a counsellor hint from the number, so a brand-new
  WhatsApp lead is assigned by the rules engine like every other source. That is CLAUDE.md
  non-negotiable #8 working as intended; the old hint was a quiet second assignment path.
- `findScopeIdByCredentialValue()` existed only for that routing and is deleted rather than left
  as an unused reverse lookup over decrypted credentials.
- The broadcast sweep no longer refuses a lead with no assigned counsellor.

**Template sends moved from `whatsapp.send` to `whatsapp.campaign`.** Leon's rule was that a
counsellor whose 24-hour window has closed messages from their own phone. The technical reason
agrees with him: a template is billed and counts against the number's quality rating, and one
number now carries the whole institute's reputation rather than one counsellor's. Free-form
replies inside the window stay with `whatsapp.send`, where they belong.

## 2026-09-04 — Templates are read from Meta, never mirrored

A template must be approved by Meta before it can be sent, and until now a counsellor typed the
name from memory and found out it was wrong when the send failed.

`/whatsapp/templates` lists them live from `/{waba_id}/message_templates` on every page load. No
local copy, deliberately: Meta owns the approval state and changes it without telling us — approved
overnight, or paused later for poor feedback — so a mirrored table would be wrong more often than
right, and the wrongness would be invisible. The cost is one Graph call per page view, which at
AFD's volume is nothing.

This needed a new credential, `waba_id`. Templates live on the WhatsApp Business Account, not on
the phone number, which is why sending needs `phone_number_id` and this needs the account.

Quick-reply buttons are supported at creation. They are also the first half of the "click to
multiple choice" flows Leon asked for: a tap arrives back through the ordinary webhook as an
inbound message carrying the button's exact text, so it already lands on the lead's thread. What
does not exist yet is the branching — reading that reply and deciding what happens next — which is
the automation-flow engine, deferred with scheduling and the audience builder.

## 2026-09-04 — WhatsApp inbound matches a lead, and never creates one

Leon: the WhatsApp Business API number is a marketing and broadcasting tool. Enquiries arrive on
the counsellors' own WhatsApp Business apps and are entered in the CRM by hand. But a reply to a
broadcast should notify that lead's counsellor.

This reverses the webhook's original design, which ran every inbound message through
`resolveOrCreateLead()`. Under Leon's arrangement that would be wrong twice: it would fill the
pipeline with people who tapped a button on a bulk message, and it would overwrite the first-touch
source of somebody who actually came from Meta with "whatsapp".

So `findLeadByPhone()` exists as the deliberate counterpart to `resolveOrCreateLead()`. CLAUDE.md
non-negotiable #8 says every lead entering the system goes through one ingestion path; this does
not contradict it, because no lead enters here at all — the source stopped being an ingestion path
when Leon said enquiries come in elsewhere.

It matches through `lead_identifiers` rather than `leads.primary_phone`, so a reply from the
parent's number reaches the right lead, and follows one `merged_into_lead_id` hop so a reply to a
merged duplicate lands on the survivor.

**Unmatched replies are kept, not dropped.** `whatsapp_messages.lead_id` became nullable
(migration 0042). Dropping them would lose the only record that somebody answered; creating a lead
is what Leon has ruled out. So they are stored with no lead and shown under "Not in the CRM",
where the person who sent the broadcast can decide — it may be an existing student's parent, a
wrong number, or a real enquiry, and that is a human call.

Those rows have no lead to inherit visibility from, so the RLS policy gained a second arm: a
message with no lead is visible to anyone holding `whatsapp.campaign` at any scope. That is the
person who sent the broadcast being replied to and the only person who can act on it. Every other
row keeps exactly the policy it had. INSERT and UPDATE still require a lead, so a browser session
cannot manufacture an unmatched row — only the webhook, on the direct connection, can.

Their number is shown unmasked, against the general rule (CLAUDE.md non-negotiable #6), because
the number is the thread's only identity and the thing you copy into a new lead — and only
campaign-holders can see these rows at all. Matched threads stay masked like every other list.

**Only the assigned counsellor is notified.** `whatsapp.reply_received` ships with
`defaultNotifyOwner: true` and no roles: exactly the rule Leon gave, and an admin can widen it in
Settings without a deploy.

## 2026-09-04 — Broadcast audiences reuse the Insights filter grammar

The audience was one lead tag. Leon asked for what Insights does — every variable, over leads and
students.

`lib/whatsapp/audience.ts` calls `applyPivotFilters()` directly rather than growing a second
filter language. Two implementations of "Kannur, Meta, NIFT" would eventually disagree, and the
person composing a broadcast is usually the person who just looked at the same slice on Insights.
It also means a custom field is a targeting option the moment an admin adds it, with no deploy —
the same property the rest of the field system has.

Everything runs through the caller's RLS-bound client, so a centre head's audience is their centre.
The scoping is the same policies as every list they can already read, not a rule this module
invents.

Three judgement calls in the resolver:

- **One message per number, not per record.** A parent whose number is on two siblings' records
  gets one broadcast. The count on screen says how many were folded together, so it doesn't look
  like leads went missing.
- **`do_not_contact` is applied in SQL**, not left to whoever composes the audience — a broadcast
  is precisely the unsolicited contact the flag exists to block. `consent_status`/
  `opted_out_channels` are still not checked: they govern ad-platform retargeting, a different
  consent question, and remain flagged for when WhatsApp-specific consent tracking exists.
- **`select("*")`** on the audience query, against the usual instinct, because the fields are
  configuration: an admin's new custom field has to be filterable without a code change. Nothing
  is rendered from it — only names and numbers reach the recipient snapshot.

**Students needed a real schema change**, not a lead lookup. `whatsapp_broadcast_recipients` now
carries `student_id` alongside `lead_id` with a `num_nonnulls(...) = 1` check, because a student
whose originating lead was deleted still has a phone, and their number can differ from the lead's.
The sweep stopped joining `leads` — it uses the phone snapshotted on the recipient row, which is
what it should have used from the start and is the only thing that works for a student audience.

**Only approved templates are offered.** An unapproved one is a send that fails at Meta's door, and
the failure reaches nobody who could act on it.

## 2026-09-04 — An UPDATE is gated by the SELECT policy too

Found by the first full run of the database-backed suite. `notifications_select` carried
`and deleted_at is null`; dismissing a notification is an UPDATE that sets `deleted_at`; and
Postgres rejected it with "new row violates row-level security policy". The row the update
produced no longer satisfied the SELECT policy, and an UPDATE whose WHERE clause reads the
table is checked against that policy as well as the UPDATE one.

Migration 0037's comment explicitly considered this and got it wrong — it reasoned about the
UPDATE policy's own WITH CHECK, concluded a dismissal was allowed, and never tested it.

The general rule this leaves behind: **RLS decides whose rows you may see, not which of your
own you have tidied away.** A soft-delete flag in a SELECT policy silently makes the row
un-soft-deletable by the person it belongs to. Filter `deleted_at` in queries, where it is a
display concern, and keep policies to the access boundary. Migration 0044 does that; every
read already filtered, so nothing changed except that dismissal now works.

## 2026-09-04 — The local Supabase shim is committed, not rebuilt each time

Three previous sessions hand-built a stand-in for the parts of Supabase the migrations assume
(the `auth` schema, `auth.uid()`, the three roles and their grants), verified something, and
threw it away — which is why the suite went unrun for about forty sessions afterwards.

It is now `scripts/local-supabase-shim.sql`, run via `npm run db:local-shim`, with the
sequence documented in docs/GETTING-STARTED.md. It stays out of `src/lib/db/migrations/`
deliberately and says so loudly at the top: a real Supabase project has genuine versions of
all of it, and shipping a fake `auth` schema into a real project's migration history would be
actively harmful.

Run it twice — once before `db:migrate` so the roles and default privileges exist, once after
so the tables the migration created inherit the grants. A missing grant does not look like a
missing grant: every query fails with "permission denied for table X", which reads as an RLS
failure and is not one.

## 2026-09-04 — Opt-out matches the whole message, and is keyed by phone

Two calls in the opt-out matcher, both about which mistake is worse.

**The message must BE the keyword, not contain it.** Matching a substring would unsubscribe
somebody for writing "stop by the centre tomorrow" or "can you stop calling in the morning" —
and that failure is silent: they never hear from their counsellor again and never know why. A
missed opt-out is loud by comparison; the person repeats it, usually more firmly. So the strict
rule is right, and multi-word keywords ("stop promotions") work the same way.

**Suppression is by phone number, not by lead.** Somebody typing STOP is speaking for the number
in their hand. They may not be a lead at all — this number sends marketing and AFD's enquiries
arrive on the counsellors' own phones — and a parent whose number sits on two siblings' records
should be suppressed once, not twice, which keying on the lead would get wrong.

**The keywords are `dropdown_options`.** CLAUDE.md § 10: before hardcoding a list, ask whether an
admin would ever want it different. An institute in Kerala will want a Malayalam word, and one
running a different kind of campaign may want STOP to mean nothing.

**Checked at compose time and again at send time.** The audience is snapshotted when a broadcast
is created, deliberately, so a stage change mid-send doesn't move the goalposts — but an opt-out
is not a goalpost. Somebody who says STOP after the queue is built must not receive the message,
so the sweep re-checks before each send. It is one query for the batch, not one per recipient.

**`released_at` rather than a delete.** "We stopped messaging them on the 3rd, they asked to come
back on the 9th" is the answer to a complaint; a deleted row answers nothing. The partial unique
index is on live suppressions only, so somebody can opt out, back in, and out again.

## 2026-09-04 — Combining marks are letters too

The opt-out normaliser stripped everything outside `\p{L}\p{N}\s`, which is the reflex, and it
mangles most Indic scripts: Malayalam writes vowels and the virama as combining marks (`\p{M}`),
so "നിർത്തുക" normalised to "ന ർത ത ക". A keyword added in Malayalam would have matched nothing,
forever, with no error anywhere.

Worth remembering beyond this one function: any "strip the punctuation" regex in a codebase whose
users write Malayalam needs `\p{M}` in the keep-set. The test that caught it says so in a comment
rather than just asserting a string, because the next person to write one of these will reach for
the same reflex.

## 2026-09-09 — Three scopes of target, never added together

`targets` holds an institute-wide row, per-centre rows and per-person rows in one table, and the
forecast screen shows all three. The obvious alternative — derive the institute number by summing
the centres — was rejected: they are separate decisions. An institute that wants 60 admissions and
splits 35 to Kochi and 20 to Kannur has deliberately left five unallocated, and a screen that
reports 55 as "the target" has quietly overwritten a management decision with arithmetic.

The consequence is that the same admission counts in three rows, which looks like double-counting
and is not. The page says so in as many words, because somebody will otherwise add the column up
and conclude the month went 300%.

**A partial unique index over coalesced nullable columns.** In Postgres two nulls are not equal, so
a plain unique index on `(period_month, metric, center_id, owner_id)` would happily accept the
institute's June admissions target five times. Coalescing the nullable ids to the nil uuid is what
makes the null case a value the index can compare.

**`target.manage`, not `settings.manage`.** A centre head runs their centre's numbers. That is not
the same authority as editing the pipeline, the roles and the integration credentials, and the
whole point of permission primitives is that the two can be granted separately.

## 2026-09-09 — What a report refuses to say

Three of the new reports withhold a number they could easily compute, and in each case that is the
feature:

- **Cohort windows return null, not zero,** for a cohort younger than the window. Zero is a claim
  about people who have not been asked yet.
- **Segments under `MIN_FOR_RATE` (8) leads report no percentage.** The counts are still shown and
  still true; it is the percentage that misleads, because one admission out of two reads as 50%.
- **Pace returns `no_target` rather than treating an unset target as zero.** A target of zero is a
  month that reports 100% achieved for doing nothing, or a permanent failure, depending on which
  way the comparison falls. Neither is what "nobody set one" means.

The general rule this is an instance of: when the honest answer is "not enough information", a
report that prints a number anyway is worse than one that prints a dash, because the number gets
acted on.

## 2026-09-09 — Where a searchable dropdown is not an improvement

The `<Select>` → `<Combobox>` sweep stopped at the short fixed vocabularies: field entity, stage
type, notification channel, discount type, SLA measure, student status, template category. These
are enumerations the code enforces — they cannot grow at runtime — and the Combobox's own rule
already says a search box over four items is a thing to read, understand and dismiss before you
can do the obvious thing. Converting them would have been consistency for its own sake.

Everything whose options come from a database row was converted, including the three lists with no
ceiling at all: roles, tags and templates are rows an admin creates.

## 2026-09-09 — A person-scoped row has no centre, so the policy has to go through the person

Migration 0061's target policies let anyone holding `report.read` at centre scope read **every**
person-scoped target in the institute, and anyone holding `target.manage` at centre scope set one
for **any** member of staff. The screen was already narrower than that, which is exactly the
failure mode CLAUDE.md § 3 exists to prevent: the policy, not the page, is the boundary.

0062 fixes it. The complication is that a person-scoped target carries no `center_id` — there is
nothing for `can_access_center()` to check — so the boundary has to be found through the person's
`user_centers` rows. A plain sub-select there would be filtered by `user_centers`' own RLS and
quietly return false for exactly the rows the policy means to allow, so it goes through a new
`shares_center_with(uuid)` helper, security definer, the same shape as `auth_center_ids()` beside
it.

Nine tests in `rls.spec.ts` assert the boundary, and the centre-head one was confirmed to fail
against the 0061 policy before 0062 was applied — the house rule about making a security test fail
on purpose before believing it.


## 2026-09-10 — Configuration that reaches nothing is not configuration

Settings → Organisation had held a name, a logo, a colour and three locale fields since the first
week. Only two of them were ever read, and the brand colour was read by nothing at all. The screen
existed, the fields saved, and the system behaved identically whatever was typed in them.

That is a worse failure than a missing feature, because it looks finished. CLAUDE.md § 10 asks
whether a thing is configuration or a constant; it does not ask whether the configuration is
*wired to anything*, and this is the case that shows the question is incomplete. **A settings field
with no enforcement point is the UI equivalent of a permission code with no check behind it.**

The concrete rule that came out of it: a settings screen should show what its fields produce.
Settings → Organisation now previews the letterhead, built from the same component and the same
query the real documents use, so "why am I typing this?" has a visible answer and the preview
cannot drift from the output.

## 2026-09-10 — Suppression rides with the stylesheet, not with the page

Every screen now prints a letterhead from the `(app)` layout, and documents that draw their own
(receipts, the fee agreement, the two profile sheets) must not print two.

The obvious implementation is a prop or a per-page flag, and it rots the first time somebody adds
a document and forgets. Instead the suppression rule lives inside `A4_PORTRAIT_CSS` and
`A4_LANDSCAPE_CSS` — the stylesheets every document page already injects to control its paper
size. A document that sets its page size cannot fail to suppress the generic letterhead, because
it is the same string.

The general shape: when two things must always travel together, make one of them physically part
of the other rather than documenting that they should match.

## 2026-09-10 — The amount in words takes paise

`amountInWords()` takes paise, like every other money value in this system, and the test says so in
a comment rather than only asserting a string. A version that quietly expected rupees would print
"four hundred rupees" on a receipt for ₹40,000 — wrong by a factor of a hundred, on the one
document nobody re-reads before handing it over, in a system where CLAUDE.md's money rule exists
precisely to stop this class of error.

Indian numbering (lakh, crore) rather than the Intl default, for the same reason the rest of the
system formats in `en-IN`: "four lakh fifty thousand" is what a family reads back to you.

## 2026-10-01 — Node 22, not 20

`.nvmrc` said 20 while every developer machine and this container ran 22, so
CI was the only place the difference showed — and it showed in the one step
nobody runs locally.

`@supabase/supabase-js` 2.112 builds a `RealtimeClient` inside `createClient()`,
and that constructor demands a native `WebSocket`, which Node 20 does not have.
The library prints a deprecation notice about Node 20 on every run and then
throws:

    Error: Node.js detected but native WebSocket not found.
    Suggested solution: Ensure you are running Node.js 22+

The seed only hits it when `SUPABASE_SERVICE_ROLE_KEY` is set — the step that
creates the six logins. Locally that is usually unset, so the seed skips it and
nothing fails. The browser workflow sets it, because a suite that cannot sign in
tests the login page. So the first CI run died at `seeded 6 finance accounts`.

Raised `.nvmrc` to 22 and `engines.node` to `>=22` rather than pinning around
it. Node 20 is deprecated by this dependency, 22 is LTS and is what the code is
actually developed and tested on; `createClient()` is also on the live path in
the webhook and cron handlers, so a runtime that cannot construct it is not a
runtime this application supports. Verified: the exact failing call succeeds on
22, and the full suite, typecheck, lint and build pass there.

## 2026-10-03 — Server errors are reported by `instrumentation.ts`, and both reports are kept

A crashed screen was reported only by the React error boundary, which runs in the
browser and is given a digest rather than a message. Next.js's `onRequestError` hook
now reports the same failures from the server, with the message and stack.

Both reporters stay. The boundary catches errors that happen in the browser —
hydration mismatches, a client component throwing on interaction — which never reach
the server and so never reach `onRequestError`. The server hook catches render and
action failures, which the browser is never told the detail of. Neither covers the
other, so the duplicate row for a server crash is accepted; the digest is recorded in
both so they can be matched.

**Rejected:** replacing the boundary's report with the server's. It would have made
every client-side crash invisible, which is the class of failure Leon is least able to
describe over the phone.

**Rejected:** recording the full URL including its query string. A lead id in a path is
worth having and carries nothing a colleague could not already see; a search query is
the name of somebody's student, and an error table that accumulates those is a liability
that grows on its own.

## 2026-10-03 — The migration count is shown on Platform Health, not enforced at boot

`drizzle-kit migrate` can fail without failing `vercel-build`, leaving new code on an
old database. The alternative to showing it was refusing to serve — a boot check that
throws when the database is behind.

Not done, because the failure it guards against is partial: most screens work fine
when one migration is missing, and taking the whole CRM down during admissions season
to prevent one screen from erroring is the worse trade. It is shown prominently
instead, above the fault list, where somebody investigating a broken screen will read
it before the symptoms.

## 2026-10-03 — The deploy's migration step is ours, not `drizzle-kit`'s

`drizzle-kit migrate` is a schema tool whose output is tuned for a developer watching a
terminal. As a deploy step it reports a failure as an exit code and nothing else, which
cost two days of stale production.

`npm run db:migrate` now runs drizzle-orm's migrator directly with operator-grade
reporting. The mechanism is unchanged — same journal, same bookkeeping table, same
single transaction — so this is a change to what you are told, not to what happens.

**Rejected:** keeping `drizzle-kit migrate` and adding `--verbose`. It has no such flag,
and the information that was missing (the Postgres error under drizzle's wrapper) is not
something a log level would have exposed.

**Rejected:** letting the build continue when a migration fails, so a deploy is never
blocked by the database. That is how you get new code running against an old schema,
which is the failure this project already has a Platform Health banner for. A deploy
that cannot migrate should stop.

`db:migrate:kit` is kept for schema work, where drizzle-kit's own behaviour is wanted.

## 2026-10-03 — Schema drift is checked column by column, not by counting migrations

Platform Health reported all 78 migrations applied, correctly, while production was
missing `leads.assigned_at` — migration 0071 was recorded as applied with only part of it
there. Every admission died on it.

Migration bookkeeping is a record of intent. The schema is the fact. Platform Health now
compares the columns the Drizzle schema declares against the live
`information_schema.columns`, and the same check runs in the test suite against a migrated
database, so the two can never silently diverge again.

**One-directional on purpose.** Columns the database has and the code does not are
harmless — an old column kept for a report, something Supabase manages — and reporting
them would fill the screen with things nobody should act on.

**Rejected:** comparing types, nullability and defaults as well. Those drift for
legitimate reasons and would produce noise that teaches people to ignore the screen. A
missing column is unambiguous and is what actually broke.

## 2026-10-03 — A Server Action reports its own failures, rather than leaving it to instrumentation

`instrumentation.ts` printed this failure to the console and never wrote its row, because
on Vercel a serverless function can be frozen the moment its response is sent, and
`onRequestError` runs after that.

So reporting that must survive belongs *inside* the request. `confirmAdmissionAction`
awaits `captureError` before returning. `instrumentation.ts` stays for everything it does
catch — page renders, route handlers, anything with no handler of its own — but it is a
net, not a guarantee.

It also returns a message on the form instead of throwing, so a failed save costs the save
and not the whole screen.

## 2026-10-03 — The deploy verifies the schema, and a row count never decides anything

drizzle applies a migration only when its journal `when` is strictly greater than the
newest `created_at` in `drizzle.__drizzle_migrations`. That makes the bookkeeping table
authoritative over the migration files: one row with a timestamp at or ahead of the
journal skips everything behind it *and reports success*.

Two consequences are now built in.

**A count never decides whether to migrate.** The first version of `db:migrate` returned
early when the number of recorded rows matched the journal — which is how a migration
that never ran looked like a clean deploy. `migrate()` now runs unconditionally; the
count is printed, not obeyed.

**The deploy verifies the schema afterwards and fails on drift.** Rejected the gentler
option of warning and continuing: a build that ships code selecting a column the database
does not have is a build that has already failed, and it fails on the counsellor's screen
instead of in the log. The failure names the missing columns and the timestamp rule, so it
is actionable rather than merely alarming.

**Repairs go in a new migration with a later `when`, never as an edit to the old one.**
An edited migration file cannot re-run — its row is already there and its timestamp is no
longer greater than the newest.

## 2026-10-03 — Migrations must be re-runnable, and 0077 was edited to make it so

drizzle decides what to apply from the newest row in its own bookkeeping table, not from
which files have run. When effects get committed without their row — which is what
happened to 0077 — that migration is re-applied on every deploy forever. If it cannot run
twice it fails, and because the batch is one transaction it drags every migration behind
it into the rollback.

So re-runnability is not a nicety here; it is what stops one bad migration becoming a
permanent outage. New migrations use `if not exists`, `drop … if exists` before `create`,
and `to_regprocedure` guards around `alter function`.

**0077 was edited in place**, against the usual rule. It is justified because the file was
not recorded as applied anywhere that mattered, so it was going to run again whatever we
did; the only question was whether it would succeed. The rule still holds everywhere else:
a migration that is recorded as applied is repaired by a NEW migration, never by an edit.

## 2026-10-03 — An academic year is chosen, never typed

`fee_structures` is found by an exact match on course, centre, mode and academic year.
Any field on both sides of that match must be produced the same way in both places, so the
academic year is a list in the admission form and in Settings, from one shared function.

**Rejected:** normalising on read (accepting `2027`, `2026-2027`, `26-27` and folding them
together). It makes the stored data ambiguous, every future query has to remember to
normalise, and the first one that forgets reintroduces the bug silently. Constraining the
input is one place; normalising is everywhere forever.

Existing out-of-window values are offered as `(as stored)` rather than hidden, so editing
an old row cannot silently change what it says.

## 2026-10-03 — Printed documents carry their own padding

`@page { margin }` is a request the browser's own print dialog overrides — Chrome's
"Minimum" setting ignores it entirely, which is how the instalment agreement printed to
the paper's edge. Documents now set a modest `@page` margin AND their own print padding,
which nothing in the dialog can remove.

## 2026-10-03 — Signed documents read from the enrolment, never the lead

The instalment agreement took its course from `courses_interested` and its centre from the
lead. Both are enquiry data and both drift from the admission legitimately — a student
enquires about one course and joins another.

`leads` is the sales object and stops changing at Gate 1 (CLAUDE.md § lifecycle chain);
the enrolment is the commercial record. Anything a family signs reads from the enrolment,
and `getLeadFeePlan` now returns its terms for exactly that purpose.

## 2026-10-03 — A dropped admission is shown on the lead, never written to it

Dropping an admission does not change the lead's stage, and will not.

The alternative — moving the lead out of Won, or into Lost — rewrites sales history to say
a conversion that happened did not. It would change last month's conversion rate after the
fact, break the funnel counts the institute is measured on, and lose the distinction
between "never converted" and "converted and then left", which are different problems with
different fixes.

So the lead keeps the stage it reached and the drop is **displayed** by reading the
enrolment. That was always the stated design; what was missing is that only the lead's
detail page did the reading. The leads list and the pipeline board now do too.

## 2026-10-03 — Setup problems are shown to admins in their own words

`reportActionFailure` takes `revealMessage`. On admin-only settings screens the failure is
nearly always a setup problem the reader is the right person to fix — a missing
environment variable, a key of the wrong length — and hiding that behind "something went
wrong" sends an admin to ask somebody who knows less than the message did.

Counsellor-facing actions keep a generic fallback: an internal message is noise there at
best, and the real one is on Platform Health either way.

**Rejected:** inferring "this is a setup error" from the message text. Brittle, and it
would silently start hiding things the moment a wording changed. The caller knows who is
reading its screen; that is where the decision belongs.

## 2026-10-04 — Counsellors' own WhatsApp: Coexistence, not an iframe and not a library

Three ways to get a counsellor's own WhatsApp into the CRM, and only one of them exists.

**An unofficial library** (whatsapp-web.js, Baileys) breaks WhatsApp's terms and gets the
number banned — permanently, with no appeal. The number is the line a counsellor answers
enquiries on, so the loss is the conversations in progress, not a feature.

**An iframe of `web.whatsapp.com` cannot render.** WhatsApp sends `X-Frame-Options` and
the browser refuses to display the page inside another site. Nothing in this application
can override a header another domain sends; that is the entire purpose of the header.
Proxying WhatsApp Web through our own server to strip it is the reverse-engineering
problem again under a different name, and would break the session anyway.

**Coexistence is the supported answer.** Meta shipped it in May 2025: one number running
the WhatsApp Business app and the Cloud API simultaneously, mirroring messages both ways
in real time, with up to 180 days of one-to-one history syncing on approval. The
counsellor keeps their phone and their number. Group chats do not sync, disappearing
messages and live location switch off, broadcast lists become read-only, and throughput
is capped — all acceptable for admissions conversations.

It also puts the privacy line in the right place by accident of design: it syncs a
business number's one-to-one chats, not someone's group chats, so a centre head reading
their team's admissions conversations is not reading their private messages. Counsellors
should still be told plainly that the number is visible to their supervisor.

## 2026-10-04 — An Instagram DM does not create a lead

Decided differently from WhatsApp and from every webhook source, on Leon's instruction and
for a good reason: most Instagram messages are a question, a reply to a story, or nothing.
A CRM that turns each one into a lead stops being a record of who is enrolling.

So a DM is a conversation first. **Convert to lead** is a button the counsellor presses
when it becomes a real enquiry, and converting runs `resolveOrCreateLead()` like every
other source — so somebody who already exists is linked rather than duplicated, and the
assignment rules apply (CLAUDE.md non-negotiable #8: one ingestion path, no source gets
its own shortcut).

A handle is not a phone number, so a conversation stays matched by handle until a
counsellor adds one.

## 2026-10-04 — Meta form questions: matched by name, kept when they don't match

Leon: "my meta leads give us their current qualification & exam interested in which is not
migrated to the CRM. this could be because the values they enter is not matching with the
values in the CRM."

The diagnosis was wrong, and in the most understandable way. The values never got as far
as being compared: `mapMetaLeadFields()` read `full_name`, `phone_number`, `email` and
`city` and nothing else. Every other answer was written faithfully to the enquiry's `raw`
payload and read by nothing. The forms have asked both questions since the integration
went live, so this is months of data sitting in a jsonb column.

Three choices in fixing it.

**Matching is automatic, with configuration through what already exists.** A question
matches a field by normalised name or label, then by a short keyword list (qualification →
Education Status, exam → Interested Exams), then by containment. There is no new mapping
table and no new admin screen, because one already exists: field labels are editable and
custom fields can be added, both in Settings → Fields, so an unmatched question is made to
match by renaming a label. The unmatched questions are named on the delivery row, which is
what makes that possible rather than theoretical.

**An answer with no matching dropdown option is stored as typed, not dropped.** This
deliberately puts a value in a `select` column that is not one of its options. The
alternative is losing the only answer a person who has now gone ever gave, which is worse
than a value that does not group in a report until an admin adds it. `parseFieldValue()`
makes the opposite call for a form a person is standing in front of, correctly — they can
fix it; this lead cannot.

**Which fields an ad form may write is a blocklist, not an allowlist**
(`lib/leads/ingest-protected-fields.ts`). An allowlist would mean every new custom field
needed a code change before a form could fill it in — the rigidity the rebuild exists to
remove. The blocked ones are each an invariant elsewhere: identity, attribution, stage,
ownership, temperature. A form question called "assigned_to" must not be a shortcut past
the assignment engine.

## 2026-10-04 — Ad spend: a window, not a day

The spend sync fetched exactly yesterday, every night, for ever. Correct for a job that
has always been running; wrong in every other case, and the reason "the spend isn't
showing" was true. On the day the credentials were saved the table was empty, and it
gained one day per night against a report that looks back ninety.

A run now syncs from wherever the stored data stops up to yesterday, capped at ninety days
unattended, plus a rolling re-read of the last seven days — Meta restates a day's figures
for up to 28 days as late conversions land, and a sync that only fetched missing days
would keep the first number it ever saw and disagree with Ads Manager permanently. Seven
rather than twenty-eight because the cost is paid nightly and the benefit shrinks fast;
`?days=28` is there when a number is being argued about.

`time_increment=1` is what makes a range safe. Without it Meta sums the whole window into
one row per ad, and storing that against a single date would record ninety days of spend
as having happened on one Tuesday. Each row's own `date_start` is the date it is stored
under; a row without one is skipped rather than given a guessed date.

And the quiet part: "not configured" returned HTTP 200 with an `error` key, which the
nightly runner reads as success. So an instance with no ads token reported a healthy run
every night and produced nothing — v1's catch-and-200 in a new costume. It still returns
200 (an instance with no ad account is not broken, and a nightly failure alert nobody can
act on teaches everyone to ignore alerts) but says `skipped: "not-configured"`, and Ad
Performance now asks the credential store directly so the screen can tell "nothing spent"
from "nothing connected".

## 2026-10-04 — Retargeting has a window now, measured from last activity

Leon asked for the last six months of leads to go to Meta daily. The sync had no recency
rule at all: every consenting lead the CRM had ever held, for ever. Not only a budget
question — somebody who enquired about a 2024 batch and moved on is a person the institute
keeps paying to show course ads to.

180 days, in `org_settings.retargeting_window_days` with an admin field, because it is
exactly the number a marketing agency changes twice a year. 0 means no cutoff, so the old
behaviour is still available to anyone who wants it by choosing it.

Measured from the **later** of the lead's creation and its last activity, not creation
alone. A lead from eight months ago whose counsellor spoke to them last week is live work,
and dropping them out of the audience mid-conversation is the opposite of the point. The
cost is real and stated in the code: internal activity the lead knows nothing about keeps
them in the audience. For a pipeline whose follow-up cycle genuinely runs for months that
is the right trade.

## 2026-10-04 — Backfilling ad spend is a button, not a curl command

Leon: "can you help me pull last 1 years meta ad performance in the CRM" — then "do the
same for google ads as well".

`?days=365` already existed on both sync routes, and handing him that would have meant
handing him a terminal and the `CRON_SECRET`. He pasted a database password into this chat
once already. A report is not worth a secret.

So it is a button on each integration screen, and three decisions shape it.

**Ninety days per press, oldest-first, rather than one "fetch everything".** A serverless
function is killed at its time limit with no error anybody sees, so one enormous import
would look exactly like one that worked and stopped early — and half-imported spend is
worse than none, because every cost-per-lead figure on the reports would be confidently
wrong. Four presses that each say what they found beat one that might lie. `backfillWindow()`
walks backwards from the oldest day stored, never overlapping and never leaving a gap,
and stops at three years because that is roughly as far back as either platform keeps ad
insights.

**The window arithmetic is pure and tested, including the four-press sequence.** Not
because the arithmetic is hard, but because the failure mode is a chart that is wrong
rather than an error anybody sees.

**One sync function per platform, shared by the cron and the button.** A backfill run by
hand and a backfill run at night must not be able to disagree about what a day's spend was.
Extracting `syncMetaAdSpend()`/`syncGoogleAdSpend()` also replaced a per-row insert with
batched upserts of 200 — a year of a busy account is tens of thousands of rows, and a round
trip each would not finish inside the function's limit, which is the very failure the
chunking exists to avoid.

Google needed the same change Meta did a day earlier: `segments.date` in the SELECT, not
just the WHERE. Without it Google sums the whole window into one row per ad, and storing
that against a single date would record a year of spend as having happened on one Tuesday.
GAQL has no parameter binding, so the dates are checked against `yyyy-MM-dd` before they
are interpolated — they come from our own helpers today, but a backfill button puts a
number a person typed at the far end of the same path.

And Google's "not fully configured" branch was still returning 200 with an `error` key,
which the nightly runner reads as success. Same fix as Meta's the day before: `skipped:
"not-configured"`.

## 2026-10-04 — The one flaky browser test, and why the pool stays at 1

`journeys.spec.ts › creates a lead and lands on it` has failed three times —
be0c8f4, a54eefd, a9d2893 — always alone among twenty tests, always by running out of
time rather than by getting a wrong answer, and always on a commit whose diff had nothing
to do with leads. Ruled out before changing anything: it is not the dev server (CI runs
`next build && next start`), and lead creation makes no outbound network call (`startFlows`
only inserts a run row for the nightly cron, and email is skipped with `RESEND_API_KEY`
unset).

What is left is the connection pool. `lib/db/client.ts` is `max: 1`, deliberately — a
serverless function gets one connection, and `resolveOrCreateLead()`'s own comment depends
on it ("a second connection opened while the transaction still holds the first would
deadlock"). Creating a lead opens a transaction that holds that single connection while the
assignment engine runs inside it, and every query the browser has in flight — the App
Router prefetches every link it can see — queues behind it. On an unlucky interleaving the
queue is long enough to pass twenty seconds.

**So the budget moved, not the pool.** Raising `max` would be changing production
behaviour, and a known-deliberate one, to make a test more comfortable. Twenty seconds was
an arbitrary number; what the test asserts is that the row was written and the assignment
engine ran, not that it happened quickly. Forty-five seconds, with `test.slow()` to match,
and a comment saying that a failure at forty-five is a real problem rather than this one.

### It failed at forty-five too, so that was wrong

66abe77 — the commit that raised the budget — failed the same way. Forty-five seconds is
not a queue waiting its turn. The server action is not finishing, and the pool theory is
dead.

What survives the elimination: the only network call in `createLeadManually()` is the scope
seatbelt, `leadIsVisibleToCaller()`, which reads the new lead back through Supabase before
the redirect. A request to the local stack that never returns would look exactly like this
— including the intermittency, and including the row being created anyway. That is a
suspicion, not a finding, and it is written down as one.

Rather than guess a fourth time, the test now waits for the action's own POST and says
which half failed: the server never answering, or the browser failing to navigate after it
did. Two very different bugs that are indistinguishable from the outside, and the next
occurrence will name one.

The discipline is worth more than the fix here. Four runs have now been spent treating this
as a possible regression in whatever had just merged, because "it only ever fails on its
own" is exactly what a real intermittent bug looks like too — and the one confident
explanation offered along the way was wrong, which is why it got a disproving experiment
rather than a comment.

## 2026-10-05 — Changing a course does not change the fee

Leon asked for two things that sound like one: let counsellors, accounts and academics
change the course and batch a student registered for, and let accounts change the fee.

They are not one thing, and building them as one would have been the mistake. A different
course almost always has a different fee structure, so the obvious implementation looks up
the new course's fee and applies it. That is a fee change nobody agreed, arriving through
a form labelled "course", and bypassing the discount authority limits — the whole
machinery that exists to stop a fee moving without someone who may move it saying so.

So `changeEnrolmentPlan` writes the course, batch, mode and academic year, and does not
touch a single fee column. Accounts are notified that the course moved, with what it moved
from and to, and they change the figure deliberately if it should change. One extra step
for the one case where the fee really should follow, and no silent re-pricing in the many
cases where it should not.

### Two permissions, not one

`enrolment.update` was described as "edit an enrolment's course, batch or fee plan" and
held only by centre heads and the two admin roles. Granting it to counsellors, accounts and
academics so they could move a batch would have handed all three the fee as well.

It is split. `enrolment.change_plan` is the course, batch, mode and year — counsellors at
`own`, accounts, academics and centre heads at `center`. `enrolment.update` now means the
fee plan and nothing else, and gains accounts at `center`, which is the part of Leon's ask
that really was a straight grant.

RLS cannot express the split, because it is a column-level distinction and a policy sees
rows. `enrolments_update` therefore accepts either permission — the row-level question is
"may you touch this admission at all", and the answer is the same for both — and the two
server actions enforce which columns each may move. That is written into the migration
rather than left implicit, because CLAUDE.md's non-negotiable #3 is about rows, and this
still satisfies it: no counsellor can reach another counsellor's enrolment through either
route.

### A fee has a floor, not a freeze

Accounts can now change a fee after payments have arrived — that is the point, since a
figure typed wrong on day one should not need a centre head and a week. What they cannot
do is set it below what has already been collected. That would leave a balance of minus
three thousand rupees, and there is no such student: if the institute is holding more than
is owed, the institute owes *them*, and that is a refund entry against the original
payment. The error says how much has been received, so the next step is obvious.

Nothing in the ledger is touched by a fee change either way. `payments` and `receipts`
remain append-only; what moves is the agreed amount, which was always a column on
`enrolments`.

### One fact, one path

`students.current_course` and `students.current_batch_id` are a copy of what the enrolment
says, kept so the roster reads without a join. The generic student edit form could write
them directly, which left the admission record, the printed agreement and the accounts
screens still saying the old course — three screens disagreeing about what somebody is
studying, with no way to tell which was right.

Both columns are now read-only on that form (and skipped by `updateStudent`, so the guard
is not only in the UI), and `changeEnrolmentPlan` writes the enrolment, the two copies and
the `student_batches` history together in one transaction. Settings → Batches, which had
the same gap in the other direction, now writes `enrolments.batch_id` too and fires the
same notification in the same words.

## 2026-10-05 — A new lead that nobody was given is now announced

`lead.assigned` returned early when a lead arrived unassigned, with a comment arguing that
the orphan queue surfaces those and that telling a role about every unmatched lead would
drown the people who work it.

Half right. The queue does surface them — to somebody who thinks to open it. A lead
arriving at 9pm from a source no rule covers was announced to nobody at all, and the
highest-value enquiry of the week is exactly the one most likely to come from a source the
rules have never seen.

So there are two events. `lead.created` fires for every new lead from every source and
goes to centre heads, saying who it went to or *"Assigned to nobody yet"*. `lead.assigned`
fires only when there is somebody to tell, and goes to them. Different audiences, different
news, no duplicate message about the same lead — and the volume concern is answered by the
fact that an admin can turn the event off in Settings → Notifications, which is where that
decision belongs.

Manual assignment from the Unassigned queue now fires `lead.assigned` too. It never did:
a lead a rule assigned told its new owner, and a lead a centre head handed over by hand
told nobody, which is the worse case of the two — somebody had already decided that lead
was worth chasing.

### notify() now means what its comment said

The fallback for an event with no `notification_settings` row claimed "a newly added event
should work on deploy, not after somebody remembers to re-seed". The wording and the
notify-the-owner switch did fall back to the definition; the roles fell back to `[]`. So a
new event whose whole point was telling accounts something told only the owner — and told
nobody at all when `defaultNotifyOwner` was false. It resolves the definition's role codes
now, so the comment is true.

And `tests/notification-emit-sites.spec.ts` asserts that every key in the catalogue has a
real `notify()` call behind it. The header of `events.ts` has always stated that rule;
nothing checked it, which is how the SLA escalation ladder stayed configurable and inert
for months.

## 2026-10-05 — The refund that was specified, permissioned, printable and unbuildable

Leon asked what other notifications were missing. The honest way to answer was to list
every audited mutation — eighty-six of them — and ask which changes a fact another
department depends on. That sweep found something bigger than a missing notification.

**`payment.refund` was granted to accounts and administrators, and there was no screen.**
`payments` has had `direction: 'debit'`, `reverses_payment_id` and `reversal_reason` since
Phase 4. The receipt page has rendered a "Refund / Reversal Note" for a debit payment for
just as long. The manual's §7.6 told staff how reversals and refunds work. Nothing in the
codebase could write the row. The one correction an append-only ledger explicitly allows
was the one thing nobody could do — and the fee-floor error added an hour earlier
("record a refund first") pointed at a screen that did not exist.

### Reversal and refund are different on the cash side

A **reversal** says the payment never happened: wrong student, wrong amount, entered
twice. The money never arrived, so the cash entry it created was wrong too, and is
reversed at its original date — the institute's balance for that day goes back to what it
really was.

A **refund** says the payment did happen and the money is going back. The original entry
stands, because it was true. A new outgoing entry is posted *today*, because that is when
the cash left.

Both insert the same debit against the enrolment, so the student's balance is right either
way. Collapsing them would misstate the bank reconciliation on two separate days, in
opposite directions — which is why the form makes you choose rather than guessing from
context.

### What it deliberately does not do

**It does not undo Gate 2.** Reversing a first payment does not delete the `students` row
or clear `accounts_to_academics_at`. They were handed to academics, who may well have
taught them by now; a gate is a thing that happened, not a thing that is currently true. A
student actually leaving is marked dropped, which is its own action with its own reason.

**It does not issue a receipt number.** The reversal is numbered on the ledger side
(`txn_no`) and the note prints without one. Putting refunds into the same gapless sequence
as fee receipts would make "receipt #412" sometimes mean money in and sometimes money out.

**One reversal per payment**, enforced in the writer rather than the form. Two people on
the same screen both pressing the button would otherwise take the balance twice as far
down as it should go, and the ledger would have no way to say which was wrong.

## 2026-10-05 — An import is one notification, not two hundred

Adding `lead.created` an hour earlier introduced a bug worth recording rather than quietly
fixing: the CSV import calls `resolveOrCreateLead()` per row, so a two-hundred-row
spreadsheet would have fired two hundred arrival notices at the centre head.

That is not visibility. It is the one person meant to be watching intake losing the next
real lead underneath a wall of their own import.

So `ResolveLeadInput` gained `suppressArrivalNotice`, set by the import and nothing else,
and the import fires one `lead.imported` summary with the counts after the run.
`lead.assigned` is NOT suppressed: that goes to the counsellor who now owns a specific
person and has to ring them, which is worth knowing however the lead arrived.

The general shape is worth keeping in mind for every future event: **ask what happens when
the action is performed two hundred times in a loop.** Every one of these events has a
bulk path somewhere.

## 2026-10-05 — Who hears about a failure is a setting, not an environment variable

Leon asked for platform failure emails to go to his address. The obvious answer was "set
`ALERT_EMAIL_TO` in Vercel", which I cannot do for him and which fails CLAUDE.md §10 on
the one setting whose entire purpose is making sure a person finds out: changing who is
told that leads have stopped arriving should not need a hosting dashboard.

So `org_settings.alert_email_to` exists, editable at **Settings → Organisation → Send
platform alerts to**. The environment variable still works and is *added* to whatever is
configured rather than overridden — somebody who set it months ago and then types a second
address into Settings means "also tell this person", and a silently dropped alert
recipient is exactly the failure the feature exists to prevent.

`alertRecipients()` carried a comment arguing a table is "one more thing that has to be
readable at the moment the database is the problem". True in general; not true of this
caller. `captureError()` has already inserted the error row by the time it asks who to
tell, so the database has just proved it works. A failure that cannot be read through
produced no error row to alert about either. The env var stays as the path needing no
database at all.

### And the bell, because email needs three things to be set

Email needs an API key, a from-address and a recipient. Until all three exist, a webhook
that has stopped accepting Meta leads tells **nobody** — the most expensive silent failure
in this system, because the symptom is "it has been quiet this week" and the cause is
three weeks old by the time anybody checks.

`system.failure` puts it in the bell, where it needs nothing configured beyond existing.
It fires on the same damping decision as the email (first occurrence, then at ten times
the count), and when no email recipient is configured the damping counter is still
advanced — otherwise the bell would fire on every single occurrence of a fault that is
firing every few seconds.

## 2026-10-05 — Custom webhooks: one handler, many endpoints

Leon asked for a webhook feature where he can add several endpoints — one for Knorish, one
for an online form — each with its own source name.

The shape that falls out of the existing code is better than it sounds. Every new lead
source used to mean a route handler, a signature scheme and a deploy, so a course platform
or somebody else's landing page either waited for developer time or kept its leads in a
spreadsheet. Meanwhile `webhook_source` carried a `knorish` value for a handler nobody ever
wrote — a dead switch, exactly what the comment above that enum warns against, and exactly
the failure mode this project keeps finding in itself.

So the handler is generic and the endpoints are rows. `custom_webhooks` holds a name, a
URL token, a signing secret, the `source` to stamp, an optional sub-source and centre, and
optional extra field aliases. `/api/webhooks/custom/[slug]` looks the endpoint up, verifies,
persists, maps and calls `resolveOrCreateLead()`. Adding a source became configuration.

**It is not a second ingestion path.** Non-negotiable #8 still holds — every lead goes
through `resolveOrCreateLead()`, which runs the assignment rules and never rejects a
duplicate — and #9 still holds, in order: verify the signature against the raw body,
persist the payload whether or not it passed, then process.

### The mapper was already generic; it was just in the wrong place

`mapWebsiteForm` solved this problem first and solved it properly: match by alias, case- and
punctuation-insensitively, keep every field whether or not it was recognised, require only a
name and a phone. That is precisely what an unknown sender needs, so the generic half moved
to `integrations/form-payload/map-fields.ts` and the website module kept only what is
genuinely about a website — which page the form was on and the UTM parameters that have to be
dug out of a page URL. The 31 existing website tests passed unchanged, which is the point of
moving code rather than copying it.

Two additions. An admin can add **extra aliases per endpoint** (`phone: mob, contact_no`),
because the next platform will name a field something nobody predicted and the fix for that
should be a text box. And a mapping failure now **names the fields that did arrive**: the
person reading that error is setting up a new feed and needs to know what the sender
actually called things, not that "no phone field" was found.

### Signatures, and the one place it is honest to turn them off

The same HMAC scheme as Meta's and the website form's, reusing `verifyMetaSignature` rather
than inventing a third. But some course platforms and form builders only offer "POST this
JSON to a URL" and cannot sign anything, and an integration that refuses them is an
integration nobody can use.

So `require_signature` can be turned off, per endpoint, beside a sentence saying what it
costs: the random token in the URL becomes the only credential, so anyone who ever sees that
URL can post leads into the CRM. The token is 32 random bytes and never derived from the
name, which is what makes that trade survivable. The card shows an **Unsigned** badge
afterwards, so the choice stays visible rather than becoming a setting somebody forgot.

### Small decisions worth writing down

**An unknown token writes nothing** — a 404 and no `webhook_events` row. Recording unknown
tokens would let anybody with the URL shape fill a table that holds raw payloads and is read
by admins, and a request to an endpoint that does not exist is not a delivery that failed.

**One source value, many endpoints.** `webhook_events.source` is `custom` for all of them
with a `custom_webhook_id` beside it, and the idempotency key stays `(source, external_id)` —
the handler prefixes the sender's own id with the endpoint's uuid, so two feeds that both
number their submissions from 1 cannot collide. A partial index would have been a second rule
to keep in step with the first.

**The source name is upserted into `dropdown_options`.** Without that the sources report would
show a value nobody configured: present in the data, absent from every filter. The whole point
of giving each feed its own source name is being able to group by it.

**A GET on the endpoint answers.** Several form builders verify a URL before they will save it,
and some only give you a browser to test with. It says the endpoint's name and whether a
signature is expected, and nothing else — not the token (the caller already has it) and never
the secret.

**`custom_webhooks` is configuration, not data,** so a data reset leaves it alone. Clearing it
would 404 every sender already posting to an endpoint, and the repair would be re-creating each
one and updating every external service with a new URL.

## 2026-10-05 — WhatsApp Coexistence, and the rule that inverts

Leon asked for Coexistence. `/whatsapp/personal` has argued for two months that it is the
only supported way to put a counsellor's own WhatsApp in the CRM, and ended by saying so and
stopping — a recommendation nobody had acted on. This builds it.

Coexistence is the WhatsApp Business app on somebody's phone AND the Cloud API on the same
number at the same time. It matters here more than anywhere else in this project, because
`whatsapp_messages` has carried this comment since Phase 5: *"AFD's enquiries arrive on the
counsellors' own WhatsApp Business apps and are typed into the CRM by hand."* That typing is
what this removes.

### The rule that inverts, and why it has to be a column

The inbound handler never created a lead, with a comment explaining exactly why: the API
number is a broadcast channel, a reply to it is somebody who pressed a button on a campaign,
and manufacturing a lead from one fills the pipeline with people who never enquired — and puts
"whatsapp" on the first-touch source of somebody who actually came from Meta.

On a counsellor's own number every word of that is false. A stranger messaging a counsellor to
ask about NIFT coaching is the highest-intent enquiry this institute gets.

So it is `whatsapp_numbers.creates_leads`, per number, and not a constant in the handler. A
lead created that way is **assigned to the number's owner directly** rather than routed through
the rules engine: the person already holding the conversation is the right owner, and sending it
to somebody else would be actively wrong.

### Three new webhook fields, two of which deliberately create nothing

`smb_message_echoes` carries what the counsellor just sent from the phone. `history` carries up
to 180 days of past conversations, in chunks, over the minutes after onboarding.
`smb_app_state_sync` carries the phone's address book.

**Echoes never create a lead.** A counsellor's phone also messages their colleagues, their
suppliers and their mother. A CRM that invents a lead every time its owner sends a WhatsApp
message is unusable within a week. Echoes attach to leads that already exist; the *inbound*
direction is what signals an enquiry.

**The history backfill never creates a lead either**, for a different reason: it is six months
of everything, arriving in one burst. Turning it into leads would create hundreds at once, each
landing on somebody's follow-up queue, most of them not students. What it does is attach to the
leads that already exist, which is the part worth having — the conversation a counsellor had in
March now sits on the lead they created in March, with its own date, so the thread reads in
order.

**The address book creates nothing at all.** `describeContactSync()` exists only to make that
decision explicit and record that the payload arrived, rather than leaving an unhandled field
that looks like an oversight. Importing a counsellor's contacts would fill the pipeline with
people who never enquired while quietly moving personal contacts into a system the whole centre
can read.

### Direction is decided by the business number, on digits

An echo and an inbound message are the same shape, and a history chunk carries both directions
in one array. The only reliable discriminator is which end matches the number Meta names in
`metadata` — compared on digits, because Meta writes the display number with a `+` in some
places and without one in others. Comparing the strings would make every echo look inbound,
which puts the counsellor's own words in the student's mouth. `normaliseMessage()` returns null
rather than guessing when it is not told which number is the business.

### Small decisions worth writing down

**History is "complete" only when phase 2 reports 100.** Meta sends three phases — day 0–1,
day 1–90, day 90–180 — and phase 0 at 100% is one day of history. Calling that done is how
somebody concludes the backfill lost their chats.

**A delivery for an unregistered number is recorded, not dropped.** It passed the account's own
signature check, so it is genuinely ours; the fix is registering the number, and the payload is
the evidence that it is already sending. One row per number rather than one per delivery, so a
chatty unregistered phone does not bury the deliveries panel.

**A history chunk that fails answers non-2xx.** The backfill is sent once, minutes after
onboarding, and there is no endpoint to ask for it again — so a retry is the only recovery
there is.

**The messages are stored through the same mapper as ordinary inbound ones.** A thread where a
photo reads one way if it came from the phone and another if it came through the API is worse
than one that is merely incomplete.

---

## 2026-10-05 — "Configured" is not "working", and a button is the only honest check

Email notifications had one state visible to an administrator: `emailConfigured()`, which is
`Boolean(RESEND_API_KEY && EMAIL_FROM)`. Two non-empty strings. The Platform health panel turned
that into **"Alerts are on."**

Everything that actually goes wrong passes that check:

- the key was revoked, or belongs to a different Resend account
- the address in *Send platform alerts to* has a typo
- the sending domain is not verified, so mail is refused or spam-binned
- the account is on Resend's sandbox, where only the signup address is deliverable

Four different fixes, all presented as working. So **Settings → Platform health → Send a test
email** sends a real one and shows what came back.

**The provider's refusal is passed through verbatim.** "You can only send testing emails to your
own email address" is a complete instruction; "Could not send email" is not. This is the same
failure this project keeps finding in itself — a tool discarding what the platform already said —
and the right fix each time is to stop paraphrasing.

**The button is shown even when the panel is green.** The case where the screen claims email
works and nothing arrives is the one worth testing, so hiding the test behind "configured" would
remove it exactly where it is needed. It also names *which* of the two variables is missing when
neither has been set, because they are two fields in one form and one of them is easy to skip.

## 2026-10-05 — The Meta integrations were built and undocumented, which is the same as unbuilt

Lead Ads had `docs/ADS-SETUP.md` and went live. WhatsApp — a bigger integration by far: one
institute number, templates, broadcasts, automations, Coexistence, and Instagram DMs on the same
app — had nothing, and was not switched on. The steps existed, in component comments and in a
conversation. `docs/WHATSAPP-SETUP.md` now holds them.

Writing it surfaced three things worth deciding in the open rather than discovering:

**The 100-per-run broadcast ceiling is a published fact now, not an implementation detail.**
Scheduled broadcasts and automations are swept by the 10:00 IST nightly run, 100 sends at a time,
because the hosting plan allows one scheduled run a day. A 400-person campaign therefore takes
four mornings. That belongs where a campaign is planned, not in a route handler's comment —
somebody who learns it on day three of a four-day send has already told the institute it went out.

**Registering a number to the Cloud API is a one-way door, and the warning goes before the
step.** The number leaves the WhatsApp Business app and its chats do not follow. The temptation
is to document the happy path and let the Coexistence section imply the alternative; the doc
instead refuses to let somebody pick a number without being told, because the number they would
pick is a counsellor's.

**One App Review submission, not three.** `whatsapp_business_messaging`,
`whatsapp_business_management`, `instagram_manage_messages`, `leads_retrieval` and the Page and
ads permissions are one app's review. Three submissions is three queues of several days each,
sequentially, for no benefit — and business verification gates all of them, so it is listed first
in the order of work.

---

## 2026-10-05 — A daily schedule is a 24-hour debugging loop, and that is a design flaw

The Meta ad spend was missing for a week. The cause was one unset environment variable. The cost
was not the cause; it was that every attempt to find it took a day.

Ten jobs run once, at 10:00 IST. Each of them depends on credentials an admin pastes in. So the
loop for "is this the right token?" was: paste, wait until tomorrow morning, read a screen, paste
something else. Nobody runs that loop. They give up, and the integration stays broken while every
dashboard reports success.

**Settings → Platform health → Run tonight's jobs now** closes it. The same ten jobs, on demand,
recorded in `cron_runs` exactly as the schedule records them, with each job's reason visible when
it finishes.

**It mints a request carrying `CRON_SECRET` rather than bypassing the check.** The sub-routes keep
their own guard and stay independently callable, and the button becomes a direct test of the
single most common cause of "nothing ran": no secret, no header, 401, nothing recorded. With the
secret missing it says that in one sentence instead of sending somebody to a hosting dashboard to
infer it from a status code.

**It confirms first, because it is not a dry run.** Queued broadcasts are sent, fee reminders go
out, audiences are rewritten. A button that quietly messages four hundred people is worse than no
button. The dialog names those consequences in the same words the screen uses.

**What the platform said, again.** Vercel's observability had the answer the whole time: one
invocation, 4XX, error rate 0%. The schedule was firing; the CRM was refusing it; a 401 is not an
error to anything that counts 5xx. Three dashboards all showed health, and the one number that
mattered was a yellow dot nobody had reason to look at. The same lesson as `expectOk` discarding a
200's body and `sendEmail` keeping only a status: the system knew, and no tool carried it to a
person.

---

## 2026-10-05 — A write that replaces a set must send the whole set

`subscribePageToLeadgen()` did exactly what it was named: `POST /{page}/subscribed_apps` with
`subscribed_fields=leadgen`. Correct for leads, and quietly wrong for everything else, because
that endpoint **replaces** the field set rather than adding to it.

Instagram messaging is delivered on the linked Page's `messages` subscription. So the CRM's one
helpful button — the one built because an unsubscribed Page is invisible — was itself capable of
unsubscribing the Page from Instagram DMs, with no error and no record.

The fix is not to add a second call. It is to stop pretending the call is additive:
`PAGE_SUBSCRIBED_FIELDS` is a single constant naming every field this application needs, and the
subscribe call always sends all of it. Adding a field later means adding it there, and the next
button press carries it.

**Reading it back matters more than the write.** The action already re-read the subscription
rather than trusting Meta's acknowledgement, and that is now the only reason the screen can say
*"leads will arrive, Instagram DMs will not, and here is why"* instead of a green tick over a
silent channel. Writing and verifying are different operations, and only the second one is
evidence.

---

## 2026-10-05 — Asking for more than the token can do must not cost what it could

Sending `leadgen,messages` in one `subscribed_apps` call was right about the replacement
semantics and wrong about the failure mode. Meta rejects the **whole** call when the token lacks
a permission any single field needs:

> (#200) To subscribe to the messages field, one of these permissions is needed: pages_messaging

and subscribes nothing — leadgen included. So a Page token generated for leads, before Instagram
was ever considered, stopped being able to subscribe for leads. The fix for a silent Instagram
channel broke the loud, working, revenue-carrying one. That is a straightforwardly worse bug than
the one it replaced, and it shipped because the change was reasoned about as a set-replacement
problem and never as a permissions problem.

**Ask for everything, fall back to what is certain.** The call now takes its fields from the
caller: `PAGE_SUBSCRIBED_FIELDS` first, and on a Graph refusal, `PAGE_LEAD_FIELDS` alone. Leads
survive a token that cannot do messages.

**And say which happened.** The refusal is carried into the message on screen, with Meta's own
sentence naming `pages_messaging`, plus the three permissions a replacement token needs. The
alternative — a quiet fallback that reports success — would have left Instagram broken with a
green tick over it, which is the failure this whole screen exists to prevent.

The general rule, third time of writing it down in this project: a degraded path is only
acceptable when the degradation is visible. Falling back silently is not resilience, it is a
lie with better manners.

---

## 2026-10-05 — A CHECK constraint passes on NULL, which is the row you were trying to stop

Every interaction must now say what happens next **and when**. The next action was already
required (migration 0009); the date beside it was not, which made the next action a sentence
nobody would ever be shown again — nothing surfaced the lead in the morning queue, nothing counted
it against a response target, and it turned up months later in a list of leads quietly abandoned
mid-conversation.

The exemption is the outcome with nowhere left to go: `converted` means the student joined, and
demanding a next call would have counsellors typing "nothing" into a field forever.

**The first version of the constraint did not work, and the way it failed is worth keeping.**

```sql
source = 'system' or outcome = 'converted' or (next_action is not null and next_followup_at is not null)
```

A CHECK rejects a row only when its expression evaluates to **FALSE**. With the outcome left
blank, `null = 'converted'` is NULL, so the whole predicate was `false OR null OR false` = NULL,
and Postgres accepted the row. The constraint worked for every outcome a counsellor chose and
silently did nothing for the one case it most needed to catch: somebody in a hurry skipping the
dropdown. `coalesce(outcome, '')` fixes it.

It was caught by a test written three months ago for the *old* rule, which started passing a row
it had been written to reject. A green suite that goes greener is not always good news.

**NOT VALID, deliberately.** Interactions logged before today have a next action and no date, and
they are a true record of what happened. The constraint governs what may be written from now on
rather than retroactively making history invalid; Postgres still enforces it on every insert and
update, since NOT VALID only skips the scan of rows already there.

**Why a dropdown value is named in code.** CLAUDE.md §10 puts lists in the database and the
outcomes are there — admin-editable `dropdown_options` rows. What is keyed on is the row's
**value**, the stable identifier in a system category, exactly as `stage_type = 'won'` is keyed on
while the stage's name stays editable. Renaming "Converted" to "Joined" changes nothing; deleting
the row turns the exemption off, and then every interaction needs a follow-up, which is the safe
direction to fail in.
