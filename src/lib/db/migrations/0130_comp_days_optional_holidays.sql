-- Optional holidays: a few days on the holiday list that each person may take
-- one of. A person's choice makes that day a holiday for them alone.
alter table company_holidays add column if not exists is_optional boolean not null default false;--> statement-breakpoint

create table if not exists employee_optional_holidays (
  employee_id uuid not null references employees(id) on delete cascade,
  holiday_id uuid not null references company_holidays(id) on delete cascade,
  -- Calendar year of the holiday. One choice per person per year.
  year integer not null,
  chosen_at timestamptz not null default now(),
  chosen_by uuid references profiles(id) on delete set null,
  primary key (employee_id, year)
);--> statement-breakpoint

-- Working on a day off in return for another day off.
create table if not exists comp_day_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  work_date date not null,
  work_part text not null check (work_part in ('full', 'half')),
  off_date date not null,
  off_part text not null check (off_part in ('full', 'half')),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approver_user_id uuid references profiles(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A full day off needs a full day worked.
  constraint comp_day_parts check (off_part = 'half' or work_part = 'full'),
  constraint comp_day_distinct check (work_date <> off_date)
);--> statement-breakpoint
create index if not exists comp_day_requests_employee_idx on comp_day_requests (employee_id, off_date);--> statement-breakpoint
create index if not exists comp_day_requests_status_idx on comp_day_requests (status, off_date);--> statement-breakpoint

alter table employee_optional_holidays enable row level security;--> statement-breakpoint
alter table comp_day_requests enable row level security;--> statement-breakpoint
create policy employee_optional_holidays_select on employee_optional_holidays for select to authenticated
  using (private.hr_can_see_employee(employee_id));--> statement-breakpoint
create policy comp_day_requests_select on comp_day_requests for select to authenticated
  using (private.hr_can_see_employee(employee_id));
