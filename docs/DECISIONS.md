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
