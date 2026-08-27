# AFD India CRM

Read `CLAUDE.md` first, then `docs/02-BUILD-PHASES.md` and `docs/PROGRESS.md` before doing
anything else in this repo.

## Setup

```bash
cp .env.example .env.local   # fill in your Supabase project's values
npm install
npm run db:migrate           # schema, functions, triggers, RLS
npm run db:seed              # centres, roles, dropdowns, stages, field defs, 6 test users
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm run start` | Production build / run |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations in `src/lib/db/migrations/` |
| `npm run db:push` | Push schema directly (local prototyping only) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Run `src/lib/db/seed.ts` (idempotent) |
| `npm test` | Vitest |
