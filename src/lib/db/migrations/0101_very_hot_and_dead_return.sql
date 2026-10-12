-- Very hot and Dead come back as temperatures.
--
-- 0099 retired them (Very hot folded into Hot, Dead into Negative) when the
-- merge was first read as eleven values. Leon: every status is just a
-- temperature, "along with hot, cold, warm, very hot, and dead". So both
-- are active again, as ordinary buttons.
--
-- Leads already converted by 0099 stay where they are: nothing is
-- guessed back. Only new choices can land on these two.
--
-- Very hot sits straight after Hot; Dead goes last. Everything after Hot
-- shifts down one place to make room.

update dropdown_options
set sort_order = sort_order + 1
where category = 'temperature'
  and sort_order > (select sort_order from dropdown_options where category = 'temperature' and value = 'hot');
--> statement-breakpoint

-- Upserts, not updates: a database that never had the old values (a fresh
-- install migrated before the seed ran) gets the rows too.
insert into dropdown_options (category, value, label, color, sort_order, is_active, metadata)
select 'temperature', 'very_hot', 'Very hot', '#991b1b',
       coalesce((select sort_order + 1 from dropdown_options where category = 'temperature' and value = 'hot'), 6),
       true,
       '{"kind":"open","probability":80,"requires_reason":false,"interested":true}'::jsonb
on conflict (category, value) do update
  set is_active = true,
      label = 'Very hot',
      color = coalesce(dropdown_options.color, '#991b1b'),
      sort_order = excluded.sort_order,
      metadata = coalesce(dropdown_options.metadata, '{}'::jsonb) || excluded.metadata;
--> statement-breakpoint

insert into dropdown_options (category, value, label, color, sort_order, is_active, metadata)
select 'temperature', 'dead', 'Dead', '#6b7280',
       (select coalesce(max(sort_order), 0) + 1 from dropdown_options where category = 'temperature' and value <> 'dead'),
       true,
       '{"kind":"lost","probability":0,"requires_reason":false,"interested":false}'::jsonb
on conflict (category, value) do update
  set is_active = true,
      label = 'Dead',
      color = coalesce(dropdown_options.color, '#6b7280'),
      sort_order = excluded.sort_order,
      metadata = coalesce(dropdown_options.metadata, '{}'::jsonb) || excluded.metadata;
