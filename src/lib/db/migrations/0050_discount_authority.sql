-- Nobody could give away money they were not entitled to give away, until
-- now — the `discount.approve` permission and this idea have existed since
-- Phase 4 and nothing enforced either. A counsellor could type any figure
-- into the discount box and the student was billed accordingly.

create table if not exists discount_limits (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null unique references roles(id) on delete cascade,
  -- Both are optional and BOTH apply when set. A percentage alone lets 10%
  -- off a ₹2,00,000 consultancy through unnoticed; a cash cap alone makes
  -- ₹5,000 look reasonable on a ₹15,000 crash course.
  max_percent integer,
  max_amount_paise bigint,
  -- For admin and co-admin, who must be able to approve what was escalated.
  is_unlimited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint discount_limits_percent_range check (
    max_percent is null or (max_percent >= 0 and max_percent <= 100)
  ),
  constraint discount_limits_amount_non_negative check (
    max_amount_paise is null or max_amount_paise >= 0
  )
);

alter table discount_limits enable row level security;

-- Configuration, same shape as fee_structures: every authenticated user
-- may read it, because the fee panel has to tell a counsellor what their
-- own ceiling is before they type a number rather than after. Only
-- settings.manage changes it.
create policy discount_limits_select on discount_limits for select
  to authenticated
  using (true);

create policy discount_limits_insert on discount_limits for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy discount_limits_update on discount_limits for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy discount_limits_delete on discount_limits for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

-- A discount somebody asked for and is not authorised to give.
--
-- Deliberately not folded into discount_paise/net_fee_paise while it is
-- pending: an unauthorised discount already reducing the bill is one
-- nobody has to hurry to approve, and if it is never approved then
-- accounts have spent weeks collecting against a number that was never
-- agreed. The student owes the full fee until somebody with the authority
-- says otherwise.
alter table enrolments
  add column if not exists pending_discount_paise bigint,
  add column if not exists pending_discount_name text,
  add column if not exists pending_discount_by uuid references profiles(id) on delete set null,
  add column if not exists pending_discount_at timestamptz,
  add column if not exists discount_decided_by uuid references profiles(id) on delete set null,
  add column if not exists discount_decided_at timestamptz,
  add column if not exists discount_decision_note text;

alter table enrolments
  add constraint enrolments_pending_discount_non_negative
  check (pending_discount_paise is null or pending_discount_paise >= 0);

-- The approvals queue reads "every enrolment with something outstanding",
-- which is a handful of rows out of all of them.
create index if not exists enrolments_pending_discount_idx
  on enrolments (pending_discount_at)
  where pending_discount_paise is not null;

comment on column enrolments.pending_discount_paise is
  'A discount requested above the requester''s authority. NOT applied to
   net_fee_paise until approved — see migration 0050.';
