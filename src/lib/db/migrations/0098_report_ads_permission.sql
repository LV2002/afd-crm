-- Ad Performance gets a permission of its own.
--
-- It was gated on `report.org`, so the only way to hide it from a role
-- was to take away every other organisation-wide report with it. Leon:
-- "theres no option for not allowing certain roles to see ad performance
-- tab" — and that was the whole of the problem, because the two were one
-- switch.
--
-- The sidebar entry was worse than that. It asked for `report.read`,
-- which every counsellor holds, so four of the six seeded roles saw a
-- tab whose only behaviour, for them, was to refuse them. The link and
-- the screen now agree on `report.ads`.
--
-- The primitive itself has to exist before anything can be granted it:
-- `permissions` is a real table with a foreign key from
-- `role_permissions`, and the seed only runs on a fresh instance.
insert into permissions (code, label, category, description)
values (
  'report.ads',
  'View ad performance',
  'Reports',
  'See what advertising cost and what it produced — spend, cost per lead and return on ad spend, per campaign.'
)
on conflict (code) do nothing;--> statement-breakpoint

-- Granted here to every role that already holds `report.org`, at the
-- same scope. That is the set who could open the screen yesterday, so
-- nobody loses access to something they were using — and an admin who
-- wants it narrower now has a switch to narrow it with.
insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, 'report.ads', rp.scope
from role_permissions rp
where rp.permission_code = 'report.org'
on conflict (role_id, permission_code) do nothing;
