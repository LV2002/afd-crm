# Data Model

Postgres / Supabase. Drizzle definitions in `src/lib/db/schema/`, one file per group.
All tables have `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`,
`updated_at timestamptz`. Soft delete via `deleted_at timestamptz` — never `DELETE`.

Money is `bigint` **paise**. Phones are `text` in E.164.

---

## Org & access

```
org_settings       singleton row: name, logo_url, primary_color, timezone, currency,
                   locale, fiscal_year_start_month, date_format
terminology        key, singular, plural, is_active
                   -- e.g. key='lead' → "Enquiry"/"Enquiries" for a different company.
                   -- UI reads labels through a t() helper, never hardcoded strings.
centers            id, name, city, address, is_active, timezone, catchment jsonb
profiles           id (= auth.users.id), full_name, email, phone, role_id, is_active,
                   whatsapp_display_name, avatar_url
user_centers       user_id, center_id            -- composite PK
```

## Permissions

Roles are data. Permission primitives are code. This is the split that makes dynamic roles
compatible with database-enforced security.

```
permissions        code text PK, label, category, description
                   -- seeded from a constant in src/lib/auth/permissions.ts.
                   -- Adding a row here without an enforcement point does nothing;
                   -- the seed is the single source of truth.

roles              id, code, name, description, is_system bool, is_protected bool
                   -- is_protected: cannot be deleted or have permissions removed.
                   -- Exactly one protected role ships: admin.

role_permissions   role_id, permission_code, scope
                   scope: 'own' | 'center' | 'all'
```

Permission primitives (the seeded list — extend only alongside a real enforcement point):

```
lead.read  lead.create  lead.update  lead.delete  lead.assign  lead.merge
lead.export  lead.reveal_phone  lead.import
interaction.read  interaction.create
whatsapp.read  whatsapp.send  whatsapp.campaign
enrolment.read  enrolment.create  enrolment.update
payment.read  payment.record  payment.refund  discount.approve
student.read  student.update  batch.manage
report.read  report.center  report.org  ai.query
settings.manage  users.manage  roles.manage  rules.manage  config.export
audit.read
```

Two SQL helpers, both `security definer stable`:

```sql
auth_center_ids()             -- uuid[] of centres the caller is assigned to
auth_scope(perm text)         -- returns 'all' | 'center' | 'own' | null
```

`auth_scope` returns the widest scope the caller's role holds for that permission.
Policies branch on it. This replaces every `role = 'admin'` comparison in the codebase.

## Custom fields

An admin adds a field through the UI; it appears in the form, the list view, filters,
exports and reports. No migration, no deploy.

```
field_definitions  entity ('lead'|'student'|'enrolment'), key, label, help_text,
                   type, options jsonb, validation jsonb,
                   is_required, is_active, sort_order, section,
                   show_in_list, show_in_filters, visible_to_roles uuid[],
                   editable_by_roles uuid[], is_core bool
                   -- is_core: backed by a real column (name, phone, stage).
                   -- Non-core fields live in leads.custom jsonb.
```

Types: `text`, `long_text`, `number`, `currency`, `date`, `datetime`, `boolean`,
`select`, `multiselect`, `phone`, `email`, `url`, `file`, `user_ref`, `lead_ref`.

Core fields appear in `field_definitions` too — the admin can relabel them, mark them
required, hide them, or reorder them, but not delete them. Reads go through one
`getFieldSchema(entity)` helper so forms, tables and exports stay in sync automatically.

Index `leads.custom` with GIN. Where a custom field becomes heavily filtered, add a
generated column later — that's an optimisation, not a design requirement.

## Reference data

```
dropdown_options   category, value, label, sort_order, is_active, color, metadata jsonb
                   -- categories are themselves rows in dropdown_categories so an admin
                   -- can create a brand new list without a code change
dropdown_categories key, label, is_system, allow_admin_edit

pipeline_stages    name, sort_order, color, stage_type, is_active,
                   probability numeric, sla_hours int,
                   requires_reason bool, required_fields text[],
                   auto_actions jsonb
                   stage_type: new|normal|scheduled|enrolment_form|payment|won|lost|parked
```

`stage_type` is the one part of the pipeline that stays a fixed vocabulary — it drives
behaviour (the lost-reason modal, the form link, the won calculation), so it maps to code.
Everything else about a stage is free: name, order, colour, probability, SLA, which fields
become mandatory to enter it.

## Temperature

Also configurable. `leads.temperature` is a text reference into the `temperature`
dropdown category, not an enum.

```
dropdown_options   category='temperature'
                   value, label, color, sort_order,
                   metadata: { rank: int, is_terminal: bool }
                   -- ships as Hot / Warm / Cold / Dead. Rename them, add
                   -- "Very Hot", drop one, reorder — all admin actions.

temperature_rules  temperature_value, priority int, conditions jsonb, is_active
                   -- same JSONB condition grammar as assignment_rules.
                   -- First match by priority wins. Evaluated nightly and on activity.
                   -- e.g. replied within 48h AND stage rank >= 5 → 'hot'
```

`leads.temperature_override_until` still wins over any rule while it is in the future —
a counsellor's manual judgement beats the engine for a configurable number of days
(`org_settings.temperature_override_days`).

`metadata.is_terminal` is the only behavioural hook: terminal temperatures are excluded
from active work queues and forecast. Everything else is presentation.

## SLA policies

```
sla_policies       name, priority int, is_active,
                   applies_to jsonb,   -- same condition grammar; empty = applies to all
                                       -- e.g. source=Walk-in gets a 2h SLA,
                                       -- purchased database gets 72h
                   measure text,       -- 'first_response' | 'next_followup' | 'in_stage'
                   target_hours int,
                   business_hours_only bool,
                   escalations jsonb
```

`escalations` is an ordered array. Each step names hours, who to notify **by role id**,
and optional side effects:

```json
[
  { "at_hours": 12, "notify_roles": ["<uuid>"], "notify_owner": true },
  { "at_hours": 24, "notify_roles": ["<uuid>"], "flag_breach": true },
  { "at_hours": 48, "notify_roles": ["<uuid>"], "unassign": true, "requeue": true }
]
```

Role references are ids, not names, so a renamed or newly created role keeps working.
`notify_owner` and `notify_center_head` are relationship shortcuts rather than fixed roles.

```
business_hours     center_id, day_of_week, opens_at, closes_at, is_closed
holidays           center_id, date, name
```

When `business_hours_only` is set, the SLA clock pauses outside working hours and on
holidays — otherwise a Saturday-evening lead breaches its 24h SLA before anyone is at work.
Both tables are admin-editable and per-centre.

Multiple policies can exist. Highest `priority` whose `applies_to` matches wins;
`pipeline_stages.sla_hours` overrides for time spent in that specific stage.      name, signal, condition jsonb, weight int, is_active
                   -- replaces any hardcoded scoring function

notification_rules event_key, role_ids uuid[], channels text[],
                   template text, is_active, throttle_minutes int
                   -- event_key from a code constant; everything else is data

dashboard_layouts  role_id, widget_key, position int, config jsonb, is_visible
                   -- widget_key resolves to a registered component in
                   -- src/lib/dashboards/registry.ts
```

## Config export/import

```
config_snapshots   name, version, payload jsonb, created_by, created_at
```

Export bundles: `org_settings`, `terminology`, `roles`, `role_permissions`,
`field_definitions`, `dropdown_categories`, `dropdown_options`, `pipeline_stages`,
`assignment_rules`, `sla_policies`, `scoring_rules`, `notification_rules`,
`dashboard_layouts`, `enrolment_forms`, `fee_structures`, `promos`.

Never exports: leads, students, payments, users, messages, audit log.
Import into an empty instance must produce a working, differently-shaped CRM.

---

## Identity

```
leads              lead_number bigserial (human ref)
                   student_name, father_name, mother_name
                   primary_phone, alternate_phone, parent_phone, email
                   dob, gender
                   address_line, city, district, state, pincode, country
                   education_status, school_college, board
                   parents_occupation, previous_attempts
                   interested_exams text[], exam_year, courses_interested text[]
                   preferred_mode
                   first_touch_source, first_touch_sub_source, first_touch_campaign
                   last_touch_source,  last_touch_sub_source,  last_touch_campaign
                   gclid, fbclid, utm jsonb
                   center_id, assigned_to, stage_id
                   temperature          -- FK to dropdown_options(category='temperature')
                   temperature_override_until timestamptz
                   temperature_set_by   -- 'rule' | user_id
                   score int            -- computed, see below
                   is_competitor_student, competitor_institute
                   referred_by_lead_id  -- referral graph
                   brochure_sent bool, state_other text
                   first_response_at, last_activity_at, next_followup_at
                   sla_breached bool, consent_status, consent_source, consent_at
                   do_not_contact bool, opted_out_channels text[]
                   lost_reason, lost_reason_detail, lost_at
                   merged_into_lead_id, deleted_at
                   custom jsonb          -- escape hatch for new fields without migration

lead_identifiers   lead_id, kind (phone|email), value_normalised, is_primary
                   UNIQUE (kind, value_normalised) WHERE deleted_at IS NULL

enquiries          lead_id, source, sub_source, campaign_id, adset_id, ad_id,
                   utm jsonb, gclid, fbclid,
                   received_at, raw jsonb, dedupe_key, was_duplicate bool,
                   ingest_batch_id
                   -- one row per inbound event. Many enquiries per lead.

lead_merges        survivor_lead_id, merged_lead_id, merged_by, reason, snapshot jsonb
merge_review_queue lead_id, candidate_lead_id, score numeric, status, reviewed_by
```

`enquiries` is what makes source attribution honest. Lead volume by source is a count of
`enquiries`; unique-people volume is a count of `leads`. Reporting must be explicit about which.

---

## Assignment rules engine

```
assignment_rules   name, priority int, is_active,
                   conditions jsonb,     -- see below
                   action jsonb,         -- {center_id?, assign_to?, strategy?}
                   applies_on text[]     -- ['create','update'] — reassignment triggers
                   created_by

assignment_history lead_id, from_user, to_user, from_center, to_center,
                   rule_id, reason (rule|manual|round_robin|reassign_sla), actor_id
```

`conditions` is an AND-array of predicates, evaluated in `priority` order, first match wins:

```json
{
  "all": [
    { "field": "district",  "op": "in",     "value": ["Kannur", "Kasaragod"] },
    { "field": "source",    "op": "equals", "value": "Meta" },
    { "field": "exam_year", "op": "equals", "value": "2027" }
  ]
}
```

Ops: `equals`, `not_equals`, `in`, `not_in`, `contains`, `is_empty`, `is_not_empty`,
`gt`, `lt`, `between`. Fields are a whitelisted map to lead columns — never raw SQL.

`action.strategy` supports `fixed` (a named user) or `round_robin` (across a user list,
skipping inactive/on-leave). Round-robin state lives in `assignment_rules.action.cursor`.

Admin/co-admin only. The rule builder UI is a visual condition builder with a
**dry-run preview**: "this rule would have matched 43 of the last 200 leads."

---

## Activity

`stage_history` is written by a **database trigger** on `leads.stage_id`, not by
application code. V1 wrote it from one endpoint and missed every other path, so its
time-in-stage data was silently incomplete and any funnel-velocity report built on it
was wrong.

```
interactions       lead_id, type, direction, occurred_at, duration_seconds,
                   outcome, notes, next_action, next_followup_at,
                   created_by, source (manual|call|whatsapp|system)

tasks              lead_id, assigned_to, due_at, type, title, notes,
                   status (open|done|cancelled), completed_at, completed_by

stage_history      lead_id, from_stage, to_stage, changed_by, changed_at,
                   duration_in_previous_seconds
                   -- powers time-in-stage and funnel velocity reports
```

notifications      user_id, type, title, body, lead_id, is_read, read_at,
                   channel text[]  -- ['in_app','whatsapp','email']

audit_log          actor_id, action, entity_type, entity_id,
                   before jsonb, after jsonb, ip, user_agent, occurred_at
                   -- includes exports and phone-number reveals
```

---

## WhatsApp

```
whatsapp_accounts     label, purpose (conversational|marketing), waba_id,
                      phone_number_id, display_number, quality_rating,
                      messaging_limit, access_token_ref
whatsapp_threads      lead_id, account_id, contact_phone,
                      last_inbound_at, service_window_expires_at, unread_count
whatsapp_messages     thread_id, lead_id, wamid, direction, type, body,
                      media_url, template_name, variables jsonb,
                      status (queued|sent|delivered|read|failed), error jsonb,
                      sent_by, occurred_at
whatsapp_templates    name, language, category, body, variables jsonb,
                      approval_status, synced_at
campaigns             name, template_id, account_id, segment jsonb,
                      scheduled_at, status, sent_count, delivered_count,
                      read_count, failed_count, cost_paise, created_by
campaign_recipients   campaign_id, lead_id, status, wamid, error
suppression_list      phone, reason (opt_out|dnd|bounce|manual), created_at
```

Send path must check `suppression_list`, `do_not_contact`, and service-window state
before dispatch. No exceptions, no override flag.

---

## Fees, enrolment, payments

```
fee_structures     course, center_id, mode, academic_year, base_fee_paise, is_active
promos             name, discount_type (percentage|fixed), value,
                   max_discount_paise, valid_from, valid_until, is_active
lead_promos        lead_id, promo_id, applied_by, applied_at, notes
                   -- discounts get discussed during counselling, long before an
                   -- enrolment row exists. Capture them where they happen; they
                   -- carry forward into the enrolment.
discount_approvals lead_id, requested_by, amount_paise, reason,
                   status (pending|approved|rejected), decided_by, decided_at

enrolment_forms    name, fields jsonb, is_active
form_tokens        lead_id, form_id, token, expires_at, used_at
form_submissions   lead_id, form_id, data jsonb, submitted_at, ip

enrolments         lead_id, student_id, course, batch_id, center_id, mode, academic_year,
                   total_fee_paise, discount_paise, net_fee_paise,
                   enrolled_at, agreement_doc_id, signed_doc_id,
                   sales_to_accounts_at, sales_to_accounts_by,
                   accounts_to_academics_at, accounts_to_academics_by,
                   status (pending_payment|active|cancelled|refunded)

installments       enrolment_id, seq, due_date, amount_paise,
                   paid_paise, status (pending|partial|paid|overdue|waived)

documents          lead_id, enrolment_id, student_id, type, storage_path, mime,
                   size_bytes, uploaded_by, uploaded_at
```

### Students (academics object)

Created at the `accounts_to_academics_at` gate. Academics never queries `leads`.

```
students           student_code text unique      -- from a gapless sequence
                   lead_id                       -- provenance, not a dependency
                   full_name, phone, parent_phone, email, dob, photo_doc_id
                   center_id, joined_at, status (active|on_hold|completed|dropped)
                   target_exams text[], target_exam_year
                   current_course, current_batch_id
batches            name, center_id, course, mode, academic_year,
                   start_date, end_date, capacity, is_active
student_batches    student_id, batch_id, joined_at, left_at, reason
```

Copy the fields academics needs at creation time rather than joining back to `leads`.
Denormalising here is deliberate: the two records diverge legitimately after handoff.

### Financial ledger (append-only)

`payments` and `receipts` are **insert-only**. No UPDATE policy, no DELETE policy — enforce
it in RLS, not just convention. Corrections are reversals.

```
payments           enrolment_id, installment_id, amount_paise, direction (credit|debit),
                   method (cash|upi|card|neft|cheque|other), reference,
                   received_at, recorded_by,
                   reverses_payment_id     -- null unless this is a correction
                   reversal_reason
receipts           receipt_no bigint       -- from sequence receipt_no_seq, gapless
                   payment_id, enrolment_id, issued_at, issued_by, doc_id
refunds            enrolment_id, amount_paise, reason, approved_by, processed_at,
                   payment_id
```

An instalment's paid amount is **derived** — `sum(credit) - sum(debit)` over its payments —
never a stored mutable counter. Expose it as a view, not a column.

```sql
create sequence receipt_no_seq;   -- gapless, DB-generated, never in app code
```

---

## Marketing spend

```
webhook_events     source, external_id, signature_ok bool, raw jsonb,
                   received_at, processed_at, status (pending|done|failed),
                   attempts int, last_error text
                   UNIQUE (source, external_id)
                   -- Persist BEFORE processing. Idempotency via the unique key.
                   -- Failures stay here for replay rather than vanishing.

ad_spend_daily     date, platform (google|meta), account_id, campaign_id, campaign_name,
                   adset_id, adset_name, ad_id, ad_name,
                   spend_paise, impressions, clicks, leads_reported
                   UNIQUE (date, platform, ad_id)
```

Synced nightly. Joins to `enquiries.campaign_id` / `ad_id` for CPL, and through to
`enrolments` for cost-per-admission and ROAS.

---

## Targets

```
targets            user_id | center_id, period_month date,
                   metric (admissions|revenue|calls|conversion_rate),
                   target_value, set_by
```

---

## Lead score (computed, nightly + on write)

Not the v1 hardcoded city bonus. Weighted and configurable in `settings`:

| Signal | Direction |
|---|---|
| Exam year = current admission cycle | ++ |
| Education status matches course entry point (11th/12th/12th pass) | ++ |
| Multiple exams of interest | + |
| District within centre catchment | + |
| Replied to WhatsApp / answered a call | ++ |
| Visited centre | +++ |
| Email present, form fully completed | + |
| No contact after 3 attempts | − |
| Source = purchased database | − |
| Days since last activity | − (decay) |

Store the component breakdown in `leads.custom.score_breakdown` so a counsellor can see
*why* a lead scored 78, not just the number.

---

## Row Level Security

Enable RLS on every table. Policies branch on **permission scope**, never on a role name —
that is what lets an admin invent a new role without a migration.

```sql
create policy leads_select on leads for select using (
  case auth_scope('lead.read')
    when 'all'    then true
    when 'center' then center_id = any(auth_center_ids())
    when 'own'    then assigned_to = auth.uid()
    else false
  end
);

create policy leads_update on leads for update using (
  case auth_scope('lead.update')
    when 'all'    then true
    when 'center' then center_id = any(auth_center_ids())
    when 'own'    then assigned_to = auth.uid()
    else false
  end
);
```

Write the `case auth_scope(...)` block once as a SQL function
`can_access_center(perm text, center_id uuid, owner_id uuid)` and call it from every
policy. One implementation, dozens of policies, no drift.

Child tables (`interactions`, `whatsapp_messages`, `documents`, `tasks`, `enrolments`,
`payments`) inherit visibility via `exists (select 1 from leads ...)` on `lead_id`.

Configuration tables (`roles`, `pipeline_stages`, `field_definitions`, `dropdown_options`,
`assignment_rules`, `sla_policies`, `scoring_rules`, `notification_rules`,
`dashboard_layouts`, `fee_structures`): select for all authenticated users — the app needs
to render them — insert/update/delete gated on `settings.manage`, `roles.manage` or
`rules.manage` as appropriate.

`audit_log`: insert-only for everyone, select gated on `audit.read`, no update or delete
policy at all.

`payments`, `receipts`: **insert and select policies only.** Deliberately no update or
delete policy for any role including admin — with RLS enabled, an absent policy means the
operation is denied. This is the enforcement mechanism, not a convention.

`students`, `batches`, `student_batches`: scoped on `student.read` the same way.

### Lockout protection

Two invariants enforced by database triggers, not application code:

1. At least one active user must hold a role with `settings.manage` at scope `all`.
2. The `admin` role is `is_protected` — it cannot be deleted, and permissions cannot be
   removed from it.

Without these, an admin can misconfigure roles and permanently lock everyone out of the
settings screen that would fix it.

### Verification

**Part of the definition of done.** `tests/rls.spec.ts` logs in as each seeded role and
asserts row counts. Then it goes further: it creates a *new* role at runtime with a
narrow permission bundle, assigns a user to it, and asserts the RLS boundary holds. If
dynamic roles don't survive that test, they aren't really dynamic.

---

## Indexes

```
leads: (assigned_to, stage_id), (center_id, created_at desc), (next_followup_at)
       (sla_breached) where sla_breached, (temperature, stage_id)
       gin on interested_exams, gin on custom
lead_identifiers: (kind, value_normalised) unique partial
enquiries: (lead_id, received_at desc), (source, received_at), (ad_id, received_at)
interactions: (lead_id, occurred_at desc)
whatsapp_messages: (thread_id, occurred_at desc), (wamid) unique
installments: (due_date, status)
audit_log: (entity_type, entity_id, occurred_at desc)
```
