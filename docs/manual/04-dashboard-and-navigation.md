# Chapter 4 — The dashboard, navigation and notifications

## 4.1 What the dashboard is

The **Dashboard** is your landing page and it is two things at once: your
**work queue** (what to do now) and your **numbers** (how you are doing).
It is assembled from widgets, and which widgets you see depends on your
role.

`/my-day` is an old address for the work queue. It redirects to the
Dashboard; the queue itself moved to **Follow-ups** in October 2026, at
the top of the screen, above the dated list.

[Screenshot: The Dashboard for a counsellor, showing Your numbers and Quick links]

## 4.2 The widgets

Seven widgets exist. An administrator chooses which appear for each role
and in what order (Settings → Dashboards), but a widget can never be given
to a role that lacks the underlying permission — it would show a card of
zeroes, which is worse than showing nothing.

| Widget | What it shows | Needs |
|---|---|---|
| **Quick links** | Add a lead, today's follow-ups, log an interaction, view all leads | `lead.read` |
| **Your numbers** | This month's leads, admissions and follow-ups due, then the whole cycle year to date | `lead.read` |
| **Centre pipeline** | The same three, for the whole centre, plus what nobody is working | `lead.assign` |
| **Counsellor performance** | Each counsellor's active leads, new leads, admissions, overdue follow-ups | `report.center` |
| **Accounts** | Waiting for a first payment, collected this month, overdue instalments | `payment.read` |
| **Students** | Active students, who joined this month | `student.read` |
| **Administration** | Users, centres, integration health, anything broken | `settings.manage` |

### Your numbers, in detail

**Three big figures, then the year.** Three are large: **total leads this
month**, **admissions this month** and **follow-ups due**. Under each of
the first two is last month's figure and the shape of the last fortnight,
because a number on its own cannot tell you whether it is a good month.

- **The arrow and the sentence say the same thing.** *Up 3 on last month
  (9)* — you never have to read the colour to know which way it went.
- **The little chart is shape, not detail.** It has no numbers on purpose;
  the figure beside it is the value.
- **Follow-ups due** is overdue follow-ups plus leads nobody has ever
  answered. It turns red when it is above zero, because zero is the
  target.
- **The 30-day chart** is new leads per day. Hover any day for the count.
  A flat stretch is a real answer: that is a week nothing came in.
- **Against target** appears only if somebody has set you one (Settings →
  Targets). The line across the bar is where an even month would have you
  today — not a judgement, just the pace.

#### Your year so far

The row underneath is the **admissions cycle year to date**, not the
month. **Press any tile and the chart above redraws for it** — New leads
is where it starts, which is what the chart always showed. It starts in the month set under Settings → Organisation →
**Year starts in** (April by default; set it to your intake month if
that is what you count by), and the card prints the date it started
from.

| Tile | What it counts |
|---|---|
| **Active leads** | Arrived this year and still being worked — not won, not lost |
| **New leads** | Everybody who arrived this year |
| **Contacted** | Of those, the ones answered at least once |
| **Never contacted** | Of those, the ones never once answered |
| **Overdue follow-ups** | Of those still active, a follow-up date that has passed |
| **Interested** | Of those still active, temperature Very Hot, Hot or Warm |
| **Enrolments** | Admissions confirmed this year |
| **Admission rate** | This month's running rate — the one tile that is not about the year |

Two things worth knowing about these:

- **Contacted and never contacted always add up to new leads.** Every
  tile but Enrolments is about leads that *arrived* this year, which is
  what lets the row be read as one population rather than seven
  unrelated numbers.
- **Enrolments count by the date the admission was confirmed**, not by
  when the lead arrived. An admission confirmed in June on a lead from
  February is June's work, and it counts here.

**What the chart is, when a tile is selected.** It is not history. The
CRM keeps no daily record of what a lead's temperature or stage *was*,
so "Interested on 3 June" does not mean "was interested on 3 June". It
means **arrived on 3 June and is interested today** — the caption under
the chart says so each time.

That is the more useful question anyway: a week whose leads all went
cold shows as a dip in Interested while New leads stayed flat, which is
exactly the week worth asking about. Enrolments is the one exception, and
counts by confirmation date, matching its tile.

**Admission rate is not selectable.** It is this month's running
percentage, not a count of anything per day, so there is no honest line
to draw for it.

**Interested** is Very Hot, Hot or Warm. If you add a new temperature
meaning something similar, tell whoever maintains the CRM — it will not
be counted until it is added to the list in the code.

## 4.3 Monitoring your counsellors

Anyone who can read another person's reports — a centre head, co-admin
or admin — gets a row of **chips under the Dashboard heading**:
**Overview**, then one per person. With one centre it is a single row.
With two or more, each centre gets its own line with its name on it.

Pressing a name opens that person's page, which has four things in the
order you would read them:

| Card | What it answers |
|---|---|
| **Their numbers** | The same card they see, with their name on it — this month, and the cycle year |
| **Their day** | What is on their desk right now: overdue, due today, new, at risk |
| **Open tasks** | What they have been asked to do, soonest first. Each links to its lead |
| **Their pipeline** | Every lead assigned to them, by stage as bars, and by temperature |

A few things worth knowing:

- **Counsellors do not see this.** It needs *View centre reports*, which
  a counsellor holds only over their own work. It is not a bar for
  looking sideways at a colleague.
- **You only see the people you are allowed to see.** A centre head gets
  their centres' staff; an admin gets everybody. Typing a user id from
  another centre into the address bar gives the same "not found" as
  typing nonsense.
- **Somebody at two centres appears under both.** Deliberately — if you
  are scanning "who is at Kannur", the person who splits their week
  belongs in that list.
- **The bars are shares of that person's own pipeline**, so two
  counsellors' bars are not comparable to each other. The counts beside
  them are.

## 4.4 Your day — now on Follow-ups

The work queue moved to the top of **Follow-ups** in October 2026. It was
the right content in the wrong column: a long list in the Dashboard's
narrow right-hand side, squeezing the numbers beside it. It now sits
above the dated follow-up list, which is the same question asked over a
longer horizon. The **Today's follow-ups** quick link goes straight to it.

Four buckets, in the order you should work them:

| Bucket | Meaning |
|---|---|
| **Overdue** | Past their follow-up or task date |
| **Due today** | Before the day is out |
| **New** | Assigned to you and not contacted yet |
| **At risk** | Hot with no next step, or an SLA breach |

Leads that are **won or lost** are excluded — they need no daily
attention.

**At risk** is the one worth understanding. A lead lands there when it is
marked Hot but has no next follow-up booked, or when it has breached its
stage's response-time target. Both mean the same thing in practice:
somebody who matters is about to be forgotten.

## 4.3 The red badges in the sidebar

Five sidebar entries carry a red count. Each is a queue somebody is
supposed to empty, which is why only these five have one — a number on
Insights would be a number nobody can work down.

| Badge | Counts |
|---|---|
| **Unassigned** | Leads nobody owns yet |
| **Admissions** | Admissions confirmed but with no first payment |
| **Students** | Students waiting to be onboarded |
| **Chats** | Conversations waiting for a reply |
| **Student Profile Forms** | Submitted forms nobody has read |

The counts respect your scope: a counsellor's Chats badge is their own
threads, a centre head's is their centre's.

## 4.4 Notifications

### Where they appear
In the bell at the top of the screen, and in full at **Notifications**.
Some events also send an email, if email is configured and your role is
set to receive that event.

### What you get told about
Nineteen things can notify somebody, and which of them reach *you*
depends on your role and on what an administrator has configured
(Chapter 13). The ones most people see:

| You are | You hear about |
|---|---|
| A counsellor | A lead assigned to you · a WhatsApp reply from one of your leads · an SLA breach on one of your leads · a discount you asked for being approved or rejected · a payment on an admission you sold, or one being reversed · the course, batch or fee of one of your students changing |
| A centre head | Everything above for your centre, plus every new lead arriving — including ones no rule could assign · SLA escalations · admissions confirmed and dropped · discounts waiting on you |
| Accounts | Admissions confirmed and waiting for a fee · payments recorded · payments reversed or refunded · instalments overdue · a fee or a course changing |
| Academics | A student joining, ready to onboard · a student moving course or batch · an admission dropped |

Two rules hold everywhere. **You are never told about your own action** —
confirming an admission does not notify you that it was confirmed. And
**you are never told about a lead you could not open**: a Kannur centre
head hears nothing about Kochi.

### Procedure: clear your notifications

**Goal** — stop the bell counting things you have already dealt with.

**Before you start** — nothing.

**Steps**
1. Open **Notifications** (the bell, or the address `/notifications`).
2. Use the **All** filter to switch between everything and the unread.
3. For a single item, press **Open** to go to the record it is about, or
   **Mark read** to leave it where it is.
4. **Dismiss** removes it from your list entirely.
5. **Mark all read** clears the lot.

**What you should see** — the bell count drops.

**Common mistakes**
- *Dismissing instead of acting.* Dismiss removes the reminder, not the
  work. The lead is still waiting.
- *Expecting an email.* Emails only go out for the events an administrator
  has configured for your role, and only once the institute has switched
  email on at all — which is an account with an email service, not a
  setting (Chapter 13). Until then the bell is the only channel, and the
  Notifications settings screen says so at the top.

**Related** — Chapter 13, Settings → Notifications.

## 4.5 Finding things

**The quickest way is the Search button in the top bar, or Ctrl + K.**
Type two letters of a name or a number, and the people who match appear
as you type — press Enter on one to open it. The same box jumps to any
screen you can reach: type "fee" for Fee Structures, "insights" for
Insights.

It only ever finds what you are allowed to see. A counsellor searching a
name finds their own leads and nobody else's, exactly as the list does,
and phone numbers show masked here as they do everywhere else — the full
number is on the lead's own page.

Press **Esc** to close it without going anywhere.

- **Search within leads**: the box at the top of the Leads list. Type part
  of a name or a phone number and press Enter.
- **Search within students**: same idea, and it also matches the student
  code.
- **Ask AI**: for questions rather than records — "how many leads from
  Meta last month?" (Chapter 11).
- **The address bar**: every screen has a stable address, so you can
  bookmark a filtered list.

### When something saves

A small message appears at the bottom of the screen — *Payment recorded*,
*Lead updated*. It fades by itself after a few seconds.

It exists because the confirmation on a long form renders where you are
not looking: you press Save at the bottom of the fee agreement and the
message appears at the top. Errors behave the other way round and stay
next to the field that caused them, where you have to go anyway to fix
it.

## 4.6 Signing out

Use the account menu at the top of the sidebar. Sessions also expire on
their own.

---

[Back to contents](#contents)
