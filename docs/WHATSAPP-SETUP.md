# Switching on WhatsApp and Instagram

Written for Leon. No code, no terminal — every step is a page in a browser.

Companion to `docs/ADS-SETUP.md`, which covers Meta **Lead Ads** and ad spend. That part is
already live: leads arrive and spend is syncing. This is the rest of the same Meta app.

Everything described here is already built. These are the switches that turn it on.

---

## The shape of it: one app, three objects, one review

This is the single thing that confuses people most, so it is worth getting straight before
touching anything.

You have **one Meta app**. Inside it, Meta treats WhatsApp, Instagram and your Facebook
Page as three separate **objects**, and each one is subscribed separately, with its own
callback URL pointing at this CRM:

| Meta object | Callback URL | Fields to subscribe | What it delivers | Status |
|---|---|---|---|---|
| **Page** | `https://afd-crm-one.vercel.app/api/webhooks/meta-leads` | `leadgen` | Lead Ads form submissions | **Done** |
| **WhatsApp Business Account** | `https://afd-crm-one.vercel.app/api/webhooks/whatsapp` | `messages` (+ three more for Coexistence, Part 4) | Replies, delivery receipts, mirrored counsellor chats | To do |
| **Instagram** | `https://afd-crm-one.vercel.app/api/webhooks/instagram` | `messages` | Instagram DMs | To do |

Same App Secret, same Verify Token, three URLs. Subscribing one does nothing for the other
two — which is exactly why WhatsApp and Instagram are silent today while leads arrive fine.

And **one App Review submission** covers all of it. Put every permission on the same
submission (Part 6); do not do three reviews.

---

## What you get, and what each piece needs

| What it does | What it needs |
|---|---|
| **A lead's WhatsApp reply lands on their record**, and their counsellor is notified | WhatsApp webhook + Access Token + Phone Number ID |
| **Counsellors reply from the CRM** — the full thread on the lead's page | Same as above |
| **Templates** — the only thing you may send to someone who hasn't messaged in 24 hours | WhatsApp Business Account ID, plus Meta approving each template |
| **Broadcasts** — a campaign to a filtered audience, with opt-outs honoured | Approved template + the nightly job actually running (Part 3) |
| **Automations** — a message ladder that fires off a stage change or a missed payment | Same as above |
| **Counsellors' own numbers mirrored in** — their phone keeps working, the CRM sees everything | Coexistence onboarding + three extra webhook fields (Part 4) |
| **Instagram DMs answered from the CRM** | Instagram webhook + `instagram_manage_messages` + Instagram Account ID (Part 5) |

You do not have to do all of it at once. Part 1 is the one that matters; everything else
builds on it.

---

## Before you start

Have ready:

- Your CRM's address: `https://afd-crm-one.vercel.app`
- Admin access to the CRM (**Settings → Integrations**)
- The **same Meta app** you already set up for Lead Ads — do not create a second one
- The **Verify Token** you invented for Lead Ads. The same value is used again here.
- A phone number for the institute's WhatsApp that is **not currently on WhatsApp**, or
  that you are willing to move off it. Read 1.2 before you pick one — it is a one-way door.

---

# Part 1 — The institute's WhatsApp number

This is the number that sends campaigns and receives replies. One number for the whole
CRM.

### 1.1 Add WhatsApp to the app you already have

Meta App Dashboard → your existing app → **Add product** → **WhatsApp** → Set up.

Meta will either attach an existing **WhatsApp Business Account** (WABA) or create one. A
test number appears straight away; it can only message five numbers you nominate, which is
enough for 1.8 and nothing else.

### 1.2 Pick the number — and understand the one-way door

Registering a number to the Cloud API the ordinary way **ends its use in the WhatsApp or
WhatsApp Business app on anybody's phone.** The chats on that phone do not come with it.

So:

- For the **institute's broadcast number**, use a fresh SIM, or a landline/IVR-capable
  number, or an old number nobody answers enquiries on. Do not use a counsellor's number.
- For a **counsellor's own number**, do not do this at all — that is Part 4
  (Coexistence), which keeps the phone and the chats.

WhatsApp Manager → **Phone numbers** → Add phone number, then verify by SMS or call.

### 1.3 The token — use a System User

Exactly as in `docs/ADS-SETUP.md` 1.3, and for the same reason: a token generated in the
Graph API Explorer expires in an hour or two and everything stops working at a moment
nobody is watching. A System User token does not expire.

Business Settings → **Users → System users** → your system user → **Generate new token**:

- App: your app
- Permissions: **`whatsapp_business_messaging`** and **`whatsapp_business_management`**

The first one sends messages. The second reads and creates templates — without it the
Templates screen will say it cannot reach Meta.

Also give that system user **Full control** of the WhatsApp Business Account under
Business Settings → Accounts → WhatsApp accounts → Add people. A token with the right
permissions over an account it has no role on still gets refused.

### 1.4 The two IDs

Both are in **WhatsApp Manager**, and both are ids, not phone numbers:

- **Phone Number ID** — on the number itself (App Dashboard → WhatsApp → API Setup shows
  it too). Every webhook delivery names this, which is how the CRM knows which number a
  message belongs to.
- **WhatsApp Business Account ID** — the account the number sits under. Needed for
  templates; sending works without it.

### 1.5 Paste it into the CRM

**Settings → Integrations → WhatsApp → Credentials:**

| Field | What goes in |
|---|---|
| App Secret | The same App Secret as the Meta integration |
| Verify Token | The same Verify Token as the Meta integration |
| Access Token | The system user token from 1.3 |
| Phone Number ID | From 1.4 |
| WhatsApp Business Account ID | From 1.4 |

**Yes, the App Secret and Verify Token are entered twice** — once under Meta, once under
WhatsApp, even though it is one app. They are stored separately on purpose: the day you
move WhatsApp to a different app or a different provider, nothing about Lead Ads needs
touching.

### 1.6 The webhook

App Dashboard → **WhatsApp → Configuration → Webhook → Edit**:

- Callback URL: `https://afd-crm-one.vercel.app/api/webhooks/whatsapp`
- Verify Token: the value you just saved

Save. Meta calls the URL immediately to check it answers; if it refuses, the Verify Token
in the two places does not match — that is the only cause.

Then **Manage** the fields and tick **`messages`**. That one field carries inbound messages
*and* delivery/read receipts; Meta puts both under it.

You do **not** need a template-status field: the Templates screen reads their status live
from Meta each time it loads.

### 1.7 Register the number in the CRM

**Settings → Integrations → WhatsApp → Numbers → Register your first number:**

- Label: something you'll recognise — "AFD main number"
- Phone number ID: from 1.4
- Number: the actual number, for display
- Whose phone: **Nobody — a shared number**
- What this number is: **API only**
- *A message from somebody new creates a lead*: **leave unticked**

That last box is the one to get right. On the broadcast number a reply is almost always
someone who tapped a button on a campaign and is already in the CRM. Replies from numbers
nobody has entered show up under **"Not in the CRM"** on the WhatsApp screen, where a
counsellor can look at them and decide — rather than filling the pipeline with noise.

### 1.8 Send yourself a test

While you are still on the test number, nominate your own mobile in App Dashboard →
WhatsApp → API Setup, then message the institute number from your phone.

Within seconds: **WhatsApp** in the sidebar shows the thread, and
**Settings → Integrations → WhatsApp → Recent deliveries** lists the delivery. That panel
is the answer to "is anything arriving?" — every delivery is written down before anything
is done with it, so an empty list is not missing data, it is the answer.

If your number is already a lead in the CRM, the reply attaches to that lead and their
counsellor gets a notification. That is the whole feature.

### 1.9 The 24-hour rule, which is Meta's and cannot be changed

A free-form message is only allowed within **24 hours** of the person's last message to
you. After that, the only thing you may send is an **approved template**. The CRM greys
the box out and says so rather than letting a counsellor type into a void.

Tell the team this plainly: *if they haven't messaged us today, you can only send a
template.* Every WhatsApp CRM in the world works this way and it surprises everyone once.

---

# Part 2 — Templates

A template is a pre-approved message. It is what makes the first contact, the fee
reminder and the class announcement possible at all.

### 2.1 Submit one from the CRM

**WhatsApp → Templates → New template.** It goes to Meta from here; you do not need
WhatsApp Manager for this. Name, language, category, body, optional header and footer, up
to three quick-reply buttons.

It comes back **PENDING** and becomes sendable when Meta approves — usually minutes,
occasionally a day. There is no way to hurry it, and the screen reads the real status from
Meta rather than guessing.

If Meta refuses, its own words are shown, because they name the actual rule broken far
better than a guess would: a duplicate name, a placeholder that doesn't start at `{{1}}`,
a body that ends on a variable.

### 2.2 What gets rejected

- **Category matters.** A fee reminder is *Utility*; "20% off Foundation batch" is
  *Marketing*. Marketing dressed as utility is the most common rejection, and repeat
  offences cost you quality rating.
- No promises about results ("guaranteed NID rank").
- Placeholders need surrounding words. `{{1}}` on its own line is refused.

### 2.3 Quality rating and limits

Meta scores your number on how people react. Blocks and reports drop the rating; a low
rating cuts how many people you may start conversations with per day, starting at 1,000 and
going up as you behave. Two things protect it:

- **Never message someone who did not ask to hear from you.** Opt-in is a real obligation,
  not a formality.
- The CRM honours **STOP** automatically — see **WhatsApp → Suppressions**. Anyone who
  opts out is excluded from every future broadcast, re-checked at the moment of sending
  rather than when the campaign was composed.

---

# Part 3 — Broadcasts, automations, and the once-a-day fact

Two features ride on the nightly job rather than sending immediately:

- **WhatsApp → Broadcasts** — a campaign to a filtered audience
- **WhatsApp → Flows** — automations that fire off a stage change, a missed payment, a
  new lead

Both are swept by the scheduled run at **10:00 AM IST** (04:30 UTC), in batches of **100
sends per run**.

**Read that twice if you are planning a campaign.** A broadcast to 400 people does not go
out in an afternoon — it goes out over four mornings. A "scheduled for 6pm Friday"
broadcast starts on Saturday's run. This is a hosting-plan consequence, not a design
choice: the plan allows one scheduled run a day. Running the sweep every few minutes is a
one-line change to `vercel.json` the day the hosting plan allows it, and nothing else has
to change with it.

Immediate, one-to-one replies from a counsellor are **not** affected — those send the
moment the button is pressed.

### The thing that silently stops all of it

The scheduled run needs a password called `CRON_SECRET` set on the hosting environment.
**If it is not set, every scheduled call is turned away and nothing overnight runs** — no
broadcasts, no automations, no ad spend, no fee reminders, no response-time sweep. Being
turned away is not an error, so nothing is recorded as failing.

Check **Settings → Platform health → The nightly run**. If it says no run has ever been
recorded, this is why, and it is the first thing to fix — before any of the above is worth
configuring.

Under that panel is **Run tonight's jobs now**. Use it after pasting in any credential on this
page: it runs the same ten jobs immediately and tells you what each one did, so a wrong token is
found in a minute instead of tomorrow. It is the real run, so it asks first.

---

# Part 4 — Counsellors' own numbers (Coexistence)

This is the one people assume is impossible. Until May 2025 it was.

**What it is:** one number running the **WhatsApp Business app** on a counsellor's phone
**and** Meta's Cloud API at the same time. They keep their number, their phone and their
chats. Everything they send and receive mirrors into the CRM, onto the right lead.

**What it is not:** an unofficial library driving WhatsApp Web (that breaks WhatsApp's
terms and what gets banned is the number your counsellor answers enquiries on), and not an
embedded WhatsApp Web window (WhatsApp sends a header that forbids it, and no setting on
our side can override another site's headers). Both dead ends are written up on
**WhatsApp → Personal numbers** in the CRM.

### 4.1 The counsellor's phone

The number must be on the free **WhatsApp Business app** — not ordinary WhatsApp. Same
number, same chats; it is a different app from the same company. Migrating is a few taps
and nothing is lost.

### 4.2 Onboard the number through Embedded Signup

In Meta's **Embedded Signup** flow, choose the **WhatsApp Business app** path (not "new
number"). The counsellor scans a QR code with their phone and is asked to **consent to
syncing message history**. They must say yes; without it the number still connects, but
nothing from before arrives.

If that path is not offered, the gate is usually one of: the app's business is not
verified, or WhatsApp permissions are still at Standard access rather than Advanced (Part
6). It is not something the CRM can start — this flow lives entirely in Meta.

### 4.3 Subscribe three more webhook fields

On the **WhatsApp Business Account** object, in addition to `messages`:

| Field | What it carries |
|---|---|
| `smb_message_echoes` | Messages the counsellor sends from their own phone |
| `history` | Up to 180 days of past one-to-one chats, in chunks |
| `smb_app_state_sync` | The phone's address book, recorded but deliberately not imported as leads |

**Without these the number connects and nothing mirrors.** No error, no clue — which is
precisely the failure this doc exists to prevent.

### 4.4 Register it in the CRM

**Settings → Integrations → WhatsApp → Numbers → Register another number:**

- Phone number ID: the Coexistence number's own id
- Whose phone: **the counsellor** — required, and it is who sent messages are attributed to
- What this number is: **Coexistence**
- *A message from somebody new creates a lead*: **ticked** (picking Coexistence ticks it
  for you)

Here the tick is right. A stranger messaging a counsellor's number about NIFT coaching is
the highest-intent enquiry the institute gets, and it goes through the same path as every
other source — an existing phone number attaches as a second enquiry rather than becoming
a duplicate, and the assignment rules pick the owner.

### 4.5 What arrives, and what never will

History lands in the following minutes and attaches to leads the CRM already holds. The
number's card shows the count and says when the sync completed.

- **Group chats never sync.** Meta does not send them.
- **The address book is not imported as leads.** Deliberately — a contact list is not a
  list of enquiries, and importing one would put 2,000 unassigned rows in your pipeline.
- Messages from people who are not in the CRM are kept against the delivery record, not
  turned into leads, unless that number is set to create them.

---

# Part 5 — Instagram DMs

Full walkthrough in `docs/ADS-SETUP.md` § 1.7b. In short, four things, and the first two
are the ones everybody forgets:

1. **On the phone**, with the account set to **Professional** and linked to the AFD
   Facebook Page: Instagram → Settings → **Messages and story replies → Connected tools →
   Allow access to messages**. Without this nothing is ever delivered and nothing errors.
2. **App Dashboard → Webhooks → Instagram** object (not Page) → subscribe **`messages`**,
   callback `https://afd-crm-one.vercel.app/api/webhooks/instagram`, same Verify Token.
3. **`instagram_manage_messages`** through App Review — same submission as everything else
   (Part 6).
4. **Settings → Integrations → Meta → Instagram Account ID**. Replies are sent with the
   Page Access Token you already saved.
5. **Press Subscribe Page again** on that screen. The Instagram account hangs off the Facebook
   Page, and the Page has to be subscribed to the `messages` field or nothing arrives. That
   subscription needs **`pages_messaging`** on the Page Access Token — a token made for leads
   alone does not have it, and Meta's refusal says so by name. Generate a Page token carrying
   `pages_messaging`, `instagram_basic` and `instagram_manage_messages`, save it, press again.

DMs then appear under **WhatsApp → Instagram** and can be answered from the CRM.

**An Instagram DM does not create a lead**, on purpose: most are a question, a reply to a
story, or nothing. Each conversation has a **Convert to lead** button for when it becomes a
real enquiry, and converting runs the same path as every other source. It asks for a phone
number, because Instagram never gives us one.

Instagram has its own 24-hour rule, identical in effect to WhatsApp's.

---

# Part 6 — App Review: one submission, not three

Until your app has **Advanced access** to these permissions, it only works for people with
a role on the app — which is enough to test everything above and nothing more.

Put all of it on **one** submission:

| Permission | What stops working without it |
|---|---|
| `whatsapp_business_messaging` | Sending any WhatsApp message |
| `whatsapp_business_management` | Templates — creating and reading them |
| `instagram_manage_messages` | Instagram DMs, in and out |
| `pages_messaging` | Subscribing the Page to `messages`, without which no DM is delivered |
| `instagram_basic` | Reading the linked Instagram account at all |
| `leads_retrieval` | Fetching a submitted lead's answers (already in review for Lead Ads) |
| `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` | Page subscription and lead delivery |
| `ads_read` / `ads_management` | Ad spend sync and retargeting audiences |

Also required, and worth starting first because it is the slowest: **Business
verification** in Business Settings → Security Centre. Meta wants documents proving AFD
India is a real registered business — GST certificate, utility bill, or similar matching
the business name and address exactly.

Reviews are usually days, sometimes longer, and a rejection names what to fix. A screen
recording of the CRM actually using the permission is the single most effective thing to
attach: Meta's reviewers are looking for "a real product uses this for a real reason", and
a twenty-second clip of a counsellor answering a WhatsApp reply on a lead's page says it
better than any paragraph.

---

# Part 7 — The order to do it in

Blockers first:

1. **Check `CRON_SECRET` is set** — Settings → Platform health. Nothing overnight runs
   without it, so configuring broadcasts before this is configuring nothing (Part 3).
2. **Start business verification.** It is the slowest step and everything else can proceed
   while it runs (Part 6).
3. **Part 1** — the institute's number, end to end, ending at a test message you can see
   in the CRM. Needs no review while you are testing with your own numbers.
4. **Part 5, steps 1, 2 and 4** — Instagram's webhook and the phone-side permission. Five
   minutes, and DMs from people with a role on the app arrive immediately.
5. **Submit App Review** with every permission from Part 6 at once.
6. **Part 2** — submit the three or four templates you actually use, while review runs.
   Template approval and App Review are separate queues and both take days; starting them
   together saves a week.
7. **Part 4** — Coexistence, one counsellor first, after WhatsApp permissions are
   Advanced. Do not onboard five numbers before you have watched one work.
8. **Part 3** — broadcasts and automations last, because they are the only part that can
   annoy 400 people in one morning if something is wrong.

---

## If something stops working

| What you see | Where to look first |
|---|---|
| No WhatsApp messages ever arrived | **Settings → Integrations → WhatsApp → Recent deliveries.** Empty means Meta has never called us: the `messages` field is not subscribed, or the callback URL is wrong |
| Messages arrive but a counsellor's own sends do not | The three Coexistence fields (4.3). `messages` alone does not carry echoes |
| History never arrived for a Coexistence number | Consent was declined during onboarding. It cannot be requested again afterwards — the number has to be re-onboarded |
| "Not in the CRM" filling up on the broadcast number | Expected. Replies from unknown numbers go there by design rather than becoming leads |
| A reply attached to the wrong lead | Two leads share a phone number. Merge them from the lead's page; the thread follows |
| Templates screen says it cannot reach Meta | `whatsapp_business_management` missing from the token, or the WhatsApp Business Account ID is not saved |
| A broadcast sits at "sending" for days | Working as built — 100 per daily run (Part 3) |
| Nothing overnight runs at all | `CRON_SECRET`. Settings → Platform health says whether a run has ever happened |
| Instagram DMs silent | Connected tools → Allow access to messages, on the phone. It is step 1 for a reason |
| Everything worked, then stopped two hours later | A Graph API Explorer token expired. Use a System User token (1.3) |

Every failure the CRM itself can see is listed on **Settings → Platform health**, and
platform alerts can be emailed to you — see chapter 13 of the manual.
