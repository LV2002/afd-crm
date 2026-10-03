-- Repairing drift, again — this time with a timestamp that can actually run.
--
-- Migration 0078 is RECORDED as applied in production and the column it
-- adds is still not there. It can never run again, and this is exactly why:
--
--   Newest recorded migration timestamp: 1790921043149
--   (the journal's last is 1790921043149)
--
-- drizzle applies a migration only when its journal `when` is GREATER than
-- the newest `created_at` in `drizzle.__drizzle_migrations`. Not greater or
-- equal — greater. Once a row carrying 0078's timestamp exists, 0078 and
-- everything behind it is skipped on every future deploy, and the deploy
-- reports success, because from drizzle's point of view there is nothing
-- to do.
--
-- So the repair cannot be a re-run of 0078. It has to be a new migration
-- with a later `when`, which is this one. The body is 0078's, unchanged and
-- still idempotent, because the database may have all of it, none of it or
-- any part.
--
-- The deploy's migration step now checks the actual schema after migrating
-- and fails the build when a column the code selects is missing, so a
-- migration recorded without running can no longer look like success. See
-- `lib/db/migrate-cli.ts`.

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
