-- Batches got a table in Phase 4 and never got a screen, so `batches` has
-- sat empty and the Batch column on the students list has been
-- permanently blank. This is the schema side of giving it one.

-- Widen the read.
--
-- batches_select was gated on batch.manage, the permission for CREATING
-- batches. That made a batch's NAME invisible to accounts and to a centre
-- head — who both see the students list, where the batch column simply
-- rendered blank for them. A batch name is not sensitive; being able to
-- make one is a different question from being able to read one, and the
-- students list needs the second.
drop policy if exists batches_select on batches;

create policy batches_select on batches for select
  to authenticated
  using (
    can_access_center('batch.manage', center_id, null)
    or can_access_center('student.read', center_id, null)
  );

-- One live membership per student per batch.
--
-- Assigning somebody twice is a mis-click, not an intention, and a
-- duplicate row would double them in every roster count. A membership that
-- ENDED does not block a fresh one: a student who left a batch and came
-- back is a real thing, and the history of both is worth keeping (nothing
-- here is ever hard-deleted — CLAUDE.md § Non-negotiables 5).
create unique index if not exists student_batches_live_uq
  on student_batches (student_id, batch_id)
  where left_at is null;

-- "Who is in this batch right now", which is every roster read.
create index if not exists student_batches_batch_live_idx
  on student_batches (batch_id)
  where left_at is null;

comment on index student_batches_live_uq is
  'A student can only be in a batch once at a time. Re-joining after
   leaving is allowed, because left_at is set on the old row.';
