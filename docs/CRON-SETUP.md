# The CRM's schedules

**Who this is for:** Leon, or whoever administers the deployment.
**What you have to do:** create two jobs on cron-job.org. About five minutes.
**Cost:** nothing.

---

## The three schedules, and why there are three

The jobs are three different kinds of thing, and putting them all in one
daily run made two of them behave badly.

| | When | Jobs | Why that often |
|---|---|---|---|
| **Frequent** | every 10 min | WhatsApp automations · Scheduled broadcasts · Response-time sweep | A queue being drained. Nothing an automation or a broadcast sends leaves the building until this runs. |
| **Hourly** | :25 past | Meta & Google ad spend · Both retargeting audiences | Numbers somebody reads during the day, and audiences a lead should join the day they enquire. |
| **Daily** | 10:00 IST | Fee reminders · Temperature · Google offline conversions — **and everything above** | Work that should happen once, at a civilised hour. Plus a safety net. |

**Why the daily run repeats the other two:** the first two are called by
cron-job.org, which is outside the application and can be paused,
deleted, or quietly stop. The daily one is configured in `vercel.json`
and ships with the code. With it as a backstop, the worst case of any
scheduler failure is the once-a-day behaviour this system had before the
tiers existed — **late, but never lost**.

**What is not on a schedule at all:** a counsellor replying in the inbox,
sending one template to one person, sending a file. Those go out on the
button press and always have. Inbound messages arrive by webhook within
seconds — no cron involved.

---

## Before you start

You need the value of **`CRON_SECRET`** from Vercel:
**Project → Settings → Environment Variables**.

If it is not set there, nothing scheduled works at all — including the
daily run. The schedule calls, the CRM answers "not allowed", and nothing
happens, with no failure recorded anywhere, because being turned away is
not an error. If you need to set it: generate a long random value, add it
in Vercel, **redeploy** (environment variables only reach a new build),
and use that same value below.

You also need your CRM's address, e.g. `https://afd-crm-one.vercel.app`.

---

## Job 1 of 2 — the ten-minute schedule

1. Sign up at **cron-job.org** and confirm the email.
2. Press **Create cronjob**.
3. **Title**: `AFD CRM — frequent (10 min)`
4. **URL**:

   ```
   https://YOUR-CRM-ADDRESS/api/cron/frequent
   ```

5. **Execution schedule**: choose **Every 10 minutes**.
   (On the custom tab that is minutes `*/10`, every hour, every day.)
6. Open the **Advanced** section.
   - **Request method**: `GET`
   - Under **Headers**, add one:

     | Key | Value |
     |---|---|
     | `Authorization` | `Bearer YOUR-CRON-SECRET` |

     The word `Bearer`, **one space**, then the secret. Nothing else.
7. Leave **Enable job** switched on. Press **Create**.
8. Press **Test run**. You want **HTTP 200**.

## Job 2 of 2 — the hourly schedule

Same again, with three things different:

- **Title**: `AFD CRM — hourly`
- **URL**: `https://YOUR-CRM-ADDRESS/api/cron/hourly`
- **Schedule**: every hour, at **minute 25**.
  (Custom tab: minutes `25`, every hour, every day.)

Minute 25 rather than 0 for a dull but real reason: a great many
schedules in the world run on the hour, and the ten-minute job already
fires on the tens. There is no reason to join a queue.

---

## Then check it from inside the CRM

**Settings → Platform health → Scheduled work.**

Within ten minutes, **Every ten minutes** should show a run. Within the
hour, so should **Hourly**. Each panel lists what every job did —
including the ones that ran and did nothing because an integration has no
credentials yet, which reads as `ok — nothing to do: not-configured` and
is a token to paste in rather than a bug.

That screen is also where this shows up later if a job is paused or the
secret stops matching, so it is worth knowing where it is.

---

## Two settings on cron-job.org worth turning on

**Failure notifications.** In the job's settings, enable the email alert
for failures. A scheduler that stops silently is how this entire class of
problem happens — the original once-a-day cron looked healthy for weeks
while being refused at the door every time.

**Treat a non-2xx as failure.** This is the default; leave it. The CRM
answers `500` when a job inside the run fails, and `401` if the secret is
wrong, and you want to hear about both.

---

## If a test run does not return 200

| What you see | What it means |
|---|---|
| **401** | The `Authorization` header is wrong or missing. Check the word `Bearer`, the single space, and that the secret matches Vercel exactly — no quotes, no trailing newline. |
| **404** | The URL is wrong. It must end `/api/cron/frequent` or `/api/cron/hourly`, on your own domain. |
| **500** | The call got in and a job inside it failed. **Settings → Platform health** names which one and why. |
| **Timeout** | The run took longer than cron-job.org waits. Raise the job's timeout in its advanced settings to 60 seconds. |

> ### Why the secret has to be a header
>
> `CRON_SECRET` is only read from the `Authorization` header — the CRM
> will not accept `?secret=` in the URL. That is deliberate: a secret in a
> query string lands in the hosting access log, the scheduler's own run
> history, and any referrer, and a credential you cannot rotate out of
> six logs is worse than a slow broadcast.

---

## Rejected, and why

- **GitHub Actions.** Was committed as two workflow files and then
  removed, at Leon's instruction, and he is right: GitHub queues
  scheduled workflows at low priority, so `*/10` really means every ten
  to twenty-five minutes, and it disables scheduled workflows on a
  repository with no commits for 60 days. For the one schedule where
  punctuality is the entire point, that is the wrong tool.
- **A second `crons` entry in `vercel.json`.** The tidiest answer, and
  the Hobby plan does not allow it — a scheduled job there fires once a
  day. On a plan with minute-level cron, add entries pointing at
  `/api/cron/frequent` and `/api/cron/hourly`, delete the cron-job.org
  jobs, and nothing in the code changes.
- **Putting the secret in the URL** so simpler schedulers work. See the
  box above.
- **Running `/api/cron/daily` every ten minutes.** The obvious move and
  the wrong one: 144 ad-spend and retargeting calls a day to Meta and
  Google, re-uploaded offline conversions, and fee reminders landing at
  3am.
- **Cloudflare Workers / Upstash QStash.** Both work and both are free at
  this volume. Both need code or a CLI to set up, which is a worse trade
  than a web form for two URLs on a fixed interval.

---

## A note on the hosting plan

Vercel's Hobby plan is for non-commercial use, and this is a business.
Pro also gives minute-level cron scheduling, which makes this whole
document unnecessary — two `crons` entries and done. Worth weighing
against the five minutes this takes.

---

## When something is not going out

In this order, all on **Settings → Platform health**:

1. **The relevant schedule's panel.** No run recorded means nothing is
   calling it. A run much older than its interval means it has stopped —
   check the job is still enabled on cron-job.org and that its last runs
   there are 200s.
2. **That panel's job list.** A job listed `failed` names its own error.
3. **Press "Send anything that is waiting."** It does the frequent
   tier's work immediately, which both unblocks whatever you were waiting
   for and separates "the scheduler is not calling" from "the job itself
   is broken".
4. **Inbound deliveries**, if the problem is messages coming *in* rather
   than going out. That is webhooks, a different system entirely, and
   that panel diagnoses it.
