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

## Asked for, not yet started — Leon, 2026-10-05

Three requests, parked while the Meta and WhatsApp integrations are finished. He will say
"come back" when he wants them picked up.

### A. Marking an admission should move the lead's stage

When a counsellor marks an admission, the lead's stage should move to **Admission taken**
automatically. Today the stage is left wherever it was, so the counsellor has to remember a
second action and the pipeline shows leads sitting at Demo-Scheduled who have already enrolled.

Notes for whoever picks this up: the first gate is `sales_to_accounts_at` (CLAUDE.md, the
lifecycle chain), and the stage must be looked up rather than hardcoded — stages are
`pipeline_stages` rows an admin can rename, so match on stage **type** or an explicit
"this is the won stage" marker, never on the label "Admission taken". Check whether
`pipeline_stages` already carries a type that means won; if it does not, that is part of the
work. Writes an `audit_log` row and fires the existing `lead.stage_changed` notification like
any other stage move.

### B. The CRM is not usable on a phone

It must be responsive at every screen size. **Navigation is the worst of it and does not work
on mobile at all** — that is the first thing to fix, before any individual screen.

Everything else follows: lead lists, the detail page, pipeline, Insights, Settings. Tables are
the obvious problem and the kanban is the hard one. Counsellors work from phones, so this is
closer to a correctness bug than a polish task.

### C. The pipeline widget on the dashboard is half-width

It should run the full width of the dashboard. At half width it is out of proportion with
everything around it and the funnel is squashed.

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
- ~~**Set the alerting environment variables** in Vercel~~ — **done, 2026-10-05.**
  `RESEND_API_KEY` and `EMAIL_FROM` are set and a test email arrived. Alerts go to
  `leonvinny2002@gmail.com`, which is now a setting (Settings → Organisation) rather than
  `ALERT_EMAIL_TO`. `NEXT_PUBLIC_APP_URL` is still unset: links inside emails work, but point
  at whichever deployment sent the mail rather than at a stable address.
- ~~**`CRON_SECRET`**~~ — **done, 2026-10-05.** It was never set, so every scheduled call was
  turned away with a 401 and nothing overnight had run since launch. Set now; the nightly run
  is recorded on Settings → Platform Health, which also has a button to run the jobs on demand.
- **Fill in Settings → Organisation.** Address, phone, email, GSTIN and the logo.
  Every printed document — receipts, the fee agreement, profile sheets, and any
  report somebody prints — reads from there, and until it is filled in they carry
  your name and nothing else. Add each centre's own phone and email under
  Settings → Centres at the same time, so a receipt from Kannur shows Kannur.
- **Create a Google Ads conversion action** of type "Import — from clicks", and paste its
  resource name into Settings → Integrations → Google. Until then admissions are never reported
  back and Google keeps optimising for form fills.
