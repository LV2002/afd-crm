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

## Meta, WhatsApp and Instagram — Leon's, in Meta's dashboard

Not code. Every one of these is a step only Leon can take, and the CRM side of each is
already built and waiting. Full walkthroughs in `docs/WHATSAPP-SETUP.md` and
`docs/ADS-SETUP.md`.

**Done so far:** Lead Ads, Meta ad spend, the nightly run, email alerts, and Instagram DM
delivery (the Page is subscribed to `messages` with a token carrying `pages_messaging`).

### i. Business verification — start first, it gates the rest
Business Settings → Security Centre. Meta wants documents proving AFD India is a real
registered business, with the name and address matching exactly. Days to weeks, and every
permission below waits on it.

### ii. App Review — one submission, not three
`whatsapp_business_messaging`, `whatsapp_business_management`, `instagram_manage_messages`,
`leads_retrieval`, the three `pages_` permissions, `pages_messaging` and `ads_read` all go on
the same submission. Until it clears, Instagram DMs arrive only from people with a role on the
Meta app — enough to test with, not enough to run on. A twenty-second screen recording of the
CRM using the permission is the single most effective thing to attach.

### iii. WhatsApp — the whole of Part 1, nothing started
Add WhatsApp to the existing Meta app, pick a number that is not a counsellor's (registering
one to the Cloud API ends its use in the WhatsApp app and the chats do not follow), generate a
System User token, paste five values into Settings → Integrations → WhatsApp, subscribe the
`messages` field, register the number, send a test. Coexistence for counsellors' own phones is
Part 4 and comes after one number is proven.

### iv. Message templates
Submit the three or four the institute actually uses, from WhatsApp → Templates. Template
approval and App Review are separate queues and both take days, so start them together.
Categories matter: a fee reminder is Utility, a discount offer is Marketing, and marketing
dressed as utility is the most common rejection.

---

## Backlog proper

### 2. A tag should be usable as a rule condition
Tags are the one lead attribute an admin cannot test in an assignment or temperature rule —
`condition-fields.ts` has no tag field, so "assign anybody tagged *walk-in* to the Kochi desk" is
not expressible. The evaluator already has `includes_any` for `interested_exams`, a text[], so the
operator exists; what is missing is a field whose value comes from the `lead_tags` join rather
than a column on `leads`, which means the evaluator's `Lead` shape has to carry the tag ids.

Small, and worth doing before anybody builds a workflow around a tag. Noticed while answering
Leon's question about whether tags could be dropped (DECISIONS.md, 2026-10-05).

### 3. Telephony — **blocked**
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
