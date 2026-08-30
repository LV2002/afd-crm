-- Phase 4 foundation, part 2: RLS + the gapless student_code sequence.
-- docs/01-DATA-MODEL.md § Row Level Security: "payments, receipts: insert
-- and select policies only... an absent policy means the operation is
-- denied. This is the enforcement mechanism, not a convention." Same for
-- enrolments/students/batches/student_batches: no delete policy anywhere
-- in this migration, matching CLAUDE.md non-negotiable #5 (nothing is
-- hard-deleted) and the fact that none of these have a corresponding
-- `.delete` permission primitive in src/lib/auth/permissions.ts.

create trigger set_updated_at before update on fee_structures
  for each row execute function set_updated_at();
create trigger set_updated_at before update on enrolments
  for each row execute function set_updated_at();
create trigger set_updated_at before update on students
  for each row execute function set_updated_at();
create trigger set_updated_at before update on batches
  for each row execute function set_updated_at();

-- `students.student_code` (docs/01-DATA-MODEL.md § Students: "from a
-- gapless sequence"): a dedicated sequence, same gapless-via-DB-sequence
-- idea as `receipts.receipt_no` (bigserial) and `leads.lead_number`
-- (bigserial) elsewhere in this schema — just formatted as text here
-- since the data model doc types this column as `text unique`, not a
-- bare integer.
create sequence student_code_seq;
alter table students
  alter column student_code
  set default ('STU' || lpad(nextval('student_code_seq')::text, 6, '0'));

alter table fee_structures enable row level security;
alter table enrolments enable row level security;
alter table payments enable row level security;
alter table receipts enable row level security;
alter table students enable row level security;
alter table batches enable row level security;
alter table student_batches enable row level security;

-- fee_structures: configuration table, same shape as pipeline_stages/
-- dropdown_options (docs/01-DATA-MODEL.md § RLS) — visible to every
-- authenticated user (the app needs to render fee amounts wherever an
-- enrolment is created), mutations gated on settings.manage.
create policy fee_structures_select on fee_structures for select
  to authenticated
  using (true);

create policy fee_structures_insert on fee_structures for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy fee_structures_update on fee_structures for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy fee_structures_delete on fee_structures for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

-- enrolments: visibility inherited from the parent lead (docs/01-DATA-MODEL.md
-- § RLS: "Child tables ... inherit visibility via exists (select 1 from
-- leads ...) on lead_id"), same shape as enquiries/interactions/tasks.
create policy enrolments_select on enrolments for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = enrolments.lead_id
      and can_access_center('enrolment.read', l.center_id, l.assigned_to)
  ));

create policy enrolments_insert on enrolments for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = enrolments.lead_id
      and can_access_center('enrolment.create', l.center_id, l.assigned_to)
  ));

create policy enrolments_update on enrolments for update
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = enrolments.lead_id
      and can_access_center('enrolment.update', l.center_id, l.assigned_to)
  ))
  with check (exists (
    select 1 from leads l
    where l.id = enrolments.lead_id
      and can_access_center('enrolment.update', l.center_id, l.assigned_to)
  ));

-- payments / receipts: CLAUDE.md non-negotiable #7 — append-only.
-- Insert and select only, for every role including admin. No update or
-- delete policy exists anywhere in this file; that omission IS the
-- enforcement.
create policy payments_select on payments for select
  to authenticated
  using (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = payments.enrolment_id
      and can_access_center('payment.read', l.center_id, l.assigned_to)
  ));

create policy payments_insert on payments for insert
  to authenticated
  with check (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = payments.enrolment_id
      and can_access_center('payment.record', l.center_id, l.assigned_to)
  ));

create policy receipts_select on receipts for select
  to authenticated
  using (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = receipts.enrolment_id
      and can_access_center('payment.read', l.center_id, l.assigned_to)
  ));

create policy receipts_insert on receipts for insert
  to authenticated
  with check (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = receipts.enrolment_id
      and can_access_center('payment.record', l.center_id, l.assigned_to)
  ));

-- students: has its own center_id directly (docs/01-DATA-MODEL.md §
-- Students — "Academics never queries leads"), so scoping doesn't join
-- through leads the way enrolments/payments do. No 'own' scope currently
-- granted to anyone for student.read/student.update (see seed.ts), so
-- passing null for the owner check is safe — that branch simply never
-- matches today.
create policy students_select on students for select
  to authenticated
  using (can_access_center('student.read', center_id, null));

create policy students_insert on students for insert
  to authenticated
  with check (can_access_center('student.update', center_id, null));

create policy students_update on students for update
  to authenticated
  using (can_access_center('student.update', center_id, null))
  with check (can_access_center('student.update', center_id, null));

-- batches / student_batches: schema only this pass (docs/DECISIONS.md —
-- no batch-management UI yet), gated on the one batch.manage primitive
-- that covers all batch operations.
create policy batches_select on batches for select
  to authenticated
  using (can_access_center('batch.manage', center_id, null));

create policy batches_insert on batches for insert
  to authenticated
  with check (can_access_center('batch.manage', center_id, null));

create policy batches_update on batches for update
  to authenticated
  using (can_access_center('batch.manage', center_id, null))
  with check (can_access_center('batch.manage', center_id, null));

create policy student_batches_select on student_batches for select
  to authenticated
  using (exists (
    select 1 from students s
    where s.id = student_batches.student_id
      and can_access_center('student.read', s.center_id, null)
  ));

create policy student_batches_insert on student_batches for insert
  to authenticated
  with check (exists (
    select 1 from students s
    where s.id = student_batches.student_id
      and can_access_center('batch.manage', s.center_id, null)
  ));

create policy student_batches_update on student_batches for update
  to authenticated
  using (exists (
    select 1 from students s
    where s.id = student_batches.student_id
      and can_access_center('batch.manage', s.center_id, null)
  ))
  with check (exists (
    select 1 from students s
    where s.id = student_batches.student_id
      and can_access_center('batch.manage', s.center_id, null)
  ));
