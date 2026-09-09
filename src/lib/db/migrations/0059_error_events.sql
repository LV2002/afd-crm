-- What has broken, and whether anybody was told.
--
-- Nothing in this system reported its own failures. A webhook that
-- started erroring, a cron that threw, a page that crashed — the first
-- anybody knew was a counsellor saying "leads stopped coming in", days or
-- weeks later.
--
-- Grouped by fingerprint rather than one row per occurrence: the same bug
-- firing four hundred times is one thing to fix, and four hundred rows is
-- a table nobody opens twice. `count`, `first_seen_at` and `last_seen_at`
-- carry what those rows would have said.
--
-- `notified_at_count` is the anti-flood mechanism and the reason these
-- alerts stay worth reading: an email on the first occurrence, then only
-- when the count reaches ten times what was last reported. A fault firing
-- every few seconds produces about one message per order of magnitude
-- rather than one per failure. See lib/errors/fingerprint.ts.
create table if not exists error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  -- Where it happened: cron:payment-reminders, webhook:whatsapp,
  -- action:saveFeePlan, page.
  source text not null,
  message text not null,
  stack text,
  -- Anything useful for finding it again. Never credentials.
  context jsonb,
  count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notified_at_count integer,
  -- Marked fixed by a person. A fingerprint that returns afterwards gets
  -- a fresh row — a bug coming back is news, and burying it in the count
  -- of the one somebody closed last month is how it stays buried.
  resolved_at timestamptz,
  resolved_note text
);--> statement-breakpoint

-- One OPEN row per fingerprint. This is what makes the capture an upsert,
-- so two failures arriving in the same millisecond cannot race into two
-- rows and halve each other's count.
create unique index if not exists error_events_open_fingerprint_uq
  on error_events (fingerprint) where resolved_at is null;--> statement-breakpoint

create index if not exists error_events_last_seen_idx on error_events (last_seen_at);--> statement-breakpoint

-- Readable by administrators; written only by the capture helper on the
-- direct client, which is deliberate — the thing that records a failure
-- must not itself depend on there being a valid session, since "nobody is
-- logged in" is one of the ways a request fails.
alter table error_events enable row level security;--> statement-breakpoint

create policy error_events_select on error_events for select
  to authenticated
  using (auth_scope('settings.manage') = 'all');--> statement-breakpoint

create policy error_events_update on error_events for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');
