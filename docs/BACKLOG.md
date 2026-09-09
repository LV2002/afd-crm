# Backlog

Everything known to be unbuilt, in the order I'd build it. Leon asked for this list on
2026-09-04 so that "what's next?" has a standing answer.

The order is a recommendation, not a contract — it optimises for *risk retired per session*
rather than for finishing phases in sequence. Anything here can be pulled forward by asking.

Sources: `docs/02-BUILD-PHASES.md` (the original plan), the deferrals recorded in
`docs/DECISIONS.md`, and gaps found while building. When something ships, move it to
`docs/PROGRESS.md` and delete it from here.

---

## Now

### 1. A cron that actually runs everything — **Leon's decision**
The plan allows one cron a day. `vercel.json` declares eight, most of them weekly, and three
features now piggyback on other people's crons to get a schedule at all: the flow engine runs
inside the broadcast sweep, and the Google conversion upload inside the Google spend sync.

**A single `/api/cron/tick` route calling every sweep in sequence would let one daily cron drive
the whole system.** That is the right fix while the plan stays as it is, and it would also make
scheduled broadcasts land on the day they were scheduled for rather than the following Sunday.

This got more urgent with inbound media. Images under 5MB are fetched inside the webhook, but
anything larger waits for `downloadPendingMedia()`, which has no schedule of its own — and Meta
deletes inbound media after **thirty days**. An id that is never redeemed is a permanently
missing message, not a delayed one.

---

## Backlog proper

### 2. Telephony — **blocked**
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
- **Decide how the crons run** (see item 2). Three features are currently piggybacking on other
  jobs to get a schedule at all, and scheduled broadcasts land on Sunday whatever time you pick.
- **Set this month's targets** under Settings → Targets, and give each pipeline stage a
  probability under Settings → Pipeline Stages. Without the first, Insights → Targets counts
  what happened but has nothing to judge it against; without the second, the forecast counts
  those leads as worth nothing (and says so on the page).
- **Set the alerting environment variables** in Vercel — `RESEND_API_KEY`, `EMAIL_FROM`,
  `ALERT_EMAIL_TO`, `NEXT_PUBLIC_APP_URL`. Failures are recorded and visible on
  Settings → Platform Health either way; without these, nobody is emailed about them.
- **Create a Google Ads conversion action** of type "Import — from clicks", and paste its
  resource name into Settings → Integrations → Google. Until then admissions are never reported
  back and Google keeps optimising for form fills.
