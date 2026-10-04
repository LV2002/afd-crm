# Chapter 17 — Glossary

Every term, status and stage used in the CRM.

## Core objects

**Lead** — A prospective student. The *person*, not the enquiry. One lead
can have many enquiries.

**Enquiry** — One inbound event: a form fill, an ad click, a walk-in, a
phone call. Many enquiries belong to one lead, which is how the same
person arriving twice stays one record.

**Enrolment (Admission)** — The commercial record: course, mode,
academic year, fee, discount, instalments. Created when a counsellor
confirms an admission.

**Student** — The academic record. Created automatically at the first
cleared payment. Separate from the lead on purpose.

**Batch** — A class group with timings, a course, a centre and seats.

**Centre** — A physical branch. Kochi, Kannur.

**Counsellor** — The person who owns a lead.

**Interaction** — A logged conversation: a call, a WhatsApp, a walk-in, a
note.

**Task** — A small piece of work on a lead, with a due date.

**Tag** — A label on a lead, for segmentation and audiences.

## Process

**Stage** — Where a lead sits in the funnel.

**Stage type** — The behaviour behind a stage, fixed in code: `new`,
`normal`, `scheduled`, `enrolment_form`, `payment`, `won`, `lost`,
`parked`.

**Temperature** — How likely a lead is to join: Hot, Warm, Cold, Dead.
Independent of stage.

**Probability** — A percentage on each stage, used by the forecast only.

**SLA** — The response-time target for a stage. Exceeding it is a
*breach*.

**Handover / Gate** — One of the two one-way doors:
*Sales → Accounts* (admission confirmed) and
*Accounts → Academics* (first payment cleared, student created).

**First-touch source** — Where a lead first came from. Never overwritten.

**Last-touch source** — The most recent source before conversion.

**Assignment rule** — A rule deciding who gets a new lead: conditions, a
priority, and either a fixed person or a rotation.

**Orphan / Unassigned** — A lead nobody owns.

**Onboarding** — The checklist between a student paying and being
properly set up. Not a status.

## Money

**Course fee** — The standard fee from the fee structure.

**Discount** — Money off. Above your role's ceiling it needs approval.

**Net fee / Payable** — Course fee minus discount. What they owe.

**Down payment** — Paid at the time of admission.

**Instalment** — A dated, scheduled part of the balance.

**Payment** — Money received. Append-only; never edited or deleted.

**Reversal** — An entry cancelling a payment recorded in error.

**Refund** — Money returned to the family.

**Receipt** — The numbered document for a payment. Numbers are gapless.

**Fee structure** — The base fee for a course + centre + mode + academic
year.

**Offer / Promo** — A named discount with dates and limits.

**Transfer** — Money moved between the institute's own accounts. Neither
income nor expense.

**Opening balance** — What was in an account when you started using the
CRM.

## Messaging

**Template** — A message approved in advance by Meta. The only thing you
can send outside the 24-hour window.

**The 24-hour window** — Meta's rule: a free-form reply is allowed only
within 24 hours of the person's last message.

**Broadcast** — One template sent to many people.

**Automation (flow)** — A sequence that runs by itself when something
happens.

**Opt-out / Suppression** — Somebody who has asked not to be messaged.
Excluded from everything, permanently.

**Coexistence** — Meta's supported way of running one number on both the
WhatsApp Business app and the Cloud API.

**Convert to lead** — The button that turns an Instagram conversation
into a lead.

## Advertising

**Retargeting audience** — A list of your leads' hashed phone numbers,
kept in sync with Meta and Google so ads can be aimed at them.

**Custom Audience / Customer Match** — Meta's and Google's names for
that list.

**Lookalike** — An audience the platform builds of people resembling
yours.

**Match rate** — The share of your numbers the platform recognises.
50–70% is normal.

**Booked** — The fee agreed on an admission.

**Collected** — What has actually been received.

**ROAS** — Return on ad spend: booked revenue divided by spend.

**CPL / Cost per lead** — Spend divided by leads.

**LTV : CAC** — Average admission value against what it cost to win one.

## System

**Permission** — A named thing the system can enforce, e.g. `lead.read`.

**Scope** — How wide a permission reaches: **own**, **centre** or
**all**.

**Role** — A named bundle of permissions with their scopes. A record, not
code.

**Audit log** — Every change and every export, with who and when.

**Soft delete** — Hidden but recoverable. Nothing here is hard-deleted.

**Webhook** — The address an outside platform calls when something
happens.

**Nightly run** — The single scheduled job at 10:00 IST that does the
overnight work.

**Platform Health** — The screen listing anything that has broken.

**Custom field** — A field an administrator added without a developer.

**Dropdown category** — One editable list of options.

**Terminology** — The renameable words for lead, student, counsellor,
centre, course and exam.

**Config bundle** — A JSON export of configuration. Not a data backup.

**Masked number** — `+91 98••••3456`.

**Profile form** — The link a student uses to fill in their own details,
needing no login.

---

[Back to contents](#contents)
