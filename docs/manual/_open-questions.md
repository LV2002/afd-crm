# Open questions for Leon

Things the manual could not state confidently from the code alone.
Nothing below is guessed at in the chapters — where an answer was
unavailable, the manual either stays silent or describes only what the
code definitely does.

Answer these and I will fold them into the relevant chapter.

---

## 1. Who actually does onboarding?

**Chapter 8.4.** The system has an onboarding queue and an **Onboarding
done** button, but nothing in the code says what onboarding *is* at AFD —
which documents are collected, who allocates the batch, whether there is
a welcome call.

The manual currently says "do whatever your institute's onboarding
actually involves", which is honest but useless to a new member of staff.

**What I need:** the three or four steps, in order, and who does them.

---

## 2. Is there a password reset route for staff?

**Chapter 2.1.** The login page has **Email**, **Password** and **Sign
in**, and no "forgot password" link. An administrator can set a
temporary password (`user.reset_password`, Admin only — not Co-Admin).

**What I need:** confirmation that "ask an administrator" is the intended
process, and whether Supabase's own password-reset email is enabled for
this project. If it is, staff could reset their own and the manual should
say so.

---

## 3. What is the undo path for a wrongly confirmed admission?

**Chapters 7.1, 14.3, 16.** Confirming an admission is deliberately a
one-way door, and both the code and the confirmation dialog say only an
administrator can walk it back. I could not find a screen that does it.

**What I need:** how an administrator actually reverses it today — a
database change, or a step I have missed. Staff will ask, because they
will do it by accident.

---

## 4. Does the escalation ladder notify anybody today?

**Chapter 13.3.** SLA policies have an **Escalation ladder (JSON array)**
and the nightly sweep flags breaches. What I could not establish is what
an escalation rung actually *does* when it fires — whether anybody is
messaged, or whether the breach only surfaces on screen.

**What I need:** one sentence on what a staff member experiences when a
rung fires.

---

## 5. Is Knorish still used?

**Chapter 18.4.** `Knorish` is a seeded lead source. There used to be an
unbuilt webhook behind it; **custom webhooks replaced the need for one**
(Chapter 13.7), so if Knorish is still in use the answer is now an
endpoint an admin creates in two fields rather than a feature anybody has
to build.

**What I need:** is Knorish still in use? If yes, set up a custom webhook
for it and point Knorish's own integration settings at the URL. If no,
retire the dropdown option so it stops appearing in reports.

---

## 6. Telephony

**Chapter 13.7.** Settings → Integrations lists **Telephony** as "coming
soon". Click-to-call and call logging are not built.

**What I need:** nothing yet — flagging it so the manual gains a section
the day it ships, rather than staff discovering it.

---

## 7. House rules the software does not enforce

These are policy, not code, and a manual is the right place for them —
but they have to come from you:

- **When should a lead be moved to Parked rather than Lost?** The system
  offers both and says nothing about when to use which.
- **How long before an uncontacted lead is given to somebody else?**
- **Who may approve a discount above the Centre Head ceiling in
  practice** — the authority exists; the convention does not.
- **Is there a rule about logging every call, or is it expected
  behaviour?** The manual states it as the most important habit in the
  system, which I believe is right, but it is my emphasis rather than
  your instruction.

---

## 8. Screenshots

Every `[Screenshot: …]` placeholder in the chapters needs a real image.
There are eight. They live in `docs/manual/images/` once you add them —
see Chapter 19.2.

Current placeholders:

| Chapter | Shot needed |
|---|---|
| 2.1 | The login page |
| 2.2 | The main layout with the sidebar and a leads list |
| 4.1 | The Dashboard for a counsellor |
| 5.1 | The Leads list with the filter bar and buttons |
| 5.2 | The Pipeline board mid-drag |
| 6.1 | A lead detail page with all panels visible |
| 7.2 | The printed instalment agreement |
