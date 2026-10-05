-- That the nightly job ran, and what each part of it did.
--
-- Leon asked why yesterday's Meta ad spend had not appeared in Ad
-- Performance, and the CRM could not answer. Nothing recorded a run:
-- `runNightly()` handed its result back as JSON to whoever invoked the
-- route, and that was the end of it.
--
-- Three of the four ways this goes wrong leave no trace in error_events
-- either. A deployment with no CRON_SECRET answers every cron call with a
-- 401 before the handler runs, and a 401 is not an exception. A job that
-- reports "not configured" is a 200 and correct on a fresh instance. A job
-- skipped for want of time in the run's budget is not a failure. In all
-- three the symptom is the same: a number that does not appear.
--
-- So the run writes itself down, and Settings → Platform Health reads it.
-- An empty table is itself the answer — it means no run has ever reached
-- the handler.
create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null default 'daily',
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_ms integer not null,
  ok boolean not null,
  ok_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  -- runNightly()'s own result, stored rather than reshaped: a column per
  -- job would need a migration every time the job list changes.
  jobs jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);--> statement-breakpoint

create index if not exists cron_runs_started_at_idx on cron_runs (started_at desc);--> statement-breakpoint

create trigger set_updated_at before update on cron_runs
  for each row execute function set_updated_at();--> statement-breakpoint

alter table cron_runs enable row level security;--> statement-breakpoint

-- Admin-only read, like webhook_events: a job's note can name a service
-- and a reason, which is operational detail rather than anything a
-- counsellor needs. No insert/update/delete policy for any authenticated
-- role — only the cron route writes here, on the direct client.
create policy cron_runs_select on cron_runs for select
  to authenticated
  using (private.auth_scope('settings.manage') = 'all');
