# Chapter 14 — Troubleshooting

Grouped by what you were trying to do. If your problem is not here, check
**Settings → Platform Health** (administrators) — a broken integration
or a failed nightly job shows up there before anybody notices the
symptom.


## 14.1 Signing in and seeing things

**"Invalid login credentials"**
The email or password is wrong. There is no self-service password reset;
ask an administrator.

**I signed in but my sidebar is almost empty**
Your role has fewer permissions than you expect, or you have been given
no centre. Administrators: Settings → Users.

**A colleague describes a screen I cannot find**
You do not have permission for it. The sidebar only shows what you can
use. Not a fault.

**I can see the screen but the buttons are missing**
The same thing at a finer grain — for example `lead.export` controls
whether **Export CSV** exists at all.

**"You don't have permission to do that."**
You reached a page by link or by typing its address.

## 14.2 Leads

**I cannot find a lead I know exists**
Three usual causes, in order of likelihood:
1. It belongs to another counsellor and your scope is **own**.
2. A filter is still applied. Clear the filter bar.
3. It was deleted — check **Leads → Deleted** if you can.

**Searching does nothing**
Press **Enter**. The search runs on Enter, not as you type.

**The phone number is dots**
That is the mask. Open the lead and click the number to reveal it
(Chapter 6.4). Revealing is recorded.

**I created a lead that already existed**
No harm done, and no error by design. The enquiry attached to the
existing person, or the pair is in **Merge review**.

**A lead has two records**
Open **Leads → Merge review**. If it is not there, the two have
different phone numbers — the system had no way to know. A merge needs
`lead.merge`.

**I cannot change a lead's stage**
You lack `lead.update` for that lead.

**Moving a lead to Lost will not complete**
A reason is mandatory. Pick one under **Select a reason**, then **Move
to Lost**.

**A lead I marked Hot is Warm again**
A manual temperature wins for a few days, then the nightly rules take
over (Chapter 5.6).

**The Unassigned queue keeps filling**
No assignment rule matches those leads. Add a catch-all rule at the
lowest priority (Chapter 13.3).

## 14.3 Admissions and payments

**"There is no fee for this" when confirming an admission**
No fee structure matches that course + centre + mode + academic year.
**Check the academic year first** — it is the usual culprit. Either an
administrator adds the structure, or you use **Manual fee override**.

**I confirmed the wrong course / confirmed too early**
Only an administrator can undo it. It is deliberately a one-way door.

**I recorded a payment for the wrong amount**
You cannot edit or delete it. Record a **reversal** and then the correct
payment (needs `payment.refund`). The ledger keeps both, which is the
point.

**There is no account to receive the payment into**
No bank or cash account exists. Administrators or accounts:
Finance → Bank & cash accounts.

**The student record was not created**
It is created at the **first cleared payment**, not when the admission is
confirmed. Check a payment has actually been recorded.

**My conversion disappeared from the numbers**
The admission was probably marked **dropped**. Open the lead — a dropped
admission shows in red with the reason.

**The instalments do not add up**
The fee panel says so explicitly and by how much. Fix it before printing
the agreement.

**The receipt has no address on it**
Settings → Organisation is incomplete. Fill in the letterhead.

## 14.4 Chats

**I cannot reply to a WhatsApp message**
Either more than 24 hours have passed since their last message — Meta's
rule, not ours; use an approved template — or the thread is not matched
to a lead, so there is nothing to record the message against.

<!-- only: staff -->
**A broadcast has not gone out — scheduled, or sent now**
Both wait for the same sweep, so "send now" is not immediate either —
give it a few minutes. If a broadcast is still sitting there much later,
an administrator can send it at once and find out why the sweep is
behind.
<!-- /only -->
<!-- only: admin -->
**A broadcast has not gone out — scheduled, or sent now**
Both wait for the same sweep, so "send now" is not immediate either.
Check **Settings → Platform health → Every ten minutes**: if it shows no
run, or one much older than ten minutes, the sweep is not running often
enough and that is the whole explanation. Press **Send anything that is
waiting** on the same screen to send it this minute, and see
`docs/CRON-SETUP.md` for the three-minute, no-cost fix.

**Nothing an automation sends ever arrives**
Same cause, same screen. An automation's steps — including the first —
only move when the sweep runs. Also check the automation is switched
**On**, and read the **Only:** line under its trigger on the automations
list: conditions narrowed too far mean it matches nobody.
<!-- /only -->

<!-- only: admin -->
**No inbound WhatsApp message reaches the inbox**
**Settings → Platform health → Inbound deliveries** answers this in one
look, and it has three different answers:
- **Nothing received.** Meta is not calling. The callback URL or the
  subscribed fields are wrong, on Meta's side — `docs/WHATSAPP-SETUP.md`.
- **Received, with some rejected.** Meta is calling and being refused
  because the signature does not match. The **App secret** stored on
  **Settings → Integrations → WhatsApp** is not the one belonging to the
  Meta app that is sending. **WhatsApp keeps its own copy, separate from
  Meta Lead Ads and Instagram** — setting one does not set the other, and
  this is the usual way it happens.
- **Received, none rejected.** The messages are in. Look at the inbox
  filter, and at whether the number they arrived on is registered under
  **Settings → Integrations → WhatsApp numbers**.

<!-- /only -->
**My new template cannot be used yet**
Meta reviews templates, usually within a day.

**Somebody did not get a broadcast**
Check **Chats → Opted out**. Opted-out numbers are excluded from
everything, permanently.

<!-- only: staff -->
**Instagram shows nothing**
It is probably not connected. The tab says exactly what is missing;
connecting it is an administrator's job.
<!-- /only -->
<!-- only: admin -->
**Instagram shows nothing**
It is probably not connected. The tab says exactly what is missing. The
two things people forget: the **Allow access to messages** switch in the
Instagram app itself, and subscribing the webhook to the **Instagram**
object rather than the Page.

**Instagram only shows messages from people who run the page**
This is not a fault and not fixable in the CRM. A Meta app starts in
**Development mode**, and in that state Meta delivers messages only from
people who hold a role on the app — which is why your own test DMs and
your colleagues' arrive and a student's does not. Exactly the same rule
as ad leads (14.6).

Two things, both on Meta's side, and **both** are needed — Live mode
with only Standard access still delivers nothing new, which is why
flipping the toggle alone appears to change nothing:
1. **Advanced Access** for `instagram_manage_messages`
   (App Review → Permissions and Features → Request advanced access).
2. The app switched to **Live** mode (top of the app dashboard).

The Live toggle refuses until App settings → Basic has a privacy policy
URL, terms URL, icon, category and data-deletion URL, and — for a
Business-type app — business verification. When it refuses vaguely, the
real reason is usually sitting under **Required actions** or **Alerts**
in the left sidebar. `docs/WHATSAPP-SETUP.md` § 6a has the order that
wastes least time.

Until then, a member of the public's DM is **not queued anywhere** — it
is simply never delivered, so there is nothing to recover afterwards.
Review usually wants Business Verification done first.
`docs/WHATSAPP-SETUP.md` Part 6 is the single submission that covers this
along with everything else.

<!-- /only -->
**A message I sent from my phone is not in the CRM**
Known and expected for Instagram. The CRM records what it sends itself.

## 14.5 Reports and advertising

**Two of us see different totals on the same report**
Correct. Reports are scoped: your own leads, your centre, or the
institute.

**Ad Performance shows no spend**
The page tells you which of three it is:
- *not connected at all* — credentials missing (administrator)
- *connected but never synced* — the hourly sync has not run yet; press
  **Import past ad spend**, or see 14.6a
- nothing spent in those dates — nothing to fix

**Ad Performance will not open at all**
It needs institute-wide report access. Advertising cannot honestly be
split by centre, so the page declines rather than inventing a number.

**This month's cost per admission looks terrible**
Recent months are genuinely incomplete: a lead that arrived in March
often enrols in May. The number improves on its own.

**The retargeting audience is "too small"**
Meta will not run an audience below roughly a thousand matched people.
At ~200 leads a month that takes several months. Nothing to fix.

**A dash instead of a number**
The sum has no answer yet. It is not zero.

<!-- only: admin -->
## 14.6 Leads not arriving from ads

Work through this in order:

1. **Settings → Integrations → Meta → Recent deliveries.** Empty means
   Meta has never called the CRM — the problem is on Meta's side.
2. **Is the Page subscribed?** Press **Subscribe this Page to leads**.
   This is the switch everyone misses.
3. **Is the app approved?** `leads_retrieval` must be through App Review.
4. **Did a delivery fail?** The row says why, in Meta's own words.
5. **Did a test lead "fail"?** Meta's **Create lead** button fills every
   answer with placeholder text, so there is no real phone number. That
   is the whole chain working with nothing real at the end of it. Use
   **Preview form** and fill it in yourself.

## 14.6a Ad spend, or any overnight figure, has not updated

**Check the schedules first.** Settings → Platform Health, at the top.
Ad spend and the retargeting audiences are on the **hourly** schedule;
everything else overnight is on the **daily** one at 10:00 IST. Each has
its own panel saying whether it ran and what each job did.

Four different answers, four different fixes:

| What the panel says | What it means |
|---|---|
| *No run recorded* under **Hourly** | The hourly schedule was never set up, so spend updates once a day instead. Not a fault — see `docs/CRON-SETUP.md`. |
| *No run recorded* under **Daily** | Nothing scheduled is running at all. Usually `CRON_SECRET` is missing from the hosting environment — see Chapter 13, Platform Health. |
| *Last run* far older than the schedule's interval | That schedule has stopped firing. For the daily one check Vercel → Project → Cron Jobs; for the other two check whatever calls them. |
| The job ran, *nothing to do: not-configured* | The credentials for that integration are not saved. For Meta ad spend that is the **Ads access token** and **Ad Account ID** in Settings → Integrations → Meta — the Page token that brings in leads is a different token and does not cover spend. |
| The job *failed* with a message | That message is the answer. A 401 from Meta means the token expired or lacks a permission. |

Once the credentials are in, the nightly run picks spend up the same
night, and **Import history** on the integration screen pulls the days
that were missed rather than leaving a gap.

## 14.7 Form answers not reaching the CRM

**A question's answer is missing from the lead**
Open **Recent deliveries**. The row names the questions nothing matched,
with the fix: add a field in Settings → Custom Fields whose **Label** is
that question.

**An answer is there but spelled oddly**
It did not match any dropdown option, so it was kept exactly as the lead
typed it rather than thrown away. Add that value in
Settings → Dropdowns and it will group properly from then on.

<!-- /only -->
## 14.8 Imports

**"Couldn't find any columns or rows in that file."**
An Excel file renamed to `.csv`, or an empty sheet. Save as CSV
properly.

**The Next button stays greyed out**
**Student Name** and **Primary Phone** must both be mapped.

**Most rows say "matched an existing lead"**
Those phone numbers are already in the system. Nothing was duplicated
and nothing was lost.

**Phone numbers imported as `9.85E+09`**
The spreadsheet did it. Format the column as text before exporting.

## 14.9 Something is just broken

- Note **exactly** what you did and what you saw.
- Administrators: **Settings → Platform Health** records unhandled
  errors with their details. Most problems are already listed there
  before anyone reports them.

---

[Back to contents](#contents)
