-- RLS for attachments, plus the private Storage bucket the bytes live in.
--
-- Access to a file is always decided by its PARENT (the lead or student it
-- hangs off), never by anything stored on the attachment row itself. That
-- is why there is no center_id column here to scope against: a copy of the
-- centre would go stale the moment a lead moved centres, and a stale copy
-- on an access-control path is how files leak across centres.
--
-- The two helpers below are `security definer` on purpose. Without that,
-- the `leads`/`students` lookup inside a policy would itself be filtered by
-- those tables' own RLS, so a role holding file.read but NOT lead.read
-- (accounts and academics are exactly this shape — see seed.ts) would find
-- no parent row and be denied its own files. The helpers answer one narrow
-- question — "may this caller reach files under this parent?" — and answer
-- it from the parent's real, current centre and owner.

create or replace function can_access_lead_files(perm text, target_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leads l
    where l.id = target_lead_id
      and l.deleted_at is null
      and can_access_center(perm, l.center_id, l.assigned_to)
  );
$$;

comment on function can_access_lead_files(text, uuid) is
  'May the current user exercise `perm` over files attached to this lead?
   security definer so the parent lookup is not blocked by leads RLS: a role
   can legitimately hold file.read without lead.read.';

-- Students have no assigned owner, so `own` scope can never match one:
-- can_access_center is passed null and falls through to false. A role that
-- should see student files needs file.read at center or all scope.
create or replace function can_access_student_files(perm text, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from students s
    where s.id = target_student_id
      and can_access_center(perm, s.center_id, null)
  );
$$;

comment on function can_access_student_files(text, uuid) is
  'May the current user exercise `perm` over files attached to this student?
   See can_access_lead_files; students carry no owner, so `own` scope never
   matches and center/all scope is required.';

alter table attachments enable row level security;

-- A live file is visible to file.read. A REMOVED file stays visible only to
-- whoever could have removed it (file.delete), which does two things: it
-- keeps a deleted document out of ordinary sight without hard-deleting it,
-- and it makes the removal reversible by someone accountable.
--
-- The second arm is also load-bearing mechanically, not just editorially.
-- Soft-deleting is `update ... set deleted_at = now() returning id`, and
-- Postgres applies the SELECT policy to the NEW row whenever an UPDATE
-- returns rows. With only the first arm, the very act of removing a file
-- would fail with "new row violates row-level security policy" — the
-- update succeeds against its own WITH CHECK and is then rejected on the
-- way out. Caught by tests/rls.spec.ts.
create policy attachments_select on attachments for select
  to authenticated
  using (
    case when deleted_at is null then
      (lead_id is not null and can_access_lead_files('file.read', lead_id))
      or (student_id is not null and can_access_student_files('file.read', student_id))
    else
      (lead_id is not null and can_access_lead_files('file.delete', lead_id))
      or (student_id is not null and can_access_student_files('file.delete', student_id))
    end
  );

create policy attachments_insert on attachments for insert
  to authenticated
  with check (
    (lead_id is not null and can_access_lead_files('file.upload', lead_id))
    or (student_id is not null and can_access_student_files('file.upload', student_id))
  );

-- UPDATE is how a file is removed (setting deleted_at) and how its label is
-- corrected. There is deliberately no DELETE policy: nothing here is ever
-- hard-deleted from the app (CLAUDE.md § Non-negotiables 5).
create policy attachments_update on attachments for update
  to authenticated
  using (
    (lead_id is not null and can_access_lead_files('file.delete', lead_id))
    or (student_id is not null and can_access_student_files('file.delete', student_id))
  )
  with check (
    (lead_id is not null and can_access_lead_files('file.delete', lead_id))
    or (student_id is not null and can_access_student_files('file.delete', student_id))
  );

-- ---------------------------------------------------------------------------
-- Supabase Storage: the private bucket and its object-level policies.
-- ---------------------------------------------------------------------------
-- Guarded on the `storage` schema existing, because the test suite runs this
-- same migration chain against a plain local Postgres that has no Supabase
-- Storage. Skipping there is correct rather than a compromise: there are no
-- objects to protect on a database with no object store, and the attachments
-- policies above — the ones the tests actually exercise — still apply.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present (local Postgres) — skipping bucket and object policies';
    return;
  end if;

  -- public = false: objects are readable only through a signed URL minted by
  -- someone who passed the policies below. A public bucket would make every
  -- student document world-readable to anyone holding the URL.
  insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict (id) do update set public = false;

  -- Object keys are '<kind>/<parent id>/<uuid>-<filename>', so segment 1 says
  -- which parent table to check and segment 2 is that parent's id. The app
  -- writes this shape in src/lib/storage/attachments.ts; the two must agree.
  --
  -- These policies are the real enforcement point for the bytes. The app only
  -- ever reaches Storage with the caller's own JWT (never the service-role
  -- key, per CLAUDE.md § Non-negotiables 3), so a user who cannot satisfy
  -- them cannot read or write the object no matter what the UI does.
  execute $pol$
    create policy attachments_objects_select on storage.objects for select
      to authenticated
      using (
        bucket_id = 'attachments'
        and (
          ((storage.foldername(name))[1] = 'lead'
            and can_access_lead_files('file.read', ((storage.foldername(name))[2])::uuid))
          or ((storage.foldername(name))[1] = 'student'
            and can_access_student_files('file.read', ((storage.foldername(name))[2])::uuid))
        )
      )
  $pol$;

  execute $pol$
    create policy attachments_objects_insert on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'attachments'
        and (
          ((storage.foldername(name))[1] = 'lead'
            and can_access_lead_files('file.upload', ((storage.foldername(name))[2])::uuid))
          or ((storage.foldername(name))[1] = 'student'
            and can_access_student_files('file.upload', ((storage.foldername(name))[2])::uuid))
        )
      )
  $pol$;

  -- Removing the bytes is an admin action taken deliberately, not something
  -- the app does when a user removes a file — that only sets deleted_at, so
  -- a mis-click stays recoverable.
  execute $pol$
    create policy attachments_objects_delete on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'attachments'
        and auth_scope('settings.manage') = 'all'
      )
  $pol$;
end $$;
