-- RLS for assignment_rules / assignment_history (Phase 1: assignment engine).
--
-- Unlike temperature_rules/sla_policies (migration 0003), which are visible
-- to every authenticated user, docs/01-DATA-MODEL.md § Assignment rules
-- engine says the rule set itself is "Admin/co-admin only" — a rule can
-- encode which counsellor covers which district/source/campaign, which is
-- org structure the seed data doesn't expose to center_head or below. So
-- select is gated the same as insert/update/delete: rules.manage at scope
-- 'all'. Per src/lib/db/seed.ts only admin and co_admin currently hold that.
--
-- assignment_history is different: it's part of a lead's own activity
-- trail (who owned it, when it changed), so visibility is inherited from
-- the parent lead via can_access_center(), same shape as stage_history.
-- No update or delete policy for anyone — append-only, like stage_history
-- and audit_log. The insert policy is gated on lead.assign against the
-- target lead so a future manual-reassignment UI (Session 7+) can write
-- here under the caller's own session without a new migration; today the
-- only writer is applyAssignment() on the direct db client (see
-- src/lib/assignment/apply-assignment.ts), same as resolveOrCreateLead().

alter table assignment_rules enable row level security;
alter table assignment_history enable row level security;

create trigger set_updated_at before update on assignment_rules
  for each row execute function set_updated_at();

create policy assignment_rules_select on assignment_rules for select
  to authenticated
  using (auth_scope('rules.manage') = 'all');

create policy assignment_rules_insert on assignment_rules for insert
  to authenticated
  with check (auth_scope('rules.manage') = 'all');

create policy assignment_rules_update on assignment_rules for update
  to authenticated
  using (auth_scope('rules.manage') = 'all')
  with check (auth_scope('rules.manage') = 'all');

create policy assignment_rules_delete on assignment_rules for delete
  to authenticated
  using (auth_scope('rules.manage') = 'all');

create policy assignment_history_select on assignment_history for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = assignment_history.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));

create policy assignment_history_insert on assignment_history for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = assignment_history.lead_id
      and can_access_center('lead.assign', l.center_id, l.assigned_to)
  ));
