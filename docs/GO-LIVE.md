# Testing everything, then starting clean

Two halves, in this order:

1. **Test** — the automated click-through, then your own manual pass.
2. **Reset** — wipe everything that happened, keep everything you set up.

Do not reset until you are finished testing. It cannot be undone.

---

# Part 1 — The automated test

This signs in as all six roles and opens every screen each of them can reach,
on a desktop and on a phone. It runs on **your computer against a local copy**,
never against the live CRM — the suite creates leads and clicks buttons, and
you do not want that happening to real students.

## 1.1 One-time setup

You need these installed: Node 20+, Git, and Postgres (or Docker). If your
developer set the project up already, skip to 1.2.

```bash
git clone https://github.com/LV2002/afd-crm.git
cd afd-crm
npm install
npm run e2e:install          # downloads the test browser, ~150 MB
```

Create `.env.local` with a **local** database, never the live one:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase start`>
SUPABASE_SERVICE_ROLE_KEY=<from `supabase start`>
CRON_SECRET=anything-random
INTEGRATION_ENCRYPTION_KEY=<openssl rand -base64 32>
```

The local Supabase stack comes from `npx supabase start` (needs Docker). It
prints all three values when it finishes.

## 1.2 Prepare the database

```bash
npm run db:migrate           # builds the tables
npm run db:seed              # creates the six test logins
```

The logins are `admin@afd-crm.test`, `coadmin@`, `centerhead.kochi@`,
`counsellor.kochi@`, `accounts@` and `academics@` — all with the password
printed by the seed. They exist only on your local copy.

## 1.3 Run it

```bash
npm run e2e
```

A few minutes. It starts the app itself. You will see each role's run and a
count of screens visited.

**Green:** every screen opened for every role, with no errors, no broken links
and no failed requests.

**Red:** open the report and look.

```bash
npm run e2e:report
```

Click the failed test, then the **trace**. You get a replay of exactly what it
did — the clicks, the page at each step, the network, a screenshot and a video.
Send me the failing test name and what the trace shows and I will fix it.

To watch it work rather than read a report:

```bash
npm run e2e:ui
```

## 1.4 What it does not check

Run these yourself, because no browser test can:

- **Does the number mean the right thing?** The suite proves a report renders.
  It cannot know whether "12 admissions this month" is true.
- **Anything that costs money or messages a person.** Recording a payment is
  permanent and WhatsApp reaches a real phone, so the suite does not do either.
- **Webhooks from Meta and Google.** Use each platform's own "send test lead"
  button and watch it arrive.
- **Is it readable?** The suite finds broken, not ugly.

## 1.5 Your manual pass

Work the real thing end to end, on the live site, as a human:

1. Create a lead by hand. Check it was assigned to somebody.
2. Submit each website form. Check the page and form name appear in the source.
3. Send a test lead from Meta, and from Google Ads.
4. Log a call on a lead. Set a follow-up date. Check it appears on your Dashboard.
5. Confirm an admission, picking a batch.
6. In Accounts, record a first payment. Check the receipt prints.
7. Check the student appears under **Students → Onboarding**, and the red count.
8. Mark onboarding complete. Check they move to the main list.
9. Send a profile form link. Fill it in as the student, **attach a photo**.
10. Check the photo prints on the profile sheet, and the red count on
    **Student Profile Forms** clears when you mark it read.
11. Record an expense in Finance. Check the bank balance moves.
12. Open every report in Insights.
13. Do steps 1, 4 and 5 again **on your phone**.
14. Sign in as a counsellor and confirm they cannot see another centre's leads.

Write down anything that looks wrong. Then come back here for Part 2.

---

# Part 2 — Starting clean

Clears every record of something that happened. Keeps everything you set up.

| Cleared | Kept |
|---|---|
| Leads, enquiries, interactions, tasks | Centres, users, roles, permissions |
| Admissions, instalments, discounts applied | Pipeline stages, temperatures, SLA policies |
| Payments, receipts, **bank entries** | **Bank accounts and their opening balances** |
| Students, batch memberships | **Batches** themselves |
| Profile forms and their answers | Custom fields, dropdowns, form layout |
| Uploaded files | Fee structures, offers, discount limits |
| WhatsApp messages and broadcasts sent | WhatsApp templates and automations |
| Notifications, audit log, error log | Notification rules, dashboards, terminology |
| Merge queue, webhook log, ad spend | Assignment rules, tags, targets, logo and branding |
| | **People who replied STOP** — see below |

Lead numbers, receipt numbers and student codes all start again at 1.

**One thing is kept that looks like data: the WhatsApp opt-out list.** Deleting
it would mean messaging somebody who told you to stop, which no amount of "we
were testing" repairs.

## 2.1 Back up first

Non-negotiable. In Supabase: **Database → Backups**, take a manual backup and
wait for it to finish. Also export your configuration from
**Settings → Export configuration**, so the setup itself is recoverable even if
the backup is not.

## 2.2 See what would go

```bash
npm run db:reset-data
```

This **changes nothing**. It prints two lists — what would be deleted and what
would be kept, with row counts — and the database it is pointed at. Read both.
If the "kept" list is missing something you set up, stop and tell me.

To run it against the live database, point `DATABASE_URL` at it for this one
command. Check the database name printed at the top is the one you mean.

## 2.3 Do it

```bash
npm run db:reset-data -- --confirm
```

It shows the lists again and asks you to type `DELETE THE TEST DATA`. Anything
else stops it.

It runs as a single transaction and counts your configuration before and after.
If a single configuration row were lost, the whole thing rolls back and nothing
is deleted.

To clear the uploaded files from storage as well:

```bash
npm run db:reset-data -- --confirm --purge-files
```

To keep your real advertising spend history:

```bash
npm run db:reset-data -- --confirm --keep-ad-spend
```

## 2.4 Afterwards

- Sign in. The dashboard is empty, the queues are at zero, Settings is untouched.
- Create one real lead and check it is **Lead #1**.
- The audit log holds exactly one row, recording the reset.

If the script refuses to run saying a table is neither configuration nor data,
that is deliberate: a table was added and nobody has said which side it is on.
Send me the name.

---

# Part 3 — Before you announce it

- [ ] Rotate the Supabase database password, and the `CRON_SECRET`.
- [ ] Check **Vercel → Cron Jobs** shows one entry and its last run is green.
- [ ] Set `RESEND_API_KEY` and `EMAIL_FROM` if you want notifications by email.
- [ ] Set `ALERT_EMAIL_TO` so you hear when the platform itself breaks.
- [ ] Confirm the Meta and Google webhooks point at the live URL.
- [ ] Give each person their own login. Nobody shares the admin account.
- [ ] Walk one counsellor through the Dashboard and the red counts.
