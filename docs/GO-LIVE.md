# Going live: test it, clear it, then announce it

Three parts, in this order:

1. **Test** — the automated click-through, then your own manual pass.
2. **Reset** — wipe everything that happened, keep everything you set up.
3. **The launch checklist** — secrets, environment, scheduled work,
   integrations, data and people.

Do not reset until you are finished testing. It cannot be undone.

Part 3 is the one to work through slowly. Every item on it is either something
that has already gone wrong once during the build, or something whose absence
is silent — a webhook that is configured and has never delivered, a cron that
returns 401 every night, a link in a student's WhatsApp that points nowhere.
None of them announces itself.

---

# Part 1 — The automated test

This signs in as all six roles and opens every screen each of them can reach,
on a desktop and on a phone. It runs **on GitHub's machines**, so there is
nothing to install on your laptop.

It never touches the live CRM. It builds a throwaway copy of the whole system —
database, logins and all — runs against that, and throws it away.

## 1.1 Run it

1. Go to **github.com/LV2002/afd-crm → Actions**.
2. In the left-hand list, click **Browser test**.
3. **Run workflow** (right-hand side) → pick the branch → **Run workflow**.
4. Wait. Ten to fifteen minutes — it builds the whole application first.

A green tick means every screen opened for every role, with no errors, no
broken links and no failed requests.

It also runs by itself on any pull request into `main`, so a change cannot
reach the live site without this passing.

## 1.2 When something fails

1. Click the failed run.
2. Scroll to **Artifacts** at the bottom and download **browser-test-report**.
3. Unzip it and open `playwright-report/index.html` in your browser.
4. Click the red test, then **Trace**.

The trace is a replay: every click, the page as it looked at each step, the
network, a screenshot and a video. You do not need to read any code to see
what happened. Send me the test name and what you see.

## 1.3 Running it on your own machine instead

Optional, and only worth it if you want to watch it click through live. It
needs Docker Desktop and working git, which is why it is not the main route.

```bash
npm install
npm run e2e:install          # downloads the test browser
npx supabase start           # needs Docker running
npm run db:migrate
npm run db:seed
npm run e2e                  # or: npm run e2e:ui, to watch
```

`npx supabase start` prints the two keys; put them in `.env.local` as
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, along with
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` and
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`.

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

Work the real thing end to end, on the live site, as a human.

**Sales, start to finish**

1. Create a lead by hand. It now makes you pick a **source** — check the one
   you picked is what shows on the lead afterwards, not "Manual".
2. Check it was assigned to somebody.
3. Submit each website form. Check the page and form name appear in the source.
4. Send a test lead from Meta, and from Google Ads.
5. Log a call on the lead. Set a follow-up date. Check it appears on your
   Dashboard.
6. Confirm an admission, picking a batch.
7. **As the counsellor who confirmed it**, set the fee and instalment plan on
   that lead. You should be able to; it is only accounts' once a payment has
   been recorded.
8. In Accounts, record a first payment. Check the receipt prints.
9. Go back to the fee plan as the counsellor. It should now be read-only.
10. Check the student appears under **Students → Onboarding**, and the red count.
11. Mark onboarding complete. Check they move to the main list.
12. Send a profile form link. Fill it in as the student, **attach a photo**.
13. Check the photo prints on the profile sheet, and the red count on
    **Student Profile Forms** clears when you mark it read.
14. Record an expense in Finance. Check the bank balance moves.
15. Open every report in Insights.

**The things that have bitten before**

16. **Filters.** Filter the leads list, open a lead, then press **Leads** in the
    sidebar. The filter should still be there.
17. **Editing a phone.** Reveal a lead's number, change one digit, save. Then
    create a new lead with the corrected number — it should find the same
    person, not make a second one.
18. **Deleting.** Delete a test lead, then enter its number again. You should
    get a new lead, not a 404.
19. **Dead.** Mark a lead with an overdue follow-up as **Dead**. It should drop
    out of the overdue filter and stop escalating.
20. **Chats.** Message the institute's WhatsApp number from your own phone.
    It should appear in **Chats → Inbox** within seconds. Reply from there and
    check it arrives. If the number is not a lead, the thread should still have
    a reply box, and **Convert to lead** should bring the messages with it.
21. **Autosave.** Change a field on a lead and navigate away without pressing
    Save. Come back; the change should be there.

**On a phone, and as somebody else**

22. Do steps 1, 5 and 6 again **on your phone**.
23. Sign in as a counsellor and confirm they cannot see another centre's leads.
24. Sign in as that counsellor on a phone and open **Chats**.

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

Five groups. The first is not optional and the rest are roughly in the order
they will bite you.

## 3.1 Secrets that are already compromised

Every one of these was pasted into a chat or caught in a screenshot during the
build. None of them is a disaster on its own and all of them are five minutes
to replace. Treat the list as a to-do, not an accusation.

- [ ] **Supabase database password** — Supabase → Settings → Database → Reset.
      Update `DATABASE_URL` in Vercel afterwards.
- [ ] **`CRON_SECRET`** — it was a company name plus a year, in a screenshot.
      Replace with `openssl rand -base64 32` and update it in Vercel **and** in
      the GitHub Actions secret the schedules use, or the overnight jobs start
      failing with a 401.
- [ ] **`RESEND_API_KEY`** — revoke the old key in Resend, generate a new one.
- [ ] **The WhatsApp access token** — regenerate it in the Meta App Dashboard
      and paste the new one into Settings → Integrations → WhatsApp. The
      console's token expires in 24 hours anyway; a System User token does not.
- [ ] **Any Graph API Explorer token** you generated while testing. They expire
      on their own, but not quickly enough to rely on.

Nothing in this list is stored in the repository, and `INTEGRATION_ENCRYPTION_KEY`
is the one secret that must **not** be rotated casually — every stored
credential is encrypted under it, and changing it means re-entering all of them.

## 3.2 The environment

- [ ] **`NEXT_PUBLIC_APP_URL`** — set it to the live URL. Still unset at the
      time of writing. Without it, links in emails and WhatsApp messages point
      at nothing, and they are the links a student clicks.
- [ ] `INTEGRATION_ENCRYPTION_KEY` is set, and you have a copy somewhere safe
      that is not this repository.
- [ ] `RESEND_API_KEY` and `EMAIL_FROM`, if you want notifications by email.
- [ ] `ALERT_EMAIL_TO`, so you hear when the platform itself breaks.
- [ ] `GEMINI_API_KEY`, if **Ask AI** is to work.
- [ ] **Settings → Platform health** shows the database up to date and matching
      the code, with no open problems.

## 3.3 The scheduled work

- [ ] **Settings → Platform health → Scheduled work** shows a run for each
      tier, green, within its expected window.
- [ ] GitHub → Actions shows the schedules enabled and their last run green.
- [ ] If a tier has never run, it is almost always `CRON_SECRET` — the same
      value has to be in Vercel and in the Actions secret.

## 3.4 The integrations

Each of these is "has it ever actually delivered", not "is it configured".
**Settings → Integrations → [platform] → Recent deliveries** is the answer in
every case: an empty list means it has never been called.

- [ ] **Meta Lead Ads** — submit through Meta's Lead Ads Testing Tool and watch
      it arrive. Needs both the app subscribed to `leadgen` *and* the Page
      subscribed, which are two different switches.
- [ ] **WhatsApp inbound** — message the number from your phone and watch the
      thread appear in Chats.
- [ ] **WhatsApp outbound** — reply from Chats and watch it arrive.
- [ ] **Instagram DMs** — the `messages` field on the **Instagram** object, a
      separate callback from the Page one. Its own delivery panel is on the
      Meta screen.
- [ ] **Google Ads** — a test lead, same as Meta.
- [ ] **Website forms** — one submission from each live form.
- [ ] **Meta App Review** — submitted, and Advanced Access granted on the
      eleven permissions. Until it clears, Instagram DMs and Coexistence only
      work for accounts with a role on the app. See `META-APP-REVIEW.md`.
- [ ] **Coexistence**, if counsellors' own numbers are going on it: App ID and
      Embedded Signup Configuration ID saved, then **Connect with Meta** per
      number. Needs Advanced Access first.

## 3.5 The data, and the people

- [ ] **Reset the test data** (Part 2) before anybody real uses it. Do not skip
      the backup.
- [ ] **Add the dropdown options** the historic import needs — the sources,
      courses and exams that are not seeded — *before* importing, or 2,000 rows
      land with blank fields.
- [ ] **Set up the assignment rule** for the historic import, so the imported
      leads land on the right counsellor rather than nobody.
- [ ] **Import the historic leads**, and spot-check twenty of them against the
      spreadsheet they came from.
- [ ] **Give each person their own login.** Nobody shares the admin account.
- [ ] **Deactivate the `Meta Reviewer` account** once App Review closes.
- [ ] **Hand out the handbooks** — the staff edition for counsellors, the
      administrator edition for whoever runs the system.
- [ ] **Walk one counsellor through** the Dashboard and the red counts, and
      watch them do one lead end to end without help. What they get stuck on is
      the only usability test that counts.
- [ ] **Agree who watches Platform health**, and how often. A system nobody
      checks tells nobody when it breaks.
