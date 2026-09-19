-- Teaching staff: who they are, what they teach, when they can.
--
-- See src/lib/db/schema/faculty.ts for why a faculty member is a record
-- rather than a login, and why availability is opt-in rather than a grid
-- somebody has to fill in before anything can be scheduled.

create type "faculty_availability_mode" as enum ('always', 'by_window');

create table "faculty" (
  "id" uuid primary key default gen_random_uuid(),
  "full_name" text not null,
  "phone" text,
  "email" text,
  "profile_id" uuid references "profiles"("id") on delete set null,
  "employment_type" text,
  "availability_mode" "faculty_availability_mode" not null default 'always',
  "notes" text,
  "is_active" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

create table "faculty_centers" (
  "faculty_id" uuid not null references "faculty"("id") on delete cascade,
  "center_id" uuid not null references "centers"("id") on delete cascade,
  primary key ("faculty_id", "center_id")
);

create table "faculty_subjects" (
  "faculty_id" uuid not null references "faculty"("id") on delete cascade,
  "subject" text not null,
  primary key ("faculty_id", "subject")
);

create table "faculty_availability" (
  "id" uuid primary key default gen_random_uuid(),
  "faculty_id" uuid not null references "faculty"("id") on delete cascade,
  "day_of_week" integer not null,
  "start_time" time not null,
  "end_time" time not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  constraint "faculty_availability_dow_range" check ("day_of_week" between 0 and 6),
  constraint "faculty_availability_times_ordered" check ("end_time" > "start_time")
);

create table "faculty_leave" (
  "id" uuid primary key default gen_random_uuid(),
  "faculty_id" uuid not null references "faculty"("id") on delete cascade,
  "start_date" date not null,
  "end_date" date not null,
  "reason" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  -- A single day off is start = end, so this is >=, not >.
  constraint "faculty_leave_dates_ordered" check ("end_date" >= "start_date")
);

create index "faculty_name_idx" on "faculty" ("full_name");
create index "faculty_profile_idx" on "faculty" ("profile_id");
create index "faculty_availability_faculty_idx"
  on "faculty_availability" ("faculty_id", "day_of_week");
create index "faculty_leave_faculty_idx" on "faculty_leave" ("faculty_id", "start_date");

-- One person, one login. Without this, two faculty records could both
-- claim the same user and "which of these is Athira" stops having an
-- answer. Partial, so any number of records may have no login at all.
create unique index "faculty_profile_uq"
  on "faculty" ("profile_id")
  where "profile_id" is not null and "deleted_at" is null;

create trigger set_updated_at before update on faculty
  for each row execute function set_updated_at();
create trigger set_updated_at before update on faculty_availability
  for each row execute function set_updated_at();
create trigger set_updated_at before update on faculty_leave
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table faculty enable row level security;
alter table faculty_centers enable row level security;
alter table faculty_subjects enable row level security;
alter table faculty_availability enable row level security;
alter table faculty_leave enable row level security;

-- Deliberately not centre-scoped. A visiting teacher works at both
-- centres, and a centre head planning a week needs to see who exists
-- institute-wide before asking for them. Centre membership is a property
-- the scheduler reads, not an access boundary; the gate is the permission
-- pair. Managing needs scope 'all' for the same reason the syllabus does —
-- one shared list, or it is not shared.

create policy faculty_select on faculty for select
  to authenticated
  using (auth_scope('faculty.read') is not null);

create policy faculty_insert on faculty for insert
  to authenticated
  with check (auth_scope('faculty.manage') = 'all');

create policy faculty_update on faculty for update
  to authenticated
  using (auth_scope('faculty.manage') = 'all')
  with check (auth_scope('faculty.manage') = 'all');

-- The four child tables follow the parent exactly. They are join rows with
-- no meaning apart from the faculty member they hang off, so repeating the
-- permission check is simpler and faster here than an exists() against
-- `faculty` would be — there is no per-row condition to inherit.

create policy faculty_centers_select on faculty_centers for select
  to authenticated
  using (auth_scope('faculty.read') is not null);

create policy faculty_centers_insert on faculty_centers for insert
  to authenticated
  with check (auth_scope('faculty.manage') = 'all');

create policy faculty_centers_delete on faculty_centers for delete
  to authenticated
  using (auth_scope('faculty.manage') = 'all');

create policy faculty_subjects_select on faculty_subjects for select
  to authenticated
  using (auth_scope('faculty.read') is not null);

create policy faculty_subjects_insert on faculty_subjects for insert
  to authenticated
  with check (auth_scope('faculty.manage') = 'all');

create policy faculty_subjects_delete on faculty_subjects for delete
  to authenticated
  using (auth_scope('faculty.manage') = 'all');

create policy faculty_availability_select on faculty_availability for select
  to authenticated
  using (auth_scope('faculty.read') is not null);

create policy faculty_availability_insert on faculty_availability for insert
  to authenticated
  with check (auth_scope('faculty.manage') = 'all');

create policy faculty_availability_delete on faculty_availability for delete
  to authenticated
  using (auth_scope('faculty.manage') = 'all');

create policy faculty_leave_select on faculty_leave for select
  to authenticated
  using (auth_scope('faculty.read') is not null);

create policy faculty_leave_insert on faculty_leave for insert
  to authenticated
  with check (auth_scope('faculty.manage') = 'all');

create policy faculty_leave_delete on faculty_leave for delete
  to authenticated
  using (auth_scope('faculty.manage') = 'all');

-- Delete IS allowed on the four child tables, unlike almost everywhere
-- else in this schema. They are membership rows, not records of anything
-- that happened: "Athira no longer teaches Drawing" is the absence of a
-- row, and keeping a tombstone for it would mean every read filtering a
-- soft-delete column for no benefit. The faculty record itself is still
-- soft-deleted, so who taught Tuesday's class survives.

-- ---------------------------------------------------------------------------
-- Permissions and the faculty role
-- ---------------------------------------------------------------------------

insert into permissions (code, label, category, description) values
  ('faculty.read', 'View faculty', 'Academics',
   'See the teaching staff list, what each teaches, and when they are free.'),
  ('faculty.manage', 'Manage faculty', 'Academics',
   'Add and edit teaching staff, their subjects, centres, availability and leave.')
on conflict (code) do update
  set label = excluded.label,
      category = excluded.category,
      description = excluded.description;

insert into role_permissions (role_id, permission_code, scope)
select r.id, 'faculty.read', 'all'
from roles r
where r.code in ('admin', 'co_admin', 'academics', 'center_head')
on conflict do nothing;

insert into role_permissions (role_id, permission_code, scope)
select r.id, 'faculty.manage', 'all'
from roles r
where r.code in ('admin', 'co_admin', 'academics')
on conflict do nothing;

-- A role for the people who actually teach.
--
-- Six roles shipped and none of them was a teacher, so faculty had nowhere
-- to sign in to. This one sees the syllabus it is meant to deliver and the
-- students in its own batches, and nothing of the sales pipeline: a
-- teacher has no business in the lead list, and the point of a role is the
-- things it does not carry.
--
-- An ordinary editable row like every other. `is_system` marks it as one
-- that shipped, not one that is protected.
insert into roles (code, name, description, is_system, is_protected)
values (
  'faculty',
  'Faculty',
  'Teaches classes. Sees the syllabus, their own batches and students, and records what was taught.',
  true,
  false
)
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_code, scope)
select r.id, perm.code, perm.scope::permission_scope
from roles r
cross join (values
  ('curriculum.read', 'all'),
  ('faculty.read', 'all'),
  ('student.read', 'center'),
  ('batch.manage', 'center'),
  ('file.read', 'center'),
  ('file.upload', 'center')
) as perm(code, scope)
where r.code = 'faculty'
on conflict do nothing;

-- Faculty type, so the list can distinguish a full-timer from somebody who
-- comes for one module. An ordinary dropdown, editable like the rest.
insert into dropdown_categories (key, label, is_system)
values ('faculty_type', 'Faculty type', false)
on conflict (key) do nothing;

insert into dropdown_options (category, value, label, sort_order)
values
  ('faculty_type', 'full_time', 'Full time', 10),
  ('faculty_type', 'part_time', 'Part time', 20),
  ('faculty_type', 'visiting', 'Visiting', 30)
on conflict (category, value) do nothing;
