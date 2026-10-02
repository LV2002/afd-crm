-- Closing the Supabase Security Advisor's findings, with the reasoning.
--
-- Leon's dashboard reported 28 schema lints. This migration clears all of
-- them. Each group below says what was actually wrong, because two of the
-- three looked worse than they were and one looked milder than it was.

-- ---------------------------------------------------------------------------
-- 1. Ten SECURITY DEFINER helpers were callable over the public REST API
-- ---------------------------------------------------------------------------
--
-- `auth_scope`, `can_access_center` and friends live in `public`, which is
-- the schema PostgREST exposes — so every one of them had an endpoint at
-- `/rest/v1/rpc/<name>`, reachable by a logged-OUT visitor. Nothing
-- catastrophic leaks (they mostly answer questions about the caller
-- themselves), but `shares_center_with(uuid)` tells a stranger whether two
-- members of staff share a centre, and none of them was ever meant to be an
-- API.
--
-- ## Why not simply revoke EXECUTE, as the advisor suggests
--
-- Because it breaks every policy in the system. Measured, not assumed:
-- revoking EXECUTE on `can_access_center` from `authenticated` turns an
-- ordinary `select` on `leads` into
-- `ERROR: permission denied for function can_access_center`. An RLS policy
-- expression is evaluated as the querying user, so the querying user needs
-- EXECUTE on whatever the policy calls.
--
-- (A first attempt looked like it worked — revoking `auth_scope` alone
-- changed nothing — because the policies call it only INSIDE
-- `can_access_center`, where it runs as the definer. That near-miss is why
-- this was tested against a policy that calls the function directly.)
--
-- ## What actually works
--
-- Move them out of the exposed schema. PostgREST only introspects `public`,
-- so a function in `private` has no endpoint — while the policies keep
-- working, because a policy stores the function's OID rather than its name
-- and follows it across the move. Grants travel with the function too, so
-- `authenticated` keeps the EXECUTE the policies need.
--
-- The one thing that does NOT follow is a function calling a SIBLING by
-- bare name: `can_access_center` calls `auth_scope`, and with
-- `search_path = public` it stopped finding it. Hence the search_path
-- change on each one.
create schema if not exists private;

comment on schema private is
  'Helper functions the RLS policies call. Deliberately NOT exposed by PostgREST: anything in here would otherwise have a public /rest/v1/rpc endpoint. See migration 0077.';

-- Needed to execute anything in here. Pointedly not granted to `anon`:
-- no anonymous request in this application queries a table through
-- PostgREST — the public profile form runs on the direct connection — so
-- anon has no reason to resolve these.
grant usage on schema private to authenticated, service_role;

alter function public.auth_scope(text) set schema private;
alter function public.auth_center_ids() set schema private;
alter function public.can_access_center(text, uuid, uuid) set schema private;
alter function public.can_access_enrolment(text, uuid) set schema private;
alter function public.can_access_lead_files(text, uuid) set schema private;
alter function public.can_access_student_files(text, uuid) set schema private;
alter function public.shares_center_with(uuid) set schema private;

-- Three more that are SECURITY DEFINER and exposed, but are trigger bodies
-- rather than policy helpers. Postgres refuses to call a trigger function
-- directly, so the endpoint was never useful — but an endpoint nobody can
-- use is still an endpoint, and a reader of the advisor cannot tell the
-- difference. Triggers resolve by OID, so these move just as safely.
alter function public.write_stage_history() set schema private;
alter function public.enforce_lead_delete_permission() set schema private;
alter function public.check_settings_admin_invariant() set schema private;

-- Each of these calls its siblings by bare name, so `private` has to come
-- first. `public` stays on the path because they all read `profiles`,
-- `role_permissions`, `user_centers` and the rest.
alter function private.auth_scope(text) set search_path = private, public;
alter function private.auth_center_ids() set search_path = private, public;
alter function private.can_access_center(text, uuid, uuid) set search_path = private, public;
alter function private.can_access_enrolment(text, uuid) set search_path = private, public;
alter function private.can_access_lead_files(text, uuid) set search_path = private, public;
alter function private.can_access_student_files(text, uuid) set search_path = private, public;
alter function private.shares_center_with(uuid) set search_path = private, public;
alter function private.write_stage_history() set search_path = private, public;
alter function private.enforce_lead_delete_permission() set search_path = private, public;
alter function private.check_settings_admin_invariant() set search_path = private, public;

-- ---------------------------------------------------------------------------
-- 2. Eight functions with a mutable search_path
-- ---------------------------------------------------------------------------
--
-- Milder than it reads: all eight are SECURITY INVOKER trigger bodies, so
-- the usual escalation — persuade a definer function to resolve a name to
-- an attacker's object — does not apply; they already run as whoever
-- triggered them. Pinning the path anyway costs one line each and removes a
-- class of surprise if any of them is ever made SECURITY DEFINER.
alter function public.set_updated_at() set search_path = public;
alter function public.protect_admin_role() set search_path = public;
alter function public.protect_admin_role_permissions() set search_path = public;
alter function public.protect_core_field_definitions() set search_path = public;
-- The one exception on this list: it calls `auth_scope`, which section 1
-- just moved, so `public` alone no longer finds it. The RLS suite caught
-- this — pinning it to `public` broke the lockout triggers that stop an
-- administrator removing the last person who can administer.
alter function public.prevent_self_privilege_escalation() set search_path = private, public;
alter function public.enforce_lost_reason() set search_path = public;
alter function public.enforce_audit_actor() set search_path = public;
alter function public.set_lead_assigned_at() set search_path = public;

-- ---------------------------------------------------------------------------
-- 3. `audit_log_insert` had WITH CHECK (true)
-- ---------------------------------------------------------------------------
--
-- Not the hole it looks like — the `enforce_audit_actor` trigger already
-- refuses any row whose `actor_id` is not the acting user. But the policy
-- was relying on the trigger to say what it should have said itself, and a
-- reader auditing the policies alone could not tell the rule existed.
--
-- `(select auth.uid())` rather than a bare call, for the same reason as
-- section 4 below.
drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log for insert
  to authenticated
  with check (actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Five policies re-evaluated auth.uid() for every row
-- ---------------------------------------------------------------------------
--
-- A bare `auth.uid()` in a policy is re-run per row; wrapped in a
-- sub-select Postgres evaluates it once for the whole query. Pure speed, no
-- behaviour change — and worth having on `profiles` and `user_centers`,
-- which are read on the way to almost every page.
--
-- These are the only policies rewritten here, so they are also the only
-- ones that must now name the helpers as `private.*`. Every other policy in
-- the database keeps working untouched, because it resolved its functions
-- when it was created.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.auth_scope('users.manage') = 'all'
    or (
      private.auth_scope('users.manage') = 'center'
      and exists (
        select 1 from user_centers uc
        where uc.user_id = profiles.id
          and uc.center_id = any (private.auth_center_ids())
      )
    )
  );

drop policy if exists user_centers_select on user_centers;
create policy user_centers_select on user_centers for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.auth_scope('users.manage') = 'all'
    or (
      private.auth_scope('users.manage') = 'center'
      and center_id = any (private.auth_center_ids())
    )
  );

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists targets_select on targets;
create policy targets_select on targets for select
  to authenticated
  using (
    case
      when center_id is not null then private.can_access_center('report.read', center_id, null)
      when owner_id is not null then (
        owner_id = (select auth.uid())
        or private.auth_scope('report.read') = 'all'
        or (private.auth_scope('report.read') = 'center' and private.shares_center_with(owner_id))
      )
      else (private.auth_scope('report.read') = 'all' or private.auth_scope('report.org') = 'all')
    end
  );

-- ---------------------------------------------------------------------------
-- 5. Two tables evaluated the same policy twice on every read
-- ---------------------------------------------------------------------------
--
-- `whatsapp_flows` and `whatsapp_flow_steps` each carry a `_select` policy
-- and a `_write` policy declared `FOR ALL` — and `ALL` includes SELECT, with
-- a condition identical to the one beside it. Permissive policies are ORed,
-- so the result was never wrong; Postgres just evaluated
-- `auth_scope('whatsapp.campaign')` twice per read for no reason.
--
-- The `_select` ones go, rather than narrowing `_write` to three separate
-- commands. `FOR ALL` already covers reads with exactly the same expression,
-- so this removes a duplicate rather than changing a rule — and the two
-- tables keep one policy each, which is easier to audit than four.
drop policy if exists whatsapp_flows_select on whatsapp_flows;
drop policy if exists whatsapp_flow_steps_select on whatsapp_flow_steps;
