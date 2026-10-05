# Chapter 16 — Frequently asked questions

## About leads

**Why can't I see another counsellor's leads?**
Your `lead.read` permission is at **own** scope. It is enforced in the
database, not just hidden on screen. A centre head sees their centre's;
an admin sees everything.

**Why are phone numbers hidden?**
Lists never show full numbers to anybody. You reveal one at a time on the
lead's own page, and that reveal is recorded. Counsellors move on and
databases go with them; a masked list cannot be screenshotted into
somebody else's CRM.

**Does revealing a number get me into trouble?**
No. Revealing numbers to ring people is the job. The record exists so
that revealing four hundred in an afternoon is visible.

**I entered somebody who already exists. Did I break anything?**
No. You will never see "this phone number already exists" — the system
attaches the new enquiry to the existing person or flags the pair for
**Merge review**. One person, one record.

**Can I undo a merge?**
Not easily. If you are unsure, reject: two records are recoverable, one
merged record is harder to separate.

**What is the difference between stage and temperature?**
Stage is how far along they are. Temperature is how likely they are to
join. They are independent — Hot at *Contacted* and Cold at *Demo
Scheduled* are both normal.

**I set a lead to Hot and it changed back.**
A manual temperature beats the overnight rules for a few days, then the
rules resume. Nobody overrode you.

**What happens if I delete a lead?**
It is hidden, not destroyed, and keeps who deleted it and why. It can be
restored from **Leads → Deleted**. Nothing in this system is ever
hard-deleted.

**Why must I give a reason for Lost?**
"We lost them" teaches nobody anything. The reasons are the most useful
column in the sources report.

## About admissions and money

**I confirmed an admission by mistake.**
Only an administrator can undo it. It is deliberately a one-way door:
it stops sales work and hands the family to accounts.

**Why can't I edit a payment?**
Payments are append-only. Corrections are reversals that reference the
original, so the history is always readable. This becomes an accounting
system; retrofitting honesty onto a year of edited transactions is not
something anyone wants to do.

**Why do receipt numbers have no gaps?**
They come from a database sequence, not from the app, so two people
recording payments at the same moment cannot collide and no number is
skipped.

**The fee is wrong on the admission form.**
No fee structure matches that course + centre + mode + academic year —
check the academic year first. An administrator adds one, or use
**Manual fee override**.

**Can I give a discount bigger than my limit?**
Yes — it is recorded as pending and somebody with authority settles it.
You are never blocked in front of a family.

**When is a student created?**
At the **first cleared payment**, not when the admission is confirmed.

**A student dropped out. Do I delete them?**
No. Mark the admission dropped with a reason. Payments stay; record a
refund separately if money is going back.

## About messages

**Why can't I reply to this WhatsApp message?**
Either more than 24 hours since their last message — Meta's rule, so use
an approved template — or the thread matches no lead.

**Why can't I just type a new WhatsApp message to a lead?**
Outside a 24-hour window Meta only allows pre-approved templates. Not a
CRM limitation.

**Why isn't my personal WhatsApp in the CRM?**
There is no legal way to do it. Every tool that claims otherwise risks a
permanent ban on **the number** — the line you answer enquiries on. The
Personal WhatsApp tab explains the supported alternative.

**My broadcast was scheduled for 3pm and went out next morning.**
Scheduled sends are picked up by the nightly run. Send immediately if the
hour matters.

**Does an Instagram DM create a lead?**
No, deliberately. Most DMs are a question or a story reply. Press
**Convert to lead** when one becomes a real enquiry.

## About reports

**My numbers differ from my colleague's.**
Different scopes. Yours are your leads, theirs are their centre's.

**Why can't I open Ad Performance?**
It needs institute-wide report access. Advertising is charged per
campaign and a campaign's leads land in every centre, so there is no
honest per-centre figure.

**Why does this month's cost per admission look awful?**
A lead that arrives in March often enrols in May, so recent months are
genuinely incomplete. The number improves by itself.

**What does a dash mean?**
The sum has no answer yet. It is not zero.

**Can Ask AI change anything?**
No. It answers questions and nothing else, within your scope.

## About admin

**Can we rename "Lead"?**
Yes — Settings → Terminology, singular and plural. The whole interface
follows.

**Can we add a question to the lead form?**
Yes — Settings → Custom Fields. No developer, no downtime. It appears on
the lead page immediately.

**Can we add a pipeline stage?**
Yes — Settings → Pipeline Stages. Choose the stage **type** carefully; it
drives behaviour.

**Can we create a role that does not exist yet?**
Yes — Settings → Roles & Permissions. Roles are records, not code. Only
**Admin** is protected.

**How do we stop leads going unassigned?**
An assignment rule must match them. Add a catch-all at the lowest
priority.

**Who can read the audit log?**
Admin only. It cannot be scoped to a centre, so a centre-scoped grant
would expose the whole institute's log.

**What is Settings → Config Export/Import for?**
Setting up another instance, or moving settings between test and live.
It carries configuration only — **no leads, students or payments. It is
not a backup.**

**What should I check weekly?**
**Settings → Platform Health.** It shows a broken integration before
anybody notices leads have stopped arriving.

---

[Back to contents](#contents)
