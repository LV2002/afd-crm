-- SLA policies and discount authority each get a permission of their own.
--
-- SLA policies were gated on `rules.manage`, which also controls the
-- assignment rules (who receives every new lead), and discount authority on
-- `settings.manage`, the key to the whole settings menu. Neither could be
-- handed to a centre head or co-admin without handing over far more.
--
-- The primitives have to exist before anything can be granted them:
-- `permissions` is a real table with a foreign key from `role_permissions`.
insert into permissions (code, label, category, description)
values
  ('sla.manage', 'Manage SLA policies', 'Administration',
   'Set the response-time targets, escalation ladders, business hours and holidays that decide when a lead counts as overdue.'),
  ('discount.manage', 'Set discount authority', 'Administration',
   'Set how much each role can take off a fee before it needs approval. Cannot raise your own role''s limit.')
on conflict (code) do nothing;--> statement-breakpoint

-- Granted to every role that could already do the job, so nobody loses
-- something they were using and nobody gains anything they did not have.
insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, 'sla.manage', rp.scope
from role_permissions rp
where rp.permission_code = 'rules.manage'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, 'discount.manage', rp.scope
from role_permissions rp
where rp.permission_code = 'settings.manage'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

-- The policies now follow the new permissions. Any scope will do: these are
-- institute-wide settings, there is no narrower version of them to scope to,
-- and requiring "all" would let an admin grant it at "centre" and have it
-- silently refuse.
drop policy if exists sla_policies_insert on sla_policies;--> statement-breakpoint
drop policy if exists sla_policies_update on sla_policies;--> statement-breakpoint
drop policy if exists sla_policies_delete on sla_policies;--> statement-breakpoint
create policy sla_policies_insert on sla_policies for insert to authenticated
  with check (private.auth_scope('sla.manage') is not null);--> statement-breakpoint
create policy sla_policies_update on sla_policies for update to authenticated
  using (private.auth_scope('sla.manage') is not null)
  with check (private.auth_scope('sla.manage') is not null);--> statement-breakpoint
create policy sla_policies_delete on sla_policies for delete to authenticated
  using (private.auth_scope('sla.manage') is not null);--> statement-breakpoint

drop policy if exists business_hours_insert on business_hours;--> statement-breakpoint
drop policy if exists business_hours_update on business_hours;--> statement-breakpoint
drop policy if exists business_hours_delete on business_hours;--> statement-breakpoint
create policy business_hours_insert on business_hours for insert to authenticated
  with check (private.auth_scope('sla.manage') is not null);--> statement-breakpoint
create policy business_hours_update on business_hours for update to authenticated
  using (private.auth_scope('sla.manage') is not null)
  with check (private.auth_scope('sla.manage') is not null);--> statement-breakpoint
create policy business_hours_delete on business_hours for delete to authenticated
  using (private.auth_scope('sla.manage') is not null);--> statement-breakpoint

drop policy if exists holidays_insert on holidays;--> statement-breakpoint
drop policy if exists holidays_update on holidays;--> statement-breakpoint
drop policy if exists holidays_delete on holidays;--> statement-breakpoint
create policy holidays_insert on holidays for insert to authenticated
  with check (private.auth_scope('sla.manage') is not null);--> statement-breakpoint
create policy holidays_update on holidays for update to authenticated
  using (private.auth_scope('sla.manage') is not null)
  with check (private.auth_scope('sla.manage') is not null);--> statement-breakpoint
create policy holidays_delete on holidays for delete to authenticated
  using (private.auth_scope('sla.manage') is not null);--> statement-breakpoint

drop policy if exists discount_limits_insert on discount_limits;--> statement-breakpoint
drop policy if exists discount_limits_update on discount_limits;--> statement-breakpoint
drop policy if exists discount_limits_delete on discount_limits;--> statement-breakpoint
create policy discount_limits_insert on discount_limits for insert to authenticated
  with check (private.auth_scope('discount.manage') is not null);--> statement-breakpoint
create policy discount_limits_update on discount_limits for update to authenticated
  using (private.auth_scope('discount.manage') is not null)
  with check (private.auth_scope('discount.manage') is not null);--> statement-breakpoint
create policy discount_limits_delete on discount_limits for delete to authenticated
  using (private.auth_scope('discount.manage') is not null);
