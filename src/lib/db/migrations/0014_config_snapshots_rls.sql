-- config_snapshots: select-only, same shape as stage_history/assignment_history
-- — no insert/update/delete policy for any authenticated role. The only
-- legitimate writer is the config export/import Server Action, which runs
-- on the direct db client (same trust boundary as resolveOrCreateLead())
-- because import also has to write to `permissions`, a table RLS never
-- lets any authenticated role write to at all. See docs/DECISIONS.md.
alter table config_snapshots enable row level security;

create policy config_snapshots_select on config_snapshots for select
  to authenticated
  using (auth_scope('config.export') = 'all' or auth_scope('config.import') = 'all');
