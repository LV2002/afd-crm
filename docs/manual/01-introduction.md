# Chapter 1 — Introduction

## 1.1 What this system is

This is AFD India's own CRM. It is the single record of every prospective
student from the moment they first get in touch to the day they enrol, and
it is where the sales work actually happens — calls, WhatsApp, follow-ups,
fee collection, receipts.

It replaces the spreadsheets, the WhatsApp notes and the "I'll remember to
call them" that used to hold all of this. If something about a student is
not in here, as far as the institute is concerned it did not happen.

## 1.2 Who it is for

Six kinds of people use it, and each sees a different system:

- **Counsellors** work their own leads: ring them, log what was said, book
  the follow-up, confirm the admission.
- **Centre heads** run a centre: they see their whole team's leads, assign
  them, and watch the numbers.
- **Accounts** collect the fees, record the payments and issue receipts.
- **Academics** look after students once they have paid — batches,
  attendance, the academic record.
- **Co-Admins** do everything an admin does except reset passwords and
  read the audit log.
- **Admins** configure the system.

Chapter 3 says exactly what each can and cannot do.

## 1.3 The one idea that explains everything else

**A person moves through four departments, and the handover between them
is a one-way door.**

```
Marketing  →  Sales  →  Accounts  →  Academics
 (lead in)    (admission   (fees,       (course, batch,
              confirmed)   payments)    exams)
```

There are two named gates, and both are deliberate, visible, and hard to
walk back:

1. **Sales → Accounts.** A counsellor presses **Confirm admission**. From
   that moment sales work on that lead stops and the family belongs to
   accounts. Only an administrator can undo it.
2. **Accounts → Academics.** The first payment clears. A **student record**
   is created automatically, and academics take over.

Understanding those two gates explains most of what the system does and
most of what confuses new users — chiefly, "why can't I edit this any
more?"

## 1.4 Key terms

These words mean specific things here. The full list is in Chapter 17.

| Word | What it means |
|---|---|
| **Lead** | A prospective student. The *person*, not the enquiry. |
| **Enquiry** | One inbound event — a form fill, an ad click, a walk-in. Many enquiries can belong to one lead. |
| **Stage** | Where they are in the funnel: New Lead, Contacted, … Admission Confirmed. |
| **Temperature** | How warm they are: Hot, Warm, Cold, Dead. **Separate from stage** — see below. |
| **Centre** | A branch. Kochi, Kannur. |
| **Counsellor** | The person who owns the lead. |
| **Enrolment** | The commercial record: course, fee, discount, instalments. |
| **Student** | The academic record, created when the first payment clears. |
| **Handover** | One of the two gates above. |

### Stage and temperature are not the same thing

This trips everybody up once. **Stage** is how far along the process they
are. **Temperature** is how likely they are to actually join. They move
independently: somebody can be at *Demo Scheduled* and Cold, or at
*Contacted* and Hot. Changing one never changes the other.

### First touch and last touch

Every lead records **where they first came from** and **where they most
recently came from**. The first-touch source is never overwritten — if
somebody clicks a Meta ad in June and then walks in during August, their
first touch stays Meta for ever. That is what makes the advertising
numbers honest.

## 1.5 Three rules the system will not let you break

Knowing these in advance saves a lot of confusion:

1. **Nothing is ever really deleted.** Deleting hides a record; it can be
   restored. Financial records cannot even be hidden — a mistake is
   corrected with a reversal entry, never by editing history.
2. **A duplicate is never rejected.** If you enter somebody who is already
   in the system, you do not get an error. The system links the new
   enquiry to the existing person, or flags the pair for review.
3. **Full phone numbers are hidden in lists.** You will see
   `+91 98••••3456` on the leads list. The full number is on the lead's own
   page, and asking to see it is recorded.

## 1.6 How to use this manual

Each chapter covers one area. Procedures are written the same way
throughout:

- **Goal** — what it achieves and when you would do it
- **Before you start** — what you need
- **Steps** — numbered, one action each, using the exact words on screen
- **What you should see** — how you know it worked
- **Common mistakes**
- **Related**

If you are brand new, read Chapters 1–4 and then the chapter for your job.
If you are looking something up, use the "Where do I find X" index at the
end of Chapter 18.

---

[Back to contents](#contents)
