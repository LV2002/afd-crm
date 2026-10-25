-- Courses and batches as one hierarchy, with the fee on the batch.
--
--   Course (name + online/hybrid)  ->  Batch (centre, academic year, dates,
--   seats, FEE)  ->  students.
--
-- 1. A batch carries its own fee. Until now the fee was looked up by course +
--    centre + mode + academic year in `fee_structures`; that table stays as
--    a fallback for admissions into no batch, but is no longer where a fee
--    is kept. Existing batches are priced from the matching fee structure
--    (by their ORIGINAL mode, so the backfill runs before any mode changes).
-- 2. A course has a mode, kept in `dropdown_options.metadata` — a course is
--    still a dropdown option, so Courses Interested, reports and filters
--    keep working unchanged. Inferred from what the course already has:
--    online if every batch and fee row of it is online, hybrid otherwise.
-- 3. A batch's mode is its course's mode. Existing batches are brought into
--    line; historical enrolments keep the mode they were taken with.
-- 4. "Offline" is retired from the mode list (Online and Hybrid remain). It
--    is switched off, not deleted, so records that carry it still read.
alter table batches add column if not exists fee_paise bigint;--> statement-breakpoint

update batches b
   set fee_paise = (
     select fs.base_fee_paise
       from fee_structures fs
      where fs.course = b.course
        and fs.center_id = b.center_id
        and fs.mode = b.mode
        and fs.academic_year = b.academic_year
        and fs.is_active = true
        and fs.deleted_at is null
      order by fs.created_at desc
      limit 1
   )
 where b.fee_paise is null;--> statement-breakpoint

with evidence as (
  select course, mode from batches where deleted_at is null
  union all
  select course, mode from fee_structures where deleted_at is null
)
update dropdown_options o
   set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
     'mode',
     case when exists (
       select 1 from evidence e where e.course = o.value and e.mode in ('hybrid', 'offline')
     ) then 'hybrid' else 'online' end
   )
 where o.category = 'course'
   and (o.metadata is null or not (o.metadata ? 'mode'));--> statement-breakpoint

update batches b
   set mode = o.metadata->>'mode'
  from dropdown_options o
 where o.category = 'course'
   and o.value = b.course
   and o.metadata ? 'mode'
   and b.mode is distinct from o.metadata->>'mode';--> statement-breakpoint

update dropdown_options
   set is_active = false
 where category = 'preferred_mode'
   and value = 'offline';
