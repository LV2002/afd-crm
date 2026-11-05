-- HR: employees, the leave policy, company holidays and leave requests.
--
-- Salary, bank details and payslips are NOT here: they are a later piece, in
-- tables of their own, so that seeing an employee's name and manager never
-- means seeing what they are paid.

create table if not exists hr_settings (
  id integer primary key default 1 check (id = 1),
  annual_sick numeric(4,1) not null default 6,
  annual_casual numeric(4,1) not null default 6,
  -- Whether the month somebody joins counts towards their first year's leave.
  joining_month_counts boolean not null default true,
  probation_months integer not null default 6,
  -- During probation only this many paid sick/casual days count per month.
  probation_paid_per_month numeric(3,1) not null default 1,
  -- Days of the week that are not working days. 0 = Sunday.
  weekly_off integer[] not null default '{0}',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);--> statement-breakpoint
insert into hr_settings (id) values (1) on conflict (id) do nothing;--> statement-breakpoint

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  -- Text, not a number: 10085, AFD/10050 and 12183 all exist.
  emp_no text not null,
  -- The CRM login this employee uses to see their own leave and payslips.
  user_id uuid references profiles(id) on delete set null,
  name text not null,
  designation text,
  department text,
  center_id uuid references centers(id) on delete set null,
  address text,
  -- May be blank: treated as long-standing (full-year leave, probation over).
  date_of_joining date,
  reports_to_id uuid references employees(id) on delete set null,
  -- Leave balances as they stood on `opening_as_of`, for employees whose
  -- history lives on an old payslip. Counting starts after that date.
  opening_sl numeric(4,1),
  opening_cl numeric(4,1),
  opening_as_of date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (reports_to_id is null or reports_to_id <> id)
);--> statement-breakpoint
create unique index if not exists employees_emp_no_uq on employees (emp_no) where deleted_at is null;--> statement-breakpoint
create unique index if not exists employees_user_uq on employees (user_id) where user_id is not null and deleted_at is null;--> statement-breakpoint
create index if not exists employees_reports_to_idx on employees (reports_to_id);--> statement-breakpoint

create table if not exists company_holidays (
  id uuid primary key default gen_random_uuid(),
  on_date date not null,
  name text not null,
  -- Null means every centre.
  center_id uuid references centers(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);--> statement-breakpoint
create unique index if not exists company_holidays_uq on company_holidays (on_date, name) where deleted_at is null;--> statement-breakpoint

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  -- Gapless reference printed on the leave slip.
  leave_no bigserial not null,
  employee_id uuid not null references employees(id) on delete restrict,
  -- sick | casual | lop (loss of pay) | half_day
  kind text not null check (kind in ('sick', 'casual', 'lop', 'half_day')),
  from_date date not null,
  to_date date not null,
  -- Working days only: weekly offs and company holidays inside the range are not counted.
  days numeric(4,1) not null check (days > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  -- Who was asked, as it stood when the request was made.
  approver_user_id uuid references profiles(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date >= from_date),
  check (kind <> 'half_day' or from_date = to_date)
);--> statement-breakpoint
create unique index if not exists leave_requests_no_uq on leave_requests (leave_no);--> statement-breakpoint
create index if not exists leave_requests_employee_idx on leave_requests (employee_id, from_date);--> statement-breakpoint
create index if not exists leave_requests_status_idx on leave_requests (status, from_date);--> statement-breakpoint

-- Who may see an employee's HR rows: HR, the employee, and their manager.
-- A SECURITY DEFINER function, because a policy on `employees` that reads
-- `employees` would recurse.
create or replace function private.hr_can_see_employee(emp uuid)
returns boolean
language sql stable security definer
set search_path = 'private', 'public'
as $$
  select private.auth_scope('hr.read') is not null
    or exists (
      select 1
      from employees e
      where e.id = emp
        and (
          e.user_id = auth.uid()
          or exists (select 1 from employees m where m.id = e.reports_to_id and m.user_id = auth.uid())
        )
    );
$$;--> statement-breakpoint
revoke all on function private.hr_can_see_employee(uuid) from public, anon;--> statement-breakpoint
grant execute on function private.hr_can_see_employee(uuid) to authenticated;--> statement-breakpoint

alter table hr_settings enable row level security;--> statement-breakpoint
alter table employees enable row level security;--> statement-breakpoint
alter table company_holidays enable row level security;--> statement-breakpoint
alter table leave_requests enable row level security;--> statement-breakpoint

create policy hr_settings_select on hr_settings for select to authenticated using (true);--> statement-breakpoint
create policy company_holidays_select on company_holidays for select to authenticated using (deleted_at is null);--> statement-breakpoint
create policy employees_select on employees for select to authenticated
  using (deleted_at is null and private.hr_can_see_employee(id));--> statement-breakpoint
create policy leave_requests_select on leave_requests for select to authenticated
  using (private.hr_can_see_employee(employee_id));--> statement-breakpoint
-- No insert, update or delete policy anywhere here: the server writes these
-- after checking who is asking (the employee, their manager, or HR).

insert into permissions (code, label, category, description)
values
  ('hr.self', 'See my own HR page', 'HR',
   'See your own leave balances, company holidays and payslips, and apply for leave.'),
  ('hr.read', 'View all employees and leave', 'HR',
   'See every employee, their leave balances, every leave request and the leave slips. Does not include pay.'),
  ('hr.manage', 'Manage employees and leave policy', 'HR',
   'Add and edit employees, set the leave policy and company holidays, and approve or reject any leave request.')
on conflict (code) do nothing;--> statement-breakpoint

-- Everybody with a login gets their own HR page.
insert into role_permissions (role_id, permission_code, scope)
select r.id, 'hr.self', 'own' from roles r
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

-- Roles that hold every settings key (admin, co-admin) run HR.
insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, p.code, 'all'
from role_permissions rp
cross join (values ('hr.read'), ('hr.manage')) as p(code)
where rp.permission_code = 'settings.manage'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

-- Two roles for the new work: HR, and a plain employee who sees only their own page.
insert into roles (code, name, description, is_system, is_protected)
values
  ('hr', 'HR', 'Employees, leave and payroll. Sees every employee and every leave request.', true, false),
  ('employee', 'Employee', 'Sees their own leave, holidays and payslips, and can apply for leave.', true, false)
on conflict (code) do nothing;--> statement-breakpoint
insert into role_permissions (role_id, permission_code, scope)
select r.id, p.code, 'all'
from roles r
cross join (values ('hr.self'), ('hr.read'), ('hr.manage')) as p(code)
where r.code = 'hr'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint
insert into role_permissions (role_id, permission_code, scope)
select r.id, 'hr.self', 'own' from roles r where r.code = 'employee'
on conflict (role_id, permission_code) do nothing;
