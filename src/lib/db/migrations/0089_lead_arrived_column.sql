-- "When did this lead come in?" on the list itself.
--
-- The column has always existed on `leads`; what was missing was a
-- `field_definitions` row saying it is a field, which is what the list,
-- the export and the filter bar all read. Without that row the only way
-- to see a lead's age was to open it, and a counsellor scanning two
-- hundred rows could not tell last week's enquiry from last year's.
--
-- Added as a definition rather than a hardcoded column so it behaves like
-- every other field: an admin can rename it, reorder it, or take it off
-- the list again from Settings → Custom Fields, with no deploy.
--
-- `is_core` because it is a real column on `leads`, not a key inside the
-- `custom` jsonb blob — the distinction `fieldColumn()` reads. It is
-- deliberately not required and not on any form: nobody types it, the
-- database writes it.
insert into field_definitions
  (entity, key, label, type, section, sort_order, is_required, show_in_list,
   show_in_filters, is_core, on_profile_form)
select
  'lead', 'created_at', 'Arrived', 'datetime', 'Tracking',
  coalesce((select max(sort_order) from field_definitions where entity = 'lead'), 0) + 1,
  false, true, false, true, false
where not exists (
  select 1 from field_definitions where entity = 'lead' and key = 'created_at'
);

-- The follow-up date belongs beside it. It has been a field since the
-- beginning and `show_in_list` was already true in the seed, but an
-- instance whose admin turned it off — or one seeded before that flag —
-- shows a catch-up filter with nothing to catch up on.
update field_definitions
set show_in_list = true
where entity = 'lead' and key = 'next_followup_at' and show_in_list = false;
