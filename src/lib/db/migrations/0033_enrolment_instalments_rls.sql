-- RLS for enrolment_instalments.
--
-- An instalment is part of its enrolment's commercial record, so it
-- inherits that enrolment's boundary rather than defining its own. The
-- helper is `security definer` for the same reason as the attachments
-- helpers in 0031: without it, the enrolments lookup inside a policy is
-- filtered by enrolments' own RLS, and a role that may see the schedule
-- but not the enrolment row would be denied its own data.
--
-- Note this schedule is the AGREED plan, not money received. It is
-- editable — a plan gets renegotiated — which is exactly why it is a
-- separate table from `payments`, where nothing is ever updated.

create or replace function can_access_enrolment(perm text, target_enrolment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from enrolments e
    where e.id = target_enrolment_id
      and e.deleted_at is null
      and can_access_center(perm, e.center_id, null)
  );
$$;

comment on function can_access_enrolment(text, uuid) is
  'May the current user exercise `perm` over this enrolment? security definer
   so the parent lookup is not itself blocked by enrolments RLS.';

alter table enrolment_instalments enable row level security;

create policy enrolment_instalments_select on enrolment_instalments for select
  to authenticated
  using (can_access_enrolment('enrolment.read', enrolment_id));

create policy enrolment_instalments_insert on enrolment_instalments for insert
  to authenticated
  with check (can_access_enrolment('enrolment.update', enrolment_id));

create policy enrolment_instalments_update on enrolment_instalments for update
  to authenticated
  using (can_access_enrolment('enrolment.update', enrolment_id))
  with check (can_access_enrolment('enrolment.update', enrolment_id));

-- DELETE is allowed here, unlike everywhere else in the finance schema,
-- and the distinction is deliberate: this table holds an INTENDED
-- schedule, not a financial fact. Rewriting a four-instalment plan as
-- three means the fourth row should cease to exist, not linger
-- soft-deleted and have to be filtered out of every sum. Nothing in the
-- append-only ledger is touched by it.
create policy enrolment_instalments_delete on enrolment_instalments for delete
  to authenticated
  using (can_access_enrolment('enrolment.update', enrolment_id));
