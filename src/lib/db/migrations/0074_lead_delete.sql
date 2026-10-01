-- Deleting a lead, properly.
--
-- `lead.delete` has been in the permission registry since Phase 1 and
-- nothing ever used it: there was no button, no action, and no way to get a
-- junk lead out of the pipeline short of marking it Lost and living with it.
-- Meanwhile `leads` carried a real DELETE policy that nothing called — so
-- the one path that did exist was the one CLAUDE.md non-negotiable #5
-- forbids.
--
-- Three parts: the hard-delete policy goes, the soft delete gets the two
-- columns that make it answerable ("who, and why"), and a trigger makes
-- `lead.delete` mean something at the database level rather than only in
-- the Server Action.

-- 1. No hard delete. "Nothing is hard-deleted; use deleted_at" — and a lead
-- is the root of enquiries, interactions, tasks, payments and an audit
-- trail, so removing the row removes the history of a person the institute
-- talked to. The configuration tables keep their delete policies on purpose
-- (an admin may genuinely remove a dropdown option or a role); this is not
-- a configuration table.
drop policy if exists leads_delete on leads;

-- 2. Who did it and why they said they did.
--
-- The audit log records both already, but a reason you have to go and look
-- up in another screen is a reason nobody reads. These two show up in the
-- deleted list itself, which is where somebody deciding whether to restore
-- a lead is standing.
alter table leads add column if not exists deleted_by uuid references profiles(id) on delete set null;
alter table leads add column if not exists deleted_reason text;

comment on column leads.deleted_reason is
  'Why this lead was deleted, in the deleter''s own words. Required by the app, not by the column — an existing row predates it.';

-- The deleted list's own lookup. Partial, so it stays the size of the
-- recycle bin rather than the size of the database.
create index if not exists leads_deleted_at_idx
  on leads (deleted_at desc)
  where deleted_at is not null;

-- 3. A soft delete is an UPDATE, so `leads_update` — and therefore
-- `lead.update` — is all that RLS would otherwise ask for. That would hand
-- every counsellor the ability to make a lead disappear, which is precisely
-- what a separate `lead.delete` primitive exists to prevent.
--
-- The guard is a trigger rather than a policy because a policy cannot see
-- WHICH column changed: `leads_update` has to keep allowing ordinary edits.
--
-- `auth.uid() is null` means there is no signed-in user, which in this
-- system means server-side code on the direct connection — the merge path
-- (`mergeLeads()` soft-deletes the loser), cron, and webhook handlers. Those
-- are already trusted and have no JWT to check, so they pass. A browser
-- session always has one.
create or replace function enforce_lead_delete_permission() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (old.deleted_at is null) is distinct from (new.deleted_at is null) then
    if auth_scope('lead.delete') is null then
      raise exception 'lead.delete is required to delete or restore a lead'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

comment on function enforce_lead_delete_permission() is
  'Soft-deleting a lead is an UPDATE, so RLS alone would accept lead.update. This makes the lead.delete primitive real. Server-side code (no auth.uid()) is exempt — see migration 0074.';

drop trigger if exists enforce_lead_delete_permission on leads;
create trigger enforce_lead_delete_permission
  before update of deleted_at on leads
  for each row execute function enforce_lead_delete_permission();
