-- One status instead of two: temperature replaces the pipeline stage.
--
-- Leon: "I don't want stages anymore, instead lets keep it as only
-- temperature" — eleven values, replacing the stage everywhere, with
-- "Took admission" set automatically when an admission is confirmed and
-- REFUSED by hand if there is no confirmed admission behind it.
--
-- This reverses CLAUDE.md's old non-negotiable #1 (stage and temperature
-- are separate columns). The reasoning is in docs/DECISIONS.md.
--
-- ## What this does NOT do: drop anything
--
-- `pipeline_stages`, `leads.stage_id` and `stage_history` are left exactly
-- as they are. stage_history is the only record of where each lead has
-- been, and dropping a column that holds a year of that history in the
-- same migration that stops using it is a decision to make once the new
-- model has been seen working, not one to make at the moment of the
-- switch. Nothing in the application reads or writes them after this; a
-- test (tests/no-stage.spec.ts) fails the build if anything starts to.
--
-- ## Order matters, and the reason is a trap
--
-- The old `enforce_lost_reason` trigger looks the lead's stage up and
-- CLEARS lost_reason/lost_at whenever that stage does not require a
-- reason. Once nothing moves stage_id, every lead sits at whatever stage
-- it last had — so leaving that trigger in place would wipe the lost
-- reason off any lead that was updated for any reason at all. It is
-- dropped FIRST, before the backfill, and replaced by one keyed on the
-- temperature.

-- ---------------------------------------------------------------------------
-- 1. Retire the stage-keyed triggers
-- ---------------------------------------------------------------------------

drop trigger if exists enforce_lost_reason on leads;--> statement-breakpoint
drop trigger if exists write_stage_history on leads;--> statement-breakpoint
drop function if exists enforce_lost_reason();--> statement-breakpoint
drop function if exists private.write_stage_history();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. The eleven values, as data
-- ---------------------------------------------------------------------------
--
-- Behaviour hangs off `metadata.kind`, never off the label, for the same
-- reason it hung off `stage_type` rather than the stage's name: an admin
-- can rename "Joined competitor" and nothing should notice.
--
--   kind             new | open | won | lost | parked
--   probability      0-100, weights the forecast (starting estimates, an
--                    admin's to change — the stages' own were never
--                    comparable to a temperature's)
--   requires_reason  a closing outcome that must say why
--   interested       counts toward the dashboard's Interested figure
--   rank             display order
--
-- Hot, Warm and Cold already exist and keep their admin-chosen label and
-- colour: only their metadata is merged in (`||`, never replaced, because
-- `interested` is somebody's decision). The other eight are inserted.
-- `deleted_at = null` revives one an admin had previously removed, so the
-- unique (category, value) slot does not block the insert.

-- The category itself first. A running instance has it; a brand-new one does
-- not until the seed runs, and without this the foreign key below fails the
-- whole migration chain on every fresh database (CI builds one each run).
-- The seed upserts the same row afterwards, so nothing is duplicated.
insert into dropdown_categories (key, label, is_system)
values ('temperature', 'Temperature', true)
on conflict (key) do nothing;--> statement-breakpoint

insert into dropdown_options (category, value, label, sort_order, is_active, color, metadata) values
  ('temperature', 'not_contacted',     'Not contacted',     1,  true, '#94a3b8', '{"rank":1,"kind":"new","probability":5,"requires_reason":false,"interested":false}'),
  ('temperature', 'contacted',         'Contacted',         2,  true, '#3b82f6', '{"rank":2,"kind":"open","probability":10,"requires_reason":false,"interested":false}'),
  ('temperature', 'cold',              'Cold',              3,  true, '#0ea5e9', '{"rank":3,"kind":"open","probability":10,"requires_reason":false,"interested":false}'),
  ('temperature', 'warm',              'Warm',              4,  true, '#f97316', '{"rank":4,"kind":"open","probability":30,"requires_reason":false,"interested":true}'),
  ('temperature', 'hot',               'Hot',               5,  true, '#dc2626', '{"rank":5,"kind":"open","probability":60,"requires_reason":false,"interested":true}'),
  ('temperature', 'took_admission',    'Took admission',    6,  true, '#16a34a', '{"rank":6,"kind":"won","probability":100,"requires_reason":false,"interested":false}'),
  ('temperature', 'future_prospect',   'Future prospect',   7,  true, '#8b5cf6', '{"rank":7,"kind":"parked","probability":15,"requires_reason":false,"interested":false}'),
  ('temperature', 'negative',          'Negative',          8,  true, '#6b7280', '{"rank":8,"kind":"lost","probability":0,"requires_reason":true,"interested":false}'),
  ('temperature', 'wrong_target',      'Wrong target',      9,  true, '#78716c', '{"rank":9,"kind":"lost","probability":0,"requires_reason":false,"interested":false}'),
  ('temperature', 'afd_india_student', 'AFD India student', 10, true, '#0d9488', '{"rank":10,"kind":"lost","probability":0,"requires_reason":false,"interested":false}'),
  ('temperature', 'joined_competitor', 'Joined competitor', 11, true, '#db2777', '{"rank":11,"kind":"lost","probability":0,"requires_reason":true,"interested":false}')
on conflict (category, value) do update
  set metadata   = coalesce(dropdown_options.metadata, '{}'::jsonb)
                   || (excluded.metadata - 'interested'),
      sort_order = excluded.sort_order,
      is_active  = true,
      deleted_at = null;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Give every lead the status its stage and temperature jointly implied
-- ---------------------------------------------------------------------------
--
-- Precedence, strongest first — the question being "what is true of this
-- lead that nothing else can overrule":
--
--   1. Has a (non-deleted) enrolment            -> Took admission.
--      An admission is a fact in another table, whatever the stage said.
--   2. Sat in a Won stage with NO enrolment     -> Hot.
--      Somebody dragged them there by hand. The new rule is that Took
--      admission needs a confirmed admission behind it, and inventing one
--      here would be fabricating a fact; Hot is the honest reading of
--      "was thought certain" and puts them back in front of a counsellor.
--      The count is reported below so it is not silent.
--   3. Sat in a Lost stage                      -> Negative.
--   4. Sat in a Parked stage                    -> Future prospect.
--   5. Had the old Dead temperature             -> Negative.
--   6. Had Very Hot (added by some instances)   -> Hot.
--   7. Had Hot / Warm / Cold                    -> unchanged.
--   8. Otherwise (no temperature yet): spoken to -> Contacted,
--      never spoken to -> Not contacted.
--
-- `set_updated_at` is switched off for the duration: re-stating a status
-- is not an edit anybody made, and bumping updated_at on every lead would
-- reorder every list sorted by it.

alter table leads disable trigger set_updated_at;--> statement-breakpoint

do $$
declare
  v_won_without_enrolment integer;
begin
  select count(*) into v_won_without_enrolment
  from leads l
  join pipeline_stages ps on ps.id = l.stage_id
  where ps.stage_type = 'won'
    and not exists (select 1 from enrolments e where e.lead_id = l.id and e.deleted_at is null);

  update leads l
  set temperature = m.new_temperature
  from (
    select
      l2.id,
      case
        when exists (select 1 from enrolments e where e.lead_id = l2.id and e.deleted_at is null)
          then 'took_admission'
        when ps.stage_type = 'won'    then 'hot'
        when ps.stage_type = 'lost'   then 'negative'
        when ps.stage_type = 'parked' then 'future_prospect'
        when l2.temperature = 'dead'  then 'negative'
        when l2.temperature = 'very_hot' then 'hot'
        when l2.temperature in ('hot', 'warm', 'cold') then l2.temperature
        when l2.first_response_at is not null then 'contacted'
        else 'not_contacted'
      end as new_temperature
    from leads l2
    left join pipeline_stages ps on ps.id = l2.stage_id
  ) m
  where m.id = l.id
    and l.temperature is distinct from m.new_temperature;

  if v_won_without_enrolment > 0 then
    raise notice '% lead(s) sat in a Won stage with no confirmed admission behind them; set to Hot rather than Took admission.', v_won_without_enrolment;
  end if;
end $$;--> statement-breakpoint

alter table leads enable trigger set_updated_at;--> statement-breakpoint

-- The two old values are retired, not deleted: they still label history.
--
-- And they are given the kind they always had, so that a lead somehow still
-- carrying one is treated correctly instead of by the default. `dead` was
-- terminal (its metadata said `is_terminal: true`), so it is `lost`; an
-- unmarked option defaults to `open`, which would put a stray Dead lead
-- back in the queue. `very_hot` was simply a warmer open one.
update dropdown_options
set is_active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || case value
      when 'dead' then '{"kind":"lost","requires_reason":false,"interested":false}'::jsonb
      else '{"kind":"open","interested":false}'::jsonb
    end
where category = 'temperature'
  and value in ('dead', 'very_hot');--> statement-breakpoint

-- Rules that wrote the old values. A rule that wrote Very Hot now writes
-- Hot. One that wrote Dead is switched OFF, not remapped: it auto-closed
-- leads, and a closing outcome needs a reason a rule cannot supply — left
-- live, the nightly job would quietly move leads BACK to a retired value
-- the moment they matched it, undoing this conversion one lead at a time.
-- Anything else that no longer names a live in-progress temperature goes
-- the same way.
update temperature_rules
set temperature_value = 'hot'
where temperature_value = 'very_hot';--> statement-breakpoint

update temperature_rules r
set is_active = false
where r.is_active
  and not exists (
    select 1
    from dropdown_options o
    where o.category = 'temperature'
      and o.value = r.temperature_value
      and o.deleted_at is null
      and o.is_active
      and coalesce(o.metadata ->> 'kind', 'open') = 'open'
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. History of the status, written by the database
-- ---------------------------------------------------------------------------
--
-- Replaces stage_history for the same reason stage_history existed
-- (docs/03-V1-AUDIT.md D6): written by a trigger, not by the application,
-- so no write path can forget to. It feeds time-in-status for the SLA
-- sweep and the funnel reports.
--
-- Seeded with one row per lead whose `changed_at` is when it LAST changed
-- stage (else when it was created). Seeding with now() would restart every
-- "time in status" clock at the moment of this migration and quietly reset
-- every SLA that is measured from it.

create table temperature_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_temperature text,
  to_temperature text,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  duration_in_previous_seconds integer
);--> statement-breakpoint

create index temperature_history_lead_id_idx
  on temperature_history (lead_id, changed_at desc);--> statement-breakpoint

alter table temperature_history enable row level security;--> statement-breakpoint

-- Select-only, inherited from the lead. No insert/update/delete policy for
-- anyone: only the security-definer trigger below writes here.
create policy temperature_history_select on temperature_history for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = temperature_history.lead_id
      and private.can_access_center('lead.read', l.center_id, l.assigned_to)
  ));--> statement-breakpoint

insert into temperature_history (lead_id, from_temperature, to_temperature, changed_by, changed_at)
select
  l.id,
  null,
  l.temperature,
  null,
  coalesce(
    (select max(sh.changed_at) from stage_history sh where sh.lead_id = l.id),
    l.created_at
  )
from leads l
where l.temperature is not null;--> statement-breakpoint

create or replace function private.write_temperature_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_changed_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.temperature is null then
      return new;
    end if;
    insert into temperature_history (lead_id, from_temperature, to_temperature, changed_by, changed_at)
    values (new.id, null, new.temperature, auth.uid(), now());
    return new;
  end if;

  if new.temperature is distinct from old.temperature then
    select changed_at into prev_changed_at
    from temperature_history
    where lead_id = new.id
    order by changed_at desc
    limit 1;

    insert into temperature_history (
      lead_id, from_temperature, to_temperature, changed_by, changed_at, duration_in_previous_seconds
    )
    values (
      new.id,
      old.temperature,
      new.temperature,
      auth.uid(),
      now(),
      case when prev_changed_at is null then null
           else extract(epoch from (now() - prev_changed_at))::int
      end
    );
  end if;

  return new;
end;
$$;--> statement-breakpoint

create trigger write_temperature_history
  after insert or update on leads
  for each row execute function private.write_temperature_history();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. The rules of the status, enforced where no write path can skip them
-- ---------------------------------------------------------------------------
--
-- Three rules, all about a CHANGE of status (an unrelated edit to a lead
-- that is already in an odd state is never refused):
--
--   a. "Took admission" (kind = won) needs a confirmed admission behind it
--      — a non-deleted enrolment: course, batch and fee recorded. Refused
--      otherwise. confirmAdmission() inserts the enrolment first and sets
--      the status second, in one transaction, so it passes its own gate.
--   b. A lead whose admission is confirmed and not dropped cannot leave
--      "Took admission" by hand. The status is a fact about the
--      enrolment, and a lead edited back to Hot while an admission is
--      open would re-enter the queue and be chased as if unsold. Dropping
--      the admission (Accounts) is the supported way out.
--   c. A closing outcome that requires a reason cannot be entered without
--      lost_reason, and lost_at is stamped. Moving to anything that is not
--      a lost outcome clears lost_reason/lost_reason_detail/lost_at, so a
--      re-opened lead does not carry a lie.
--
-- SECURITY DEFINER because (a) and (b) read `enrolments`, which a
-- counsellor's own RLS may hide: run as the caller, the check would fail
-- OPEN for exactly the people it is meant to constrain.

create or replace function private.enforce_lead_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_kind text;
  v_new_requires_reason boolean;
  v_old_kind text;
  v_label text;
begin
  if tg_op = 'UPDATE' and new.temperature is not distinct from old.temperature then
    return new;
  end if;

  select coalesce(o.metadata ->> 'kind', 'open'),
         coalesce((o.metadata ->> 'requires_reason')::boolean, false),
         o.label
    into v_new_kind, v_new_requires_reason, v_label
  from dropdown_options o
  where o.category = 'temperature' and o.value = new.temperature and o.deleted_at is null;

  v_new_kind := coalesce(v_new_kind, 'open');
  v_new_requires_reason := coalesce(v_new_requires_reason, false);

  if tg_op = 'UPDATE' then
    select coalesce(o.metadata ->> 'kind', 'open') into v_old_kind
    from dropdown_options o
    where o.category = 'temperature' and o.value = old.temperature and o.deleted_at is null;
    v_old_kind := coalesce(v_old_kind, 'open');
  end if;

  -- (a) entering "Took admission"
  if v_new_kind = 'won' then
    if not exists (select 1 from enrolments e where e.lead_id = new.id and e.deleted_at is null) then
      raise exception 'A lead can only be marked "%" by confirming the admission with its course, batch and fee.', coalesce(v_label, new.temperature)
        using errcode = 'check_violation';
    end if;
  end if;

  -- (b) leaving "Took admission" while the admission stands
  if tg_op = 'UPDATE' and v_old_kind = 'won' and v_new_kind <> 'won' then
    if exists (
      select 1 from enrolments e
      where e.lead_id = new.id and e.deleted_at is null and e.dropped_at is null
    ) then
      raise exception 'This lead''s admission is confirmed, so its status cannot be changed here. Drop the admission from the Accounts screen first.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- (c) closing outcomes and their reasons
  if v_new_kind = 'lost' then
    if v_new_requires_reason and btrim(coalesce(new.lost_reason, '')) = '' then
      raise exception 'lost_reason is required to move a lead into this status'
        using errcode = 'check_violation';
    end if;
    new.lost_at := now();
  else
    new.lost_reason := null;
    new.lost_reason_detail := null;
    new.lost_at := null;
  end if;

  return new;
end;
$$;--> statement-breakpoint

create trigger enforce_lead_status
  before insert or update on leads
  for each row execute function private.enforce_lead_status();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Names that said "stage"
-- ---------------------------------------------------------------------------

-- The SLA measure "time in the current stage" is now time in the current
-- status. An enum value rename rewrites every policy that used it.
alter type sla_measure rename value 'in_stage' to 'in_status';--> statement-breakpoint

-- Funnel position is no longer a lead field.
update field_definitions set is_active = false where entity = 'lead' and key = 'stage_id';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7. Rules and flows that were written against stages
-- ---------------------------------------------------------------------------
--
-- A condition on `stage_id` has no equivalent in a single-status model:
-- "Counselling Done" was a place in a funnel that no longer exists. And an
-- unknown condition field makes evaluateConditions() THROW, which on an
-- assignment rule would stop every new lead being assigned. So any rule,
-- policy or flow whose conditions mention a stage is switched OFF and its
-- name is prefixed, which is visible in the admin screen, rather than
-- left live to fail or be quietly ignored.
--
-- Flows get one extra chance first: a flow triggered by entering the
-- Won / Lost / Parked / New stage has a clear successor (Took admission /
-- Negative / Future prospect / Not contacted) and is re-pointed rather
-- than disabled.

update assignment_rules
set is_active = false, name = '[Needs review: used a stage] ' || name
where is_active and conditions::text like '%"stage_id"%';--> statement-breakpoint

update temperature_rules
set is_active = false
where is_active and conditions::text like '%"stage_id"%';--> statement-breakpoint

update sla_policies
set is_active = false, name = '[Needs review: used a stage] ' || name
where is_active and applies_to::text like '%"stage_id"%';--> statement-breakpoint

create function pg_temp.status_for_stage(p_stage_id text) returns text
language sql stable as $$
  select case ps.stage_type
    when 'won'    then 'took_admission'
    when 'lost'   then 'negative'
    when 'parked' then 'future_prospect'
    when 'new'    then 'not_contacted'
    else case when lower(ps.name) = 'contacted' then 'contacted' end
  end
  from pipeline_stages ps
  where ps.id::text = p_stage_id
$$;--> statement-breakpoint

update whatsapp_flows
set trigger_type = 'temperature_entered',
    trigger_config = jsonb_build_object('temperature', pg_temp.status_for_stage(trigger_config ->> 'stageId'))
where trigger_type = 'stage_entered'
  and pg_temp.status_for_stage(trigger_config ->> 'stageId') is not null;--> statement-breakpoint

-- A STEP may only move a lead to a status an automation can actually
-- reach: not Took admission (that needs an admission) and not a closing
-- outcome that asks why (an automation cannot say). A step that pointed
-- at the Won or Lost stage is therefore left as `set_stage`, which the
-- clean-up below switches off — rather than re-pointed at something the
-- database would refuse every time it ran.
update whatsapp_flow_steps
set kind = 'set_temperature',
    config = jsonb_build_object('temperature', pg_temp.status_for_stage(config ->> 'stageId'))
where kind = 'set_stage'
  and pg_temp.status_for_stage(config ->> 'stageId') in ('not_contacted', 'contacted', 'future_prospect');--> statement-breakpoint

-- Whatever could not be re-pointed is switched off, not left to misfire.
update whatsapp_flows f
set is_active = false,
    name = '[Needs review: used a stage] ' || f.name
where f.is_active
  and (
    f.trigger_type = 'stage_entered'
    or f.applies_to::text like '%"stage_id"%'
    or exists (select 1 from whatsapp_flow_steps s where s.flow_id = f.id and s.kind = 'set_stage')
  );
