-- ============================================================================
-- Phase 0: auth helper functions, lockout-protection triggers, and RLS.
--
-- Every policy branches on auth_scope()/can_access_center() — never on a
-- role name or role code. This is what lets an admin invent a brand new
-- role at runtime, in the settings UI, with no migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function auth_center_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(center_id), '{}'::uuid[])
  from user_centers
  where user_id = auth.uid();
$$;

comment on function auth_center_ids() is
  'Centres the calling user is assigned to, via user_centers.';

create or replace function auth_scope(perm text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rp.scope::text
  from profiles p
  join role_permissions rp on rp.role_id = p.role_id
  where p.id = auth.uid()
    and p.is_active = true
    and rp.permission_code = perm
  limit 1;
$$;

comment on function auth_scope(text) is
  'Scope (''own''|''center''|''all'') the calling user''s role holds for a
   permission code, or null if the role does not hold it / the user is
   inactive. Every RLS policy in this system calls this instead of
   comparing role = ''admin''.';

create or replace function can_access_center(perm text, target_center_id uuid, owner_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case auth_scope(perm)
    when 'all'    then true
    when 'center' then target_center_id = any(auth_center_ids())
    when 'own'    then owner_id = auth.uid()
    else false
  end;
$$;

comment on function can_access_center(text, uuid, uuid) is
  'One implementation of the scope->row check, called from every policy so
   there is a single place to fix if the logic is ever wrong.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on org_settings
  for each row execute function set_updated_at();
create trigger set_updated_at before update on terminology
  for each row execute function set_updated_at();
create trigger set_updated_at before update on centers
  for each row execute function set_updated_at();
create trigger set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger set_updated_at before update on user_centers
  for each row execute function set_updated_at();
create trigger set_updated_at before update on roles
  for each row execute function set_updated_at();
create trigger set_updated_at before update on role_permissions
  for each row execute function set_updated_at();
create trigger set_updated_at before update on dropdown_categories
  for each row execute function set_updated_at();
create trigger set_updated_at before update on dropdown_options
  for each row execute function set_updated_at();
create trigger set_updated_at before update on pipeline_stages
  for each row execute function set_updated_at();
create trigger set_updated_at before update on field_definitions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Lockout protection (docs/01-DATA-MODEL.md ss Lockout protection)
-- ---------------------------------------------------------------------------

-- Invariant 1: at least one active user must hold settings.manage at scope
-- 'all'. Re-checked after any change that could remove the last one.
create or replace function check_settings_admin_invariant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    where p.is_active = true
      and rp.permission_code = 'settings.manage'
      and rp.scope = 'all'
  ) then
    raise exception
      'lockout protection: at least one active user must hold settings.manage at scope all';
  end if;
  return null;
end;
$$;

create constraint trigger settings_admin_invariant_profiles
  after update or delete on profiles
  deferrable initially deferred
  for each row execute function check_settings_admin_invariant();

create constraint trigger settings_admin_invariant_role_permissions
  after update or delete on role_permissions
  deferrable initially deferred
  for each row execute function check_settings_admin_invariant();

-- Invariant 2: the `admin` role (is_protected = true) can never be deleted,
-- stripped of a permission, or un-protected. Exactly one role ships
-- is_protected; this is what stops an admin from locking the org out of
-- its own settings screen.
create or replace function protect_admin_role()
returns trigger
language plpgsql
as $$
begin
  if old.is_protected and tg_op = 'DELETE' then
    raise exception 'lockout protection: the protected role cannot be deleted';
  end if;
  if old.is_protected and tg_op = 'UPDATE' and new.is_protected is distinct from true then
    raise exception 'lockout protection: the protected role cannot be un-protected';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger protect_admin_role before update or delete on roles
  for each row execute function protect_admin_role();

create or replace function protect_admin_role_permissions()
returns trigger
language plpgsql
as $$
declare
  target_role_id uuid := coalesce(old.role_id, new.role_id);
  role_is_protected boolean;
begin
  select is_protected into role_is_protected from roles where id = target_role_id;
  if role_is_protected and tg_op in ('UPDATE', 'DELETE') then
    raise exception
      'lockout protection: permissions cannot be removed or narrowed on the protected role';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger protect_admin_role_permissions before update or delete on role_permissions
  for each row execute function protect_admin_role_permissions();

-- Core field definitions (is_core = true) back a real column and can never
-- be deleted through the settings UI, only relabelled/reordered/hidden.
create or replace function protect_core_field_definitions()
returns trigger
language plpgsql
as $$
begin
  if old.is_core then
    raise exception 'core field definitions cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger protect_core_field_definitions before delete on field_definitions
  for each row execute function protect_core_field_definitions();

-- org_settings is a singleton. RLS controls who can write to it, but
-- nothing above stops a second row from being inserted — enforce that at
-- the database level too.
create unique index org_settings_singleton_idx on org_settings ((true));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table org_settings enable row level security;
alter table terminology enable row level security;
alter table centers enable row level security;
alter table profiles enable row level security;
alter table user_centers enable row level security;
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table dropdown_categories enable row level security;
alter table dropdown_options enable row level security;
alter table pipeline_stages enable row level security;
alter table field_definitions enable row level security;
alter table audit_log enable row level security;

-- org_settings: singleton, readable by any signed-in user, writable only by
-- an org-wide settings admin. No delete policy — it is never removed.
create policy org_settings_select on org_settings for select
  to authenticated
  using (true);

create policy org_settings_insert on org_settings for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy org_settings_update on org_settings for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

-- terminology: same shape as org_settings.
create policy terminology_select on terminology for select
  to authenticated
  using (true);

create policy terminology_insert on terminology for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy terminology_update on terminology for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy terminology_delete on terminology for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

-- centers: everyone needs the list to render (their own center's name, the
-- "assign to center" picker); only a settings admin can change it.
create policy centers_select on centers for select
  to authenticated
  using (true);

create policy centers_insert on centers for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy centers_update on centers for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy centers_delete on centers for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

-- profiles: v1's S3 bug (GET /users returned everyone) does not get to
-- happen here. A user always sees their own row; beyond that, users.manage
-- scope decides — 'all' sees everyone, 'center' sees people who share a
-- center with the caller, anything else sees only themselves.
create policy profiles_select on profiles for select
  to authenticated
  using (
    id = auth.uid()
    or auth_scope('users.manage') = 'all'
    or (
      auth_scope('users.manage') = 'center'
      and exists (
        select 1 from user_centers uc
        where uc.user_id = profiles.id
          and uc.center_id = any(auth_center_ids())
      )
    )
  );

create policy profiles_insert on profiles for insert
  to authenticated
  with check (auth_scope('users.manage') = 'all');

create policy profiles_update on profiles for update
  to authenticated
  using (
    auth_scope('users.manage') = 'all'
    or (
      auth_scope('users.manage') = 'center'
      and exists (
        select 1 from user_centers uc
        where uc.user_id = profiles.id
          and uc.center_id = any(auth_center_ids())
      )
    )
  )
  with check (
    auth_scope('users.manage') = 'all'
    or (
      auth_scope('users.manage') = 'center'
      and exists (
        select 1 from user_centers uc
        where uc.user_id = profiles.id
          and uc.center_id = any(auth_center_ids())
      )
    )
  );

-- No delete policy on profiles: users are deactivated (is_active = false),
-- never removed. deleted_at is deliberately absent from this table too.

-- Defence in depth: a user can never elevate their own role or reactivate
-- themselves via the update policy above, even if they somehow hold
-- users.manage at 'center' scope over their own center.
create or replace function prevent_self_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.id = auth.uid()
    and (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active)
    and auth_scope('users.manage') is distinct from 'all'
  then
    raise exception 'cannot change your own role or active status without org-wide users.manage';
  end if;
  return new;
end;
$$;

create trigger prevent_self_privilege_escalation before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- user_centers: visible to anyone who can see the profile it belongs to;
-- writable by the same users.manage scope as profiles.
create policy user_centers_select on user_centers for select
  to authenticated
  using (
    user_id = auth.uid()
    or auth_scope('users.manage') = 'all'
    or (auth_scope('users.manage') = 'center' and center_id = any(auth_center_ids()))
  );

create policy user_centers_insert on user_centers for insert
  to authenticated
  with check (
    auth_scope('users.manage') = 'all'
    or (auth_scope('users.manage') = 'center' and center_id = any(auth_center_ids()))
  );

create policy user_centers_delete on user_centers for delete
  to authenticated
  using (
    auth_scope('users.manage') = 'all'
    or (auth_scope('users.manage') = 'center' and center_id = any(auth_center_ids()))
  );

-- permissions: fixed, code-seeded reference list. Readable by everyone
-- (the role builder needs it); never mutated through the app's own
-- session — only migrations/seed touch this table.
create policy permissions_select on permissions for select
  to authenticated
  using (true);

-- roles: readable by everyone (role names show up all over the UI);
-- writable only by a roles admin. The protect_admin_role trigger backs
-- this up against a roles.manage='all' user deleting/un-protecting admin.
create policy roles_select on roles for select
  to authenticated
  using (true);

create policy roles_insert on roles for insert
  to authenticated
  with check (auth_scope('roles.manage') = 'all');

create policy roles_update on roles for update
  to authenticated
  using (auth_scope('roles.manage') = 'all')
  with check (auth_scope('roles.manage') = 'all');

create policy roles_delete on roles for delete
  to authenticated
  using (auth_scope('roles.manage') = 'all');

-- role_permissions: readable by everyone (needed to compute the caller's
-- own permission set for the sidebar); writable only by a roles admin.
create policy role_permissions_select on role_permissions for select
  to authenticated
  using (true);

create policy role_permissions_insert on role_permissions for insert
  to authenticated
  with check (auth_scope('roles.manage') = 'all');

create policy role_permissions_update on role_permissions for update
  to authenticated
  using (auth_scope('roles.manage') = 'all')
  with check (auth_scope('roles.manage') = 'all');

create policy role_permissions_delete on role_permissions for delete
  to authenticated
  using (auth_scope('roles.manage') = 'all');

-- dropdown_categories / dropdown_options / pipeline_stages /
-- field_definitions: configuration tables. Select for all authenticated
-- users (the app renders them everywhere); mutations gated on
-- settings.manage='all'.
create policy dropdown_categories_select on dropdown_categories for select
  to authenticated
  using (true);

create policy dropdown_categories_insert on dropdown_categories for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy dropdown_categories_update on dropdown_categories for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy dropdown_categories_delete on dropdown_categories for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

create policy dropdown_options_select on dropdown_options for select
  to authenticated
  using (true);

create policy dropdown_options_insert on dropdown_options for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy dropdown_options_update on dropdown_options for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy dropdown_options_delete on dropdown_options for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

create policy pipeline_stages_select on pipeline_stages for select
  to authenticated
  using (true);

create policy pipeline_stages_insert on pipeline_stages for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy pipeline_stages_update on pipeline_stages for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy pipeline_stages_delete on pipeline_stages for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

create policy field_definitions_select on field_definitions for select
  to authenticated
  using (true);

create policy field_definitions_insert on field_definitions for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy field_definitions_update on field_definitions for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

create policy field_definitions_delete on field_definitions for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');

-- audit_log: insert-only for every authenticated user (every mutation and
-- every export writes here, from whatever session performed it); select
-- gated on holding audit.read at any scope; no update or delete policy at
-- all, for anyone, ever.
create policy audit_log_insert on audit_log for insert
  to authenticated
  with check (true);

create policy audit_log_select on audit_log for select
  to authenticated
  using (auth_scope('audit.read') is not null);
