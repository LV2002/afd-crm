-- How many academic years a batch runs for. A two-year batch started in
-- 2026-27 is still a live batch in 2027-28, with the same students in it.
alter table batches add column if not exists years integer not null default 1 check (years between 1 and 5);--> statement-breakpoint
-- Existing batches take their course's programme length.
update batches b set years = c.years
from (
  select value, case when (metadata ->> 'years') ~ '^[1-5]$' then (metadata ->> 'years')::int else 1 end as years
  from dropdown_options where category = 'course' and deleted_at is null
) c
where c.value = b.course and c.years > 1;
