-- Restore the source of leads whose Lead Source was blanked by the profile form.
--
-- The lead page read `row.lead_source`, which does not exist (the value lives in
-- `last_touch_source`), so the form drew an empty Lead Source and Sub-source for
-- every lead; its autosave then posted those blanks back, overwriting the real
-- values the moment anybody edited anything on the lead.
--
-- The truth survives in `enquiries`, which is append-only and was never touched.
-- Each affected lead gets its most recent enquiry's source and sub-source back,
-- spelled as the matching Lead Source option where one exists. Only leads whose
-- value is NULL or empty are changed; nothing that has a value is overwritten.

with latest as (
  select distinct on (e.lead_id) e.lead_id, e.source, e.sub_source
  from enquiries e
  order by e.lead_id, e.received_at desc
)
update leads l
set last_touch_source = coalesce(
      (select o.value from dropdown_options o
        where o.category = 'lead_source' and o.deleted_at is null
          and lower(o.value) = lower(latest.source) limit 1),
      latest.source),
    last_touch_sub_source = coalesce(nullif(l.last_touch_sub_source, ''), latest.sub_source)
from latest
where latest.lead_id = l.id
  and l.deleted_at is null
  and (l.last_touch_source is null or l.last_touch_source = '');
--> statement-breakpoint

-- Leads that kept their source but lost only the sub-source.
with latest as (
  select distinct on (e.lead_id) e.lead_id, e.sub_source
  from enquiries e
  order by e.lead_id, e.received_at desc
)
update leads l
set last_touch_sub_source = latest.sub_source
from latest
where latest.lead_id = l.id
  and l.deleted_at is null
  and (l.last_touch_sub_source is null or l.last_touch_sub_source = '')
  and latest.sub_source is not null;
