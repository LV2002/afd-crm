-- Tags are retired.
--
-- Nothing is dropped: the `tags` and `lead_tags` tables, and the `tag_id`
-- column on broadcasts, stay in the database as a record, unused, the same
-- way pipeline stages were left behind (tests/no-tags.spec.ts fails the
-- build if application code touches them).
--
-- One thing has to change in data. An automation that STARTS when a tag is
-- put on a lead can never start now, but would still show as switched on.
-- They are switched off so the automations list is honest, and the screen
-- tells whoever opens one to pick another trigger. Steps that put a tag on a
-- lead are left in place; the runner steps over them.
update whatsapp_flows
set is_active = false,
    updated_at = now()
where trigger_type = 'tag_added'
  and is_active = true;
