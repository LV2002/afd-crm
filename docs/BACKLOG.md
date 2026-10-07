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

### 3. Telephony — **unblocked, waiting on one answer from Exotel**

Researched with Leon on 2026-10-07. The old entry said this was blocked on "Exotel or
Ozonetel, nothing can start until Leon picks". It is Exotel, for a specific reason, and what
is left is one question for their sales team rather than a decision of ours.

**Why Exotel.** Live call monitoring is the requirement that eliminates the field. Most Indian
providers have listen/whisper/barge only inside their own supervisor dashboard, which would
mean Leon tapping into calls on somebody else's website. Exotel exposes it as a REST API, so
it can be a button in this CRM:

- `GET /v1/Accounts/{sid}/Calls/{CallSid}/ActiveLegs` — the legs of a call in progress
- `POST /v1/Accounts/{sid}/Calls/{CallSid}/Legs` with `Action=listen|whisper|barge` and
  `PhoneNumber` — creates a monitor leg that rings the supervisor and joins them

Use the **Mumbai cluster** (`api.in.exotel.com`); data residency matters under DPDP.

**What Leon asked for, and what answers it.**

| Requirement | Mechanism |
| --- | --- |
| Call from the lead's page, never touching a handset | WebRTC Web SDK — a softphone embedded in this CRM, bridged to PSTN. Official reference: `exotel/exotel_websdk_crm` |
| Calls logged automatically | `StatusCallback` webhook → an `interactions` row through the one ingestion path |
| Recording on the lead's timeline | Recording URL arrives on the same webhook |
| Tap into a live call | The LWB API above |
| Every inbound call becomes a lead | Inbound `StatusCallback`; `no-answer` is a terminal status, so a missed call is as capturable as an answered one. Exotel also has a dedicated missed-call product |

**The one open question, and it decides the shape of the project.** Can Exotel port AFD's
existing number? Porting is subject to the operator's policies and regulatory approval, takes
7–15 business days, and not every number type is eligible. Ask with the actual number in hand,
and do not accept "yes, porting is supported" in general.

Three outcomes, and it is a business decision rather than a technical one:

- **Ported.** One number, inbound and outbound, branding intact. Best, if allowed.
- **Forwarded.** Keep the number where it is, forward unconditionally to the ExoPhone. No
  porting risk, works immediately — but outbound shows the ExoPhone, so students are called
  from one number and see another on the hoardings, and save the wrong one.
- **Adopt the ExoPhone** as the public number. Clean technically, throws away years of
  branding. Not recommended.

**Design notes for when this is built.**

- **Voice creates leads; the WhatsApp broadcast number does not.** That inversion is correct
  and deliberate: somebody who dials the institute chose to, where a reply to a broadcast is
  often just a button press. `whatsapp_numbers.creates_leads` already carries this concept
  per number; voice defaults the other way. Leon was explicit — *always* a lead, missed calls
  included.
- **The cost of "always"** is wrong numbers, vendors and current students in the pipeline.
  `resolveOrCreateLead()` dedupes on phone so a repeat caller is one lead, and a distinct
  source value keeps them filterable. If it gets noisy, the cheap fix is skipping numbers
  already attached to a student. Build it as asked first and see.
- **DPDP consent is a build requirement, not a footnote.** The rules were notified in
  November 2025: commercial call recording needs explicit informed consent — an announcement
  in the first 15 seconds stating the purpose specifically ("quality assurance and training",
  not "this call is recorded"), a genuine opt-out, and **a logged consent event with a
  timestamp**. That last part is a table here, not a telephony feature. Confirm with a lawyer
  before go-live; the sources are vendor guidance, not statute.
- **The webhook must answer 200 within 15 seconds**, and Exotel retries twice. That suits
  non-negotiable #9 (verify, persist, then process) exactly.
- **Browser calling is only as good as the office internet.** Wired connections at each desk,
  and a backup line. A counsellor who cannot be heard loses the admission.

**Ruled out, with reasons.** *Number masking* — it solves "the counsellor's personal handset
accumulates the database", and AFD's counsellors use company phones and company numbers, so
it buys nothing and adds a moving part. *Auto-dialers and predictive dialing* — a call-centre
feature for a consultative sale at ~200 leads a month; it would make counsellors worse at
their job. *Transcription and AI call summaries* — wanted eventually, and the Gemini client is
already here, but Malayalam–English code-switching is where transcription quality falls over.
Test on twenty real recordings before building anything.

**Costs, indicative only.** Roughly ₹0.60–1.50 per minute outbound on top of a platform plan;
published India tiers run about ₹9,999 / ₹19,999 / ₹49,499, with per-minute, number rental and
DLT charges separate. Confirm which tier carries the LWB API and WebRTC.

Still to write when this starts: `docs/TELEPHONY-SETUP.md` — the `calls` schema, the webhook
handler, the consent log, where the softphone sits on the lead page, and the porting decision
above written down rather than left in a chat.

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
