# AFD India CRM — Staff Handbook

**Who this is for:** everybody who uses the CRM. Counsellors, centre heads,
accounts, academics and administrators.

**How to use it:** Part 1 explains how the system thinks. Read it once — it is
short, and almost every "why can't I…" question is answered there. Then read
the part for your own role. The rest is reference.

---

## Part 1 — How this system thinks

Six ideas. If you understand these, the rest of the CRM stops being surprising.

### 1. A lead is a *person*, not an enquiry

Anjali fills in a form on Instagram, then walks into Kochi three weeks later,
then her father rings. That is **one lead and three enquiries**, not three
leads.

The CRM tries hard to work this out for itself using phone numbers and email
addresses. When it isn't sure, it puts the pair in **Leads → Merge review** for
a person to decide.

### 2. It never refuses a duplicate

If you enter somebody who is already in the system, it will **not** stop you.
It creates the record and flags the possible match for review.

This is deliberate. A system that rejects duplicates makes people give up and
keep the lead in a notebook — and a lead in a notebook is a lead that leaves
with whoever wrote it down.

### 3. Stage and temperature are two different things

| | |
|---|---|
| **Stage** | Where they are in the funnel — New, Contacted, Demo Scheduled, Admitted… |
| **Temperature** | How keen they are — Hot, Warm, Cold, Dead |

They move independently. Somebody can be **Hot** at *Demo Scheduled* and
**Cold** at *Demo Scheduled*. Set both honestly; the reports depend on it.

### 4. There are two gates, and they are one-way

```
Marketing  →   SALES   →  ACCOUNTS  →  ACADEMICS
              (a lead)   (enrolment)   (a student)
                      ↑             ↑
                  Gate 1        Gate 2
            counsellor        first payment
            confirms the      clears
            admission
```

- **Gate 1 — confirming the admission.** The counsellor's work on that lead
  stops. The record becomes a commercial one: course, fee, discount, plan.
- **Gate 2 — the first payment clearing.** A **student** record is created.
  Academics take over.

Neither gate can be walked back without an administrator. Confirm an admission
when it is *actually* agreed, not when it looks likely.

You can see how long people are spending between the gates on the
**Handovers** screen.

### 5. Nothing is ever deleted

"Delete" means hidden. Every record keeps its history, and every change writes
a line to an audit log with your name on it.

This is not surveillance — it is so that "who changed this fee?" and "when did
she ask us to stop messaging her?" always have an answer.

### 6. You see what your role lets you see

A counsellor sees their own leads. A centre head sees their centre. An
administrator sees everything. This is enforced by the database itself, not
by hiding buttons — you cannot reach another counsellor's lead by guessing a
web address.

---

## Part 2 — Your first day

### Signing in

Your administrator creates your account and sends you an email. Sign in with
your email and password.

If you are sent back to the login screen repeatedly, your session has expired —
sign in again. If it keeps happening, tell your administrator.

### The screen

- **Left sidebar** — the sections you have access to. If a section isn't there,
  your role doesn't include it. That's normal, not a fault.
- **Top right** — the notification bell, and your own menu.
- **Everything else** — the screen you're on.

### The screens, in one line each

| Screen | What it is for |
|---|---|
| **My Day** | Your work queue. Start here every morning. |
| **Dashboard** | Numbers for your role. |
| **Leads** | Everybody in the pipeline. Search, filter, open. |
| **Pipeline** | The same people as a drag-and-drop board by stage. |
| **Accounts** | Confirmed admissions and their fees. |
| **Students** | People who have paid and started. |
| **Batches** | Class groups, and who is in them. |
| **Finance** | The institute's own money — income, expenses, banking. |
| **WhatsApp** | Inbox, templates, broadcasts, automations, opt-outs. |
| **Insights** | Slice the data any way you like. |
| **Ad Performance** | What the advertising actually bought. |
| **Handovers** | How long admissions take to clear each gate. |
| **Ask AI** | Ask a question about the data in plain English. |
| **Settings** | Everything an administrator configures. |

---

## Part 3 — If you are a counsellor

Your job in the CRM is: **work your queue, log everything, and be honest about
temperature.**

### Every morning: My Day

Four lists, in the order you should work them:

1. **Overdue** — you said you'd follow up and the date has passed. Clear this
   first, every day.
2. **Due today** — your follow-ups for today.
3. **New assignments** — leads that arrived and were given to you.
4. **At risk** — leads that have breached the response-time target. Somebody
   is waiting on you and has been for too long.

### Working a lead

Open a lead and you get: their details, their **timeline**, their WhatsApp
thread, their profile form, their fees and their files.

**After every real contact — every call, every message, every walk-in —
log it.** Use *Log interaction*, and always set the **next follow-up date**.

The next follow-up date is what puts them back in your My Day. A lead with no
next action is a lead nobody will ever ring again.

### Phone numbers

In a **list** you see a masked number: `+91 98••••3456`.
On the **detail page** you can reveal the full number — and revealing it is
recorded against your name.

This is not distrust of you. Counsellors leave, and lead databases leave with
them; a masked list is what makes bulk copying visible.

### Temperature

Set it honestly, and change it when it changes. It drives your queue ordering,
the forecast and the marketing budget. A pipeline where everything is "Warm"
tells nobody anything.

### Confirming an admission (Gate 1)

When the family has genuinely agreed: **Confirm admission** on the lead.

You'll enter the course, mode, academic year, fee and any discount. Once
confirmed, the lead stops being sales work and becomes an admission that
accounts owns.

### Discounts

You have a limit — a percentage, an amount, or both. The screen tells you what
yours is.

- **Within your limit** — it applies straight away.
- **Above your limit** — it is recorded as a *request* and the student still
  owes the full fee until somebody with the authority approves it.

That last point matters: an unapproved discount is **not** quietly reducing the
bill. Don't promise it to the family until it's approved.

**Offers are different.** If the institute is running "Early Bird 10%", pick it
from the **Offer** dropdown. Offers are pre-approved — you can apply one however
large it is, because the institute already decided on it. Typing *more* than the
offer still needs approval.

---

## Part 4 — If you are a centre head

Everything in Part 3, plus:

- **You see your whole centre**, not just your own leads.
- **Leads → Orphans** — leads at your centre with nobody assigned. Nobody is
  working these. Assign them.
- **Leads → Merge review** — possible duplicate people. Merge or dismiss.
- **Dashboard and Insights** are scoped to your centre.
- **Handovers** shows your centre's gate lag, and who is confirmed but unpaid.
- You may be able to **approve discounts** up to your own limit. You cannot
  approve one larger than you could have given yourself — that is deliberate,
  or the limits would mean nothing.

---

## Part 5 — If you are in accounts

### The queue

**Accounts** lists every confirmed admission. Open one to see the fee, the
discount, the instalment plan and everything paid so far.

### Recording a payment

Record it against the admission with the amount, date, method and reference.

**The first payment that clears is Gate 2.** A student record is created
automatically and academics take over. You do not do anything extra to make
that happen.

### Giving somebody a receipt

Every payment gets a receipt number automatically. To print one, open the
admission and **click the receipt number** in the payments table — it opens a
receipt on your letterhead with the amount, the amount in words, the balance
remaining and your centre's phone number, ready to print or save as a PDF.

Printing it again changes nothing. The tenth copy is identical to the first, so
"can you send that again?" is never a problem.

A reversal prints too, marked clearly as a reversal rather than as a receipt for
money received.

### The ledger is append-only

**A payment is never edited and never deleted.** If something is wrong, record
a **reversal** referencing the original. Both lines stay.

This will feel like extra work the first time. It is the reason the accounts
can be trusted a year from now, and it is how every real accounting system
works.

Receipt numbers come from the database and are gapless. Never write one by
hand.

### Collections

**Finance → Collections** shows who is late and by how much. Overdue reminders
also go out automatically on a ladder an administrator sets up.

### Approving discounts

If a counsellor requested a discount above their limit, it appears for
approval. Approve or reject it — and remember the student is being billed the
**full** fee until you do.

### Institute money

**Finance** covers the institute's own income and expenses, bank and cash
accounts, monthly and yearly reports and cash flow. This is separate from
student fees.

> **Before you trust any balance:** an administrator must set the opening
> balances for each bank and cash account. Until that is done, every balance is
> wrong by a fixed amount.

---

## Part 6 — If you are in academics

- **Students** — everybody past Gate 2. Their profile, course, batch and
  contact details.
- **Print** a one-page student profile from their record.
- **Batches** — create class groups and put students in them. Moving somebody
  between batches keeps the history: "she was in the morning batch until
  August" stays answerable.
- A batch **over capacity warns you, it does not stop you.** Real classes take
  one more student; a system that refuses just gets worked around.

---

## Part 7 — WhatsApp

Everything here goes through the institute's one WhatsApp Business number.

### The rules WhatsApp itself imposes

- **Outside 24 hours you can only send an approved template.** If somebody
  messaged you within the last 24 hours you can reply freely; after that, only
  a template Meta has approved.
- **Templates take time to approve.** Write them in **WhatsApp → Templates**
  and Meta usually reviews within minutes.

### Broadcasts

**WhatsApp → Broadcasts → New broadcast.**

1. **Who it goes to** — leads or students, filtered by any variable, exactly
   like Insights.
2. **Check the audience** — always. It tells you how many people, names a few,
   and admits how many were dropped for having no number.
3. **What it says** — pick a template. Each blank is either the same words for
   everybody, or **that person's own details**: first name, course, centre,
   their counsellor, amount due.
4. Every variable needs a **fallback** — what to say when we don't have it.
   WhatsApp rejects a message with an empty blank.
5. **When it goes out** — straight away, or at a time you set.

You can **stop** a broadcast at any point, including mid-send.

### Automations

**WhatsApp → Automations.** A numbered list of steps a lead walks down: send a
template, wait two days, send another — and **wait for their reply** and go
somewhere different depending on which button they pressed.

- Steps keep their numbers forever. Deleting step 3 leaves a gap on purpose,
  because branches point at numbers.
- An automation stays **off** until you switch it on, and it won't switch on
  until it passes a check.
- Switching one **off** stops new people entering. People already
  mid-conversation finish. Stopping them is a separate button.

### Opt-outs — the one rule with no exceptions

If somebody replies STOP, they are added to the suppression list and **nothing
will ever message them again** — not a broadcast, not an automation, not a fee
reminder.

Do not work around this. A number that ignores opt-outs loses its quality
rating and eventually its access, and that is the whole institute's marketing
gone.

The same applies to a lead marked **do not contact**.

---

## Part 8 — Reports

Insights has five tabs. They answer different questions and it is worth knowing
which is which.

| Screen | The question it answers |
|---|---|
| **Insights → Explore** | Anything. Pick variables, filter, group. Same grammar as broadcast audiences. |
| **Insights → Sources** | Which sources bring people in, and which ones close them? |
| **Insights → Timing** | How long do people take to decide, and is this month genuinely worse or just younger? |
| **Insights → Segments** | Which districts and schools actually enrol — not which send the most enquiries. |
| **Insights → Targets** | Is this month on course? |
| **Ad Performance** | What did each campaign cost, and what did it actually bring in? |
| **Handovers** | Who is confirmed but unpaid right now, and how long do admissions take? |
| **Finance → Reports** | Monthly, yearly, cash flow, collections, timeliness. |
| **Ask AI** | A plain-English question. Admins and co-admins only. |

Five things worth knowing about the numbers:

- **Recent months always look worse than they are.** An enquiry from last week
  hasn't had time to enrol. Ad Performance says so on screen, and Timing is the
  screen built to correct for it.
- **Handovers reports medians, not averages.** One admission that took eight
  months would otherwise make it look like every handover is broken.
- **A dash is not a zero.** On Timing it means that month hasn't lived long
  enough for the number to exist yet. On Segments it means fewer than eight
  leads — the counts are still true, it is the percentage that would mislead,
  because one enrolment out of two reads as 50%.
- **On Sources, the two columns do not add up, and are not supposed to.** Somebody
  who found us on Instagram and enrolled after walking in counts once in
  Instagram's *started* column and once in Walk-in's *finished* column. Cutting
  a source because it doesn't close is how you lose the source that introduces
  everybody.
- **On Targets, the rows do not add up either.** An admission at Kochi counts in
  Kochi's row, in the counsellor's row and in the institute's. Three statements
  about the same month, not a total.

### Reading the Targets screen

Two numbers, deliberately not merged into one:

- **On course for** — your current rate carried to the end of the month. Useful
  from about the 5th; before that it is one good week multiplied by six, and the
  screen says so.
- **Open pipeline worth** — every lead still in play, counted at its stage's own
  chance of closing. A lead at Demo Scheduled at 60% counts as 0.6.

When those two disagree, that is the thing to act on. A good rate on an empty
pipeline is a month that ends badly, and you can see it on the 14th instead of
the 30th.

If a stage shows "not set" under Chance, nobody has given it a probability yet
and its leads are being counted as worth nothing. An admin fixes that in
Settings → Pipeline Stages.

---

## Part 8b — Printing anything

Press **Ctrl+P** (⌘P on a Mac) on any screen and it prints on your letterhead —
your logo, address and phone at the top, the date printed at the bottom. The
menus, buttons and filter boxes are left off automatically.

This works for the reports as well, so a number somebody asks for in a meeting
can go on paper without anybody copying it into a document first.

Wide tables that scroll sideways on screen are left out of the printout on
purpose: they would print their first few columns and silently lose the rest,
which is worse than not printing them at all.

If your documents print with just your name and nothing else, an administrator
has not filled in **Settings → Organisation** yet.

---

## Part 9 — Rules that apply to everybody

1. **Log every real contact**, and always set the next follow-up date.
2. **Never share your login.** Every action is recorded against a person.
3. **Never work around an opt-out or a do-not-contact flag.**
4. **Confirm an admission only when it is actually agreed.** Gate 1 is one-way.
5. **Never promise an unapproved discount.**
6. **Correct a payment with a reversal**, never by editing.
7. **Set temperature honestly.** Everything downstream depends on it.

---

## Part 10 — When something looks wrong

| What you see | What it usually means |
|---|---|
| A section is missing from the sidebar | Your role doesn't include it. Ask your administrator. |
| "You don't have permission to do that" | The same. The button was reachable; the action wasn't. |
| A lead you expected isn't in your list | It is assigned to somebody else, or at another centre. |
| Two records for the same person | Expected. Send it to Merge review. |
| A broadcast says people were skipped | They had no number, or they have opted out. Both are correct. |
| A WhatsApp message failed | Usually the template, or the person is outside the 24-hour window. |
| A fee balance looks wrong | Check for a reversal, and check the opening balances were set. |
| The AI says it can't answer | It only answers from a fixed set of questions. Rephrase, or use Insights. |

Anything else: **screenshot it, note what you clicked, and send it to Leon.**
Nothing you do in this system is unrecoverable, and everything is logged — so
report it rather than working around it.

---

## Glossary

| Word | Meaning here |
|---|---|
| **Lead** | A prospective student. The *person*, not the enquiry. |
| **Enquiry** | One inbound event. Many enquiries, one lead. |
| **Stage** | Position in the funnel. |
| **Temperature** | How keen they are. Independent of stage. |
| **Gate 1** | The counsellor confirms the admission. Sales stops. |
| **Gate 2** | The first payment clears. A student is created. |
| **Enrolment** | The commercial record: course, fee, discount, plan. |
| **Student** | The academic record, created at Gate 2. |
| **First-touch source** | Where they came from originally. Never overwritten. |
| **Last-touch source** | The most recent source before converting. |
| **Template** | A pre-approved WhatsApp message. |
| **Broadcast** | One template sent to a filtered group. |
| **Automation** | A sequence of steps a lead walks down. |
| **Offer** | A pre-approved discount. Needs no sign-off. |
| **Suppression** | Somebody who said STOP. Never messaged again. |
| **SLA** | The response-time target for a stage or source. |
