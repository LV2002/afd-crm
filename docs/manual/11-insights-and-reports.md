# Chapter 11 — Insights, Ad Performance and Ask AI

Three different ways of asking questions. **Insights** for the funnel,
**Ad Performance** for what advertising cost, **Ask AI** for a question
you have not got a screen for.

All of them respect your scope. A counsellor's numbers are their own
leads; a centre head's are their centre's. Two people can open the same
report and honestly see different totals.

## 11.1 Insights

**Insights** in the sidebar (`report.read`). Eight tabs.

| Tab | Answers |
|---|---|
| **Explore** | Anything — build your own breakdown |
| **Sources** | Which sources bring leads, and which bring admissions |
| **Timing** | How long things take, and when admissions actually close |
| **Handovers** | The lag between confirming an admission and the first payment |
| **Segments** | How different groups convert |
| **Referrals** | Who is sending you people |
| **Targets** | Progress against the month's numbers, and what the pipeline is worth |
| **Activity** | What the team did today |

### Explore

The one to learn first, because it answers questions the others do not.

**Procedure: build a breakdown**

**Goal** — answer "how many leads by X?" for any X.

**Before you start** — `report.read`.

**Steps**
1. Open **Insights**.
2. **Break down by** — choose a field (source, centre, counsellor,
   course, stage…). Type to search.
3. Add filters underneath. Each offers **Any** as well as its values, and
   a "not set" option for records where the field is blank.
4. Text filters need **Enter**.

**What you should see** — a table with **Leads**, **Conversion**,
**Share**, **Won**, **Lost** and **Dropped**, plus a funnel.

**Common mistakes**
- *Reading "not set" as zero.* It means nobody filled the field in — a
  data-quality finding, often the most useful thing on the screen.
- *Comparing your numbers to a colleague's.* Different scopes, different
  totals. Not a bug.

### Sources
**Arrived here** against **Converted here**, and **Admissions started**
against **Admissions finished** — first touch and last touch side by
side under **Every source, both ways**. A source that brings many leads
and few admissions is a budget decision waiting to be made.

### Timing
How long leads take, grouped **By the month they arrived**, and **When
admissions actually close**. Recent months are deliberately incomplete —
a lead that arrived in March often enrols in May.

### Handovers
Per counsellor: admissions confirmed, and how long families then sat
**Waiting** before paying. A growing wait means admissions are being
confirmed too early.

### Segments
Conversion by group: **Leads**, **Enrolled**, **Rate**, **Share of
leads**. Which exam, which education level, which city actually
converts.

### Referrals
**Referred by**, **Leads**, **Enrolled**, **Conversion**, **Last one**,
and a **Month by month** view. For a 25-year-old institute this is often
the best-converting source in the building, and it only works if people
fill in **Referred by** when creating leads (Chapter 5.4).

### Targets
**This month, by scope** against targets an administrator set
(Settings → Targets), plus **What the open pipeline is worth** — each
stage's leads multiplied by that stage's **Chance**. A forecast, not a
promise.

### Activity
**The day, across everybody**: interactions logged, **Outcomes**, and
**Counsellor activity**. Useful at 6pm; not a stick to beat people with.

## 11.2 Ad Performance

**Ad Performance** in the sidebar. Needs `report.read` to see the entry
and **`report.org`** to open it.

**Why it is institute-wide only.** Advertising is charged per campaign,
and a campaign's leads land in every centre. There is no honest way to
tell a centre head their share, so the screen declines rather than
inventing a number. Per-centre lead counts live in Insights, where the
question does have an answer.

### What it shows
**Ad spend**, **Cost per lead**, **Cost per admission**, **Return on ad
spend**, **LTV : CAC**, **Leads not from ads**, and a **By campaign**
table.

### How to read it honestly
- **A lead is counted in the period it arrived; its admission counts
  whenever it happened.** So a recent month's admissions are genuinely
  incomplete and will keep rising.
- **Booked** is the fee agreed. **Collected** is what has arrived. For
  instalment plans collected is always lower.
- **A dash means the sum has no answer yet, not zero.**
- A campaign with spend and no leads still appears. That is the row worth
  finding.

### If it shows nothing
The page tells you which of three situations you are in: nothing spent in
these dates, connected but never synced, or **not connected at all**.
Only the last needs an administrator (Chapter 13).

## 11.3 Ask AI

**Ask AI** (`ai.query`). Ask in plain English: *"How many leads from Meta
last month?"*, *"Which counsellor has the best conversion?"*

### What it can do
It runs a fixed set of prepared queries — find a person, their history,
leads by source, the funnel, conversion by counsellor, centre
performance, lost reasons, SLA breaches, the centre list, and what the
pipeline is worth.

### What it cannot do
- **It never writes anything.** It cannot change a lead, send a message
  or record a payment.
- **It cannot answer outside those queries.** If nothing fits, it says
  so rather than guessing.
- **It cannot see past your scope.** A centre head asking about a centre
  they do not run gets nothing — the same rule as everywhere else.

### Common mistakes
- *Treating it as a search box.* To find one person, the Leads search is
  faster.
- *Asking it to do something.* It answers questions; it does not act.

---

[Back to contents](#contents)
