-- RLS for the finance ledger.
--
-- The point of this whole module, and the one thing the spreadsheet could
-- not do. There, "Apply owner-only protection" stopped EDITING but not
-- READING — its own comment says so — so every staff member with the link
-- could open the Dashboard, read the bank balance, and take a copy of the
-- file. Here, a counsellor holds no finance permission at all and the
-- database returns them nothing.
--
-- Scope is by centre, through the same `can_access_center` helper the
-- leads and enrolments policies already use, so a Kannur centre head sees
-- Kannur's accounts and Kannur's ledger. Accounts staff and admins hold
-- the permission at `all` and see the whole institute.
--
-- `can_access_center(perm, center_id, owner_id)` is passed null for the
-- owner: money has no owner the way a lead does, so a role granted
-- finance.read at `own` scope matches nothing. That is correct — "your
-- own bank account" is not a meaningful idea here, and a role configured
-- that way should see nothing rather than everything.

alter table finance_accounts enable row level security;
alter table finance_transactions enable row level security;

-- ── Accounts ───────────────────────────────────────────────────────────────

create policy finance_accounts_select on finance_accounts for select
  to authenticated
  using (deleted_at is null and can_access_center('finance.read', center_id, null));

create policy finance_accounts_insert on finance_accounts for insert
  to authenticated
  with check (can_access_center('finance.manage', center_id, null));

-- Editing an account's name, opening balance or active flag is ordinary
-- configuration, unlike the ledger below. The USING clause is repeated in
-- WITH CHECK so an account cannot be moved into a centre the caller could
-- not otherwise touch.
create policy finance_accounts_update on finance_accounts for update
  to authenticated
  using (can_access_center('finance.manage', center_id, null))
  with check (can_access_center('finance.manage', center_id, null));

-- No delete policy: an account with history is deactivated (is_active =
-- false) or soft-deleted, never removed, because its transactions must
-- keep pointing somewhere.

-- ── Transactions ───────────────────────────────────────────────────────────

create policy finance_txn_select on finance_transactions for select
  to authenticated
  using (can_access_center('finance.read', center_id, null));

create policy finance_txn_insert on finance_transactions for insert
  to authenticated
  with check (can_access_center('finance.record', center_id, null));

-- Deliberately NO update and NO delete policy, for anybody, including an
-- admin. This is CLAUDE.md non-negotiable #7 enforced by the database
-- rather than by everyone remembering: a wrong entry is corrected by
-- appending a mirrored negative row and re-posting, which is what
-- `reverseTransaction()` does. The workbook kept a `Status` column it
-- rewrote in place; deriving "reversed" from the existence of a reversal
-- row means there is nothing here to rewrite.

comment on table finance_transactions is
  'Append-only cash ledger. No UPDATE or DELETE policy exists for any role: a
   correction is a mirrored negative row plus a re-post. "Reversed" is derived
   from another row pointing at this one, never stored.';
