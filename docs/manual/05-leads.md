# Chapter 5 — Leads: the list, the pipeline, and the unassigned queue

This chapter covers finding leads and moving them around. Chapter 6 covers
working an individual lead.

## 5.1 The Leads list

**Leads** in the sidebar. It shows every lead you are allowed to see — for
a counsellor, the ones assigned to you; for a centre head, their centre's;
for an admin, all of them.

### What the columns are

The columns are **not fixed**. They are whichever lead fields an
administrator has marked "show in list" (Settings → Custom Fields). As
shipped that is Student Name, Primary Phone, Lead Source, Stage,
Temperature, Assigned Counsellor, Centre and Next Follow-up.

Two things to know about what you see in those columns:

- **Phone numbers are masked** — `+91 98••••3456`. This is deliberate
  (Chapter 6.4).
- **A lead whose admission was later dropped is marked**, so a name in the
  list does not silently look like a live admission.

### The buttons at the top

| Button | Who sees it | What it does |
|---|---|---|
| **New lead** | `lead.create` | Opens the create form (5.4) |
| **Import** | `lead.import` | The CSV wizard (Chapter 12) |
| **Export CSV** | `lead.export` | Downloads exactly what the filters currently show (Chapter 12) |
| **Merge review** | `lead.merge`, and only when something is pending | Possible duplicates to judge (Chapter 6.7) |
| **Deleted** | `lead.delete` | The recycle bin (Chapter 6.8) |

[Screenshot: The Leads list with the filter bar and the buttons along the top]

### Procedure: find a lead

**Goal** — get to one person quickly.

**Before you start** — `lead.read`.

**Steps**
1. Open **Leads**.
2. Click the search box, marked *Search name or phone… (Enter)*.
3. Type part of the name, or any part of the phone number.
4. Press **Enter**.

**What you should see** — the list narrows, and the count under the page
title updates.

**Common mistakes**
- *Typing and waiting.* Nothing happens until you press Enter. This is on
  purpose, so the list does not reload on every keystroke.
- *Searching for somebody another counsellor owns.* You will find nothing.
  That is scope, not a missing record.

### Procedure: filter the list

**Goal** — see a slice, for example "Hot leads in Kochi from Meta".

**Before you start** — `lead.read`.

**Steps**
1. Open **Leads**.
2. The filter bar sits under the title. It is built from whichever fields
   an administrator marked "show in filters", so it may differ from the
   list below.
3. Pick values. Dropdown filters apply immediately; text filters need
   **Enter**.
4. Use the **Tag** box to filter by tag.
5. To clear a filter, set it back to blank.

**What you should see** — the list and its count change. The address in
your browser changes too, so you can bookmark this view or send it to a
colleague (they will still only see what their own scope allows).

**Related** — Chapter 12 for exporting a filtered list.

## 5.2 The Pipeline board

**Pipeline** shows the same leads as columns, one per stage.

### Procedure: move a lead to another stage

**Goal** — record that a lead has progressed.

**Before you start** — `lead.update` on that lead.

**Steps**
1. Open **Pipeline**.
2. Find the lead's card.
3. Drag it to the column you want and release.

**What you should see** — the card moves immediately and stays after a
refresh. The change is written to the lead's history.

**If you drag to Lost**, a small dialog appears first:
1. Choose a reason under **Select a reason** (Not Interested, Budget
   Constraint, Joined Competitor, Not Reachable, Wrong Number, Other).
2. Add **Additional detail (optional)**.
3. Press **Move to Lost**, or **Cancel** to abandon the move.

The reason is required because "we lost them" without a why teaches
nobody anything.

**Common mistakes**
- *Nothing drags.* You do not hold `lead.update` for that lead.
- *Dropping into Admission Confirmed to mark a sale.* Do not. Confirming
  an admission is its own action on the lead page, because it hands the
  family to accounts and creates the fee record (Chapter 7).

[Screenshot: The Pipeline board mid-drag]

## 5.3 The Unassigned queue

**Unassigned** in the sidebar, visible to anyone with `lead.assign`. These
are leads nobody owns — usually because they arrived from an ad or a form
and no assignment rule matched.

This is the most important queue in the system. An unassigned lead is a
lead nobody is chasing.

### Procedure: assign an unassigned lead

**Goal** — give an orphaned lead an owner.

**Before you start** — `lead.assign`.

**Steps**
1. Open **Unassigned**.
2. Find the lead.
3. Either:
   - choose a person from the **Assign to…** dropdown on that row, or
   - press **Claim** to take it yourself. (**Claim** only appears if you
     are someone who could work that centre's leads.)

**What you should see** — the lead leaves the queue, the red badge drops
by one, and the new owner is notified.

**Common mistakes**
- *Assigning everything to one person to clear the queue.* The queue is a
  symptom. If it keeps filling, the assignment rules need fixing
  (Chapter 13).

**Related** — Chapter 13, Settings → Assignment Rules.

## 5.4 Creating a lead by hand

### Goal
Record somebody who walked in or rang up.

### Before you start
`lead.create`. If your permission is at **centre** scope you must pick one
of your own centres; at **own** scope the lead is assigned to you
automatically.

### Steps
1. Open **Leads** → **New lead**.
2. Under **Who they are**, fill in:
   - **Student name** — required.
   - **Primary phone** — required. Any format; it is normalised.
   - **Father's name**, **Email** — optional.
3. Under **Where they are**: **Centre** (required if you work across more
   than one), **City or town**, and state/district.
4. Under **What they want**: exams, courses and **Exam year** (four
   digits, e.g. `2027`).
5. **Referred by** — if an existing lead or past student sent them, search
   for that person here. Worth doing: referrals are among the best
   sources, and this is the only place that records them.
6. Press the create button.

### What you should see
You land on the new lead's own page. The lead gets a number (`Lead #124`),
starts at the first stage, and — unless you were assigned it
automatically — the assignment rules choose an owner.

### Common mistakes and fixes
- **"Choose one of your own centres."** You picked a centre you do not
  belong to, or left it blank when your scope requires one.
- **The phone is rejected.** It could not be read as a phone number.
  Check for stray letters.
- **You create somebody who already exists.** This is handled, not
  punished: the system attaches a new enquiry to the existing person, or
  flags the pair in **Merge review**. You will not get an error, and you
  will not create a second record by accident.

### Related
- Chapter 6 — working the lead you just made
- Chapter 12 — creating many at once

## 5.5 Stages and what they mean

Fourteen stages ship with the system. An administrator can rename,
reorder, recolour, add or retire them (Settings → Pipeline Stages), so
yours may differ.

| Stage | Type | Probability | Response target |
|---|---|---|---|
| New Lead | new | 5% | — |
| Contacted | normal | 10% | 4 hours |
| Qualified | normal | 20% | 24 hours |
| Demo Scheduled | scheduled | 35% | 48 hours |
| Demo Completed | normal | 45% | 24 hours |
| Counselling Done | normal | 55% | 48 hours |
| Brochure Sent | normal | 40% | 72 hours |
| Follow-up | normal | 50% | 72 hours |
| Registration Form Sent | enrolment_form | 65% | 48 hours |
| Registration Form Submitted | enrolment_form | 80% | — |
| Payment Pending | payment | 90% | 24 hours |
| Admission Confirmed | won | 100% | — |
| Lost | lost | 0% | — (reason required) |
| Parked | parked | 15% | — |

**Probability** is used by the forecast report, not by anything that
decides behaviour. **Response target** is the SLA: exceed it and the lead
appears as a breach.

**Stage type** is fixed in the software and drives behaviour — a `lost`
stage demands a reason, a `won` stage counts as an admission. When an
administrator adds a stage they must choose one of these types.

## 5.6 Temperature

Hot, Warm, Cold, Dead — and separate from stage (Chapter 1.4).

You can set it by hand on the lead. Overnight, the system recalculates
temperatures from the rules an administrator has set
(Settings → Temperatures). **A manual override wins for a few days** —
three by default — so your judgement is not overwritten the same night.
After that the rules take over again.

This is why a lead you marked Hot last week may be Warm today: nobody
changed it, the rules recalculated it once your override expired.

---

[Back to contents](#contents)
