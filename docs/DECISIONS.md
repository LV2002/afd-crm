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
