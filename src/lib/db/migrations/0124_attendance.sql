-- Biometric attendance: punches pulled from the eSSL (ZKTeco-family) devices,
-- and the shift times the preliminary report measures them against.

alter table employees add column if not exists biometric_code text;--> statement-breakpoint
create unique index if not exists employees_biometric_uq on employees (biometric_code) where biometric_code is not null and deleted_at is null;--> statement-breakpoint

alter table payroll_settings add column if not exists shift_start time not null default '09:30';--> statement-breakpoint
alter table payroll_settings add column if not exists shift_end time not null default '17:30';--> statement-breakpoint
-- Only the hash of the key the relay script presents is kept; the key itself is shown once.
alter table payroll_settings add column if not exists attendance_key_hash text;--> statement-breakpoint
alter table payroll_settings add column if not exists attendance_key_set_at timestamptz;--> statement-breakpoint

create table if not exists biometric_devices (
  id uuid primary key default gen_random_uuid(),
  serial text not null,
  name text,
  last_seen_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);--> statement-breakpoint
create unique index if not exists biometric_devices_serial_uq on biometric_devices (serial);--> statement-breakpoint

create table if not exists attendance_punches (
  id uuid primary key default gen_random_uuid(),
  -- The employee code as the device knows it. Kept even when it maps to nobody yet.
  device_code text not null,
  employee_id uuid references employees(id) on delete set null,
  punched_at timestamptz not null,
  device_serial text not null default '',
  -- device | relay | csv
  source text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);--> statement-breakpoint
create unique index if not exists attendance_punches_uq on attendance_punches (device_code, punched_at, device_serial);--> statement-breakpoint
create index if not exists attendance_punches_employee_idx on attendance_punches (employee_id, punched_at);--> statement-breakpoint
create index if not exists attendance_punches_unmapped_idx on attendance_punches (device_code) where employee_id is null;--> statement-breakpoint

alter table biometric_devices enable row level security;--> statement-breakpoint
alter table attendance_punches enable row level security;--> statement-breakpoint
create policy biometric_devices_select on biometric_devices for select to authenticated
  using (private.auth_scope('hr.read') is not null);--> statement-breakpoint
create policy attendance_punches_select on attendance_punches for select to authenticated
  using (employee_id is not null and private.hr_can_see_employee(employee_id));
