# Chapter 4 — The dashboard, navigation and notifications

## 4.1 What the dashboard is

The **Dashboard** is your landing page and it is two things at once: your
**work queue** (what to do now) and your **numbers** (how you are doing).
It is assembled from widgets, and which widgets you see depends on your
role.

`/my-day` is an old address for the work queue. It now redirects to the
Dashboard, where the queue lives.

[Screenshot: The Dashboard for a counsellor, showing Your day and Your numbers]

## 4.2 The widgets

Seven widgets exist. An administrator chooses which appear for each role
and in what order (Settings → Dashboards), but a widget can never be given
to a role that lacks the underlying permission — it would show a card of
zeroes, which is worse than showing nothing.

| Widget | What it shows | Needs |
|---|---|---|
| **Your day** | The work queue: Overdue, Due today, New, At risk | `lead.read` |
| **Your numbers** | Assigned today, this month's new leads and admissions, admission rate | `lead.read` |
| **Centre pipeline** | New leads this month, what is in the funnel, SLA breaches, admissions | `lead.assign` |
| **Counsellor performance** | Each counsellor's active leads, new leads, admissions, overdue follow-ups | `report.center` |
| **Accounts** | Waiting for a first payment, collected this month, overdue instalments | `payment.read` |
| **Students** | Active students, who joined this month | `student.read` |
| **Administration** | Users, centres, integration health, anything broken | `settings.manage` |

### Your day, in detail

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
Eighteen things can notify somebody, and which of them reach *you*
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
  has configured for your role, and only if the institute has set up
  email sending at all (Chapter 13).

**Related** — Chapter 13, Settings → Notifications.

## 4.5 Finding things

- **Search within leads**: the box at the top of the Leads list. Type part
  of a name or a phone number and press Enter.
- **Search within students**: same idea, and it also matches the student
  code.
- **Ask AI**: for questions rather than records — "how many leads from
  Meta last month?" (Chapter 11).
- **The address bar**: every screen has a stable address, so you can
  bookmark a filtered list.

## 4.6 Signing out

Use the account menu at the top of the sidebar. Sessions also expire on
their own.

---

[Back to contents](#contents)
