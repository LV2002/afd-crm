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
