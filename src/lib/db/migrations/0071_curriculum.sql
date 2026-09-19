-- The syllabus layer: modules, topics, per-course plans, and batch timings.
--
-- See src/lib/db/schema/curriculum.ts for why these are three layers and
-- not one. In short: the syllabus is shared vocabulary, the plan is what
-- one course does with it, and the timings are what turns planned hours
-- into calendar dates.

create type "curriculum_item_kind" as enum ('teaching', 'practice', 'mock_test', 'revision');
create type "day_session" as enum ('morning', 'evening');

create table "syllabus_modules" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "subject" text,
  "description" text,
  "sort_order" integer not null default 0,
  "is_active" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

create table "syllabus_topics" (
  "id" uuid primary key default gen_random_uuid(),
  "module_id" uuid not null references "syllabus_modules"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "sort_order" integer not null default 0,
  "is_active" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

create table "course_curricula" (
  "id" uuid primary key default gen_random_uuid(),
  "course" text not null,
  "academic_year" text,
  "teaching_end_date" text,
  "notes" text,
  "is_active" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

create table "curriculum_items" (
  "id" uuid primary key default gen_random_uuid(),
  "curriculum_id" uuid not null references "course_curricula"("id") on delete cascade,
  "module_id" uuid not null references "syllabus_modules"("id") on delete cascade,
  "topic_id" uuid references "syllabus_topics"("id") on delete cascade,
  "kind" "curriculum_item_kind" not null default 'teaching',
  "hours" numeric(5, 2) not null default 0,
  "coverage" text,
  "sort_order" integer not null default 0,
  "is_active" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  -- A block of no hours would silently never be scheduled, and a negative
  -- one would quietly shorten the course. Both are data entry slips, and
  -- both are cheaper to refuse here than to find in November.
  constraint "curriculum_items_hours_sane" check ("hours" >= 0 and "hours" <= 100)
);

create table "batch_sessions" (
  "id" uuid primary key default gen_random_uuid(),
  "batch_id" uuid not null references "batches"("id") on delete cascade,
  "day_of_week" integer not null,
  "start_time" time not null,
  "end_time" time not null,
  "day_session" "day_session" not null default 'morning',
  "is_active" boolean not null default true,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  constraint "batch_sessions_dow_range" check ("day_of_week" between 0 and 6),
  constraint "batch_sessions_times_ordered" check ("end_time" > "start_time")
);

-- Unique on (course, academic_year) rather than course alone: the same
-- course runs again next year with a different end date, and last year's
-- plan is the obvious starting point for this year's rather than
-- something to overwrite. A null year is the evergreen default plan, and
-- Postgres treats nulls as distinct in a unique index, so the partial
-- index below is what actually stops two of those.
create unique index "course_curricula_course_year_uq"
  on "course_curricula" ("course", "academic_year")
  where "deleted_at" is null and "academic_year" is not null;

create unique index "course_curricula_course_evergreen_uq"
  on "course_curricula" ("course")
  where "deleted_at" is null and "academic_year" is null;

create index "syllabus_modules_sort_idx" on "syllabus_modules" ("sort_order");
create index "syllabus_topics_module_idx" on "syllabus_topics" ("module_id", "sort_order");
create index "curriculum_items_curriculum_idx" on "curriculum_items" ("curriculum_id", "sort_order");
create index "curriculum_items_module_idx" on "curriculum_items" ("module_id");
create index "curriculum_items_topic_idx" on "curriculum_items" ("topic_id");
create index "batch_sessions_batch_idx" on "batch_sessions" ("batch_id", "day_of_week");

create trigger set_updated_at before update on syllabus_modules
  for each row execute function set_updated_at();
create trigger set_updated_at before update on syllabus_topics
  for each row execute function set_updated_at();
create trigger set_updated_at before update on course_curricula
  for each row execute function set_updated_at();
create trigger set_updated_at before update on curriculum_items
  for each row execute function set_updated_at();
create trigger set_updated_at before update on batch_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table syllabus_modules enable row level security;
alter table syllabus_topics enable row level security;
alter table course_curricula enable row level security;
alter table curriculum_items enable row level security;
alter table batch_sessions enable row level security;

-- The syllabus is one institute-wide document, so it is not centre-scoped
-- — the same shape as pipeline_stages and dropdown_options. Reading it is
-- gated on curriculum.read rather than left open to every authenticated
-- user, because a course's hour allocation and coverage notes are the
-- institute's own teaching method and there is no reason a counsellor
-- needs them. Writing needs curriculum.manage at 'all': a syllabus that
-- one centre could edit for everybody is not a shared syllabus.

create policy syllabus_modules_select on syllabus_modules for select
  to authenticated
  using (auth_scope('curriculum.read') is not null);

create policy syllabus_modules_insert on syllabus_modules for insert
  to authenticated
  with check (auth_scope('curriculum.manage') = 'all');

create policy syllabus_modules_update on syllabus_modules for update
  to authenticated
  using (auth_scope('curriculum.manage') = 'all')
  with check (auth_scope('curriculum.manage') = 'all');

create policy syllabus_topics_select on syllabus_topics for select
  to authenticated
  using (auth_scope('curriculum.read') is not null);

create policy syllabus_topics_insert on syllabus_topics for insert
  to authenticated
  with check (auth_scope('curriculum.manage') = 'all');

create policy syllabus_topics_update on syllabus_topics for update
  to authenticated
  using (auth_scope('curriculum.manage') = 'all')
  with check (auth_scope('curriculum.manage') = 'all');

create policy course_curricula_select on course_curricula for select
  to authenticated
  using (auth_scope('curriculum.read') is not null);

create policy course_curricula_insert on course_curricula for insert
  to authenticated
  with check (auth_scope('curriculum.manage') = 'all');

create policy course_curricula_update on course_curricula for update
  to authenticated
  using (auth_scope('curriculum.manage') = 'all')
  with check (auth_scope('curriculum.manage') = 'all');

create policy curriculum_items_select on curriculum_items for select
  to authenticated
  using (auth_scope('curriculum.read') is not null);

create policy curriculum_items_insert on curriculum_items for insert
  to authenticated
  with check (auth_scope('curriculum.manage') = 'all');

create policy curriculum_items_update on curriculum_items for update
  to authenticated
  using (auth_scope('curriculum.manage') = 'all')
  with check (auth_scope('curriculum.manage') = 'all');

-- Batch timings ARE centre-scoped, because a batch is: the policy follows
-- the batch's own centre rather than repeating a centre column here that
-- could drift out of step with it.

create policy batch_sessions_select on batch_sessions for select
  to authenticated
  using (
    exists (
      select 1 from batches b
      where b.id = batch_sessions.batch_id
        and (
          can_access_center('batch.manage', b.center_id, null)
          or can_access_center('student.read', b.center_id, null)
        )
    )
  );

create policy batch_sessions_insert on batch_sessions for insert
  to authenticated
  with check (
    exists (
      select 1 from batches b
      where b.id = batch_sessions.batch_id
        and can_access_center('batch.manage', b.center_id, null)
    )
  );

create policy batch_sessions_update on batch_sessions for update
  to authenticated
  using (
    exists (
      select 1 from batches b
      where b.id = batch_sessions.batch_id
        and can_access_center('batch.manage', b.center_id, null)
    )
  )
  with check (
    exists (
      select 1 from batches b
      where b.id = batch_sessions.batch_id
        and can_access_center('batch.manage', b.center_id, null)
    )
  );

-- No delete policies anywhere here, deliberately: nothing is hard-deleted
-- (CLAUDE.md non-negotiable #5). Removing a module sets deleted_at, which
-- is an update.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The permission rows themselves, so `db:migrate` alone is enough on a
-- deployed instance. `role_permissions.permission_code` is a real foreign
-- key into `permissions`, so the grants below would fail without these.
-- `seed.ts` upserts the same two rows from lib/auth/permissions.ts; both
-- paths are idempotent and agree.
insert into permissions (code, label, category, description) values
  ('curriculum.read', 'View the syllabus', 'Academics',
   'See the modules, topics and per-course teaching plans.'),
  ('curriculum.manage', 'Edit the syllabus', 'Academics',
   'Add and edit modules, topics, and each course''s hours and coverage notes.')
on conflict (code) do update
  set label = excluded.label,
      category = excluded.category,
      description = excluded.description;

-- The academic coordinator writes the syllabus; admin and co-admin can too.
-- Faculty read it. `academics` is the coordinator's seeded role.
insert into role_permissions (role_id, permission_code, scope)
select r.id, 'curriculum.read', 'all'
from roles r
where r.code in ('admin', 'co_admin', 'academics', 'center_head')
on conflict do nothing;

insert into role_permissions (role_id, permission_code, scope)
select r.id, 'curriculum.manage', 'all'
from roles r
where r.code in ('admin', 'co_admin', 'academics')
on conflict do nothing;
