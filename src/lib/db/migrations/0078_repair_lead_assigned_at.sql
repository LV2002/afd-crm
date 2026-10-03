-- Repairing drift: `leads.assigned_at` was missing in production.
--
-- Migration 0071 added the column, created the trigger that maintains it,
-- backfilled it and indexed it. In the production database the FUNCTION
-- and the trigger exist and the COLUMN does not — so 0071 is recorded as
-- applied, and part of it is not there.
--
-- The cost was total for one screen: confirming an admission begins with
-- `select * from leads where id = $1`, which names every column the code
-- knows about, so the save died with
-- `column "assigned_at" does not exist` before it did anything. The
-- counsellor got a blank screen and an eight-digit number.
--
-- How 0071 came to be half-applied is not known. The honest answer is that
-- `drizzle-kit migrate` reported its own failures as an exit code and
-- nothing else (see migration 0077's deploy and `db/migrate-cli.ts`), so a
-- batch that went wrong on 1 October left no evidence of what it did.
-- Guessing further is not worth as much as making the drift visible, which
-- is what `lib/db/schema-drift.ts` now does on Settings -> Platform Health.
--
-- ## Everything here is idempotent
--
-- This re-runs 0071 against a database that may have all of it, none of it
-- or any part of it, and must be correct in each case. That is also why it
-- is a new migration rather than an edit to 0071: 0071 is recorded as
-- applied, so it will never run again anywhere.

alter table "leads" add column if not exists "assigned_at" timestamp with time zone;--> statement-breakpoint

create or replace function set_lead_assigned_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only when the owner actually changes, and only to somebody. Clearing
  -- an assignment leaves the old timestamp alone: it is a record of when
  -- the lead was last handed to someone, and an unassigned lead is the
  -- orphan queue's problem, not this column's.
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
  then
    new.assigned_at := now();
  end if;
  return new;
end; $$;--> statement-breakpoint

-- Dropped and recreated rather than `if not exists`: a trigger that exists
-- but was created against the old function body is exactly the state this
-- migration is here to stop assuming away.
drop trigger if exists set_lead_assigned_at on leads;--> statement-breakpoint

create trigger set_lead_assigned_at
  before insert or update of assigned_to on leads
  for each row execute function set_lead_assigned_at();--> statement-breakpoint

-- Existing rows: the best available answer is when the lead was created.
-- Wrong for anything reassigned before today, but every alternative is
-- either null (which reads as "never assigned") or a guess that looks more
-- precise than it is. Re-running this is safe — the `is null` guard means
-- it only ever fills gaps.
update leads
set assigned_at = created_at
where assigned_to is not null and assigned_at is null;--> statement-breakpoint

create index if not exists "leads_assigned_to_assigned_at_idx"
  on "leads" ("assigned_to", "assigned_at" desc)
  where "deleted_at" is null;--> statement-breakpoint

-- 0071's last statement, repeated for the same reason. `on conflict do
-- nothing` means a database that already has these rows is untouched, and
-- one that lost them gets the admin dashboard back as Leon asked for it.
insert into dashboard_layouts (role_id, widget_key, sort_order, is_visible)
select r.id, w.key, w.ord, false
from roles r
cross join (values ('my_numbers', 0), ('my_day', 1)) as w(key, ord)
where r.code in ('admin', 'co_admin')
on conflict (role_id, widget_key) do nothing;
