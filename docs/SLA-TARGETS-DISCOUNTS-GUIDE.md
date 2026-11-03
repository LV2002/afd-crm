# SLA policies, targets and discount authority — a guide for the team

Three settings that answer three different questions. They are separate on
purpose, and each can be handed to a centre head or co-admin without giving
them anything else (see "Who can change them").

| Setting | The question it answers | Who it is aimed at |
|---|---|---|
| **SLA policies** | "Is this lead being answered fast enough?" | Counsellors (their clock), centre heads (who gets told) |
| **Targets** | "Are we on course for the month?" | Everyone: counsellor, centre, institute |
| **Discount authority** | "How much can this person take off a fee on their own?" | Counsellors and centre heads, when they build a fee plan |

---

## 1. SLA policies

**SLA = a promise about speed.** A policy says "a lead like this must have
X within N hours". The CRM watches every lead against the promise, flags the
ones that miss it, and can tell people about it.

### The clock

Each policy measures one of three things. Pick the one that matches the
promise you are making.

| It measures | The clock starts | The clock stops |
|---|---|---|
| **First response** | The moment the lead arrives | Somebody logs their first interaction (a call, a message) |
| **Follow-up kept** | The follow-up date a counsellor promised, once that date has passed | They log something against the lead |
| **Time in one status** | The last time the lead's temperature changed | The temperature changes again |

*First response* is the one every institute needs. *Follow-up kept* stops a
promised "I'll call you Thursday" from quietly being forgotten. *Time in one
status* catches leads that went Warm and then nobody touched them.

A lead that has been **won or lost** (Took admission, Negative, Wrong target…)
is no longer being worked, so it stops counting. Nobody is paged about a
student who has already joined.

### Which leads a policy covers

Under **Which leads**, add conditions the same point-and-click way as
assignment rules: source is Meta, centre is Kochi, exam is NIFT, and so on.
**Leave it empty and the policy covers everybody** — the right choice for
your first one.

### When several policies could apply

Each lead is measured against **one** policy at a time. The CRM goes down the
list from the **highest priority number** to the lowest and uses the first
policy that (a) matches the lead and (b) currently has something to measure
(for example, a "first response" policy has nothing left to measure once a
response is logged, so the next matching policy is used).

So: give a **catch-all a low number** and your **specific policies higher
numbers**.

### Target, and "working hours only"

**Target** is in hours. The screen says it back in days and weeks, so 336
reads as "2 weeks".

**Count working hours only** pauses the clock overnight, on weekly offs and
on holidays. Without it a lead that arrives Saturday evening is "late" by
Sunday morning with nobody in the building.

> **Set up business hours first, for every centre.** The clock uses each
> centre's own opening hours and holidays (Settings → SLA Policies, further
> down the page). A day with no hours entered counts as **closed**. If a
> centre has no hours at all, a "working hours only" policy sees **zero**
> elapsed time for its leads and **never breaches**. A lead with no centre
> has no hours either. Fill in the hours before you switch the option on.

### What happens when the target is missed

* The lead is flagged as breached. It shows up under **At risk** and on the
  dashboards, and the "SLA breached" notification goes out per your
  Notification settings.
* The check runs **every 10 minutes**.
* When the lead is dealt with (a response is logged, the follow-up is done,
  the status changes) the flag clears by itself.

### The escalation ladder — "when it is missed"

Rungs, each saying **how many hours late** it fires and what it does:

* **Tell the counsellor** — a nudge to the lead's owner.
* **Tell these roles** — for example the centre head.
* **Take it off them** — removes the lead from the counsellor so it goes back
  to the unassigned queue. Use sparingly: a counsellor who loses leads for
  being late learns to stop logging calls, not to make them.

How it behaves:

* "Hours late" counts from the moment the **target** was missed. On a 4-hour
  target, a "24 hours late" rung fires at 28 hours in.
* Each rung fires **once**. Nobody is told about the same lead every hour.
* If several rungs are due at once (a lead untouched over a weekend), only the
  **highest** fires. Three messages about one lead say nothing the last one
  doesn't.
* If a lead is rescued and later goes bad again, the ladder starts from the
  bottom.
* A policy with an empty ladder does nothing except flag the lead.

### A way to start (suggestions, not presets — your call)

The CRM ships with no ready-made policies; what you measure yourselves on is
your decision. A common first set:

1. **First response** — all leads — 1 hour, working hours only. Ladder: at 0
   hours late tell the counsellor; at 4 hours late tell the centre head.
2. **Follow-up kept** — all leads — 4 hours, working hours only. Ladder: at 0
   tell the counsellor.
3. Optional: **Time in one status** for Hot leads — 3 days. Ladder: at 0 tell
   the centre head.

Start generous, watch the At risk list for two weeks, then tighten.

---

## 2. Targets

**A target is a number to be compared against.** Everything else in the CRM
says what happened; targets say what you were *trying* to do, so on the 14th
of the month anyone can see whether the month is on course.

### What you set

Three **metrics**, per month:

* **Leads** — how many enquiries.
* **Admissions** — how many confirmed admissions.
* **Revenue** — rupees collected (you type rupees; it is stored exactly).

Three **scopes**:

* The **whole institute**.
* One **centre**.
* One **person** (a counsellor).

Rules worth knowing:

* Scopes are **separate numbers, never added up**. The institute's target is
  its own statement, not the total of the centre rows. (Adding them is how a
  month reads 200% achieved.)
* **Nothing carries forward.** Each month is set by hand. A target that rolls
  over on its own is one nobody re-thought.
* Setting one for a person is how a centre's number gets split between the
  people in it.

### Where people see it

On the dashboard, as a progress bar with a line showing where an even month
would have you, and in the **Targets** tab of Insights.

### Who sets what

* **Admin / co-admin** (**All** column): the institute, every centre, every
  person.
* **Centre head** (**Centre** column): their centre's numbers and their
  people's numbers — not the institute-wide one.

---

## 3. Discount authority

**A limit on how much each *role* can discount without asking.** It stops a
counsellor typing any figure into the discount box and the student being
billed accordingly.

### The limit

For each role, set a **percentage**, a **cash amount**, or **no limit**.

* **Both apply when both are set.** "10% or ₹5,000" means the *lower* of the
  two for that fee. A percentage alone lets 10% off a ₹2,00,000 course through
  unnoticed; a cash cap alone makes ₹5,000 look reasonable on a ₹15,000 crash
  course.
* **Blank means "this ceiling doesn't apply"**, not zero. You cannot leave
  both blank without ticking *no limit* — the screen refuses, so a role can't
  end up unlimited by accident.
* **A role with no limit set has no authority.** Every discount it enters
  waits for approval. Roles you create next year start safe.

As shipped: Counsellor 10% / ₹5,000 · Centre Head 25% / ₹25,000 · Accounts
25% / ₹25,000 · Academics 0 · Admin and Co-Admin unlimited.

### What happens when someone goes over

1. They enter a discount on the **fee plan** (after the admission is
   confirmed — there is no discount box on the confirm form any more).
2. **Within their limit:** it applies immediately.
3. **Over their limit:** it is **not applied**. It is saved as a *pending
   request*, and the student owes the **full fee** until it is approved. That
   is deliberate: a discount that already reduces the bill is one nobody hurries
   to approve.
4. Someone with the **approve discounts** permission decides. They also need
   **enough authority of their own** — a centre head can't approve a ₹50,000
   discount if their own ceiling is ₹25,000, and can't get around it by routing
   it through a colleague with the same ceiling. *Rejecting* only needs the
   permission.
5. Lowering a discount that was already approved is always allowed. Asking for
   *more* than was approved is a new request.

### Offers (Settings → Offers)

An **offer** is a named discount the institute is running ("Early Bird 5%").
It is **pre-approved**: choosing it needs nobody's sign-off. On the fee plan,
the offer and any **extra discount** sit side by side. The offer always
applies; the *total* is compared to the person's limit, so an extra on top of
an offer that takes it over their ceiling becomes a pending request for the
part above what is already approved.

### You can't raise your own limit

Anyone you give this setting to can change *other* roles' limits, with two
guard-rails (admins and co-admins with unlimited authority are exempt):

* They **cannot change their own role's limit**.
* They **cannot give any role more than they hold themselves** (including "no
  limit").

Lowering a limit is always allowed. Every change is written to the audit log.

---

## Who can change them

Each of the three has its own switch under **Settings → Roles & Permissions**,
so you can hand over exactly these and nothing else:

| Screen | Permission to tick | Notes |
|---|---|---|
| SLA Policies | **Manage SLA policies** (`sla.manage`) | Policies, ladders, business hours, holidays. Does **not** include assignment rules. |
| Targets | **Set targets** (`target.manage`) | Tick the **Centre** column to limit a centre head to their centre and people; **All** also allows the institute-wide number. |
| Discount Authority | **Set discount authority** (`discount.manage`) | Cannot raise their own limit (above). |

To give them to Centre Heads:

1. **Settings → Roles & Permissions → Centre Head.**
2. Tick the permission(s) above. For SLA and Discount any column except
   **None** works — they are institute-wide settings, so Centre and All behave
   the same. For Targets, choose **Centre**.
3. Save. The next time a centre head opens Settings, those entries appear and
   nothing else does.

Co-Admin already holds all three. Anything an existing role could do before
this change it can still do (roles that held *Manage rules* now also hold
*Manage SLA policies*; roles that held *Manage settings* now also hold *Set
discount authority*).

> **Think before giving centre heads the SLA setting.** A policy is
> institute-wide, not per centre. A centre head can edit or switch off a
> policy that applies to every centre. If you only want them to adjust
> *their* centre's hours and holidays, there is no narrower option today — it is
> all of SLA or none of it.
