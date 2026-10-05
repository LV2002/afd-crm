# Chapter 9 — Finance

The **Finance** section is the institute's own money: what came in, what
went out, and what is in each account. It is separate from Chapter 7,
which is about one family's fees.

Counsellors cannot see any of it — the whole section is absent from their
sidebar, not merely disabled.

**Who can do what**

| | Read | Record entries | Manage accounts |
|---|---|---|---|
| Accounts | ✓ | ✓ | ✓ |
| Centre Head | ✓ (own centre) | ✓ | — |
| Admin / Co-Admin | ✓ | ✓ | ✓ |
| Counsellor / Academics | — | — | — |

## 9.1 The tabs

| Tab | What it is |
|---|---|
| **Dashboard** | Income, expenses and account balances at a glance |
| **Collections** | Who owes what, and how late |
| **Monthly** | One month: fees collected, other income, expenses |
| **Yearly** | The full year, with a GST note |
| **Cash flow** | Money in and out over time, cumulative |
| **Transactions** | Every entry, searchable |
| **Account ledger** | One account, entry by entry, with a running balance |
| **Record entry** | Add an expense, other income, or a transfer |
| **Bank & cash accounts** | The accounts themselves |

## 9.2 The four kinds of entry

Everything in the ledger is one of four kinds:

| Kind | Where it comes from |
|---|---|
| **Fee** | Written automatically when a student payment is recorded (Chapter 7.4). You never type one. |
| **Other income** | Typed by hand — study material sales, test series, workshops, late fees, sponsorship |
| **Expense** | Typed by hand — salaries, rent, electricity, ads… |
| **Transfer** | Money moved between two of your own accounts |

**Fee entries are not editable here.** They belong to a student's payment
and are corrected on that side.

## 9.3 Recording an expense

### Goal
Record money the institute has spent.

### Before you start
`finance.record` — Accounts, centre heads and administrators.

### Steps
1. Open **Finance** → **Record entry**.
2. Choose the **Expense** tab.
3. **Date** — the day the money actually moved, not today.
4. **Amount** — for example `12500`.
5. **Category** — Salaries, Rent, Mobile Bills & WiFi, Electricity,
   Printing, Google Ads, Meta Ads, Other Marketing, Bank Charges,
   Stationery & Office Supplies, Travel & Conveyance, Repairs &
   Maintenance, Software & Subscriptions, Professional Fees (CA/Legal),
   or Other Expenses. An administrator can add more.
6. **Description** — required. For example *September electricity bill*.
   Write what an accountant would need to recognise it in a year.
7. Choose the account it was paid from.
8. **Reference** — cheque number, UTR, invoice number.
9. Submit.

### What you should see
The entry appears in **Transactions** and in that account's ledger, and
the balance changes. It gets a transaction number from a gapless
sequence.

### Common mistakes and fixes
- **Using today's date for last month's bill.** The month-end report will
  be wrong. Use the real date.
- **A vague description.** *Payment* tells nobody anything.
- **Recording an ad spend by hand when the ad sync already imports it.**
  Check Ad Performance first — you may be double-counting.

## 9.4 Recording other income

Same as an expense, on the **Income** tab, with the other-income
categories: Study Material Sales, Test Series Sales, Workshop / Seminar
Income, Late Fee / Penalty Collected, Sponsorship / Grant, Other Income.

**Do not record student fees here.** Those come in automatically through
Chapter 7. Recording one by hand counts the money twice.

## 9.5 Recording a transfer

### Goal
Move money between the institute's own accounts — a cash deposit, a
withdrawal for petty cash.

### Steps
1. **Finance** → **Record entry** → the **Transfer** tab.
2. **Date**, **Amount** (for example `20000`).
3. **From** and **To** — the two accounts.
4. **Description** — for example *Cash withdrawal for petty cash*.
5. Submit.

### What you should see
Both balances change. A transfer is not income or expense and does not
appear in either report — it is the same money in a different place.

## 9.6 Bank and cash accounts

**Finance** → **Bank & cash accounts** (`finance.manage`: Accounts and
administrators).

Each account has a name, a type, a centre, an opening balance and a
current balance. The opening balance is what was in it on the day you
started using the CRM.

**Deleting an account is not how you retire one.** Entries reference it.
Stop using it instead.

## 9.7 Collections

**Finance** → **Collections** answers "who owes us money and how late are
they?"

Columns include **Student**, **Course**, **Instalment**, **Amount**,
**Days late**, and totals for **Total outstanding** and **Overdue**. It
also shows **Paid on time**, **Average delay (late only)** and **Worst
delay** — the numbers that tell you whether your payment plans are
realistic.

This is the working list for chasing fees. Payment reminders go out
automatically (Chapter 7.9), but somebody still has to ring.

## 9.8 The reports

- **Monthly** — one month: course fees by student, other income,
  expenses by category, with each category's **Share**.
- **Yearly** — the full year: **Gross fee collections**, **Total course
  fees**, **Total expenses**, and an **Indicative net of GST**.
- **Cash flow** — in and out over time, with a **Cumulative** column.

### A warning about the GST figure
The yearly report back-calculates the GST inside gross collections at the
rate in Settings → Organisation. **It is a memo, not a return.** Nothing
here tracks input credit or what has actually been remitted. Give your CA
the underlying numbers, not this line.

## 9.9 The account ledger

**Finance** → **Account ledger** shows one account with an **Opening**
balance, every entry in date order, a running **Balance**, and
**Balance now**. This is what you reconcile against a bank statement.

If it does not match, the usual causes are a missing entry, an entry
dated wrongly, or a transfer recorded as an expense.

---

[Back to contents](#contents)
