# Chapter 7 — Admissions, fees and payments

This chapter covers the first gate — Sales → Accounts — and everything
that follows until the money is in.

## 7.1 Confirming an admission (Gate 1)

### Goal
Record that a family has agreed to join, and hand them to accounts.

### Before you start
`enrolment.create`. The lead must not already have an admission.

**Understand what this does before you press it.** Confirming an
admission ends sales work on that lead and hands the family to accounts.
Only an administrator can walk it back. Do it when the admission is
actually agreed, not when it looks likely.

### Steps
1. Open the lead.
2. Find **Confirm admission** on the right.
3. **Course** — the course they are *actually joining*. This may differ
   from what they originally enquired about, and that is exactly why it is
   asked here rather than copied from the lead.
4. **Mode** — Online, Offline or Hybrid.
5. **Academic year** — choose from the list.
6. **Batch** — optional, and only offered once a course is chosen. The
   field reads *Pick a course first* until then.
7. **Discount** — in rupees, if you are giving one. Leave at `0` if not.
8. **Manual fee override** — leave blank to use the fee structure. Only
   fill this in when the agreed fee genuinely differs from the standard
   one.
9. Press **Confirm admission**.
10. A confirmation appears: *Confirm this admission?* Read it, then press
    **Yes, confirm it**.

### What you should see
The **Confirm admission** form is replaced by an **Admission confirmed**
summary showing the course, the net fee and the confirmation time. The
lead now appears in **Admissions** for accounts, and the sidebar badge
there goes up by one.

### Common mistakes and fixes
- **"There is no fee for this."** No fee structure matches that course,
  centre, mode and academic year. Either an administrator adds one
  (Settings → Fee Structures) or you use **Manual fee override**. Check
  the academic year first — a mismatch there is the usual cause.
- **Confirming the wrong course.** Ask an administrator; this is one of
  the few genuinely awkward things to undo.
- **Confirming early, "to hold the place".** Do not. It stops the lead
  being worked and puts it in the accounts queue where it clutters a
  real list.
- **The discount is above your limit.** It is not refused. It is recorded
  as pending and somebody with authority approves or rejects it (7.5).

### Related
- 7.2 The fee plan · 7.5 Discounts · Chapter 13, Settings → Fee Structures

## 7.2 The fee plan and instalments

Once an admission exists, the lead page gains a **Fees & instalment
agreement** section. Accounts see the same panel on the admission's own
page, so a fee that was agreed wrongly can be corrected by the people
collecting it rather than by finding a centre head.

### What it shows
- **Course fee** — the standard fee from the fee structure
- **Discount**
- **Payable** — what they actually owe
- **Down payment agreed**
- **Instalments** — a dated schedule
- Whether the total scheduled matches the payable amount, and by how much
  it falls short if not

### Procedure: set up a payment plan

**Goal** — agree how the fee will be paid.

**Before you start** — `enrolment.update`. Accounts, centre heads and
administrators.

**Steps**
1. Open the lead and scroll to **Fees & instalment agreement**. Accounts
   can do the same from **Admissions** → the student.
2. **Course fee** — usually pre-filled from the fee structure.
3. **Discount**, and **Discount name** if it needs one (for example
   *Early Bird*), or choose a running offer from the offers list.
4. **Down payment** — what they are paying today.
5. Under **Instalments**, fill in a due date and an **Amount ₹** for each
   instalment they need. Leave unused rows blank.
6. **Additional notes** — anything the agreement should say.
7. Save.

**What you should see** — the panel totals the instalments and tells you
whether anything is *not yet scheduled*. Aim for zero.

**Common mistakes**
- *Instalments that do not add up to the payable amount.* The panel says
  so explicitly. Fix it before printing an agreement.
- *Dates in the past.* They will immediately show as overdue and start
  generating reminders.
- *Setting the fee below what has already been paid.* Refused, and the
  message says how much has been received. The institute is holding more
  than the student owes, which is a refund — record that first.

**Changing a fee later.** The same panel does it, and the change is not
quiet: accounts, the centre head and the counsellor who sold the
admission are all told the old figure and the new one. Nothing in the
payments ledger is touched — what was received was received.

### Procedure: print the instalment agreement
1. Open the lead, scroll to **Fees & instalment agreement**.
2. Open the agreement.
3. Print or save as PDF from your browser.
4. Have the family sign it, then upload the signed copy to
   **Documents** so the panel shows a **Signed agreement**.

The printed agreement takes the course and the terms **from the
admission**, not from the lead's enquiry details — so it says what was
actually agreed.

[Screenshot: The printed instalment agreement]

## 7.3 The Admissions screen

**Admissions** in the sidebar (`payment.read`). Every confirmed
admission and where its money has got to.

Columns: **Student**, **Course**, **Centre**, **Confirmed**, **Net fee**,
**Paid**, **Status**. Dropped admissions are marked.

The red badge counts admissions confirmed with **no first payment yet** —
the queue accounts should be working down.

## 7.3a Changing the course or batch

A student who enquired about Foundation and joined DWO, or who moved from
the Tuesday batch to the Thursday one, is ordinary — and until recently
the admission record could not say so.

**Course & batch** appears on three screens, because three different
people change it: the lead (the counsellor), the admission (accounts) and
the student's own page (academics). All three do the same thing.

**Procedure: change what a student is enrolled on**

**Goal** — correct or update the course, batch, mode or academic year of
a confirmed admission.

**Before you start** — `enrolment.change_plan` for the batch, mode and
academic year. Counsellors for their own students; accounts, academics and
centre heads for their centre.

**The course needs `enrolment.change_course`, which only academics hold**
(and admin and co-admin). Everybody else sees the course on this panel but
cannot change it: it decides which room and which syllabus a student is
in, and that is academics' call. When academics do move it, accounts, the
co-admin and the admin are all notified — the fee does not follow a course
change, so somebody has to decide whether it should.

**Steps**
1. Open the lead, the admission or the student, and find **Course &
   batch**.
2. Change **Mode**, **Academic year** or **Batch** — and **Course**, if
   you are academics. The batch list shows only batches running that
   course at that centre — clear the box to take them out of a batch
   altogether.
3. **Reason (optional)** — kept on the batch history.
4. Press **Save course & batch**, then **Yes, change it**.

**What you should see** — a line confirming exactly what moved, for
example *Course: Foundation → DWO · Batch: Kochi A → Kochi B*.

**The fee does not change.** Moving somebody to a more expensive course
does not re-price their admission — that would be a fee change nobody
agreed. Accounts are notified so they can adjust it deliberately.

**Common mistakes**
- *Expecting the fee to follow the course.* It does not, on purpose.
- *Trying to change the course of a student who has dropped.* Refused —
  restore the admission first.
- *Looking for the course on the student edit form.* It is shown there
  but not editable, because editing it in one place used to leave the
  admission record saying something else.

## 7.4 Recording a payment

### Goal
Record money received and issue a receipt.

### Before you start
`payment.record` — Accounts and administrators. Counsellors cannot do
this, deliberately.

### Steps
1. Open **Admissions** and click the student.
2. Find **Record a payment**.
3. **Amount** — in rupees.
4. **Method** — Cash, UPI, Card, NEFT, Cheque or Other.
5. **Received into** — which bank or cash account the money landed in.
6. **Reference (optional)** — *UTR / cheque no. / transaction id*. Fill
   this in for anything that is not cash; it is what reconciliation
   depends on.
7. Press **Record payment**.
8. Confirm at *Record this payment?* with **Yes, record it**.

### What you should see
- The payment appears in the **Payment ledger** on that page.
- **Paid** goes up and **Balance** goes down.
- A receipt number is issued.
- **If this is the first cleared payment, a student record is created
  automatically** — the second gate. The page shows **Student created**.

### Common mistakes and fixes
- **Recording the wrong amount.** You cannot edit or delete it. Payments
  are append-only: a mistake is corrected with a reversal (7.6). This is
  not an inconvenience, it is what makes the ledger trustworthy.
- **Recording into the wrong account.** Same — correct with a transfer or
  a reversal, do not try to edit.
- **No account to choose.** None has been set up. See Chapter 9.

### Related
- 7.6 Refunds and reversals · Chapter 8, students · Chapter 9, finance

## 7.5 Discounts and approval

Each role has a ceiling (Chapter 3.3). A discount within your ceiling is
simply applied. A discount above it is recorded as **pending approval**
and shown at the top of the fees panel.

### Procedure: approve or reject a discount
1. Open the lead (or the admission).
2. The pending discount is shown above the fee panel.
3. Optionally write a note — *Note (optional) — why you approved or
   refused*.
4. Press **Approve** or **Reject**.

Needs `discount.approve`: centre heads, accounts and administrators.

**Why it works this way.** Nobody is blocked from promising a discount in
front of a family. The discount is recorded, the fee reflects it as
pending, and the authority to actually grant it is resolved afterwards —
rather than a counsellor having to say "I need to ring my manager".

## 7.6 Refunds and reversals

**Nothing financial is ever edited or deleted.** A correction is a new
entry that points at the original.

- A **reversal** cancels a payment recorded in error. The money never
  arrived, so the institute's cash for that day is put back to what it
  really was.
- A **refund** returns money the institute did receive. The original
  payment stands, because it was true; the money leaving is recorded as
  going out **today**, because that is when it left.

The difference matters to one person — whoever reconciles the bank
statement — and the form makes you choose, because nobody volunteers it.

Both need `payment.refund` (Accounts and administrators). Both leave the
original payment visible, with the correction beside it, so the history
of what happened is readable a year later.

**Procedure: reverse or refund a payment**

**Goal** — undo a payment, correctly.

**Before you start** — `payment.refund`. You need the reason in words:
it prints on the note the family gets.

**Steps**
1. Open **Admissions** → the student → **Reverse or refund a payment**.
2. **Payment** — pick it from the list. Payments already undone are not
   offered.
3. **What happened** — *Reversal* or *Refund*, as above.
4. For a refund: **Paid back by** (cash, UPI, NEFT…) and **Paid from**
   (which account the money leaves).
5. **Reason** — written for the family, not for the file.
6. **Reverse payment** / **Record refund**, then confirm.

**What you should see**
- A new line in the **Payment ledger**, in the opposite direction.
- **Paid** goes down and **Balance** goes back up by the same amount.
- Accounts, the centre head and the student's counsellor are notified.
- Opening that line's note prints a **Refund / Reversal Note**.

**Common mistakes**
- *Reversing when you mean refund.* A reversal says the money never
  arrived. If it arrived and went back, it is a refund, and recording it
  as a reversal misstates the bank balance on two different days.
- *Trying to undo the same payment twice.* Refused. A payment can be
  undone once; if the amount was wrong, reverse it and record the right
  one.
- *Expecting the student record to disappear.* It does not. Reversing a
  first payment does not un-enrol anybody — they were handed to academics
  and may have sat in a class. A student actually leaving is **dropped**
  (7.8), which is a separate thing with its own reason.

## 7.7 Receipts

Every payment gets a receipt with a number from a **gapless sequence** —
1, 2, 3, with no holes. The numbers come from the database, never from
the app, so two people recording payments at the same moment cannot get
the same number.

### Procedure: get a receipt to send to a family

**Two ways in, whichever screen you are already on:**

- **Admissions → the student → Payment ledger → Receipt**, next to the
  payment itself.
- **Finance → Transactions → Receipt**, on the row for that payment. This
  is the quicker one when somebody rings up about a payment and you have
  the date rather than the name.

Then press **Print or save as PDF** and choose *Save as PDF* as the
destination. That gives you a file to send on WhatsApp or email.

The receipt carries the institute's letterhead from
Settings → Organisation — name, address, phone, GSTIN — and the centre's
own address and phone from Settings → Centres, so a Kannur receipt shows
Kannur. If those are blank, the receipt prints without them, which is the
one thing worth checking before you send the first one.

It states the amount received in figures **and in words**, the mode of
payment, the total fee, what has been paid to date and the balance
outstanding — which is the question that otherwise generates the next
phone call.

**Reprinting is not reissuing.** The receipt number, amount and date come
from rows that can never be edited, so the tenth print is identical to the
first. A correction is a reversal with its own entry, and it prints marked
as one rather than quietly disappearing.

## 7.8 When a student drops out

### Goal
Record that somebody who had confirmed is not coming.

### Before you start
`enrolment.drop` — Accounts, centre heads and administrators.

### Steps
1. Open **Admissions** → the student.
2. Find the drop panel.
3. **Why did they leave?** — for example *Moved city, joined elsewhere,
   financial reasons…*
4. Confirm.

### What you should see
The admission is marked **Dropped out** with the date and reason. It
shows on the lead page too, in red, so a counsellor wondering where their
conversion went can see why. The student stops counting as an admission
in the reports.

### Edge cases
- **Payments already made stay.** Dropping is not a refund. If money is
  going back, record a refund as well (7.6).
- **The student record.** If one was created, it reflects the drop.

## 7.9 Payment reminders

Overdue instalments are chased automatically overnight. An administrator
configures the rungs — how many days after the due date, by what channel,
with which message (Settings → Payment Reminders). As shipped there are
four rungs.

Reminders are recorded, so the same instalment is not chased twice by the
same rung.

---

[Back to contents](#contents)
