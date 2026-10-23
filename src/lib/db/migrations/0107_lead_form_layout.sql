-- The lead profile's Personal tab, tidied the way the team asked:
--
--   * Alternate Phone goes; WhatsApp Number (already beside it) stays.
--   * "Country (specify)" and "State (specify)" go.
--   * City, State and District sit together at the bottom of the tab.
--
-- Configuration is data (CLAUDE.md), so this is rows, not code: the fields
-- are switched OFF rather than deleted, so nothing already stored on a lead
-- is touched and an admin can switch any of them back on under Settings ->
-- Custom Fields. Their values stay on the leads.
update field_definitions
   set is_active = false
 where entity = 'lead'
   and key in ('alternate_phone', 'country_other', 'state_other');--> statement-breakpoint

with ceiling as (
  select coalesce(max(sort_order), 0) as top
    from field_definitions
   where entity = 'lead'
     and section = 'Personal'
     and key not in ('city', 'state', 'district')
)
update field_definitions fd
   set sort_order = ceiling.top + case fd.key when 'city' then 1 when 'state' then 2 else 3 end
  from ceiling
 where fd.entity = 'lead'
   and fd.key in ('city', 'state', 'district');
