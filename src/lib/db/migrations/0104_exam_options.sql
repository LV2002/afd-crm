-- The Interested exams list, as Leon wants it:
-- NID UG, NID PG, NIFT UG, NIFT PG, UCEED, CEED, NATA, JEE 2, BFA, MFA,
-- KSDAT, GAT, PF, Others.
--
-- The stored VALUE is what every lead and student remembers, so the options
-- that were already there keep theirs and only get the new wording:
--   nid          -> "NID UG"
--   nift_mdes    -> "NIFT PG"   (MDes is NIFT's postgraduate course)
--   jee_paper_2  -> "JEE 2"
-- Leads that chose "NID" or "NIFT MDes" are therefore still counted, and now
-- read as NID UG / NIFT PG. The others are new rows — or a removed row of the
-- same name brought back, since a deleted option still holds its value.
--
-- Nothing already on the list is switched off or deleted. Anything an admin
-- added by hand and is not named here is left exactly as it is.

with wanted(value, label, sort_order) as (
  values
    ('nid',         'NID UG',   0),
    ('nid_pg',      'NID PG',   1),
    ('nift_ug',     'NIFT UG',  2),
    ('nift_mdes',   'NIFT PG',  3),
    ('uceed',       'UCEED',    4),
    ('ceed',        'CEED',     5),
    ('nata',        'NATA',     6),
    ('jee_paper_2', 'JEE 2',    7),
    ('bfa',         'BFA',      8),
    ('mfa',         'MFA',      9),
    ('ksdat',       'KSDAT',   10),
    ('gat',         'GAT',     11),
    ('pf',          'PF',      12),
    ('others',      'Others',  13)
)
insert into dropdown_options (category, value, label, sort_order, is_active)
select 'exam', value, label, sort_order, true from wanted
where exists (select 1 from dropdown_categories where key = 'exam')
on conflict (category, value) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      is_active = true,
      deleted_at = null;
--> statement-breakpoint

-- Anything else on the list (added by hand) goes after the fourteen, in its
-- existing order, rather than tying with them.
update dropdown_options
   set sort_order = sort_order + 14
 where category = 'exam'
   and deleted_at is null
   and value not in ('nid','nid_pg','nift_ug','nift_mdes','uceed','ceed','nata','jee_paper_2','bfa','mfa','ksdat','gat','pf','others')
   and sort_order < 14;
