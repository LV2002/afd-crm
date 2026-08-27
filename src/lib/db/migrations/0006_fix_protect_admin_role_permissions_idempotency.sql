-- Bug fix: protect_admin_role_permissions() blocked ANY update to a
-- protected role's role_permissions row, including a no-op re-upsert that
-- sets the scope to the value it already has. That broke the seed
-- script's documented idempotency ("safe to re-run") the moment a
-- database already had the admin role's permissions seeded once —
-- src/lib/db/seed.ts's onConflictDoUpdate for admin's own rows would
-- always be rejected by this trigger on every re-run, even though nothing
-- was actually changing.
--
-- Fix: only raise on DELETE, or on an UPDATE that actually changes the
-- scope. Re-asserting the same scope — exactly what an idempotent reseed
-- does — is now a no-op, not a lockout violation.
create or replace function protect_admin_role_permissions()
returns trigger
language plpgsql
as $$
declare
  target_role_id uuid := coalesce(old.role_id, new.role_id);
  role_is_protected boolean;
begin
  select is_protected into role_is_protected from roles where id = target_role_id;

  if role_is_protected and tg_op = 'DELETE' then
    raise exception 'lockout protection: permissions cannot be removed from the protected role';
  end if;

  if role_is_protected and tg_op = 'UPDATE' and old.scope is distinct from new.scope then
    raise exception 'lockout protection: permissions cannot be narrowed on the protected role';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Second bug found by the same re-seed test: check_settings_admin_invariant()
-- fires (it's a deferred AFTER UPDATE/DELETE trigger) the moment any
-- role_permissions row is updated — including the seed script's idempotent
-- re-upserts for co_admin, center_head, etc. On a freshly migrated database
-- where no profile has ever been created yet (the common case: config is
-- seeded before the SUPABASE_SERVICE_ROLE_KEY-gated auth-user step runs, or
-- that step is skipped entirely), the invariant "at least one active user
-- must hold settings.manage at scope all" is unsatisfiable by construction
-- — there are no users at all yet — so it blocked re-seeding forever, before
-- the system had ever been bootstrapped with a real admin.
--
-- Fix: the invariant only applies once the system actually has at least one
-- profile. Before that, there is nothing to lock anyone out of yet.
create or replace function check_settings_admin_invariant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles) then
    return null;
  end if;

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
