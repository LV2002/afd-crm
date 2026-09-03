ALTER TABLE "field_definitions" ADD COLUMN "on_profile_form" boolean DEFAULT false NOT NULL;

-- Backfill, so an existing install keeps the form it already had.
--
-- Before this column, the student-facing form (/f/<token>) rendered EVERY
-- student field definition. Defaulting the new flag to false would have
-- silently emptied that form on deploy, so every student field is switched
-- on here except the ones the institute sets itself — a student picking
-- their own batch id, centre, enrolment status or joining date was the bug
-- that motivated the column. Anything an admin has added since is included,
-- which matches the behaviour being replaced.
--
-- `photo_url` is excluded for a different reason: it is a pasted-URL field,
-- and a sixteen-year-old on a phone has no URL to paste. Their photo comes
-- in as a real upload against the student record.
UPDATE "field_definitions"
SET "on_profile_form" = true
WHERE "entity" = 'student'
  AND "key" NOT IN (
    'photo_url',
    'center_id',
    'current_course',
    'current_batch_id',
    'status',
    'joined_at',
    'target_exam_year'
  );
