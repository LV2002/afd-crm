-- Cash has no bank statement, so it is checked by counting it. And a bank
-- statement can be checked by comparing it with the balance the bank itself
-- shows. Both are written by the server only, and neither is ever edited.

alter table bank_statement_lines add column if not exists seq integer;--> statement-breakpoint

create table if not exists cash_counts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finance_accounts(id) on delete restrict,
  center_id uuid not null references centers(id) on delete restrict,
  counted_on date not null,
  counted_paise bigint not null check (counted_paise >= 0),
  -- What the books said the box should hold when it was counted. Stored, not
  -- recomputed, so the count stays true after later entries change the balance.
  expected_paise bigint not null,
  note text,
  counted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);--> statement-breakpoint
create index if not exists cash_counts_account_idx on cash_counts (account_id, counted_on desc);--> statement-breakpoint

create table if not exists bank_balance_checks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finance_accounts(id) on delete restrict,
  center_id uuid not null references centers(id) on delete restrict,
  as_of date not null,
  -- The balance somebody read off the bank's own app or passbook.
  bank_balance_paise bigint not null,
  -- What the imported statement says it was on that date, or null if the
  -- statement does not reach that date.
  statement_balance_paise bigint,
  note text,
  checked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);--> statement-breakpoint
create index if not exists bank_balance_checks_account_idx on bank_balance_checks (account_id, as_of desc);--> statement-breakpoint

alter table cash_counts enable row level security;--> statement-breakpoint
alter table bank_balance_checks enable row level security;--> statement-breakpoint
create policy cash_counts_select on cash_counts for select to authenticated
  using (private.can_access_center('finance.read', center_id, null));--> statement-breakpoint
create policy bank_balance_checks_select on bank_balance_checks for select to authenticated
  using (private.can_access_center('finance.read', center_id, null));--> statement-breakpoint

-- Accounts uploads the statements, as Leon wants. The protection moves from
-- "she cannot upload" to "what she uploads is checked": it has to continue
-- from the last statement, it can't rewrite earlier dates, and the admin
-- confirms the balance against the bank's own.
insert into role_permissions (role_id, permission_code, scope)
select r.id, 'bank.import', rp.scope
from roles r
join role_permissions rp on rp.role_id = r.id and rp.permission_code = 'finance.record'
where r.code = 'accounts'
on conflict (role_id, permission_code) do nothing;--> statement-breakpoint

-- Statement lines are inserted by the server after it has checked them, never
-- straight from a browser, whoever holds the upload permission.
drop policy if exists bank_lines_insert on bank_statement_lines;--> statement-breakpoint

update permissions set
  label = 'Upload bank statements',
  description = 'Upload a bank statement. What is uploaded is checked: it must continue from the last statement and cannot change dates already imported.'
where code = 'bank.import';--> statement-breakpoint
update permissions set
  label = 'Match and review bank and cash',
  description = 'Pair statement lines with entries by hand, undo a pair, accept a line as having no entry, confirm the bank balance and count the cash.'
where code = 'bank.reconcile';
