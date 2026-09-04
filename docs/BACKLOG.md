# Backlog

Everything known to be unbuilt, in the order I'd build it. Leon asked for this list on
2026-09-04 so that "what's next?" has a standing answer.

The order is a recommendation, not a contract — it optimises for *risk retired per session*
rather than for finishing phases in sequence. Anything here can be pulled forward by asking.

Sources: `docs/02-BUILD-PHASES.md` (the original plan), the deferrals recorded in
`docs/DECISIONS.md`, and gaps found while building. When something ships, move it to
`docs/PROGRESS.md` and delete it from here.

---

## Now — the numbers the business runs on

### 1. Cost dashboards: CPL, cost per admission, ROAS, LTV:CAC
`ad_spend_daily` is synced from Meta and Google and nothing reads it. This is the question
the ad budget turns on and the CRM currently cannot answer it. First-touch attribution is
already stored per lead, so the join exists.

### 2. Discount approval enforcement
`discount_approvals` and the `discount.approve` permission both exist; nothing enforces an
authority limit. A counsellor can currently agree any discount. Needs a per-role limit and a
request/approve flow on the fee plan.

### 3. Batch management
`batches` exists as a table with no screen, so students can't be put in one and the Batch
column on the students sheet is permanently empty. Needs: create/edit batches, assign
students, and the batch showing on the student record.

### 4. Automated overdue reminders
Collections shows who is late; nothing chases them. A cron plus a WhatsApp template, reusing
the ageing buckets already computed.

---

## Then — WhatsApp beyond broadcasting

### 5. Scheduled sends
Compose now, go out Tuesday at 10am. A `scheduled_for` column and the sweep respecting it.

### 6. Per-recipient template values
Only `{{1}}` is fillable today, with one value for the whole broadcast — so no "Hi Anjali".
Needs per-recipient parameter resolution from the lead/student record.

### 7. Automation flows and quick-reply branching
Trigger → wait → condition → send. Button taps already arrive as ordinary inbound messages
carrying the button's text; nothing reads them and decides what happens next. The largest
single unbuilt thing Leon has asked for, and much easier now that audiences are solved.

### 8. Inbound media
Sending images and video now works (Session 35); receiving them still does not. An inbound
image is recorded by Meta's media id and never downloaded, so it can't be viewed in the CRM.
The raw delivery is in `webhook_events`, so nothing is lost — it is just not fetchable
through the UI.

---

## Later — analysis and reporting

### 9. Gate-lag reporting
The sales→accounts→academics lag CLAUDE.md calls "a real operational metric" is timestamped
on every enrolment and measured nowhere.

### 10. Google offline conversion upload
GCLID is captured on the lead; admissions are never uploaded back, so Google can't optimise
on who actually enrolled — the single biggest lever on Google Ads spend.

### 11. First-touch vs last-touch comparison
Both are stored on every lead, never compared.

### 12. Cohort conversion curves, geographic heatmap, school-level analytics
Phase 5's remaining reports. The Insights pivot covers a lot of this ad hoc already, which is
why they sit here rather than higher.

### 13. Targets and weighted pipeline forecast
Per-centre and per-counsellor targets, and a forecast weighted by stage probability
(`pipeline_stages.probability` is already configured and unused).

---

## Backlog proper

### 14. Promos
Table exists, no UI, no logic.

### 15. Telephony — **blocked**
Click-to-call, auto-logged direction/duration/disposition, recordings, missed-call → lead,
Malayalam transcription, call scoring, QA dashboard. All of Phase 6 sits behind one decision:
**Exotel or Ozonetel**. Nothing can start until Leon picks.

---

## Not code — Leon's to do

- **Run the pending migrations and the seed.** Several shipped features are dark until then;
  the seed is what grants new permissions to roles.
- **Set finance opening balances** under Finance → Bank & cash accounts. Every balance is
  currently wrong by a constant until this is done.
- **Rate-limit the public profile form** at the edge — Cloudflare Turnstile or a WAF rule.
  It has a honeypot and no rate limit, and this belongs in front of the app, not in it.
- **Connect the WhatsApp Business API number** — Phone Number ID and WhatsApp Business
  Account ID in Settings → Integrations → WhatsApp.
