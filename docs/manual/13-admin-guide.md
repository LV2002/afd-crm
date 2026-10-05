# Chapter 13 — Admin guide

Everything in **Settings** (`settings.manage`). Twenty-five entries,
grouped below by what you would actually be trying to do.

**The governing idea:** almost nothing about this system is hardcoded. If
you find yourself thinking "a developer would have to change that", check
here first — stages, roles, fields, dropdowns, rules, templates, fees,
notification wording and dashboard layouts are all editable records.

## 13.1 People

### Settings → Users

Create, deactivate, change role and centre membership.

**Procedure: add a user**

**Goal** — give a new member of staff access.

**Before you start** — `users.manage`. Centre heads can do this for
their own centres.

**Steps**
1. **Settings** → **Users** → new user.
2. **Full name**, **Email** (their login), **Phone**.
3. **Role** — *Select a role*.
4. **Centres** — tick every centre they work at. This drives every
   "centre" scoped permission.
5. **Temporary password** — set one and tell them in person.
6. Save.

**What you should see** — they appear in the list and can sign in.

**Common mistakes**
- *No centre.* A centre-scoped role with no centre sees nothing.
- *Emailing the password alongside the address.* Hand it over in person
  or by a different channel.

**Procedure: when somebody leaves**
1. **Settings** → **Users** → open them.
2. **Deactivate.** Do not delete: their name must stay on every
   interaction, payment and audit row they created.
3. Reassign their open leads (Chapter 5.3).

**Procedure: reset a password**
Needs `user.reset_password` — **Admin only**, not Co-Admin. Open the
user and set a new temporary password.

### Settings → Roles & Permissions

Create a role, rename it, change its permission bundle. Each permission
is granted at **own**, **centre** or **all**.

A role has a **Name**, a **Code** (for example `front_desk`) and a
**Description**.

**The Admin role is protected** — it cannot be deleted or stripped, so
the institute cannot lock itself out.

**Before changing a role, remember it affects everybody who has it.**
Removing `lead.export` from Centre Head removes it from all of them at
once.

### Settings → Discount Authority

How much each role can take off a fee before approval is needed:
a percent, an amount, or unlimited. See Chapter 3.3 for the shipped
figures. A request above the ceiling is recorded as pending, never
refused.

## 13.2 The institute

### Settings → Organisation
Name, legal name, tagline, logo, colour, full letterhead (address, city,
state, pincode, phone, email, website, GSTIN), a document footer,
timezone, currency, locale, fiscal year start, GST rate and date format.

**These are not cosmetic.** The address and GSTIN print on every receipt
and agreement. A receipt with no address is not a receipt anybody will
accept.

### Settings → Terminology
Rename lead, student, counsellor, centre, course and exam — **Singular**
and **Plural**. Change "Lead" to "Enquiry" and the sidebar, the page
titles and the buttons all follow.

### Settings → Centres
Create, edit and deactivate centres: **Name**, **City**, **Address**,
**Phone**, **Email**, **Timezone**. Deactivate rather than delete —
history points at them.

## 13.3 The sales process

### Settings → Pipeline Stages
Add, rename, reorder, recolour. Each stage has a **type** (fixed list:
new, normal, scheduled, enrolment_form, payment, won, lost, parked), a
**probability** used by the forecast, an optional **SLA hours**, and
whether it **requires a reason**.

**Choose the type carefully** — it drives behaviour, not just colour. A
`lost` stage demands a reason; a `won` stage counts as an admission.

### Settings → Temperatures
The temperature values themselves, their colours and order, and the
rules that assign them. A rule has **Sets temperature to**, a
**Priority**, and **Conditions (JSON)**.

> **Conditions are entered as JSON.** This is the one genuinely technical
> screen. If you are not comfortable with it, leave the shipped rules
> alone — they work.

Remember the override window: a manual temperature beats the rules for a
few days (Settings → Organisation sets how many), then the rules resume.

### Settings → Assignment Rules
Who gets a new lead. **This is the screen that stops leads going
unassigned.**

A rule has a **Name**, a **Priority** (lower numbers are considered
first), **Active**, conditions under *Run this rule when a lead is …*,
and a strategy:

- **Fixed** — always this person (*Choose a person*)
- **Round robin** — rotate between several (*Share between*)

Rules can also set the centre, or **Leave the centre alone**.

**Procedure: route a source to a person**
1. **Settings** → **Assignment Rules** → new rule.
2. Name it, e.g. *Kannur Meta NIFT → Athira*.
3. Set the conditions: centre Kannur, source Meta, exam NIFT.
4. Strategy **Fixed**, *Choose a person* → Athira.
5. Set the priority so it is considered before any catch-all.
6. **Active**, save.

**What you should see** — matching new leads are assigned on arrival,
whatever route they came in by. Watch the **Unassigned** badge: if it
keeps filling, no rule matches those leads and you need a catch-all at
the lowest priority.

### Settings → SLA Policies
Response-time targets and what happens when they are missed: **Name**,
**Priority**, **Measure**, **Target hours**, **Applies to (JSON, empty =
everyone)** and an **Escalation ladder (JSON array)**. Business hours
and holidays (for example *Onam*, marked **Closed**) are set here too,
so a target does not expire overnight on a day the office is shut.

Two of these fields are JSON. Same caution as temperatures.

### Settings → Tags
Labels a lead can carry: **Name** and **Colour**.

### Settings → Dropdowns
Every enumerated list: the fourteen categories in the Appendix, each
with its options. Add an option whenever a real answer does not fit —
this is what keeps "Other" from swallowing your reporting.

**You cannot delete an option that is in use** without orphaning
records. Deactivate it instead: existing records keep it, new ones
cannot choose it.

### Settings → Custom Fields
Add a field to lead, student or enrolment with **no developer and no
downtime**.

A field has an **Entity**, a **Key** (e.g. `preferred_shift`), a
**Label**, **Help text**, a **Type**, a **Section** (e.g. *Personal*),
**Options (one per line, value:label)** for select types, **Required**,
**Show in filters**, and **Visible to roles (empty = everyone)**.

**This is also how you capture a new question from an ad form**: add a
field whose **Label** is the question Meta is sending, and the answers
start landing (Chapter 13.7).

## 13.4 Money

### Settings → Fee Structures
The base fee for a combination of **Course**, **Centre**, **Mode** and
**Academic year**, plus the **Base fee (₹)**.

**Get this right before an admission season.** If no structure matches,
the admission form cannot price the course and the counsellor has to
override by hand. The academic year is the usual mismatch.

### Settings → Offers
Named discounts: **Name** (e.g. *Early Bird*), **Code (optional)**
(e.g. `EARLY26`), **Type** (**Percent** with an optional *Up to (₹)*, or
**Amount off (₹)**), **From** and **Until**, **Max uses**, and
**Courses (blank = all)** / **Centres (blank = all)**.

### Settings → Payment Reminders
The chase ladder for unpaid instalments. Each rung has a **Name** (e.g.
*First nudge*), **Days after due**, how to **Send** it, an **Approved
template** (e.g. `fee_reminder`) and a **Language**.

Four rungs ship. Reminders go out on the nightly run and are recorded,
so nobody is chased twice by the same rung.

### Settings → Batches
Class groups: **Batch name** (e.g. *NIFT Foundation — Morning*),
**Centre**, **Academic year** (e.g. `2026-27`), **Course**, **Mode**,
**Starts**, **Ends** and **Seats** (or **No limit**). You can move a
student between batches with a **Reason (optional)**.

### Settings → Targets
The monthly numbers for the institute, each centre and each person.
Feeds the **Targets** tab in Insights.

## 13.5 What people see

### Settings → Dashboards
Which widgets each role sees and in what order. You can **remove** a
widget from a role but never **add** one the role has no permission for —
it would draw a card of zeroes, and a zero is a number somebody will
believe.

### Settings → Notifications
Which events notify which roles, on which channels, and **in what
words**. The copy is editable.

Sixteen events ship, grouped by what they are about:

| Group | Events |
|---|---|
| **Leads** | New lead arrived · Lead assigned · WhatsApp reply · Automation needs a person |
| **SLA** | SLA breached · SLA escalation step |
| **Admissions** | Admission confirmed · Admission dropped · Student profile form submitted |
| **Money** | Payment recorded · Fee instalment overdue · Fee changed after admission · Discount needs approval · Discount approved or rejected |
| **Academics** | Student joined (accounts → academics) · Course or batch changed |

Each has three switches: whether it fires at all, which **roles** hear
it, and whether the lead's **own counsellor** hears it regardless of
role. Nobody is ever told about a lead they could not open anyway — a
Kannur centre head is not notified about a Kochi lead — and nobody is
told about their own action.

**New lead arrived** fires for every lead from every source, including
ones the assignment rules could not place; it says *Assigned to nobody
yet* when that happens. It goes to centre heads by default and not to
the counsellor, who hears about the same lead through **Lead assigned** a
moment later. If a centre head finds two hundred a month too many, turn
the event off here rather than living with it.

### Settings → Student Profile Form
Which questions students answer on their own form. Keep internal fields
(batch, status, centre) off it.

## 13.6 Oversight

### Settings → Audit Log
**Admin only** (`audit.read`). Every change and every export: **Who**,
**What they touched**, the **Table**, and **Before** / **After**, with
filters for **Anybody**, **Any table**, **Anything**, **From**, **To**
and **Clear filters**.

Not available to Co-Admin or Centre Head — it cannot be scoped to a
centre, so a centre-scoped grant would expose the whole institute's log.

### Settings → Platform Health
**Platform health** lists anything that has broken — a failed webhook, a
failed nightly job, an unhandled error — with what it was and how often,
plus **Recently marked fixed**.

**Check this weekly.** It is where a quietly broken integration shows up
before anybody notices leads have stopped arriving.

### Settings → Config Export/Import
See Chapter 12.4.

## 13.7 Integrations

**Settings → Integrations** lists Meta, Google, WhatsApp, Website forms
and Telephony (not built), each marked **Connected** or **Not
connected**.

**Before anything else:** if the page says credentials cannot be saved,
the encryption key is missing from the hosting environment. Nothing can
be connected until that is set — it is the one setting that cannot live
in the database, because it is the key everything else is encrypted
under.

### Meta
Fields: **App ID**, **App Secret**, **Verify Token**, **Page Access
Token**, **Ads Access Token**, **Ad Account ID** (digits only, no
`act_`), **Instagram Account ID**.

Three things on this screen besides credentials:
- **Test connection**
- **Subscribe this Page to leads** — Meta has *two* delivery switches and
  this is the second. With only the first, Meta reports the webhook as
  subscribed and delivers nothing, with no error anywhere.
- **Recent deliveries** — one panel for leads, one for Instagram. This is
  the answer to "is anything arriving?", and an empty list is itself the
  answer.

**Ad spend history** — the **Import past ad spend** button pulls ninety
days per press, working backwards. Four presses is a year. It shows the
dates already stored, and goes dead when there is nothing older.

**Retargeting audiences** — explains how retargeting works and sets the
window (**180 days** by default; `0` means no cutoff). Counted from the
later of when the lead arrived and the last activity on it, so somebody
still being followed up stays in.

**Form questions.** Meta names four questions itself; everything else on
your form is matched to a CRM field by name, label or keyword. An answer
with no matching dropdown option is **kept as typed**, and a question
nothing matched is **named on the delivery row** with the fix: add a
field whose label is that question (13.3).

### Google
**Webhook Verify Key**, **OAuth Client ID**, **OAuth Client Secret**,
**OAuth Refresh Token**, **Developer Token**, **Customer ID** (digits
only), **Manager (Login) Customer ID**, **Offline Conversion Action**.

Lead delivery takes five minutes and needs no approval; the reporting
parts wait on Google approving a developer token. Same **Import past ad
spend** button. Full walkthrough in `docs/ADS-SETUP.md`.

### WhatsApp
**App Secret**, **Verify Token**, **Access Token**, **Phone Number ID**,
**WhatsApp Business Account ID**. Note these are stored separately from
Meta's even when it is the same app — you must enter the App Secret in
both places.

### Website forms
A signing secret and a webhook address for your own site's forms.

### Where each webhook points

| Source | Address |
|---|---|
| Meta Lead Ads | `/api/webhooks/meta-leads` |
| Instagram DMs | `/api/webhooks/instagram` |
| WhatsApp | `/api/webhooks/whatsapp` |
| Google lead forms | `/api/webhooks/google-leads` |
| Your website | `/api/webhooks/website` |

Every delivery is written down **before** it is processed, so a failure
is visible rather than silent.

## 13.8 What happens overnight

One scheduled run, at **10:00 IST**, does all of this in order:

1. Response-time (SLA) sweep
2. Temperature recalculation
3. Fee reminders
4. Meta retargeting audience
5. Google retargeting audience
6. WhatsApp automations
7. Scheduled broadcasts
8. Meta ad spend
9. Google ad spend
10. Google offline conversions

Ordered by how fast the value decays. If the run is short of time the
last jobs are skipped, not failed — tomorrow picks them up. That is why
a scheduled broadcast set for 3pm goes out the next morning, and why a
one-day gap in ad spend is normal.

---

[Back to contents](#contents)
