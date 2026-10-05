# Running the CRM's scheduled jobs

**Who this is for:** Leon, or whoever administers the deployment. About
five minutes, no cost.

**What it fixes:** on the hosting plan's own scheduler, the CRM gets
**one scheduled run a day**. That is fine for nine of the ten jobs and
wrong for two of them, because those two are a queue being drained:

- **WhatsApp automations.** Every step, including the first. An
  automation triggered by a new enquiry at 11am sends its first message
  at 10:00 the next morning.
- **Scheduled broadcasts.** Including the ones sent *now* — pressing
  Send queues the recipients and marks the broadcast `sending`; a sweep
  does the actual sending. Press Send at 2pm, messages leave at 10:00
  tomorrow.

Everything a counsellor does by hand is unaffected and always has been:
replying in the inbox, sending one template to one person, sending media.
Those go out the moment the button is pressed. Inbound messages are also
immediate — they arrive by webhook, not by schedule.

---

## What you are setting up

Something outside the CRM that calls one URL every ten minutes:

```
GET https://<your-crm-domain>/api/cron/frequent
Authorization: Bearer <CRON_SECRET>
```

That endpoint runs the three time-critical jobs and nothing else —
automations, broadcasts, and the response-time sweep. It deliberately
does **not** run the ad-spend syncs, the retargeting pushes, the offline
conversion uploads, the fee reminders or the temperature recalculation:
four of those spend Meta and Google API quota on data that does not
change every ten minutes, and a fee reminder should arrive at a civilised
hour rather than whenever a sweep happened to fire. Those stay on the
daily run.

**The daily run keeps going, unchanged.** It includes these three as
well, so if the frequent schedule is never set up or quietly stops, the
worst case is the delay you have today.

> ### The secret has to travel in a header
>
> `CRON_SECRET` is only ever read from the `Authorization` header, and
> the CRM will not accept it in the URL. That rules out the simplest
> schedulers, deliberately: a secret in a query string ends up in the
> hosting access logs, in the scheduler's own history, and in any
> referrer — and a credential you cannot rotate out of six logs is worse
> than a slow broadcast. Both options below send headers.
>
> The value is the same `CRON_SECRET` already set on the deployment. If
> you do not have it to hand, generate a new one, set it in the hosting
> environment, **redeploy** (environment variables only reach a new
> build), and use the new value in both places.

---

## Option A — cron-job.org (recommended)

A web form. Nothing to install, nothing to write.

1. Sign up at **cron-job.org** and confirm the email.
2. **Create cronjob.**
3. **Title**: `AFD CRM — frequent`.
4. **URL**: `https://<your-crm-domain>/api/cron/frequent`
5. **Execution schedule**: *Every 10 minutes*.
6. Open **Advanced** → **Headers** and add one:
   - Name: `Authorization`
   - Value: `Bearer <CRON_SECRET>` — the word `Bearer`, one space, then
     the secret.
7. Leave **Enable job** on. **Create.**
8. Press **Test run** (or **Run now**). A green **200** is success.

**Then check it from inside the CRM**: *Settings → Platform health → The
frequent run* should show a run within the last ten minutes. That panel
is the thing to look at later too — if it goes quiet, the scheduler has
stopped.

**Why this one:** the free plan goes down to one minute, it sends custom
headers, and it emails you when a job starts failing — which matters,
because a scheduler that silently stops is how this whole class of
problem happens in the first place.

---

## Option B — GitHub Actions

The repository is already on GitHub, so this keeps everything in one
place and needs no new account.

1. In GitHub: **Settings → Secrets and variables → Actions → New
   repository secret.**
   - Name: `CRON_SECRET`, value: the same secret as the deployment.
   - Add a second: `CRM_BASE_URL`, value: `https://<your-crm-domain>`.
2. Commit this file as `.github/workflows/frequent-cron.yml`:

```yaml
name: CRM frequent jobs
on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Call the frequent cron endpoint
        run: |
          code=$(curl -s -o /tmp/body -w '%{http_code}' \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.CRM_BASE_URL }}/api/cron/frequent")
          cat /tmp/body
          test "$code" = "200"
```

3. **Actions → CRM frequent jobs → Run workflow** to test it now.

**Two things to know before choosing this.** GitHub's scheduled
workflows are queued at low priority, so `*/10` in practice means
"every ten to twenty-five minutes, sometimes worse" — fine for
broadcasts, less good if you want an automation's first message inside
ten minutes. And GitHub **disables scheduled workflows on a repository
with no commits for 60 days**, with one email about it. If development
goes quiet, this stops.

---

## Rejected, and why

- **A second `crons` entry in `vercel.json`.** The right answer, and the
  plan does not allow it. On a plan that does, add it and delete
  whichever option above you set up — nothing in the code changes.
- **Putting the secret in the URL** so that header-less schedulers work.
  See the box above.
- **Running `/api/cron/daily` every ten minutes.** The obvious move and
  the wrong one: 144 ad-spend and retargeting calls a day to Meta and
  Google, re-uploaded offline conversions, and fee reminders landing at
  3am.
- **Cloudflare Workers / Upstash QStash.** Both work and both are free at
  this volume. They need a little code or a little CLI, and neither is
  better than Option A for one URL on a fixed interval.

---

## A note on the hosting plan

Vercel's Hobby plan is for non-commercial use, and this is a business.
Pro also gives minute-level cron scheduling, which makes this whole
document unnecessary — a second `crons` entry and done. Worth weighing
against the five minutes Option A takes.

---

## When something is not going out

In this order:

1. **Settings → Platform health → The frequent run.** No run recorded
   means no scheduler is calling. A run older than 45 minutes means it
   has stopped.
2. **The same panel's job list.** A job listed `failed` names its own
   error.
3. **Press "Send anything that is waiting"** on that screen. It does the
   same work immediately, which both unblocks the thing you were waiting
   for and proves whether the jobs themselves are healthy — separating
   "the scheduler is not calling" from "the job is broken".
4. **Settings → Platform health → Inbound deliveries** if the problem is
   messages coming *in* rather than going out. That is a different
   system: webhooks, not cron.
