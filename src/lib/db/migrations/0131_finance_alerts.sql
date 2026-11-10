-- Alerts for money approaching a mark (20 lakh, 1 crore): which marks, and
-- which have already been announced.
create table if not exists finance_alert_rules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- bank_balance: all bank accounts together. income_fy: income so far this financial year.
  metric text not null check (metric in ('bank_balance', 'income_fy')),
  limit_paise bigint not null check (limit_paise > 0),
  -- Warn when the figure reaches this share of the mark.
  warn_percent integer not null default 90 check (warn_percent between 50 and 99),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);--> statement-breakpoint

create table if not exists finance_alert_state (
  rule_id uuid not null references finance_alert_rules(id) on delete cascade,
  -- The financial year for income; "now" for a balance, which can fall and rise again.
  period_key text not null,
  stage text not null check (stage in ('warn', 'reached')),
  notified_at timestamptz not null default now(),
  primary key (rule_id, period_key, stage)
);--> statement-breakpoint

alter table finance_alert_rules enable row level security;--> statement-breakpoint
alter table finance_alert_state enable row level security;--> statement-breakpoint
create policy finance_alert_rules_select on finance_alert_rules for select to authenticated
  using (deleted_at is null and private.auth_scope('finance.manage') is not null);--> statement-breakpoint

insert into finance_alert_rules (label, metric, limit_paise)
select v.label, v.metric, v.limit_paise from (values
  ('₹20 lakh', 'bank_balance', 200000000),
  ('₹1 crore', 'bank_balance', 1000000000),
  ('₹20 lakh', 'income_fy', 200000000),
  ('₹1 crore', 'income_fy', 1000000000)
) as v(label, metric, limit_paise)
where not exists (select 1 from finance_alert_rules);--> statement-breakpoint

-- Leave and comp-day requests tell the manager (as owner) plus HR, co-admins
-- and admins. The existing setting named HR alone; only roles are added.
update notification_settings
set notify_roles = (
  select array_agg(distinct id) from (
    select unnest(coalesce(notification_settings.notify_roles, '{}'::uuid[])) as id
    union select id from roles where code in ('hr', 'co_admin', 'admin')
  ) s
)
where event_key = 'leave.requested' and deleted_at is null;
