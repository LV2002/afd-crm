-- The interaction outcomes Leon asked for, and the outcomes that end a
-- conversation.
--
-- Outcomes: Connected, Not connected, Call back later, Interested,
-- Not interested, Converted, Dropped, Wrong target audience.
--
-- "Not reachable" keeps its stored value and is relabelled, so interactions
-- already logged against it stay valid. "Demo scheduled" is deactivated, not
-- deleted, for the same reason: history keeps pointing at a real row.
--
-- A next action and a date are no longer needed when the outcome leaves
-- nothing to schedule: converted (they joined), not_interested, dropped,
-- wrong_target_audience. Unchanged otherwise, including a blank outcome.

-- The category first: on a fresh database it only exists once the seed has
-- run, and the options below reference it by foreign key.
insert into dropdown_categories (key, label, is_system)
  values ('interaction_outcome', 'Interaction outcome', true)
  on conflict do nothing;
--> statement-breakpoint

insert into dropdown_options (category, value, label, sort_order, is_active) values
  ('interaction_outcome', 'connected',             'Connected',             1, true),
  ('interaction_outcome', 'not_reachable',         'Not connected',         2, true),
  ('interaction_outcome', 'call_back_later',       'Call back later',       3, true),
  ('interaction_outcome', 'interested',            'Interested',            4, true),
  ('interaction_outcome', 'not_interested',        'Not interested',        5, true),
  ('interaction_outcome', 'converted',             'Converted',             6, true),
  ('interaction_outcome', 'dropped',               'Dropped',               7, true),
  ('interaction_outcome', 'wrong_target_audience', 'Wrong target audience', 8, true)
on conflict (category, value) do update
  set label = excluded.label, sort_order = excluded.sort_order, is_active = true;
--> statement-breakpoint

update dropdown_options set is_active = false
  where category = 'interaction_outcome'
    and value not in ('connected','not_reachable','call_back_later','interested',
                      'not_interested','converted','dropped','wrong_target_audience');
--> statement-breakpoint

alter table interactions
  drop constraint if exists interactions_next_action_required;
--> statement-breakpoint

alter table interactions
  add constraint interactions_next_action_required
  check (
    source = 'system'
    -- `coalesce`: a blank outcome must evaluate FALSE, not NULL (see 0087).
    or coalesce(outcome, '') in ('converted', 'not_interested', 'dropped', 'wrong_target_audience')
    or (next_action is not null and next_followup_at is not null)
  )
  not valid;
--> statement-breakpoint

comment on constraint interactions_next_action_required on interactions is
  'A human-logged interaction needs a next action and a date for it, unless the outcome ends the conversation (converted, not_interested, dropped, wrong_target_audience) or the row was written by the system.';
