-- Changing a confirmed admission's course, batch, mode or academic year,
-- and letting accounts correct a fee.
--
-- Three things, all of which an existing deployment needs without waiting
-- for somebody to re-run the seed: a new permission primitive, the role
-- grants that make it useful, and an RLS policy that recognises it.
--
-- Every insert below is written to do nothing on a database where the
-- seed has not run yet. On a fresh install migrations run FIRST and
-- `roles` is empty, so `insert ... select from roles` finds no rows and
-- the seed does the work properly a moment later. That is the lesson from
-- 0081, where an unguarded insert against an unseeded table took the
-- whole migration batch down.

-- 1. The primitive itself. Split out of `enrolment.update` so that moving
-- a student between courses is not the same authority as changing what
-- their family owes.
insert into permissions (code, label, category, description)
values (
  'enrolment.change_plan',
  'Change course, batch or mode',
  'Enrolment',
  'Move a confirmed admission to a different course, batch, mode or academic year. Does not include changing the fee.'
)
on conflict (code) do update
  set label = excluded.label,
      category = excluded.category,
      description = excluded.description;

-- `enrolment.update` now means the fee plan and nothing else, so its own
-- wording stops promising course and batch.
update permissions
set label = 'Edit the fee plan',
    description = 'Set or correct an enrolment''s fee, discount and instalment schedule.'
where code = 'enrolment.update';

-- 2. Who gets it.
--
-- Counsellors at 'own' — their own students only. Accounts, academics and
-- centre heads at 'center'. The two admin roles hold every primitive at
-- 'all' and are handled by the catch-all below rather than named, so a
-- renamed admin role still picks it up.
insert into role_permissions (role_id, permission_code, scope)
select r.id, 'enrolment.change_plan', 'own'::permission_scope
from roles r
where r.code = 'counsellor'
on conflict (role_id, permission_code) do nothing;

insert into role_permissions (role_id, permission_code, scope)
select r.id, 'enrolment.change_plan', 'center'::permission_scope
from roles r
where r.code in ('accounts', 'academics', 'center_head')
on conflict (role_id, permission_code) do nothing;

-- Any role that already holds every other enrolment primitive at 'all' —
-- admin, co_admin, and anything an institute built to match them — gets
-- this one at 'all' too. Without this an admin would be the one person
-- unable to move a student between batches.
insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, 'enrolment.change_plan', 'all'::permission_scope
from role_permissions rp
where rp.permission_code = 'enrolment.update'
  and rp.scope = 'all'
on conflict (role_id, permission_code) do nothing;

-- 3. Accounts can correct a fee.
--
-- The one thing Leon asked for that is a straight grant rather than a new
-- primitive: `enrolment.update` already means "the fee plan", and before
-- this the people taking the money had to find a centre head to change a
-- figure they had just been told was wrong.
insert into role_permissions (role_id, permission_code, scope)
select r.id, 'enrolment.update', 'center'::permission_scope
from roles r
where r.code = 'accounts'
on conflict (role_id, permission_code) do nothing;

-- 4. RLS.
--
-- The row-level question is "may you touch this enrolment at all", and
-- either primitive answers yes. Which COLUMNS each one may move is a
-- column-level distinction Postgres policies cannot express without a
-- trigger, so it is enforced in the two server actions instead:
-- `changeEnrolmentPlan` writes course/batch/mode/year and never touches a
-- fee column, `saveFeePlan` the reverse. Documented here rather than left
-- implicit, because "RLS is the only thing standing between a counsellor
-- and another counsellor's leads" (CLAUDE.md non-negotiable #3) is about
-- which ROWS you can reach, and this policy still enforces exactly that.
drop policy if exists enrolments_update on enrolments;

create policy enrolments_update on enrolments for update
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = enrolments.lead_id
      and (
        private.can_access_center('enrolment.update', l.center_id, l.assigned_to)
        or private.can_access_center('enrolment.change_plan', l.center_id, l.assigned_to)
      )
  ))
  with check (exists (
    select 1 from leads l
    where l.id = enrolments.lead_id
      and (
        private.can_access_center('enrolment.update', l.center_id, l.assigned_to)
        or private.can_access_center('enrolment.change_plan', l.center_id, l.assigned_to)
      )
  ));

-- 5. The three new notification events.
--
-- `notify()` falls back to the event definition's own defaults when no
-- row exists here, so these are not what makes the events work — they are
-- what makes Settings → Notifications show the right boxes ticked on a
-- database that was seeded before the events existed. Same guard as
-- above: on a fresh install the subquery finds no roles, nothing is
-- inserted, and the seed writes the row with the full role list.
insert into notification_settings (event_key, is_enabled, notify_roles, notify_owner, channels, title_template, body_template)
select
  'lead.created',
  true,
  array(select id from roles where code in ('center_head')),
  false,
  array['in_app'],
  'New lead: {{lead_name}}',
  '#{{lead_number}} from {{source}} at {{center_name}}. Assigned to {{owner_name}}.'
where exists (select 1 from roles where code = 'center_head')
on conflict (event_key) do nothing;

insert into notification_settings (event_key, is_enabled, notify_roles, notify_owner, channels, title_template, body_template)
select
  'enrolment.plan_changed',
  true,
  array(select id from roles where code in ('accounts', 'academics', 'center_head')),
  true,
  array['in_app'],
  'Plan changed: {{student_name}}',
  '{{changes}} — changed by {{changed_by}}.'
where exists (select 1 from roles where code = 'accounts')
on conflict (event_key) do nothing;

insert into notification_settings (event_key, is_enabled, notify_roles, notify_owner, channels, title_template, body_template)
select
  'enrolment.fee_changed',
  true,
  array(select id from roles where code in ('accounts', 'center_head')),
  true,
  array['in_app'],
  'Fee changed: {{student_name}}',
  '{{old_fee}} → {{new_fee}}, changed by {{changed_by}}.'
where exists (select 1 from roles where code = 'accounts')
on conflict (event_key) do nothing;
