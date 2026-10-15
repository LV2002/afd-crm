-- A lead's country, for the enquiries that come from abroad.
--
-- Leon: UAE, Oman, Muscat, Kuwait and Saudi Arabia arrive often enough to need
-- their own answer, plus an "Others" where a counsellor types the country's
-- name. India is listed first so a lead can be marked as home explicitly; a
-- lead with no country is, as before, treated as in India.
--
-- Two ordinary custom fields (no column, no schema change): `country`, a
-- select whose options are editable in Settings → Custom Fields, and
-- `country_other`, the free-text "specify" beside it — the same shape as State
-- / State (specify). Placed in Personal just before State, shifting the rest
-- down two places.
--
-- Only where there is already a field list to slot into. A brand-new instance
-- gets both from the seed, in the right place, so inserting them here first
-- would just put them at the wrong end of a section that does not exist yet.
-- Idempotent: running it twice adds nothing.

update field_definitions
   set sort_order = sort_order + 2
 where entity = 'lead'
   and sort_order >= (select sort_order from field_definitions where entity = 'lead' and key = 'state')
   and not exists (select 1 from field_definitions where entity = 'lead' and key = 'country');
--> statement-breakpoint

insert into field_definitions
  (entity, key, label, type, options, section, sort_order, is_required,
   show_in_list, show_in_filters, is_core, on_profile_form)
select
  'lead', 'country', 'Country', 'select',
  '[{"value":"india","label":"India"},{"value":"uae","label":"UAE"},{"value":"oman","label":"Oman"},{"value":"muscat","label":"Muscat"},{"value":"kuwait","label":"Kuwait"},{"value":"saudi_arabia","label":"Saudi Arabia"},{"value":"others","label":"Others"}]'::jsonb,
  'Personal',
  (select sort_order - 2 from field_definitions where entity = 'lead' and key = 'state'),
  false, false, true, false, false
where exists (select 1 from field_definitions where entity = 'lead' and key = 'state')
  and not exists (select 1 from field_definitions where entity = 'lead' and key = 'country');
--> statement-breakpoint

insert into field_definitions
  (entity, key, label, help_text, type, section, sort_order, is_required,
   show_in_list, show_in_filters, is_core, on_profile_form)
select
  'lead', 'country_other', 'Country (specify)',
  'Fill this in when Country is Others — type the country''s name.', 'text',
  'Personal',
  (select sort_order - 1 from field_definitions where entity = 'lead' and key = 'state'),
  false, false, false, false, false
where exists (select 1 from field_definitions where entity = 'lead' and key = 'state')
  and not exists (select 1 from field_definitions where entity = 'lead' and key = 'country_other');
