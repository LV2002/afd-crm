-- Session 8: "Can't reach Lost without a reason" (docs/02-BUILD-PHASES.md
-- § Session plan). pipeline_stages.requires_reason and
-- leads.lost_reason/lost_reason_detail/lost_at already exist (Session 1/4
-- schema) — this is the enforcement, at the database level rather than
-- only in the kanban Server Action, so it holds for every current and
-- future write path (CSV import, a future bulk-move tool, direct SQL),
-- same rationale as the interactions_next_action_required CHECK
-- constraint (migration 0009).
--
-- A CHECK constraint can't reference another table, so this needs a
-- trigger: look up the target stage's requires_reason, reject the move if
-- it's true and lost_reason is missing, and — the part a CHECK constraint
-- couldn't do either — clear stale lost_reason/lost_reason_detail/lost_at
-- when a lead moves OUT of a requires_reason stage, so re-opening a
-- previously-lost lead doesn't leave a lie sitting in the row.
create or replace function enforce_lost_reason()
returns trigger
language plpgsql
as $$
declare
  v_requires_reason boolean;
begin
  if new.stage_id is null then
    new.lost_reason := null;
    new.lost_reason_detail := null;
    new.lost_at := null;
    return new;
  end if;

  select requires_reason into v_requires_reason
  from pipeline_stages
  where id = new.stage_id;

  if coalesce(v_requires_reason, false) then
    if new.lost_reason is null or btrim(new.lost_reason) = '' then
      raise exception 'lost_reason is required to move a lead into this stage';
    end if;
    if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then
      new.lost_at := now();
    end if;
  else
    new.lost_reason := null;
    new.lost_reason_detail := null;
    new.lost_at := null;
  end if;

  return new;
end;
$$;

create trigger enforce_lost_reason
  before insert or update on leads
  for each row execute function enforce_lost_reason();
