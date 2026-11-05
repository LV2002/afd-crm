-- Bank reconciliation: every bank statement line is paired with the ledger
-- entry it belongs to, and every ledger entry in a bank account with the
-- statement line that proves it. Anything left unpaired is an exception.
--
-- Pairs live here, not as a column on either side, so the ledger and the
-- statement lines stay exactly as they were. `active` is false once a pair
-- has been undone (with who and why); a row is never deleted.
create table if not exists bank_matches (
  id uuid primary key default gen_random_uuid(),
  bank_line_id uuid not null references bank_statement_lines(id) on delete restrict,
  -- Null only for a waiver: a line somebody with authority accepted as having
  -- no ledger entry.
  transaction_id uuid references finance_transactions(id) on delete restrict,
  center_id uuid not null references centers(id) on delete restrict,
  -- auto | categorised (the entry was made from this very line) | manual | waived
  method text not null,
  matched_by uuid references profiles(id) on delete set null,
  note text,
  matched_at timestamptz not null default now(),
  active boolean not null default true,
  unmatched_by uuid references profiles(id) on delete set null,
  unmatched_at timestamptz,
  unmatch_reason text,
  constraint bank_matches_method_check check (method in ('auto', 'categorised', 'manual', 'waived')),
  constraint bank_matches_waiver_check check ((method = 'waived') = (transaction_id is null))
);--> statement-breakpoint

create unique index if not exists bank_matches_line_active_uq
  on bank_matches (bank_line_id) where active;--> statement-breakpoint
create unique index if not exists bank_matches_txn_active_uq
  on bank_matches (transaction_id) where active and transaction_id is not null;--> statement-breakpoint
create index if not exists bank_matches_center_idx on bank_matches (center_id, active);--> statement-breakpoint

-- Lines already categorised before this existed are paired with the entry
-- they produced; lines already set aside become waivers, so they show up for
-- review instead of silently counting as done.
insert into bank_matches (bank_line_id, transaction_id, center_id, method, matched_by, matched_at)
select l.id, l.transaction_id, l.center_id, 'categorised', l.resolved_by, coalesce(l.resolved_at, now())
from bank_statement_lines l
where l.status = 'posted' and l.transaction_id is not null
on conflict do nothing;--> statement-breakpoint

insert into bank_matches (bank_line_id, transaction_id, center_id, method, matched_by, note, matched_at)
select l.id, null, l.center_id, 'waived', l.resolved_by,
       'Set aside before reconciliation existed: ' || coalesce(l.skip_reason, 'no reason given'),
       coalesce(l.resolved_at, now())
from bank_statement_lines l
where l.status = 'skipped'
on conflict do nothing;--> statement-breakpoint

alter table bank_matches enable row level security;--> statement-breakpoint
create policy bank_matches_select on bank_matches for select to authenticated
  using (private.can_access_center('finance.read', center_id, null));--> statement-breakpoint
-- No insert, update or delete policy for anybody: pairs are written by the
-- server after it has checked bank.reconcile, never straight from a browser.

-- The two new permissions.
insert into permissions (code, label, category, description)
values
  ('bank.import', 'Upload bank statements', 'Finance',
   'Upload a bank statement. Kept apart from recording entries on purpose: whoever keeps the books should not also be the one who supplies the bank''s side.'),
  ('bank.reconcile', 'Match and review bank transactions', 'Finance',
   'Pair statement lines with ledger entries by hand, undo a pair, and accept a line as having no entry. Run the automatic matching.')
on conflict (code) do nothing;--> statement-breakpoint

-- Granted to roles that hold every settings key (admin, co-admin), never to
-- accounts: the person who keeps the books must not also control the bank's side.
insert into role_permissions (role_id, permission_code, scope)
select rp.role_id, p.code, 'all'
from role_permissions rp
cross join (values ('bank.import'), ('bank.reconcile')) as p(code)
where rp.permission_code = 'settings.manage'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

-- Statement lines can only be added or changed by somebody who may upload
-- statements. Before this, anyone allowed to record entries could also
-- insert statement lines straight through the API, which is exactly the
-- fabrication this feature exists to rule out. (The categorise action runs
-- on the server's own connection and is unaffected.)
drop policy if exists bank_lines_insert on bank_statement_lines;--> statement-breakpoint
drop policy if exists bank_lines_update on bank_statement_lines;--> statement-breakpoint
create policy bank_lines_insert on bank_statement_lines for insert to authenticated
  with check (private.can_access_center('bank.import', center_id, null));
