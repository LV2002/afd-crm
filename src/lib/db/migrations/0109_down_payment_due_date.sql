-- The date a down payment (or a lump sum, which is entered as one) is due.
--
-- It was treated as due on the day the admission was confirmed, so a family
-- told "pay by the 5th" still showed as overdue from the day they joined.
-- The counsellor now gives it a date, the same as an instalment. Null means
-- no date was given, and the old reading — due when the admission was
-- confirmed — still applies, so nothing already saved changes.
alter table enrolments add column if not exists down_payment_due_date date;
