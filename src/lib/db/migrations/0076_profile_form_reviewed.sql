-- Somebody has looked at this submitted form.
--
-- A red count on Student Profile Forms needs a definition of "outstanding",
-- and a submitted form had none: there was no step after submission, so the
-- only candidates were "every form ever" (a number that never reaches zero
-- and that people learn to ignore) or "submitted in the last N days" (a
-- queue that empties itself whether or not anybody looked).
--
-- So there is a step now, and it is the smallest one that makes the badge
-- honest: a counsellor marks the form read. Until they do it is new, and
-- the count is the number of students waiting to be looked at.
--
-- Deliberately NOT backfilled, unlike the onboarding queue in 0073. There
-- the backfill was the truthful answer — every existing student really had
-- been accepted by academics long ago. Here the opposite is true: nobody
-- has reviewed any existing form, because there was no way to. Marking them
-- all read would be the system claiming work that was never done.
alter table leads add column if not exists profile_form_reviewed_at timestamptz;
alter table leads add column if not exists profile_form_reviewed_by uuid references profiles(id) on delete set null;

comment on column leads.profile_form_reviewed_at is
  'When a counsellor marked the submitted profile form read. Null on a submitted form means it is still new — this is the Student Profile Forms badge count.';

-- The badge's own query, on every page load: submitted and not yet read.
-- Partial, so it stays the size of the queue rather than of the database.
create index if not exists leads_profile_form_unreviewed_idx
  on leads (profile_form_submitted_at desc)
  where profile_form_submitted_at is not null
    and profile_form_reviewed_at is null
    and deleted_at is null;
