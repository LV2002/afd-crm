# Backlog

Everything known to be unbuilt, in the order I'd build it. Leon asked for this list on
2026-09-04 so that "what's next?" has a standing answer.

The order is a recommendation, not a contract — it optimises for *risk retired per session*
rather than for finishing phases in sequence. Anything here can be pulled forward by asking.

Sources: `docs/02-BUILD-PHASES.md` (the original plan), the deferrals recorded in
`docs/DECISIONS.md`, and gaps found while building. When something ships, move it to
`docs/PROGRESS.md` and delete it from here.

---

## Now — WhatsApp beyond broadcasting

### 1. Scheduled sends
Compose now, go out Tuesday at 10am. A `scheduled_for` column and the sweep respecting it.

### 2. Per-recipient template values
Only `{{1}}` is fillable today, with one value for the whole broadcast — so no "Hi Anjali".
Needs per-recipient parameter resolution from the lead/student record.

### 3. Automation flows and quick-reply branching
Trigger → wait → condition → send. Button taps already arrive as ordinary inbound messages
carrying the button's text; nothing reads them and decides what happens next. The largest
single unbuilt thing Leon has asked for, and much easier now that audiences are solved.

### 4. Inbound media
Sending images and video now works (Session 35); receiving them still does not. An inbound
image is recorded by Meta's media id and never downloaded, so it can't be viewed in the CRM.
The raw delivery is in `webhook_events`, so nothing is lost — it is just not fetchable
through the UI.

---

## Later — analysis and reporting

### 5. Gate-lag reporting
The sales→accounts→academics lag CLAUDE.md calls "a real operational metric" is timestamped
on every enrolment and measured nowhere.

### 6. Google offline conversion upload
GCLID is captured on the lead; admissions are never uploaded back, so Google can't optimise
on who actually enrolled — the single biggest lever on Google Ads spend.

### 7. First-touch vs last-touch comparison
Both are stored on every lead, never compared.

### 8. Cohort conversion curves, geographic heatmap, school-level analytics
Phase 5's remaining reports. The Insights pivot covers a lot of this ad hoc already, which is
why they sit here rather than higher.

### 9. Targets and weighted pipeline forecast
Per-centre and per-counsellor targets, and a forecast weighted by stage probability
(`pipeline_stages.probability` is already configured and unused).

---

## Backlog proper

### 10. Promos
Table exists, no UI, no logic.

### 11. Telephony — **blocked**
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
