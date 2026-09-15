-- Somewhere to put the logo.
--
-- The attachments bucket's object policies resolve the owning centre from
-- the key's first two segments — 'lead/<id>/…' or 'student/<id>/…' — so a
-- brand logo, which belongs to no lead and no student, could not be
-- written at all. The settings screen offered a "Logo URL" box instead,
-- which is why the institute's own mark lived on some other host or
-- nowhere.
--
-- The service-role key is NOT the way out of this (CLAUDE.md § 3: never in
-- a route a browser session can reach). The right answer is another
-- policy, so the same JWT that opens the settings screen is the one
-- Postgres checks.
do $$
begin
  -- Guarded on the `storage` schema existing, the same way migration 0031
  -- guards the attachments bucket. The test suite and any fresh local
  -- Postgres have no Supabase Storage, and `create policy on
  -- storage.objects` inside an EXECUTE raises `undefined_schema` — which
  -- an exception handler further down cannot catch late enough to save the
  -- transaction. drizzle-kit applies every pending migration in ONE
  -- transaction and swallows the error, so the whole batch rolled back
  -- silently and this migration never applied anywhere. Check first.
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present (local Postgres) — skipping brand logo policies';
    return;
  end if;

  -- Every signed-in user can read it. The logo appears on documents any of
  -- them may legitimately print, and it is the institute's public mark —
  -- it is on the front of the building.
  execute $pol$
    create policy attachments_objects_select_brand on storage.objects for select
      to authenticated
      using (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = 'brand'
      )
  $pol$;

  -- Writing it is changing the institute's identity on every document it
  -- issues, which is exactly the authority settings.manage describes.
  execute $pol$
    create policy attachments_objects_insert_brand on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = 'brand'
        and auth_scope('settings.manage') = 'all'
      )
  $pol$;

  -- Replacing a logo overwrites the object at the same key, which Storage
  -- treats as an update rather than an insert.
  execute $pol$
    create policy attachments_objects_update_brand on storage.objects for update
      to authenticated
      using (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = 'brand'
        and auth_scope('settings.manage') = 'all'
      )
  $pol$;
exception
  -- A re-run against a project that already has these policies.
  when duplicate_object then null;
  when insufficient_privilege then
    raise notice 'skipping brand storage policies: %', sqlerrm;
end $$;
