-- Admissions typed in from before the CRM, so two years of intake and income
-- can be read in one place. Marked so nothing treats them as live work: no
-- payment reminders go to last year's families, and no notification fires.
alter table enrolments add column if not exists is_historical boolean not null default false;

-- The source a past admission is filed under, so it never counts as a
-- result of any ad or campaign. A fresh instance gets it from the seed.
insert into dropdown_options (category, value, label, sort_order)
select 'lead_source', 'past_admission', 'Past admission', 99
where exists (select 1 from dropdown_categories where key = 'lead_source')
  and not exists (
    select 1 from dropdown_options where category = 'lead_source' and value = 'past_admission'
  );
