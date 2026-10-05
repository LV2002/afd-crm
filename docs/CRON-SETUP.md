# The CRM's schedules

**Who this is for:** Leon, or whoever administers the deployment.
**What you have to do:** add two secrets to GitHub. About three minutes.
**Cost:** nothing.

---

## The three schedules, and why there are three

The jobs are three different kinds of thing, and lumping them into one
daily run made two of them behave badly.

| | When | Jobs | Why that often |
|---|---|---|---|
| **Frequent** | every 10 min | WhatsApp automations · Scheduled broadcasts · Response-time sweep | A queue being drained. Nothing an automation or a broadcast sends leaves the building until this runs. |
| **Hourly** | :25 past | Meta & Google ad spend · Both retargeting audiences | Numbers somebody reads during the day, and audiences a lead should join the day they enquire. |
| **Daily** | 10:00 IST | Fee reminders · Temperature · Google offline conversions — **and everything above** | Work that should happen once, at a civilised hour. Plus a safety net. |

**Why the daily run repeats the other two:** the frequent and hourly
schedules live *outside* the application, so they can be absent,
disabled, or quietly broken. The daily one ships in `vercel.json`. With
it as a backstop, the worst case of any scheduler failure is the
once-a-day behaviour this system had before the tiers existed — late, but
never lost.

**What is not on a schedule at all:** a counsellor replying in the inbox,
sending one template to one person, sending a file. Those go out on the
button press and always have. Inbound messages arrive by webhook within
seconds — no cron involved.

---

## What is already done

- `/api/cron/frequent` and `/api/cron/hourly` exist.
- `.github/workflows/cron-frequent.yml` and `cron-hourly.yml` are
  committed, with the schedules in them.
- The daily run stays on Vercel's own scheduler, unchanged.
- **Settings → Platform health** shows all three, with the last run of
  each and what every job did.

## What you have to do — two secrets

GitHub needs to know where the CRM is and what the password is.

1. Go to the repository → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Add:

   | Name | Value |
   |---|---|
   | `CRM_BASE_URL` | `https://your-crm-domain` — no trailing slash |
   | `CRON_SECRET` | the **same** value as `CRON_SECRET` in Vercel |

3. **Merge the pull request first.** GitHub only runs scheduled workflows
   that are on the repository's **default branch**. While the workflow
   files sit on a feature branch they will not fire, however correct the
   secrets are. You can still test them by hand (next step).

4. Test it now: **Actions** → **CRM — frequent jobs (10 min)** → **Run
   workflow**. Green tick is success.

5. Confirm from inside the CRM: **Settings → Platform health → Every ten
   minutes** should show a run from a moment ago.

> ### If `CRON_SECRET` is not already set in Vercel
>
> Nothing scheduled works at all without it, including the daily run —
> the schedule calls, the CRM answers "not allowed", and nothing happens
> with no failure recorded anywhere, because being turned away is not an
> error. Generate a value, set it in Vercel's environment variables,
> **redeploy** (environment variables only reach a new build), and use
> the same value in the GitHub secret.

> ### The secret travels in a header, never the URL
>
> `CRON_SECRET` is only read from the `Authorization` header, and the CRM
> will not accept it as `?secret=`. That rules out the simplest
> schedulers, deliberately: a secret in a query string lands in the
> hosting access log, the scheduler's own history, and any referrer — and
> a credential you cannot rotate out of six logs is worse than a slow
> broadcast.

---

## Two things to know about GitHub's scheduler

Worth reading once, because both are surprising.

**It is not punctual.** Scheduled workflows are queued at low priority,
so `*/10` really means every ten to twenty-five minutes, sometimes worse
at peak times. Fine for broadcasts and ad spend. If you want an
automation's first message inside ten minutes reliably, use the
cron-job.org option below for that one schedule.

**It switches itself off.** GitHub **disables scheduled workflows on a
repository with no commits for 60 days**, with one email about it. If
development goes quiet for two months, these stop — and the daily run
carries on, so the symptom is broadcasts going back to next-morning
rather than anything breaking. The frequent-run panel on Platform health
is where that shows up.

---

## The alternative, if you want tighter timing

**cron-job.org** — free, down to one minute, genuinely punctual, sends
custom headers, and emails you when a job starts failing.

1. Sign up and confirm the email.
2. **Create cronjob.**
3. **Title**: `AFD CRM — frequent`.
4. **URL**: `https://your-crm-domain/api/cron/frequent`
5. **Schedule**: every 10 minutes.
6. **Advanced** → **Headers**, add one:
   - Name `Authorization`
   - Value `Bearer <CRON_SECRET>` — the word `Bearer`, one space, the secret.
7. **Create**, then **Test run**. A 200 is success.

If you do this, delete `.github/workflows/cron-frequent.yml` or you will
have two schedules calling the same endpoint. Harmless — every job is
idempotent, so the second finds nothing to do — but confusing when
reading the run history.

Repeat with `/api/cron/hourly` if you want that punctual too; it matters
much less.

---

## Rejected, and why

- **A second `crons` entry in `vercel.json`.** The right answer, and the
  Hobby plan does not allow it — a scheduled job there fires once a day.
  On a plan with minute-level cron, add entries pointing at
  `/api/cron/frequent` and `/api/cron/hourly`, delete the workflows, and
  nothing in the code changes.
- **Putting the secret in the URL** so header-less schedulers work. See
  the box above.
- **Running `/api/cron/daily` every ten minutes.** The obvious move and
  the wrong one: 144 ad-spend and retargeting calls a day to Meta and
  Google, re-uploaded offline conversions, and fee reminders landing at
  3am.
- **Cloudflare Workers / Upstash QStash.** Both work and both are free at
  this volume. Both need a little code or CLI, and neither beats the two
  options above for calling a URL on a fixed interval.

---

## A note on the hosting plan

Vercel's Hobby plan is for non-commercial use, and this is a business.
Pro also gives minute-level cron scheduling, which makes this whole
document unnecessary — two `crons` entries and done. Worth weighing
against the three minutes the GitHub option takes.

---

## When something is not going out

In this order, all on **Settings → Platform health**:

1. **The relevant schedule's panel.** No run recorded means nothing is
   calling it. A run much older than its interval means it has stopped.
2. **That panel's job list.** A job listed `failed` names its own error.
   One listed `ok — nothing to do: not-configured` is missing a
   credential, not broken.
3. **Press "Send anything that is waiting."** It does the frequent tier's
   work immediately — which both unblocks whatever you were waiting for
   and separates "the scheduler is not calling" from "the job is broken".
4. **Inbound deliveries**, if the problem is messages coming *in* rather
   than going out. That is webhooks, a different system entirely, and
   that panel diagnoses it.
