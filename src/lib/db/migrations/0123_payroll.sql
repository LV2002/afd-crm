-- Payroll: pay rates, payslips (immutable, versioned), and the link from a
-- payslip to the ledger entry that paid it, which is in turn paired with a
-- bank statement line by the reconciliation.

create table if not exists payroll_settings (
  id integer primary key default 1 check (id = 1),
  company_name text not null default 'afdindia',
  company_address text not null default '3rd Floor, MI Arcade, Edapally Toll, Kochi',
  late_allowance_min integer not null default 60,
  early_allowance_min integer not null default 60,
  -- Null means the days in the month.
  divisor integer,
  deduction_factor numeric(4,2) not null default 0.5,
  contact_email text not null default 'accounts@afdindia.com',
  -- Whether a payslip must be approved by the owner before it can be paid.
  require_approval boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);--> statement-breakpoint
insert into payroll_settings (id) values (1) on conflict (id) do nothing;--> statement-breakpoint

create table if not exists employee_pay (
  employee_id uuid primary key references employees(id) on delete restrict,
  basic_paise bigint not null default 0 check (basic_paise >= 0),
  hra_paise bigint not null default 0 check (hra_paise >= 0),
  other_paise bigint not null default 0 check (other_paise >= 0),
  medical_paise bigint not null default 0 check (medical_paise >= 0),
  pan text,
  bank_name text,
  bank_account text,
  ifsc text,
  -- Advance outstanding when the CRM took over; later months carry it forward.
  opening_advance_paise bigint not null default 0 check (opening_advance_paise >= 0),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);--> statement-breakpoint

create table if not exists pay_revisions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  month text not null,
  effective_date date not null,
  old_components jsonb not null,
  new_components jsonb not null,
  old_designation text,
  new_designation text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);--> statement-breakpoint

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  slip_no bigserial not null,
  employee_id uuid not null references employees(id) on delete restrict,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  -- A regenerated month adds a new version; the old one is kept, marked superseded.
  version integer not null default 1,
  status text not null default 'current' check (status in ('current', 'superseded')),
  -- Historical slips copied as they were. Never recalculated or regenerated.
  imported boolean not null default false,
  inputs jsonb not null,
  result jsonb not null,
  -- The pay rates in force at the start of the month, so regenerating a month
  -- with a promotion in it gives the same slip.
  base_components jsonb not null,
  net_paise bigint not null,
  earnings_paise bigint not null,
  sl_closing numeric(4,1) not null,
  cl_closing numeric(4,1) not null,
  advance_closing_paise bigint not null default 0,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  generated_by uuid references profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  superseded_at timestamptz
);--> statement-breakpoint
create unique index if not exists payslips_slip_no_uq on payslips (slip_no);--> statement-breakpoint
create unique index if not exists payslips_current_uq on payslips (employee_id, month) where status = 'current';--> statement-breakpoint
create index if not exists payslips_month_idx on payslips (month, status);--> statement-breakpoint

create table if not exists payslip_payments (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references payslips(id) on delete restrict,
  -- The ledger entry that paid it. One entry pays one slip.
  transaction_id uuid not null references finance_transactions(id) on delete restrict,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);--> statement-breakpoint
create unique index if not exists payslip_payments_txn_uq on payslip_payments (transaction_id);--> statement-breakpoint
create index if not exists payslip_payments_slip_idx on payslip_payments (payslip_id);--> statement-breakpoint

-- Who may see pay: payroll, and the employee themselves. Not their manager.
create or replace function private.payroll_can_see_employee(emp uuid)
returns boolean
language sql stable security definer
set search_path = 'private', 'public'
as $$
  select private.auth_scope('payroll.read') is not null
    or exists (select 1 from employees e where e.id = emp and e.user_id = auth.uid());
$$;--> statement-breakpoint
revoke all on function private.payroll_can_see_employee(uuid) from public, anon;--> statement-breakpoint
grant execute on function private.payroll_can_see_employee(uuid) to authenticated;--> statement-breakpoint

alter table payroll_settings enable row level security;--> statement-breakpoint
alter table employee_pay enable row level security;--> statement-breakpoint
alter table pay_revisions enable row level security;--> statement-breakpoint
alter table payslips enable row level security;--> statement-breakpoint
alter table payslip_payments enable row level security;--> statement-breakpoint

create policy payroll_settings_select on payroll_settings for select to authenticated
  using (private.auth_scope('payroll.read') is not null);--> statement-breakpoint
create policy employee_pay_select on employee_pay for select to authenticated
  using (private.payroll_can_see_employee(employee_id));--> statement-breakpoint
create policy pay_revisions_select on pay_revisions for select to authenticated
  using (private.payroll_can_see_employee(employee_id));--> statement-breakpoint
create policy payslips_select on payslips for select to authenticated
  using (private.payroll_can_see_employee(employee_id));--> statement-breakpoint
create policy payslip_payments_select on payslip_payments for select to authenticated
  using (exists (select 1 from payslips p where p.id = payslip_id and private.payroll_can_see_employee(p.employee_id)));--> statement-breakpoint
-- No write policy anywhere: the server writes these after checking who is asking.

insert into permissions (code, label, category, description)
values
  ('payroll.read', 'View payroll and pay', 'HR',
   'See every employee''s pay rates, payslips and whether each was paid.'),
  ('payroll.generate', 'Generate payslips and record salary payments', 'HR',
   'Enter the month''s inputs, generate payslips, and record the salary payment against the bank account.'),
  ('payroll.manage', 'Set pay rates and approve payslips', 'HR',
   'Set and change salary components and bank details, revise pay, change payroll rules, approve payslips and regenerate one.')
on conflict (code) do nothing;--> statement-breakpoint

insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, p.code, 'all'
from role_permissions rp
cross join (values ('payroll.read'), ('payroll.generate'), ('payroll.manage')) as p(code)
where rp.permission_code = 'settings.manage'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

-- HR and accounts prepare payroll but do not set pay rates or approve.
insert into role_permissions (role_id, permission_code, scope)
select r.id, p.code, 'all'
from roles r
cross join (values ('payroll.read'), ('payroll.generate')) as p(code)
where r.code in ('hr', 'accounts')
on conflict (role_id, permission_code) do nothing;
