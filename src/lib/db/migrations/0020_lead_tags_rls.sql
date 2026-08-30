-- Lead tagging RLS. `tags` is a config table (docs/01-DATA-MODEL.md's
-- pattern for dropdown_options/pipeline_stages) -- select-all authenticated,
-- mutations gated on settings.manage='all'. `lead_tags` inherits visibility
-- from its parent lead, same shape as enquiries/interactions/tasks; applying
-- or removing a tag is treated as a lead edit, gated on lead.update, not a
-- new permission primitive.

create trigger set_updated_at before update on tags
  for each row execute function set_updated_at();

alter table tags enable row level security;
alter table lead_tags enable row level security;

create policy tags_select on tags for select
  to authenticated
  using (true);

create policy tags_insert on tags for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy tags_update on tags for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy tags_delete on tags for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

create policy lead_tags_select on lead_tags for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = lead_tags.lead_id
      and can_access_center('lead.read', l.center_id, l.assigned_to)
  ));

create policy lead_tags_insert on lead_tags for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = lead_tags.lead_id
      and can_access_center('lead.update', l.center_id, l.assigned_to)
  ));

-- No update policy -- a tag application is never edited, only removed and
-- re-applied (see the schema's own comment on lead_tags).
create policy lead_tags_delete on lead_tags for delete
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = lead_tags.lead_id
      and can_access_center('lead.update', l.center_id, l.assigned_to)
  ));
