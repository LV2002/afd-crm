-- Tighten the person-scoped target policies to the caller's own centres.
--
-- 0061 let anybody holding report.read at 'center' scope read EVERY
-- person-scoped target, and anybody holding target.manage at 'center'
-- scope set one for ANY person — including staff at a centre they have
-- nothing to do with. A monthly admissions number is not lead data, but
-- CLAUDE.md § 3 is unconditional: the policy is the boundary, and it was
-- wider than the boundary the screen itself enforces.
--
-- A person-scoped row carries no center_id, so the check has to go
-- through the person. `user_centers` has its own RLS, so a plain
-- sub-select inside a policy would be filtered by it and quietly return
-- false for exactly the rows this is meant to allow — hence a security
-- definer helper, the same shape as auth_center_ids() beside it.
create or replace function shares_center_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_centers uc
    where uc.user_id = other_user
      and uc.center_id = any(auth_center_ids())
  );
$$;--> statement-breakpoint

comment on function shares_center_with(uuid) is
  'True when the calling user and the given user are assigned to at least one centre in common.';--> statement-breakpoint

drop policy if exists targets_select on targets;--> statement-breakpoint
create policy targets_select on targets for select
  to authenticated
  using (
    case
      when center_id is not null then can_access_center('report.read', center_id, null)
      when owner_id is not null then (
        -- Your own number, always. Somebody else's only if you report on
        -- the whole institute, or on a centre you share with them.
        owner_id = auth.uid()
        or auth_scope('report.read') = 'all'
        or (auth_scope('report.read') = 'center' and shares_center_with(owner_id))
      )
      else auth_scope('report.read') = 'all' or auth_scope('report.org') = 'all'
    end
  );--> statement-breakpoint

drop policy if exists targets_insert on targets;--> statement-breakpoint
create policy targets_insert on targets for insert
  to authenticated
  with check (
    case
      when center_id is not null then can_access_center('target.manage', center_id, null)
      when owner_id is not null then (
        auth_scope('target.manage') = 'all'
        or (auth_scope('target.manage') = 'center' and shares_center_with(owner_id))
      )
      else auth_scope('target.manage') = 'all'
    end
  );--> statement-breakpoint

drop policy if exists targets_update on targets;--> statement-breakpoint
create policy targets_update on targets for update
  to authenticated
  using (
    case
      when center_id is not null then can_access_center('target.manage', center_id, null)
      when owner_id is not null then (
        auth_scope('target.manage') = 'all'
        or (auth_scope('target.manage') = 'center' and shares_center_with(owner_id))
      )
      else auth_scope('target.manage') = 'all'
    end
  )
  with check (
    case
      when center_id is not null then can_access_center('target.manage', center_id, null)
      when owner_id is not null then (
        auth_scope('target.manage') = 'all'
        or (auth_scope('target.manage') = 'center' and shares_center_with(owner_id))
      )
      else auth_scope('target.manage') = 'all'
    end
  );
