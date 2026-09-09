-- What the institute is aiming for, so a number can be compared to one.
--
-- Everything this system reports has been descriptive — how many leads
-- arrived, how many enrolled, what it cost. None of it was ever compared
-- against what somebody was TRYING to do, so nobody could open the CRM on
-- the 14th and see whether the month was on course.
--
-- One table, three scopes: the whole institute (both ids null), one
-- centre, or one counsellor. They coexist on purpose — an institute sets
-- a number for Kochi and then splits it between the four people working
-- there — and they are never summed. An institute-wide target is its own
-- statement, not the total of the centre rows; adding them is how a month
-- reads 200% achieved.
create table if not exists targets (
  id uuid primary key default gen_random_uuid(),
  -- Always the 1st, so ordering and ranges are ordinary SQL rather than
  -- string arithmetic on 'yyyy-MM'.
  period_month date not null,
  center_id uuid references centers(id) on delete cascade,
  owner_id uuid references profiles(id) on delete cascade,
  metric text not null,
  -- A count for leads and admissions; paise for revenue, like every other
  -- money column here.
  target_value bigint not null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint targets_metric check (metric in ('leads','admissions','revenue')),
  constraint targets_value_positive check (target_value > 0),
  constraint targets_month_start check (extract(day from period_month) = 1),
  -- A target belongs to a person or a centre or the institute, never to a
  -- person within a centre — that would be a fourth scope nobody asked
  -- for and a second place the same number could live.
  constraint targets_one_scope check (num_nonnulls(center_id, owner_id) <= 1)
);--> statement-breakpoint

create index if not exists targets_period_idx on targets (period_month);--> statement-breakpoint
create index if not exists targets_center_idx on targets (center_id);--> statement-breakpoint
create index if not exists targets_owner_idx on targets (owner_id);--> statement-breakpoint

-- One target per month, per metric, per scope. A plain unique index over
-- the nullable columns would not do it: in Postgres two nulls are not
-- equal, so "the institute's June admissions target" could be entered
-- five times and every copy would be accepted. Coalescing to the nil uuid
-- is what makes the null case a value the index can compare.
create unique index if not exists targets_scope_uq on targets (
  period_month,
  metric,
  coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where deleted_at is null;--> statement-breakpoint

alter table targets enable row level security;--> statement-breakpoint

-- Anyone who can read a report can see the targets that apply to them.
-- Deliberately generous on the reading side: a counsellor being able to
-- see the number they are being measured against is the entire point, and
-- a target is not somebody's data — it is a decision the institute made.
--
-- Org-wide targets need report.org to see: "the institute wants 60
-- admissions this month" is a management figure, and a counsellor reading
-- it as their own would be reading a number twenty times their own.
create policy targets_select on targets for select
  to authenticated
  using (
    case
      when center_id is not null then can_access_center('report.read', center_id, null)
      when owner_id is not null then (
        owner_id = auth.uid() or auth_scope('report.read') in ('center','all')
      )
      else auth_scope('report.read') = 'all' or auth_scope('report.org') = 'all'
    end
  );--> statement-breakpoint

-- Setting one is a management act, gated on its own permission rather than
-- settings.manage: a centre head runs their centre's numbers without
-- getting the keys to the pipeline, the roles and the integrations.
create policy targets_insert on targets for insert
  to authenticated
  with check (
    case
      when center_id is not null then can_access_center('target.manage', center_id, null)
      when owner_id is not null then auth_scope('target.manage') in ('center','all')
      else auth_scope('target.manage') = 'all'
    end
  );--> statement-breakpoint

create policy targets_update on targets for update
  to authenticated
  using (
    case
      when center_id is not null then can_access_center('target.manage', center_id, null)
      when owner_id is not null then auth_scope('target.manage') in ('center','all')
      else auth_scope('target.manage') = 'all'
    end
  )
  with check (
    case
      when center_id is not null then can_access_center('target.manage', center_id, null)
      when owner_id is not null then auth_scope('target.manage') in ('center','all')
      else auth_scope('target.manage') = 'all'
    end
  );
