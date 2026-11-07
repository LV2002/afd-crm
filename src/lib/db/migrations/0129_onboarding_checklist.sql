-- What has to be done before a new student counts as onboarded, defined by
-- an admin, and which of those things have been done for each student.

create table if not exists onboarding_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);--> statement-breakpoint

create table if not exists student_onboarding_checks (
  student_id uuid not null references students(id) on delete cascade,
  item_id uuid not null references onboarding_items(id) on delete cascade,
  checked_by uuid references profiles(id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (student_id, item_id)
);--> statement-breakpoint

alter table onboarding_items enable row level security;--> statement-breakpoint
alter table student_onboarding_checks enable row level security;--> statement-breakpoint

create policy onboarding_items_select on onboarding_items for select to authenticated using (true);--> statement-breakpoint

create policy student_onboarding_checks_select on student_onboarding_checks for select to authenticated
  using (exists (select 1 from students s where s.id = student_id and private.can_access_center('student.read', s.center_id, null)));--> statement-breakpoint
create policy student_onboarding_checks_insert on student_onboarding_checks for insert to authenticated
  with check (exists (select 1 from students s where s.id = student_id and private.can_access_center('student.update', s.center_id, null)));--> statement-breakpoint
create policy student_onboarding_checks_delete on student_onboarding_checks for delete to authenticated
  using (exists (select 1 from students s where s.id = student_id and private.can_access_center('student.update', s.center_id, null)));--> statement-breakpoint

-- A starting list; an admin changes it under Settings → Onboarding.
insert into onboarding_items (label, sort_order)
select v.label, v.ord from (values
  ('Welcome call made to the student and parent', 0),
  ('Batch and timetable confirmed with the student', 1),
  ('Student profile form completed and signed', 2),
  ('ID proof and photographs collected', 3),
  ('Study material and orientation given', 4)
) as v(label, ord)
where not exists (select 1 from onboarding_items);
