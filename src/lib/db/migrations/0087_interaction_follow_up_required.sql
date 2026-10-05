-- Every interaction must say what happens next, and when.
--
-- `interactions_next_action_required` (migration 0009) already demanded a
-- next action. The date beside it stayed optional, which is the half that
-- actually matters: a next action with no date is a sentence nobody is
-- ever shown again. Nothing surfaces the lead in the morning queue,
-- nothing counts it against a response target, and it is found months
-- later in a list of leads that were quietly abandoned mid-conversation.
--
-- The exemption is the conversation with nowhere left to go. An outcome
-- of 'converted' means the student joined; demanding a next call would
-- have counsellors typing "nothing" into a field forever. The VALUE is
-- keyed on, not the label — `dropdown_options` rows stay admin-editable
-- and renaming "Converted" to "Joined" changes nothing here, exactly as
-- renaming a `stage_type = 'won'` stage does not change what it means.
--
-- NOT VALID, deliberately: interactions logged before today have a next
-- action and no date, and they are a true record of what happened. The
-- constraint governs what may be written from now on; it does not
-- retroactively make history invalid. Postgres enforces it on every
-- insert and update regardless — NOT VALID only skips the scan of rows
-- already there.
alter table interactions
  drop constraint if exists interactions_next_action_required;

alter table interactions
  add constraint interactions_next_action_required
  check (
    source = 'system'
    -- `coalesce`, not a bare `outcome = 'converted'`.
    --
    -- A CHECK constraint rejects a row only when its expression is
    -- FALSE. NULL is not FALSE, and `null = 'converted'` is NULL — so
    -- with the outcome left blank the whole predicate evaluated to NULL
    -- and Postgres accepted the row. That is precisely the case this
    -- constraint exists for: a counsellor in a hurry who skips the
    -- dropdown. Caught by a test that was already here and started
    -- passing a row it was written to reject.
    or coalesce(outcome, '') = 'converted'
    or (next_action is not null and next_followup_at is not null)
  )
  not valid;

comment on constraint interactions_next_action_required on interactions is
  'A human-logged interaction needs a next action and a date for it, unless the outcome is converted (they joined) or the row was written by the system.';
