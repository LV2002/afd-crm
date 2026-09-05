-- Collections has shown who is late since the finance module shipped, and
-- nothing has ever chased them. This is the chasing.

create table if not exists payment_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Negative fires BEFORE the money falls due, which is the cheapest
  -- collection there is and the thing an overdue-only design cannot say.
  days_after_due integer not null,
  channel text not null default 'notification',
  template_name text,
  template_language text not null default 'en_US',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint payment_reminder_rules_channel
    check (channel in ('notification', 'whatsapp')),
  -- A WhatsApp rung with no template is a rung that fails every night.
  constraint payment_reminder_rules_template_required
    check (channel <> 'whatsapp' or template_name is not null)
);

-- One row per rung actually fired against one instalment. The unique index
-- below is the entire anti-spam mechanism.
create table if not exists payment_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  instalment_id uuid not null references enrolment_instalments(id) on delete cascade,
  rule_id uuid not null references payment_reminder_rules(id) on delete cascade,
  channel text not null,
  status text not null,
  detail text,
  sent_at timestamptz not null default now(),
  constraint payment_reminders_sent_status
    check (status in ('sent', 'failed', 'skipped'))
);

-- A rung fires ONCE per instalment, ever. Without this the sweep would
-- remind the same student every night it ran.
create unique index if not exists payment_reminders_sent_instalment_rule_uq
  on payment_reminders_sent (instalment_id, rule_id);

alter table payment_reminder_rules enable row level security;
alter table payment_reminders_sent enable row level security;

-- The ladder is configuration, same shape as fee_structures: readable by
-- anyone signed in (the Collections screen says when the next chase goes
-- out), changed only by settings.manage.
create policy payment_reminder_rules_select on payment_reminder_rules for select
  to authenticated using (true);

create policy payment_reminder_rules_insert on payment_reminder_rules for insert
  to authenticated with check (auth_scope('settings.manage') = 'all');

create policy payment_reminder_rules_update on payment_reminder_rules for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

-- What was actually sent to a student is part of that student's file, so
-- it is visible to whoever may see the money: payment.read, scoped by the
-- enrolment's centre the same way payments themselves are. Nothing writes
-- to it from a browser at all — only the cron, on the direct connection —
-- so there is deliberately no insert or update policy.
create policy payment_reminders_sent_select on payment_reminders_sent for select
  to authenticated
  using (exists (
    select 1
    from enrolment_instalments ei
    join enrolments e on e.id = ei.enrolment_id
    where ei.id = payment_reminders_sent.instalment_id
      and can_access_center('payment.read', e.center_id, null)
  ));

-- "What is still owed and how late" is the sweep's one query.
create index if not exists payment_reminders_sent_instalment_idx
  on payment_reminders_sent (instalment_id);

comment on table payment_reminder_rules is
  'The overdue-chasing ladder. days_after_due may be negative to remind
   before the due date.';
