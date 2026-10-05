# Chapter 8 — Students, profile forms and onboarding

## 8.1 Where students come from

**You never create a student by hand.** A student record is created
automatically when the first payment on an admission clears — the second
gate (Accounts → Academics).

This matters: a student in this system is somebody who has actually paid
and started. The sales record (the lead) and the academic record (the
student) are separate on purpose, so academics never has to look at the
sales pipeline to do their job.

The student's details are **copied** at creation and then diverge. Editing
a student's address does not change the lead's, and vice versa. That is
intended, not a bug.

## 8.2 The Students screen

**Students** in the sidebar (`student.read`).

Columns: **Name**, **Code**, **Phone**, **Course**, **Batch**, **Centre**,
**Status**, **Joined**.

Filters along the top: a search box (*Name, phone or code… (Enter)*),
**Centre**, **Course**, **Batch**, **Status**, **Joined on or after**,
**Joined on or before**, and **Clear** to reset.

### Student statuses

| Status | Means |
|---|---|
| **Active** | Studying |
| **On hold** | Paused, expected back |
| **Completed** | Finished the course |
| **Dropped** | Left |

**Onboarding is not a status.** A student being onboarded is *active* —
they have paid and they are joining. Onboarding is a separate checklist
(8.4).

## 8.3 The student record

Open a student by clicking their name.

- Their details, grouped into sections. Editing needs `student.update`
  (Academics and administrators).
- **Files** — documents attached to the student.
- **Print profile** — a printable student record.

The fields are configurable: an administrator adds questions in
Settings → Custom Fields and they appear here.

## 8.4 Onboarding

### What it is
The checklist between "they paid" and "they are properly set up" —
documents collected, batch allocated, welcome done.

### Procedure: clear the onboarding queue

**Goal** — mark a student as fully set up.

**Before you start** — `student.update`.

**Steps**
1. Open **Students** → **Onboarding** (or the red badge in the sidebar).
2. The list shows everybody waiting.
3. Do whatever your institute's onboarding actually involves.
4. Press **Onboarding done** on that row.

**What you should see** — the student leaves the queue and the badge
drops. The record keeps who onboarded them and when.

**Common mistakes**
- *Pressing it to clear the badge.* The queue is the only record that
  this work happened. An empty queue that did not happen is worse than a
  full one.

## 8.5 The student profile form

A link you send to the student so they fill in their own details — the
long list of things nobody wants to read out over the phone.

### Procedure: send a profile form

**Goal** — collect a student's own details from them.

**Before you start** — `lead.update`.

**Steps**
1. Open the lead.
2. Scroll to **Student profile form**.
3. If no link exists, press **Create profile form link**.
4. Press **Copy link**. The button changes to **Copied**.
5. Send that link to the student by WhatsApp, email, however you like.

**What you should see** — the panel says *Not yet submitted.* Once they
submit, their answers appear in the same panel.

**Notes**
- The link needs **no login**. Anyone with it can fill the form in, so
  treat it as private — send it to the student, not to a group.
- Which questions appear is set in **Settings → Student Profile Form**.
  Only questions marked for the form are asked; internal fields such as
  batch are never shown to a sixteen-year-old.
- Students can upload files (for example a photo) if the form asks for
  them.

### Procedure: review a submitted form

**Goal** — close the loop on a form so it stops showing as new.

**Before you start** — `lead.read`, and `lead.update` to mark it read.

**Steps**
1. Open **Student Profile Forms** in the sidebar (the red badge counts
   forms nobody has read).
2. Open the student's row.
3. Read the answers.
4. Press **Mark read**.
5. **Print profile form** if you need a paper copy.

**What you should see** — the form stops counting towards the badge.

**Why it works this way** — "outstanding" needs a definition. Without
somebody marking a form read, the count would either be every form ever
(a number people learn to ignore) or forms from the last N days (a queue
that empties itself whether or not anyone looked).

## 8.6 Batches

Batches are class groups — their timings, and who is in them. Managed in
**Settings → Batches** (`batch.manage`: Academics, centre heads,
administrators).

A batch can be chosen when an admission is confirmed, and changed
afterwards in either of two places:

- **Course & batch**, on the student's own page (and on the lead and the
  admission — Chapter 7.3a). Use this one. It changes the course and the
  batch together and keeps the admission record in step.
- **Settings → Batches** → the batch → add or remove a student. Use this
  when you are working batch-first — filling a new group, or emptying one
  that has finished.

Both write the same three things: the admission record, the student's
current batch, and the batch history (**who was in which group, from
when to when, and why they left**). A membership is closed, never
deleted, so *"she was in Kochi A until August"* stays answerable.

Both also notify academics, accounts and the counsellor who sold the
admission, in the same words, so it does not matter which one was used.

## 8.7 Handovers

**Handovers** is now a tab inside **Insights** (the old address
redirects). It measures the lag between the two gates: how long between
a counsellor confirming an admission and the first payment clearing.

It is a performance report, not a workspace. A growing lag means
admissions are being confirmed before families are ready to pay —
which is a sales-discipline problem, and this is the screen that shows it.

---

[Back to contents](#contents)
