# V1 Audit

A full read of the previous CRM (`CRM-main`: FastAPI + MongoDB + CRA). Two lists — what to
carry forward, and what went wrong. The second list matters more: several of these are
security bugs, and they are the kind Claude Code will reproduce by default unless told not to.

---

## Part 1 — Port these

### Field taxonomy (complete, from `LeadCreate` + `EXCEL_COLUMNS`)

Seed all of these as `field_definitions` rows with `is_core = true`:

| Section | Fields |
|---|---|
| Personal | student_name, father_name, primary_phone, alternate_phone, email, dob, city, state, **state_other**, district, pincode, parents_occupation |
| Education | education_status, school_college, previous_attempts, is_competitor_student, competitor_institute |
| Preferences | interested_exams[], exam_year, courses_interested[], preferred_mode |
| Tracking | lead_source, sub_source, lead_status, pipeline_stage, assigned_counsellor, center_id, next_followup, action_item, brochure_sent |
| Profile | enrolment form submissions, uploaded documents |

Two easy to miss:
- **`state_other`** — a free-text "specify location" that appears when state is outside the
  standard list. Real requirement for out-of-state leads; keep it.
- **`brochure_sent`** — a boolean action flag, not a stage. Keep it as a field; there will
  be more like it, which is exactly what the custom-field engine is for.

The lead detail page used **tabs**: Personal / Education / Preferences / Tracking / Profile.
Good pattern, and it maps directly onto `field_definitions.section` — the tabs should be
generated from the distinct sections, not hardcoded.

### The India states/districts dataset

`frontend/src/data/indianStatesDistricts.js` — full state list with district cascade.
Copy it across verbatim. It works and rebuilding it is pointless. District drives centre
assignment, so it needs to stay clean and canonical.

### Promos applied at lead stage

V1 let a counsellor apply a promo to a **lead**, before any enrolment existed
(`leads.applied_promos[]`, `POST /leads/{id}/promos`). That's how a fee negotiation
actually works — the discount is discussed during counselling, well before payment.

My spec only had promos hanging off `enrolments`. Add `lead_promos (lead_id, promo_id,
applied_by, applied_at, notes)` so the discount conversation is captured where it happens,
and carries forward into the enrolment.

### Excel export with formatting, and an import template

V1 generated a styled `.xlsx` (bold header row, brand fill, borders, auto-width) and served
a **downloadable import template** with a guidelines sheet and a sample row. Both are small
touches that materially reduce support load. Keep both.

### PDF report export

`jspdf` + `jspdf-autotable`. My spec didn't mention PDF at all. Centre heads and anyone
sending numbers to a parent or a partner want PDF, not CSV. Add it as an export option on
the reports screens.

### Generic report pivot

`GET /reports/custom?metric=...` pivoted lead counts by source / city / state / district /
exam / status / stage / year / course / center, with a date range. One endpoint, nine
reports. Worth keeping as a registered dashboard widget with the metric as widget config —
it's the cheapest breadth in the whole reporting surface.

### Per-counsellor WhatsApp routing by `phone_number_id`

`_find_counsellor_by_phone_id()` resolved the inbound webhook to a counsellor via the
`phone_number_id` in the payload metadata. Sound approach; the new design routes to a
*lead* rather than a counsellor, but the metadata lookup is the same mechanism.

### Token masking in the settings API

`GET /integrations/settings` returned tokens as `********abc123`. Correct instinct, keep it.

---

## Part 2 — Bugs. Do not reproduce these.

### Security

**S1. IDOR on lead detail.** `GET /leads/{lead_id}` checked only that the lead was in the
counsellor's *centre* — never that it was assigned to them. Any counsellor could read any
lead in their centre by guessing or iterating IDs. The list endpoint filtered correctly, so
the leak was invisible in the UI.
→ *Fixed by design in v2: RLS applies to every access path, including direct id lookups.
There is no "the detail endpoint forgot" failure mode.*

**S2. Unauthenticated file download.** `GET /files/{file_id}` had no auth dependency at all.
Uploaded government IDs, photos and marksheets were served to anyone with the URL.
→ *v2: private Supabase Storage buckets, short-lived signed URLs, access checked against
the owning lead.*

**S3. `GET /users` returned every user to every caller** — names, emails, phones, roles,
centre assignments. No role check.
→ *v2: RLS on `profiles`, scoped by permission.*

**S4. Webhook signatures never verified.** Both the Meta Lead Ads and WhatsApp webhooks
accepted any POST. `meta_app_secret` was read from settings and then never used. Anyone
who found the URL could inject unlimited fake leads or fake inbound messages.
→ *v2: verify `X-Hub-Signature-256` (HMAC-SHA256 with the app secret) on every inbound
webhook, reject on mismatch, before parsing the body. Non-negotiable.*

**S5. Meta webhook verification used the wrong settings key.** It compared against
`whatsapp_verify_token` rather than a Meta-specific one — a copy-paste bug that couples two
unrelated integrations.

**S6. Access tokens stored in plaintext** in `integration_settings` and
`whatsapp_settings`. Masked on read, plaintext at rest.
→ *v2: Supabase Vault or env-referenced secrets. The DB stores a reference, not the token.*

**S7. Unescaped regex in search.** `{"$regex": search}` with raw user input — a pathological
query can hang the database.
→ *v2: parameterised queries, `ilike` with escaped input, or full-text search.*

**S8. `JWT_SECRET` had a hardcoded fallback** (`'arch-crm-secret-key-2026'`). If the env var
were ever missing, every token becomes forgeable with a value that's in the repo.
→ *v2: Supabase Auth. But the general rule stands — no secret gets a default.*

### Data integrity

**D1. Duplicates dropped silently.** `_process_meta_lead` returned early on a phone match —
no enquiry recorded, no notification, nothing. A returning prospect vanished, and the
second ad that generated them got zero attribution credit. This is the single most damaging
bug in v1 and the reason the source ROI numbers can't be trusted.
→ *v2: never drop. Attach an enquiry to the existing lead, keep `first_touch_source`,
update `last_touch_source`, notify the owner.*

**D2. Meta leads bypassed the assignment engine entirely.** They were inserted with no
`center_id` and no `assigned_counsellor`, and only admins were notified. Your highest-volume
paid source produced leads that nobody owned.
→ *v2: every ingestion path — webhook, import, manual, WhatsApp — goes through the same
`resolveOrCreateLead()` then `applyAssignment()`. One path, no exceptions.*

**D3. Webhooks swallowed every exception and returned `200 OK`.** Meta records successful
delivery and never retries. Failures were invisible and unrecoverable.
→ *v2: persist the raw payload **first**, process after. Return non-2xx on genuine failure
so the platform retries. Log every failure to a dead-letter table with a replay tool.*

**D4. No reconciliation sync.** Webhooks drop messages — that's normal, not exceptional.
Nothing back-filled what was missed.
→ *v2: nightly reconciliation pulling the last 7 days from each source and diffing against
`enquiries.dedupe_key`.*

**D5. Phone numbers stored inconsistently.** `phone.replace("+","").replace(" ","")` in the
Meta path, raw user input everywhere else. `9847123456`, `+919847123456` and `919847123456`
were three different people to the dedupe check.
→ *v2: one `normalizePhone()` at every write boundary, E.164, no exceptions. This is why
D1 was as bad as it was.*

**D6. Stage changes on lead update didn't write `stage_history`.** Only the dedicated
`PATCH /leads/{id}/stage` endpoint logged it. Time-in-stage data was therefore incomplete
and any funnel-velocity report built on it would have been wrong.
→ *v2: a database trigger on `leads.stage_id`, not application code. Application code
forgets; triggers don't.*

**D7. `lead_status` and `pipeline_stage` were two overlapping fields** with a hand-written
`status_stage_map` reconciling them in the seed. Two sources of truth for one concept.
→ *v2: `stage_id` is the single truth. `temperature` is the genuinely separate second
dimension.*

**D8. Export hardcoded a 10,000-row ceiling** with no warning past it. Silent truncation.

### Operational

**O1. No audit log at all.** Interactions were auto-created for some field changes, but
there was no record of who exported data, who viewed a phone number, or who changed a role.

**O2. No SLA tracking.** `overdue_followups` counted leads past their follow-up date — but
only if a counsellor had voluntarily set one. A lead nobody ever touched had no follow-up
date and therefore never appeared as overdue. **The leads most at risk were the ones the
system was structurally blind to.** This is the highest-value thing v2 fixes.

**O3. Conversion rate was lifetime, not cohort.** `enrolled / total` across all time,
labelled as the counsellor's conversion rate. For a seasonal business this is close to
meaningless, and it penalises whoever most recently received a batch of fresh leads.

**O4. Hard deletes.** `DELETE /leads/{id}` and `delete_one` on stages and rules. No
`deleted_at`, no recovery.

**O5. Deleting a pipeline stage orphaned every lead in it** — no reassignment, no guard.

**O6. No idempotency on ingestion.** Replaying a webhook created duplicate rows.

---

## Part 3 — Carried into the v2 spec

Everything in Part 1 is now reflected in `00-PRD.md` and `01-DATA-MODEL.md`.
Every item in Part 2 has a corresponding structural fix:

| v1 failure | v2 mechanism |
|---|---|
| S1, S3 | RLS at the database, every path |
| S2 | Private buckets + signed URLs |
| S4, S5 | Mandatory signature verification per webhook |
| S6 | Secret references, not secret values |
| D1, D5 | `resolveOrCreateLead()` + `normalizePhone()` at every boundary |
| D2 | Single ingestion path through assignment |
| D3, D4, O6 | Raw-payload-first, dead-letter + replay, nightly reconciliation, `dedupe_key` |
| D6 | Database trigger on stage change |
| D7 | One stage field, temperature as a separate dimension |
| O1 | `audit_log` on every mutation, export and phone reveal |
| O2 | `sla_policies` measured from lead creation, not from a voluntary date |
| O3 | Cohort conversion reporting |
| O4, O5 | `deleted_at` everywhere, FK guards on config deletion |
