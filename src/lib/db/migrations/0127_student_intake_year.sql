-- The academic year a student joined in, copied from their enrolment when
-- they are created, so academics can say "who is in year 2 of a two-year
-- course" without reading the accounts tables.
alter table students add column if not exists intake_year text;--> statement-breakpoint
update students s set intake_year = e.academic_year
from enrolments e
where e.student_id = s.id and s.intake_year is null;
