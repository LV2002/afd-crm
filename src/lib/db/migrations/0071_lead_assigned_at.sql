-- When a lead was assigned to the person who now owns it.
--
-- "How many were assigned to me today?" had no honest answer: the closest
-- column was `created_at`, which is a different question the moment a lead
-- is reassigned — and reassignment is routine here (the orphan queue
-- exists precisely so leads get claimed later).
--
-- Maintained by a trigger rather than by the four places that write
-- `assigned_to` (the rules engine, lead creation, claiming from the orphan
-- queue, and reassignment on the detail page). A fifth write site will be
-- added one day and would not know to set it; the database always does.

alter table "leads" add column "assigned_at" timestamp with time zone;

create or replace function set_lead_assigned_at() returns trigger
language plpgsql as $$
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
end; $$;

create trigger set_lead_assigned_at
  before insert or update of assigned_to on leads
  for each row execute function set_lead_assigned_at();

-- Existing rows: the best available answer is when the lead was created.
-- Wrong for anything reassigned before today, but every alternative is
-- either null (which reads as "never assigned") or a guess that looks more
-- precise than it is.
update leads
set assigned_at = created_at
where assigned_to is not null and assigned_at is null;

-- "My leads assigned today" and the centre head's team table both filter
-- on (assigned_to, assigned_at).
create index "leads_assigned_to_assigned_at_idx"
  on "leads" ("assigned_to", "assigned_at" desc)
  where "deleted_at" is null;

-- ---------------------------------------------------------------------------
-- Keep the admin dashboard as it was
-- ---------------------------------------------------------------------------

-- "Your day" used to carry `requireScope: 'own'`, which had the side effect
-- of keeping it off an admin's dashboard. That rule is gone — centre heads
-- carry their own leads and Leon asked for their day too — so the two
-- personal widgets are now permitted for every role holding `lead.read`,
-- admins included.
--
-- An admin has nothing assigned to them, so those cards would be two empty
-- lists at the top of the screen they use most. Leon's instruction was that
-- the admin view is right as it is, so it stays right as it is — expressed
-- as configuration, in the table built for exactly this, rather than as a
-- rule in code. Both are visible again with one click in
-- Settings → Dashboards.
insert into dashboard_layouts (role_id, widget_key, sort_order, is_visible)
select r.id, w.key, w.ord, false
from roles r
cross join (values ('my_numbers', 0), ('my_day', 1)) as w(key, ord)
where r.code in ('admin', 'co_admin')
on conflict (role_id, widget_key) do nothing;
