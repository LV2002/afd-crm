-- RLS for temperature_rules, sla_policies, business_hours, holidays.
--
-- Per src/lib/auth/permissions.ts, `rules.manage` is the primitive that
-- covers "assignment rules, SLA policies, temperature rules, scoring" —
-- these four tables all gate mutations on it, same shape as the
-- settings.manage-gated config tables from migration 0001: select for
-- every authenticated user (the app renders them), insert/update/delete
-- gated on the scope.

alter table temperature_rules enable row level security;
alter table sla_policies enable row level security;
alter table business_hours enable row level security;
alter table holidays enable row level security;

create trigger set_updated_at before update on temperature_rules
  for each row execute function set_updated_at();
create trigger set_updated_at before update on sla_policies
  for each row execute function set_updated_at();
create trigger set_updated_at before update on business_hours
  for each row execute function set_updated_at();
create trigger set_updated_at before update on holidays
  for each row execute function set_updated_at();

create policy temperature_rules_select on temperature_rules for select
  to authenticated
  using (true);

create policy temperature_rules_insert on temperature_rules for insert
  to authenticated
  with check (auth_scope('rules.manage') = 'all');

create policy temperature_rules_update on temperature_rules for update
  to authenticated
  using (auth_scope('rules.manage') = 'all')
  with check (auth_scope('rules.manage') = 'all');

create policy temperature_rules_delete on temperature_rules for delete
  to authenticated
  using (auth_scope('rules.manage') = 'all');

create policy sla_policies_select on sla_policies for select
  to authenticated
  using (true);

create policy sla_policies_insert on sla_policies for insert
  to authenticated
  with check (auth_scope('rules.manage') = 'all');

create policy sla_policies_update on sla_policies for update
  to authenticated
  using (auth_scope('rules.manage') = 'all')
  with check (auth_scope('rules.manage') = 'all');

create policy sla_policies_delete on sla_policies for delete
  to authenticated
  using (auth_scope('rules.manage') = 'all');

create policy business_hours_select on business_hours for select
  to authenticated
  using (true);

create policy business_hours_insert on business_hours for insert
  to authenticated
  with check (auth_scope('rules.manage') = 'all');

create policy business_hours_update on business_hours for update
  to authenticated
  using (auth_scope('rules.manage') = 'all')
  with check (auth_scope('rules.manage') = 'all');

create policy business_hours_delete on business_hours for delete
  to authenticated
  using (auth_scope('rules.manage') = 'all');

create policy holidays_select on holidays for select
  to authenticated
  using (true);

create policy holidays_insert on holidays for insert
  to authenticated
  with check (auth_scope('rules.manage') = 'all');

create policy holidays_update on holidays for update
  to authenticated
  using (auth_scope('rules.manage') = 'all')
  with check (auth_scope('rules.manage') = 'all');

create policy holidays_delete on holidays for delete
  to authenticated
  using (auth_scope('rules.manage') = 'all');
