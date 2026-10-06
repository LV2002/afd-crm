# Chapter 10 — Chats: WhatsApp and Instagram

**Chats** in the sidebar (`whatsapp.read`). The route is still
`/whatsapp` — only the name changed, so old bookmarks still work.

Across the top are three **channels**:

| Channel | What it is |
|---|---|
| **WhatsApp Business** | The institute's one WhatsApp Business API number |
| **Personal WhatsApp** | An explanation, and how to put a counsellor's own number in the CRM — see 10.6 |
| **Instagram** | DMs to the institute's Instagram account |

Under the WhatsApp Business channel there is a second row of tabs —
**Inbox**, **Templates**, **Broadcasts**, **Automations**, **Opted out** —
which apply only to that channel.

## 10.1 What the WhatsApp number is for

**It is a broadcasting channel, not a way in.** Enquiries reach
counsellors on their own phones and are typed into the CRM by hand. This
number sends campaigns and receives the replies to them.

So: **an inbound WhatsApp message never creates a lead.** It is matched to
a lead that already exists by phone number, or filed with no lead at all.
A reply from somebody nobody has entered is real and worth seeing, but it
is not an enquiry.

## 10.2 The inbox

Left: the list of conversations. Right: the selected thread.

**Filters**: **All**, **Needs a reply**, and **Not in the CRM** (replies
from numbers that match no lead — visible to whoever runs campaigns).

**The counsellor switcher** appears for centre heads, co-admins and
admins when there is more than one counsellor to choose between:
**Everyone**, each counsellor by name, and **Unassigned**. It grants no
extra access — it only sorts conversations you could already see.

A matched thread shows a masked number; an unmatched one shows it in full,
because the number is the thread's only identity and the thing you would
copy into a new lead.

### Procedure: reply to a WhatsApp message

**Goal** — answer somebody who has written in.

**Before you start** — `whatsapp.send`, and a thread matched to a lead.

**Steps**
1. Open **Chats**.
2. Pick the conversation.
3. Type your reply and press **Send**.

**What you should see** — your message in the thread, with a delivery
status.

**The 24-hour rule.** A free-form reply is only allowed within 24 hours of
their last message — that is Meta's rule, not the CRM's. Outside it you
can only send an approved **template**. The box tells you which situation
you are in.

**Common mistakes**
- *Trying to start a conversation from here.* Outside a 24-hour window
  you need a template (10.3).
- *Replying to an unmatched thread.* You cannot — there is no lead to
  record the message against. Add them as a lead first.

## 10.3 Templates

**Chats** → **Templates** (`whatsapp.campaign`).

Templates are messages **Meta has approved in advance**. They are the
only thing you can send to somebody outside the 24-hour window.

The screen lists the templates on the account with their language and
name (for example `fee_reminder`, `en`). **New template** creates one.

**You cannot write a template and send it immediately** — Meta reviews
them, usually within a day. Plan campaigns around that.

### Procedure: send a template to one person
1. Open the lead, or the conversation.
2. Choose **Send template**.
3. Pick the template and its **Language code**.
4. Fill in any `{{1}} value (optional)` placeholders.
5. **Send**.

## 10.4 Broadcasts

**Chats** → **Broadcasts** (`whatsapp.campaign`). A template sent to many
people at once.

### Procedure: send a broadcast

**Goal** — message a group of leads, for example a batch reminder.

**Before you start** — `whatsapp.campaign`, and an approved template.

**Steps**
1. **Chats** → **Broadcasts** → **New broadcast**.
2. **Who gets it** — narrow the audience. **Every lead field is a
   filter**: stage, lead source, interested exams, education status,
   temperature, centre, district, exam year and any custom field an
   administrator has added. They are ANDed — *stage is Counselling Done*
   **and** *source is Meta* means both. The form shows how many people
   match; check that number before going on.
3. **What it says** — *Choose an approved template* and fill in any
   placeholder values.
4. **When it goes out** — now, or pick a date and time.
5. Press **Schedule** (the button shows the recipient count).

**What you should see** — the broadcast is listed with its audience size
and status, and each recipient's delivery is tracked.

**Common mistakes and fixes**
- *Not checking the count.* "Everybody" is rarely what you meant.
<!-- only: staff -->
- *Expecting a broadcast to go out the moment you press Send.* **It does
  not, and "now" is no different from "scheduled"** — pressing Send
  queues the recipients and a sweep sends them, which takes a few
  minutes. If one has to leave this minute, ask an administrator.
<!-- /only -->
<!-- only: admin -->
- *Expecting a broadcast to go out the moment you press Send.* **It does
  not, and "now" is no different from "scheduled"** — pressing Send
  queues the recipients, and a sweep does the sending. With the
  ten-minute schedule set up (`docs/CRON-SETUP.md`) that is within ten
  minutes; without it, a broadcast created at 2pm leaves at 10:00 the
  next morning.
  To send one immediately, whatever the schedule: **Settings → Platform
  health → Send anything that is waiting**.
<!-- /only -->
- *Messaging people who opted out.* You cannot — they are excluded
  automatically (10.5).

## 10.5 Opted out

**Chats** → **Opted out** lists everybody who has asked not to be
messaged. Somebody replying STOP is added automatically; you can also add
one by hand with **Record an opt-out** (for example *Asked at the front
desk*).

An opted-out number is excluded from every broadcast and automation, and
from retargeting audiences. This is not a preference — treat it as
absolute.

## 10.6 Personal WhatsApp — why it is not an inbox

This tab explains, rather than showing conversations. The short version:

**There is no legal way to put a counsellor's personal WhatsApp inside
the CRM.** Every tool that claims to drives WhatsApp Web through a
reverse-engineered protocol, which breaks WhatsApp's terms. What gets
banned is **the number** — the line the counsellor answers enquiries on —
permanently, with no appeal. An iframe of WhatsApp Web does not work
either: WhatsApp sends a header that forbids it.

The supported answer is **Coexistence**, and the CRM now does it: one
number running the WhatsApp Business app and the Cloud API at the same
time, mirroring messages both ways. The counsellor keeps their phone,
their number and their chats.

<!-- only: admin -->
## 10.6a Coexistence — a counsellor's own number in the CRM

This is the one that stops the typing. A counsellor's number joins the
institute's WhatsApp account, keeps working exactly as it does today on
their phone, and every one-to-one conversation on it appears in the CRM
against the right lead.

### What it does

- **Messages they send from the phone** appear in the lead's thread,
  marked as theirs.
- **Messages a student sends them** arrive the same way — and on this kind
  of number a message from somebody not yet in the CRM **creates a lead**,
  assigned to them. On the institute's broadcast number it does not,
  because a reply there is somebody who pressed a button on a campaign.
- **Up to 180 days of past chats** sync across in the minutes after
  setup, attached to the leads the CRM already holds, keeping their own
  dates so a March conversation reads as March.

### What it does not do

- **Group chats never sync.** Nor do disappearing messages or live
  location, and broadcast lists in the app become read-only.
- **The phone's address book is not imported.** Meta sends it; the CRM
  records that it arrived and creates nothing from it. A counsellor's
  contacts are their dentist and their landlord as much as any
  prospective student.
- **Messages they send to somebody who is not a lead** are not stored.
  Only conversations with people the CRM holds.
- **It is the WhatsApp Business app**, not ordinary WhatsApp. A counsellor
  on the consumer app moves to the free Business one — same number, same
  chats.

### Setting one up

Steps 1–3 happen in Meta and need an administrator with access to the
business account; step 4 is in the CRM. **Settings → Integrations →
WhatsApp** lists all four on screen.

1. The counsellor installs the **WhatsApp Business app** on that number.
2. Onboard the number through Meta's **Embedded Signup**, choosing the
   WhatsApp Business app flow. The counsellor scans a QR code and consents
   to syncing history.
3. Subscribe three extra webhook fields on the WhatsApp Business Account:
   `smb_message_echoes`, `history` and `smb_app_state_sync`. **Without
   these the number connects and nothing mirrors** — which looks exactly
   like the feature not working.
4. In the CRM, register the number under **Settings → Integrations →
   WhatsApp → Numbers**: its **Phone number ID** from Meta, a label, whose
   phone it is, and *Coexistence*.

**What you should see** — the number's card says whether history has
finished arriving and how many past messages it attached. A delivery for a
number nobody registered shows up on **Recent deliveries** saying so, with
what to do about it.

### Tell the counsellors

Admissions conversations on that number become visible to their centre
head, the same way a shared inbox is. That is reasonable for work on a
business number and it is not a surprise anybody should get afterwards.

Group chats and anything on a different number stay private — the sync is
one-to-one business conversations only.

<!-- /only -->
## 10.7 Instagram DMs

**Chats** → **Instagram**.

**An Instagram DM does not create a lead.** Most are a question, a reply
to a story, or nothing, and a CRM that turned each one into a lead would
stop being a record of who is enrolling.

### Procedure: turn a DM into a lead

**Goal** — promote a real enquiry out of the inbox.

**Before you start** — `lead.create`, and the conversation open.

**Steps**
1. Open **Chats** → **Instagram** and pick the conversation.
2. In the **Not a lead yet** panel, check the **Name** (pre-filled from
   their profile where Instagram gives us one).
3. Type their **Phone**. You have to ask them for it — Instagram never
   gives us a number.
4. Press **Convert to lead**.

**What you should see** — either *Lead created and linked to this
conversation*, or, if that number is already in the CRM, *This person was
already in the CRM — the conversation is now linked to their existing
lead*. Either way you get one record, not two, and your assignment rules
choose the counsellor.

**Notes**
- Replies obey the same **24-hour rule** as WhatsApp.
- Attachments are recorded by link, and Instagram's links expire, so an
  old one may be dead. Open Instagram itself for those.
- A message sent from the Instagram app on a phone does not appear in the
  CRM.
- Until Instagram is connected (an administrator's job, Chapter 13), the
  tab explains what is missing instead of showing an empty inbox.

**Who sees which conversations** — once converted, the conversation
follows its lead's ownership. Before that it is visible to anyone who
works the inbox, because a DM is addressed to the institute, not to a
counsellor, and somebody has to answer it.

<!-- only: admin -->
## 10.8 Automations

**Chats** → **Automations** (`whatsapp.campaign`). A sequence that runs
by itself when something happens.

**What can start one**: a lead being created, a lead entering a stage, a
tag being added, an inbound keyword, or starting it by hand.

**Who it then goes to** — *Only for these leads* narrows it further, with
the same point-and-click conditions as the assignment rules: stage, lead
source, interested exams, education status, temperature, centre,
district, exam year. The trigger decides **when** a run starts; this
decides **for whom**.

> This is how you run one automation per audience without one automation
> per combination. *A lead enters Counselling Done* **and** *source is
> Meta* **and** *education status is 12th* is one automation, not a tag
> somebody has to remember to apply by hand.

Leave it empty and the automation reaches everybody the trigger fires
for, which is what every automation built before this did.

**What a step can be**: send a template, wait, wait for a reply, add a
tag, set a stage, notify the owner, or stop.

The editor has **The steps**, **Settings**, and **Who has been through
it** so you can see what the automation has actually done.

### Procedure: build a simple follow-up automation
1. **Chats** → **Automations** → **New automation**.
2. Give it a name, for example *NIFT enquiry follow-up*.
3. Choose the trigger — *Pick a stage* or *Pick a tag* as appropriate.
   Then, if this sequence is only for some of them, add conditions under
   *Only for these leads*.
4. Add steps: a template, a wait, a wait-for-reply with answers
   (*Add an answer*, e.g. *Yes, interested*), and what each answer does.
5. Use **If unknown, say…** for replies that match nothing.
6. Save, then activate it.

**Common mistakes**
- *Leaving it active while testing.* Real leads will receive it.
- *A wait shorter than the sweep interval.* An automation only advances
  when the sweep runs — **including its first step**, so on a once-a-day
  schedule a lead who enquires at 11am hears nothing until 10:00 the next
  morning. With the ten-minute schedule in `docs/CRON-SETUP.md` the first
  message is prompt and a wait of an hour means something. Without it,
  the smallest meaningful wait is about a day.
- *No stop condition.* Always give somebody a way out of the sequence.
- *Narrowing it so far nobody matches.* The automation list shows an
  **Only:** line under the trigger for every automation that has
  conditions — read it back and check it says what you meant.

<!-- /only -->
---

[Back to contents](#contents)
