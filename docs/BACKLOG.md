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

### 1. Automation flows and quick-reply branching
Trigger → wait → condition → send. Button taps already arrive as ordinary inbound messages
carrying the button's text; nothing reads them and decides what happens next. The largest
single unbuilt thing Leon has asked for, and much easier now that audiences, scheduling and
personalisation are all solved.

### 2. Inbound media
Sending images and video now works (Session 35); receiving them still does not. An inbound
image is recorded by Meta's media id and never downloaded, so it can't be viewed in the CRM.
The raw delivery is in `webhook_events`, so nothing is lost — it is just not fetchable
through the UI.

### 3. A faster broadcast sweep — **blocked on the hosting plan**
Scheduling shipped in Session 40 but is only as precise as the cron that sends, and that cron
runs **weekly, Sunday 01:00 UTC**. So a broadcast scheduled for Tuesday morning actually leaves
the following Sunday, and a 400-person campaign at 100 sends a run takes four weeks.

Leon's plan allows one cron a day at most, and he has asked for `vercel.json` to be left alone
for now. One line (`"*/15 * * * *"`) makes both the delivery rate and the scheduled time
accurate; nothing in the code changes with it, and `SWEEP_CADENCE_NOTE` in
`lib/whatsapp/schedule.ts` is the one sentence on screen to update.

The same cron budget is why the WhatsApp flow engine advances from inside this sweep rather
than owning a schedule of its own. **A single `/api/cron/tick` route that runs every sweep in
sequence would let one daily cron drive the whole system** — worth doing if the plan stays
as it is.

---

## Later — analysis and reporting

### 4. Gate-lag reporting
The sales→accounts→academics lag CLAUDE.md calls "a real operational metric" is timestamped
on every enrolment and measured nowhere.

### 5. Google offline conversion upload
GCLID is captured on the lead; admissions are never uploaded back, so Google can't optimise
on who actually enrolled — the single biggest lever on Google Ads spend.

### 6. First-touch vs last-touch comparison
Both are stored on every lead, never compared.

### 7. Cohort conversion curves, geographic heatmap, school-level analytics
Phase 5's remaining reports. The Insights pivot covers a lot of this ad hoc already, which is
why they sit here rather than higher.

### 8. Targets and weighted pipeline forecast
Per-centre and per-counsellor targets, and a forecast weighted by stage probability
(`pipeline_stages.probability` is already configured and unused).

---

## Backlog proper

### 9. Promos
Table exists, no UI, no logic.

### 10. Telephony — **blocked**
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
- **Decide whether the broadcast sweep runs every 15 minutes** (see item 3). It changes what
  "scheduled for 3pm" actually means, and it may cost a Vercel plan upgrade.
