-- Each employee's working week, corrections to what the biometric device saw
-- (comp-off, excused lateness, a punch the device missed), and salary paid
-- over what the payslip shows, which becomes an advance.

create table if not exists employee_schedules (
  employee_id uuid not null references employees(id) on delete cascade,
  -- 0 = Sunday
  weekday smallint not null check (weekday between 0 and 6),
  is_working boolean not null default true,
  start_time time,
  end_time time,
  primary key (employee_id, weekday),
  check (not is_working or (start_time is not null and end_time is not null and end_time > start_time))
);--> statement-breakpoint

create table if not exists attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  on_date date not null,
  -- present: counts as present (the device missed them, or they worked elsewhere)
  -- comp_off: a day off in lieu of a day worked on an off day; no deduction and no leave
  -- excused: late coming and early exit that day are not counted
  -- worked_off_day: worked on a day off or a holiday, which earns a comp-off
  kind text not null check (kind in ('present', 'comp_off', 'excused', 'worked_off_day')),
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_by uuid references profiles(id) on delete set null,
  removed_at timestamptz
);--> statement-breakpoint
create unique index if not exists attendance_adjustments_live_uq
  on attendance_adjustments (employee_id, on_date) where removed_at is null;--> statement-breakpoint

alter table payslip_payments add column if not exists advance_paise bigint not null default 0 check (advance_paise >= 0);--> statement-breakpoint
-- The payslip whose "advance given" figure this advance was added to. Null until the next payslip is made.
alter table payslip_payments add column if not exists advance_absorbed_by uuid references payslips(id) on delete set null;--> statement-breakpoint

alter table employee_schedules enable row level security;--> statement-breakpoint
alter table attendance_adjustments enable row level security;--> statement-breakpoint
create policy employee_schedules_select on employee_schedules for select to authenticated
  using (private.hr_can_see_employee(employee_id));--> statement-breakpoint
create policy attendance_adjustments_select on attendance_adjustments for select to authenticated
  using (removed_at is null and private.hr_can_see_employee(employee_id));
