# Getting Started

Do everything in Part 1 yourself. Do not delegate account creation or credential handling
to Claude Code.

---

## Part 1 — Before you open Claude Code (~30 min)

### 1. Local tools
```bash
node --version    # need 20+
git --version
```

### 2. GitHub repo
Create a **private** repo named `afd-crm`. Empty — no README, no .gitignore, no licence.
Clone it locally.

### 3. Supabase project
1. New project at supabase.com
2. Name `afd-crm`, region **Mumbai (ap-south-1)**
3. Save the database password somewhere safe — it is shown once
4. Settings → API. Copy three values:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 4. Drop the spec in
Your repo should look like this before the first session:

```
afd-crm/
  CLAUDE.md
  docs/
    00-PRD.md
    01-DATA-MODEL.md
    02-BUILD-PHASES.md
    03-V1-AUDIT.md
    DECISIONS.md
    PROGRESS.md
    GETTING-STARTED.md
```

### 5. Environment file
Create `.env.local` in the repo root:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

Then, **before your first commit**:

```bash
echo ".env.local" > .gitignore
echo ".env*.local" >> .gitignore
echo "node_modules/" >> .gitignore
echo ".next/" >> .gitignore
git add . && git commit -m "spec" && git push
```

The service-role key bypasses every RLS policy you are about to write. If it reaches
GitHub, rotate it immediately in Supabase.

### 6. Export your current data
Sheets → CSV, into `data/` (add `data/` to `.gitignore`). You won't import until
Session 8, but having it ready stops you stalling then.

---

## Part 2 — Session 1

Open Claude Code (Code tab in the desktop app), point it at the repo, and paste the
**Session 1** prompt from `docs/02-BUILD-PHASES.md` § Session plan.

Sessions 1–3 have full prompts written out there. Session 1 is schema, dynamic
permissions and auth. Session 2 is the settings layer. Session 3 is the RLS test suite.

### How to verify Session 1

```bash
npm run dev
```

- Log in as the admin seed user → sidebar shows Settings, Reports, all centres
- Log in as the counsellor seed user → sidebar is much shorter, no Settings
- The sidebar must be built from permissions. Grep for it:

```bash
grep -rn "=== 'admin'\|role ===\|role ==" src/
```

Any comparison against a role *name* is a bug at this stage — everything should go
through `auth_scope()` or a permission check. Roles are data; the code shouldn't know
their names.

```bash
grep -rn "SERVICE_ROLE" src/
```
Should appear only in the service-role client module. Nowhere else, this session.

Then commit:
```bash
git checkout -b phase-0
git add . && git commit -m "Phase 0: schema, dynamic permissions, auth"
git push -u origin phase-0
```

---

## Part 3 — The loop

For every session after the first:

1. New session (or `/clear`)
2. Paste the session prompt — always starts with reading `CLAUDE.md` and `PROGRESS.md`
3. Let it work
4. **You** verify. Click through it. Never accept "done" on its word
5. It updates `PROGRESS.md`
6. Commit on a branch named for the task

Session order is in `02-BUILD-PHASES.md` § Session plan. Eleven sessions gets you a system
your counsellors can use.

### Watch for
- `SERVICE_ROLE` outside webhooks and cron — that silently disables all your RLS
- Any comparison against a role name (`role === 'admin'`) — roles are data, the code
  must not know their names. Everything goes through permission checks
- Hardcoded user-facing labels — "Lead", "Counsellor", "Centre" must come from the
  terminology table via `t()`
- Hardcoded lists of any kind — if an admin could reasonably want it different, it's a row
- Sessions running past an hour — quality drops, end it and start fresh
- Dependencies you didn't ask for — ask why before accepting
- UI marked done that you haven't clicked

### Migrations
Until you import real data, just reset and re-seed rather than writing careful migrations.
Stop doing that the day real data lands — from then on, Supabase backup before every
migration, no exceptions.
