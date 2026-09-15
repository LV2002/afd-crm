-- The audit log becomes an admin-only screen, and stops lying about scope.
--
-- Leon: "create a screen for audit which only the admin can see." The
-- screen is the visible half of that; this is the half that enforces it,
-- because a screen guarded only by application code is exactly what
-- CLAUDE.md non-negotiable #3 forbids.
--
-- There is also a real hole being closed here, independent of the ask.
-- The old policy read:
--
--   using (auth_scope('audit.read') is not null)
--
-- `audit_log` has no `center_id` and cannot have one — a row about a role
-- change or a settings edit belongs to no centre — so a *centre*-scoped
-- grant of `audit.read` was never actually scoped to a centre. It read the
-- whole table: every lead reveal, every fee change, every export, in every
-- centre. Two of the six seeded roles held it that way. Requiring 'all'
-- makes a centre-scoped grant mean nothing rather than mean everything,
-- which is the direction a permission mistake should fail in.
drop policy if exists "audit_log_select" on audit_log;

create policy "audit_log_select" on audit_log
  for select
  to authenticated
  using (auth_scope('audit.read') = 'all');

-- The grants themselves, brought in line. Deleting the centre-scoped rows
-- removes no real capability (see above — they were reading everything or
-- nothing was being enforced); dropping co_admin's is Leon's call, and the
-- same call he made for password resets: the co-admin is a person whose
-- actions the audit log exists to record.
--
-- Roles are ordinary editable rows, so this is a starting position, not a
-- rule: an admin can grant `audit.read` at scope 'all' to any role from
-- Settings → Roles & Permissions, and it will work.
delete from role_permissions
where permission_code = 'audit.read'
  and role_id not in (select id from roles where code = 'admin');

-- Inserts are untouched: every authenticated user must be able to write an
-- audit row for their own action, or half the mutations in the app would
-- fail for the people whose actions most need recording.
