-- Phase 1 (Session 4): identity module schema follow-up — updated_at
-- triggers, the stage_history-writing trigger, and RLS on every new table.
--
-- Every policy here reuses can_access_center(perm, center_id, owner_id)
-- from migration 0001 rather than repeating the case/auth_scope block —
-- "one implementation, dozens of policies, no drift" per
-- docs/01-DATA-MODEL.md § Row Level Security.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger set_updated_at before update on lead_identifiers
  for each row execute function set_updated_at();
create trigger set_updated_at before update on enquiries
  for each row execute function set_updated_at();
create trigger set_updated_at before update on lead_merges
  for each row execute function set_updated_at();
create trigger set_updated_at before update on merge_review_queue
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- stage_history: written ONLY by this trigger (docs/03-V1-AUDIT.md D6).
-- security definer so it can insert regardless of the acting session's own
-- grants on stage_history — there is no INSERT policy for anyone else.
-- ---------------------------------------------------------------------------

create or replace function write_stage_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_changed_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.stage_id is null then
      return new;
    end if;
    insert into stage_history (lead_id, from_stage, to_stage, changed_by, changed_at)
    values (new.id, null, new.stage_id, auth.uid(), now());
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    select changed_at into prev_changed_at
    from stage_history
    where lead_id = new.id
    order by changed_at desc
    limit 1;

    insert into stage_history (
      lead_id, from_stage, to_stage, changed_by, changed_at, duration_in_previous_seconds
    )
    values (
      new.id,
      old.stage_id,
      new.stage_id,
      auth.uid(),
      now(),
      case when prev_changed_at is null then null
           else extract(epoch from (now() - prev_changed_at))::int
      end
    );
  end if;

  return new;
end;
$$;

create trigger write_stage_history
  after insert or update on leads
  for each row execute function write_stage_history();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table leads enable row level security;
alter table lead_identifiers enable row level security;
alter table enquiries enable row level security;
alter table lead_merges enable row level security;
alter table merge_review_queue enable row level security;
alter table stage_history enable row level security;

-- leads: the same own/center/all shape as every scoped table, via the
-- shared can_access_center() helper.
create policy leads_select on leads for select
  to authenticated
  using (can_access_center('lead.read', center_id, assigned_to));

create policy leads_insert on leads for insert
  to authenticated
  with check (can_access_center('lead.create', center_id, assigned_to));

create policy leads_update on leads for update
  to authenticated
  using (can_access_center('lead.update', center_id, assigned_to))
  with check (can_access_center('lead.update', center_id, assigned_to));

create policy leads_delete on leads for delete
  to authenticated
  using (can_access_center('lead.delete', center_id, assigned_to));

-- lead_identifiers: visibility inherited from the parent lead (docs'
-- "child tables inherit visibility via exists (select 1 from leads ...)").
create policy lead_identifiers_select on lead_identifiers for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = lead_identifiers.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));

create policy lead_identifiers_insert on lead_identifiers for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = lead_identifiers.lead_id
      and can_access_center('lead.create', l.center_id, l.assigned_to)
  ));

create policy lead_identifiers_update on lead_identifiers for update
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = lead_identifiers.lead_id
      and can_access_center('lead.update', l.center_id, l.assigned_to)
  ));

-- enquiries: append-only attribution log — select + insert only, no update
-- or delete policy for anyone, same enforcement pattern as audit_log.
create policy enquiries_select on enquiries for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = enquiries.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));

create policy enquiries_insert on enquiries for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = enquiries.lead_id
      and can_access_center('lead.create', l.center_id, l.assigned_to)
  ));

-- lead_merges: select/insert gated on lead.merge against the survivor lead.
create policy lead_merges_select on lead_merges for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = lead_merges.survivor_lead_id
      and can_access_center('lead.merge', l.center_id, l.assigned_to)
  ));

create policy lead_merges_insert on lead_merges for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = lead_merges.survivor_lead_id
      and can_access_center('lead.merge', l.center_id, l.assigned_to)
  ));

-- merge_review_queue: insert is a byproduct of ordinary lead creation (an
-- ambiguous match during resolveOrCreateLead()), so it's gated on
-- lead.create against the lead being created, same as lead_identifiers/
-- enquiries. Resolving a review (update) is a merge decision, gated on
-- lead.merge.
create policy merge_review_queue_select on merge_review_queue for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = merge_review_queue.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));

create policy merge_review_queue_insert on merge_review_queue for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = merge_review_queue.lead_id
      and can_access_center('lead.create', l.center_id, l.assigned_to)
  ));

create policy merge_review_queue_update on merge_review_queue for update
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = merge_review_queue.lead_id
      and can_access_center('lead.merge', l.center_id, l.assigned_to)
  ));

-- stage_history: select-only, inherited from the parent lead. No insert,
-- update or delete policy for any role — only write_stage_history() above
-- (security definer) writes here.
create policy stage_history_select on stage_history for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = stage_history.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));
