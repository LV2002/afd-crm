-- Which temperatures count as "interested" becomes an admin's choice.
--
-- The dashboard's Interested tile shipped yesterday with the three
-- values Leon named hardcoded in TypeScript, and a comment admitting the
-- failure: a fourth temperature meaning "very keen" would not be counted
-- until somebody changed the code. He asked for the tickbox the next
-- morning, which is also what CLAUDE.md § What is configurable has
-- always required.
--
-- The flag lives in `dropdown_options.metadata`, a jsonb column that has
-- existed since the reference tables shipped — so there is no new column
-- here, only data. A per-option flag rather than a list held elsewhere,
-- because then an option and its meaning cannot drift apart: delete the
-- temperature and the flag goes with it.
--
-- `||` merges rather than replaces. These rows already carry a `rank`
-- the seed wrote, and overwriting the column would silently drop it.
-- `coalesce` covers an option whose metadata is null.
--
-- The values ticked are exactly the behaviour of the day before, so an
-- existing instance reads the same number this morning as it did
-- yesterday: an institute that has added `very_hot` gets it, one that
-- has not is unaffected by that row matching nothing. Anything an admin
-- has since added is theirs to tick.
update dropdown_options
set metadata = coalesce(metadata, '{}'::jsonb) || '{"interested": true}'::jsonb
where category = 'temperature'
  and deleted_at is null
  and value in ('very_hot', 'hot', 'warm');--> statement-breakpoint

-- Cold and Dead explicitly false rather than absent, so the screen shows
-- an unticked box for them rather than nothing, and so a later `||` that
-- merges other keys cannot be mistaken for somebody's decision.
update dropdown_options
set metadata = coalesce(metadata, '{}'::jsonb) || '{"interested": false}'::jsonb
where category = 'temperature'
  and deleted_at is null
  and value in ('cold', 'dead');
