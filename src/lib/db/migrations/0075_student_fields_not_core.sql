-- Twenty-two student fields were marked as built-in columns they do not have.
--
-- `is_core` means "this field's value lives in a real column of the same
-- name". Everything else lives in the `custom` jsonb. The seed's own comment
-- says the student list "mixes real columns (isCore) with genuinely
-- admin-editable custom fields (is_core: false, living in students.custom)"
-- — but the seed defaults `isCore` to TRUE when a row does not say
-- otherwise, and only eleven of the thirty-three say otherwise. So City,
-- Photo, Mother Name, Percentage 10th and eighteen others claimed a column
-- that has never existed.
--
-- The consequences were not cosmetic:
--
--   * Saving a student record sent `update students set city = …,
--     photo_url = …` and Postgres rejected the whole statement — the edit
--     form could not save AT ALL, for any field.
--   * Reading one looked for `row.city`, found nothing, and showed every
--     one of those fields as blank forever.
--   * The settings screen greyed out their type, because a core field's
--     type is the shape of a real column and must not change. That is how
--     Leon came to be stuck with a Photo question typed as a web address
--     and no way to make it an upload.
--
-- The student-facing profile form was unaffected: it writes answers into
-- `leads.profile_form_data` by key and never consults `is_core`. So the
-- answers students sent are all still there.
--
-- Corrected by asking the database which keys are real columns, rather than
-- by listing twenty-two names here that would rot the moment somebody adds
-- a column. Nothing to migrate alongside it: every write that would have
-- put a value in those columns failed, so there is no data in the wrong
-- place.
update field_definitions
set is_core = false
where entity = 'student'
  and is_core
  and key not in (
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'students'
  );

-- Photo becomes an upload.
--
-- It was typed `url` and deliberately kept off the student-facing form,
-- with the seed noting the reason: "a student on a phone has no URL to
-- paste". True when it was written, and no longer — a `file` question is a
-- real file picker now, and the file lands in the lead's documents labelled
-- with the question. So the field becomes what it was always meant to be,
-- and joins the form.
--
-- Guarded on the old type, so an admin who has already changed it keeps
-- their choice. Reversible in Settings → Custom Fields either way.
update field_definitions
set type = 'file', help_text = coalesce(help_text, 'A clear photo of the student. JPG, PNG or PDF.')
where entity = 'student' and key = 'photo_url' and type = 'url';

update field_definitions
set on_profile_form = true
where entity = 'student' and key = 'photo_url' and type = 'file';
