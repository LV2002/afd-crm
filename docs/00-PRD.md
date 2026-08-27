# AFD India CRM — Product Requirements

## 1. Objective

One system holding every lead AFD India has ever received, from any source, with a
complete auditable history of every interaction — so that no lead is lost, every
counsellor is measurable, and every rupee of ad spend is traceable to an admission.

## 2. Lead sources

| Source | Ingestion | Notes |
|---|---|---|
| Meta Lead Ads | Webhook (`leadgen`) + nightly reconciliation sync | Existing Sheets pipeline stays as fallback during cutover |
| Google Ads lead forms | Webhook / Sheets bridge | Capture GCLID for offline conversion upload |
| Website forms | Webhook (existing, custom site) | Pass UTMs through |
| Knorish / Edbound course purchases | Webhook (already built) | Also creates an enrolment candidate |
| Cart-abandon / account creation | Webhook | Low-intent, tag accordingly |
| Purchased databases | CSV/XLSX import with column mapper | **Separate consent track — see §9** |
| Email enquiries | IMAP/Gmail poll + parser rules | Match by sender or subject pattern |
| Inbound WhatsApp | WABA webhook | Unknown number auto-creates lead |
| Inbound calls | Telephony webhook (Phase 3) | Missed call auto-creates callback task |
| Walk-in / referral / consultancy | Manual entry | Referral links to referring student |

Every ingested enquiry stores raw payload in `enquiries.raw` for replay and debugging.

## 3. Identity and deduplication

**Rule: never reject, always resolve.**

On every inbound enquiry:
1. Normalise phone to E.164, lowercase email.
2. Look for an existing lead via `lead_identifiers` (exact phone, exact email).
3. If exact match → attach the enquiry to that lead. Update `last_touch_source`.
   Leave `first_touch_source` untouched. Notify the owning counsellor.
4. If no exact match → fuzzy check (same name + same district, or phone differing only
   by country-code prefix). If score above threshold, create the lead but flag it into a
   **Merge Review queue** for a human. Never auto-merge on fuzzy alone.
5. If nothing → create a new lead, run the assignment engine.

Merging two leads must: keep the older `created_at`, union all identifiers, move all
enquiries/interactions/messages/files/payments to the survivor, write a `lead_merges` row,
and keep the loser row soft-deleted with a pointer so old links still resolve.

## 4. Funnel

Two independent dimensions.

**Stage** (ordered, admin-editable, each has a `stage_type` for behaviour):

| # | Stage | Type |
|---|---|---|
| 1 | New | `new` |
| 2 | Assigned | `normal` |
| 3 | Attempted | `normal` |
| 4 | Connected | `normal` |
| 5 | Qualified | `normal` |
| 6 | Counselling Scheduled | `scheduled` |
| 7 | Counselling Done / Visited | `normal` |
| 8 | Fee Discussed | `normal` |
| 9 | Registration Form Sent | `enrolment_form` |
| 10 | Form Submitted | `normal` |
| 11 | Payment Pending | `payment` |
| 12 | Enrolled | `won` |
| 13 | Lost | `lost` |
| 14 | Nurture / Dormant | `parked` |

Moving to a `lost` stage requires a **mandatory structured lost reason**:
`Fee too high` · `Joined competitor` (+ which) · `Chose different career` ·
`Distance / location` · `Parent declined` · `Wrong exam year` · `Not eligible` ·
`Unreachable` · `Duplicate` · `Other` (+ free text).

**Temperature**: a separate configurable dimension. Ships as Hot / Warm / Cold / Dead, but
the values, their labels, colours and order are admin-editable, as are the rules that
assign them. Auto-computed nightly and on activity from `temperature_rules`, with a manual
override that wins for a configurable number of days. Never derived from stage alone.

## 5. Ownership and SLA

- New lead auto-assigns to a centre, then a counsellor, via the rules engine.
- **SLA is policy-driven, not a constant.** Multiple policies can coexist, each with its
  own conditions, target and escalation ladder — a walk-in can carry a 2-hour SLA while a
  purchased-database contact carries 72. The default policy ships as:
  - Target: first response within 24 hours
  - T+12h untouched → owner notified, rises to the top of My Day
  - T+24h untouched → centre head notified, lead flagged `sla_breached`
  - T+48h untouched → admin notified, lead unassigned and requeued
- SLA clocks respect per-centre **business hours and holidays** when the policy says so,
  so a Saturday-evening lead doesn't breach before anyone is at work.
- **Every interaction log requires a next action**: outcome + next follow-up date, or an
  explicit "close as lost" with reason. A lead with no future-dated task and no terminal
  stage lands in the centre head's **Orphan queue**.
- Reassignment (manual or rule-triggered) notifies: new owner, old owner, both centre heads.

## 6. Communication

### WhatsApp (Meta Cloud API)
- **Two WABA numbers.** `conversational` for counsellor threads, `marketing` for bulk.
  Quality rating is per-number; a blast must not be able to throttle the sales line.
- Inbound webhook → resolve identity → render inside the lead's WhatsApp tab.
  There is no shared inbox to browse; the chat is a tab on the lead record, so RLS on
  leads automatically governs who can read which conversation.
- Show the **24-hour service-window countdown** per thread. Outside it, only approved
  templates can be sent, and the UI must say so.
- Template library with variable mapping, synced approval status from Meta.
- Campaigns: pick a saved segment, pick a template, preview count and estimated cost,
  send. Per-message delivery status written back. Opt-out keyword handling is mandatory
  and must suppress the contact permanently.

### Calls (Phase 3, Exotel/Ozonetel)
- Click-to-call from the lead record via the masked business number.
- Auto-log direction, duration, disposition, recording URL.
- Missed inbound → auto-create lead (if unknown) + callback task.

## 7. Enrolment, fees and documents

- **Registration form**: admin-defined fields, sent as a tokenised public link, no login.
  Collects photo, government ID, marksheet, emergency contact, parent details, address.
  Submission writes files to a private bucket and advances the stage.
- **Fee structure master**: course × centre × mode × academic year → base fee.
- **Discounts**: from a promo master, with an **approval workflow** above a per-role
  authority limit. Track discount given vs conversion, by counsellor.
- **Payment plan**: N instalments with due dates and amounts. Generates a PDF agreement
  with a unique reference. Printed, signed, re-uploaded, attached permanently.
- **Payments**: append-only ledger. Record receipts against instalments, partial payments
  allowed, corrections as reversal entries. Gapless DB-generated receipt numbers.
  Ageing buckets (0–30 / 31–60 / 61–90 / 90+), overdue reminders, collection dashboard.

### The two handoff gates

The organisation runs Marketing → Sales → Accounts → Academics. Two explicit gates:

**Gate 1 — Sales to Accounts** (`sales_to_accounts_at`)
Counsellor confirms the admission. Fee, discount and payment plan are locked in.
The lead stops being sales work. Accounts is notified and the enrolment appears in their
queue. Counsellor retains read access and still gets credit in conversion reports.

**Gate 2 — Accounts to Academics** (`accounts_to_academics_at`)
First instalment cleared. A `students` record is created with a `student_code`. Academics
is notified, assigns a batch, and takes over. Academics sees the student — course, batch,
join date, target exams — and never the lead history or the financials.

Track the lag between gates. A long Gate 1 → Gate 2 lag means confirmed admissions aren't
paying, which is a different problem from leads not converting and needs a different fix.

Accounts and academics functionality beyond this is out of scope for v1 and will be
specified separately. What v1 must get right is the gate structure, the role, and the
append-only ledger — those are the things that are painful to add later.

## 8. Reporting

Prebuilt dashboards, real-time, scoped by role.

**Lead & source**
- Volume by source/sub-source/campaign/creative, by day/week/month/year
- New vs returning, duplicate rate
- Geographic distribution by district and pincode (heatmap)
- School/college-level lead and admission counts

**Funnel & conversion**
- Stage-by-stage conversion with drop-off
- **Cohort conversion**: leads grouped by arrival month, tracked forward. Essential —
  the business is seasonal and a June lead may convert in October. A flat monthly
  conversion rate will mislead.
- Time-to-first-contact, time-to-conversion distributions
- Lost reason breakdown, by source and by counsellor

**Marketing / spend**
- Daily spend ingested per campaign/adset/ad
- CPL, CPQL, cost per admission, **ROAS and LTV:CAC by source**
- First-touch vs last-touch attribution side by side
- Google Ads offline conversion upload (GCLID → admission) so Smart Bidding optimises
  toward admissions rather than form fills

**Sales ops**
- Counsellor scorecard: assigned, contacted, SLA compliance %, connect rate, demo rate,
  conversion %, revenue, average discount
- Monthly targets vs actual, with pacing
- Weighted pipeline forecast (stage probability × expected fee)
- Activity volume: calls, WhatsApp, follow-ups completed vs due

**Finance**
- Revenue booked vs collected
- Outstanding instalments, ageing, predicted defaults
- Revenue by course, centre, mode, batch

**Delivery**
- Daily WhatsApp/email digest to admin: leads in, % contacted in 24h, admissions,
  spend, SLA breaches, anomalies.
- Monthly counsellor report auto-generated with next month's target.

## 9. Compliance (India)

Not optional. Most leads are 16–18 year olds.

- **DPDP Act 2023**: capture consent at point of collection with purpose and timestamp.
  Purchased databases have no consent — keep them in a separate track, call-first, never
  bulk-WhatsApp them. Get a lawyer's opinion on the lawful basis before scaling this.
- **Minors**: DPDP requires verifiable parental consent for under-18s. Store parent as a
  first-class second contact with their own phone and consent record.
- **TRAI DND**: scrub before outbound calling.
- **Opt-out**: honoured across all channels, permanently, and enforced at send time.
- **Retention**: defined periods per record type, with a purge job.
- **Access**: masked phone numbers in bulk views, audit every export, no hard deletes.

## 10. Configurability

The system must be reconfigurable by an admin at runtime, with no deploy. The working
test: *could this be deployed for a completely different company by changing only
database contents?*

**Admin-editable:** organisation identity and branding · the terminology itself (the words
for lead, student, counsellor, centre, course, exam) · centres · users and their centre
assignments · **roles and their permission bundles** · pipeline stages including order,
colour, probability, SLA and entry requirements · **custom fields on any entity** ·
every dropdown list, and the ability to create new lists · assignment rules · SLA
thresholds and escalation targets · lead scoring signals and weights · notification rules
and copy · which dashboard widgets each role sees · fee structures, promos, discount
authority · message templates.

**Fixed in code, deliberately:** permission primitives (each is a real enforcement point) ·
the object model of lead → enrolment → student and the gates between them · identity
resolution · ledger immutability · dashboard widget implementations · audit logging.

The second list is short on purpose. It is what makes this a CRM rather than a database
with a form builder on top. Anything else that feels like it belongs there probably
belongs in the first list instead.

**Config export/import** is the deliverable that proves this: every configuration table
dumps to one JSON bundle, imports into an empty instance, and yields a working CRM shaped
the same way with no data in it. It doubles as the staging→production path.

## 11. Explicitly out of scope for v1

Telephony (Phase 3), AI call scoring (Phase 3), academics/LMS, attendance, test scores,
accounting integration, student mobile app.
