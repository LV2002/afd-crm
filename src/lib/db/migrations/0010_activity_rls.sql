-- RLS for interactions/tasks (Phase 1: lead detail + timeline).
--
-- interactions has its own dedicated permission primitive in
-- src/lib/auth/permissions.ts ("See call/WhatsApp/note history on a
-- lead") — its select policy uses interaction.read, not lead.read, so
-- that primitive actually means something (a role can hold lead.read
-- without interaction.read, e.g. a future report-only role). tasks has no
-- such dedicated primitive, so it inherits visibility from lead.read
-- instead, same shape as stage_history/assignment_history in migration
-- 0005/0008. Mutations on both are gated on interaction.create — logging
-- an interaction and creating/updating a task are both "working the lead"
-- actions a counsellor performs; inventing a separate task.* permission
-- with no distinct enforcement need would violate CLAUDE.md's "don't add
-- a permission for later" rule.
--
-- Unlike stage_history (system-trigger-only, no INSERT policy for anyone),
-- interactions/tasks are written directly by counsellors through the UI —
-- there is no trigger involved, so real INSERT/UPDATE policies exist.
-- Nothing is ever deleted (soft-delete via deleted_at, per CLAUDE.md
-- non-negotiable #5) — no DELETE policy for anyone.

alter table interactions enable row level security;
alter table tasks enable row level security;

create trigger set_updated_at before update on tasks
  for each row execute function set_updated_at();

create policy interactions_select on interactions for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = interactions.lead_id
      and can_access_center('interaction.read', l.center_id, l.assigned_to)
  ));

create policy interactions_insert on interactions for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = interactions.lead_id
      and can_access_center('interaction.create', l.center_id, l.assigned_to)
  ));

-- No UPDATE policy: an interaction log is what actually happened, same
-- append-only reasoning as enquiries. A correction is a new interaction,
-- not an edit to history.

create policy tasks_select on tasks for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = tasks.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));

create policy tasks_insert on tasks for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = tasks.lead_id
      and can_access_center('interaction.create', l.center_id, l.assigned_to)
  ));

-- Tasks ARE updatable (marking done/cancelled, rescheduling) — unlike an
-- interaction log, a task's whole point is that its state changes.
create policy tasks_update on tasks for update
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = tasks.lead_id
      and can_access_center('interaction.create', l.center_id, l.assigned_to)
  ))
  with check (exists (
    select 1 from leads l
    where l.id = tasks.lead_id
      and can_access_center('interaction.create', l.center_id, l.assigned_to)
  ));
