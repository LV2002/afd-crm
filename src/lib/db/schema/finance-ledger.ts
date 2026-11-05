import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";
import { students } from "./academics";
import { enrolments, payments } from "./finance";

/**
 * The institute's own money — the CRM half of AFD's finance workbook.
 *
 * The workbook's core design is kept exactly, because it is the right one:
 * ONE ledger records every rupee, every other view is derived from it, and
 * nothing is ever edited or deleted. A mistake is corrected by appending a
 * mirrored negative row, so totals net out on their own and the trail
 * survives. That is the same rule `payments` already follows (CLAUDE.md
 * non-negotiable #7), extended from student fees to the whole business.
 *
 * One thing the spreadsheet could not do is enforce who sees it. There,
 * protection stopped editing but not reading — its own comment says so —
 * and anyone with the link could open every tab or take a copy. Here it is
 * RLS: `finance.read` decides, a centre head sees their own centre, and a
 * counsellor sees nothing at all.
 */

export const financeAccountTypeEnum = pgEnum("finance_account_type", [
  "bank",
  "cash",
  "petty_cash",
]);

/**
 * Every bank account, cash box and petty cash float, by centre.
 *
 * Rows rather than the three fixed ledgers the workbook started with: a
 * second bank account, or a fourth centre, is data an admin adds, not a
 * schema change. `opening_balance_paise` is the balance on the day the CRM
 * took over; the current balance is that plus everything the ledger says,
 * never a stored counter.
 */
export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: idColumn(),
    name: text("name").notNull(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "restrict" }),
    type: financeAccountTypeEnum("type").notNull(),
    openingBalancePaise: bigint("opening_balance_paise", { mode: "number" }).notNull().default(0),
    /**
     * Petty cash only: the float this box is topped up to. A balance
     * below a fifth of it is flagged, which is what the workbook's
     * "Petty Cash Float" config did — per account here, because two
     * centres run different floats.
     */
    floatPaise: bigint("float_paise", { mode: "number" }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("finance_accounts_name_uq").on(t.name).where(sql`deleted_at is null`),
    index("finance_accounts_center_idx").on(t.centerId),
  ],
);

export const financeDirectionEnum = pgEnum("finance_direction", [
  "in",
  "out",
  "transfer_in",
  "transfer_out",
]);

/**
 * What kind of money this is, independent of which way it moved.
 *
 * The workbook inferred this from the category string ("Course Fees" meant
 * a student payment). A column is better: a category is a label an admin
 * can rename, and a report that breaks when somebody renames "Course Fees"
 * is a report that will break.
 */
export const financeKindEnum = pgEnum("finance_kind", [
  "fee",
  "other_income",
  "expense",
  "transfer",
]);

export const financeTransactions = pgTable(
  "finance_transactions",
  {
    id: idColumn(),
    /** Human reference, gapless from a DB sequence — same approach as receipts. */
    txnNo: bigserial("txn_no", { mode: "number" }).notNull(),

    /** The date the money actually moved, which is not the date it was typed in. */
    occurredOn: date("occurred_on").notNull(),
    direction: financeDirectionEnum("direction").notNull(),
    kind: financeKindEnum("kind").notNull(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "restrict" }),
    /**
     * Copied from the account at write time, exactly as the workbook does.
     * Resolving it live would rewrite history the day an account is moved
     * between centres, and a centre's past months must not change.
     */
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "restrict" }),

    /**
     * A `dropdown_options` value — category `finance_expense_category` or
     * `finance_income_category`. Not a hard FK: dropdown options are keyed
     * by id, and the same soft-reference-by-value pattern is already used
     * for `leads.temperature`. Fees and transfers carry a fixed label.
     */
    category: text("category").notNull(),

    /**
     * Negative on a reversal, and that is the whole mechanism: the pair
     * sums to zero, so every total corrects itself with no row rewritten.
     */
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),

    description: text("description").notNull(),
    /** Bill number, cheque number, UPI reference — whatever proves it. */
    reference: text("reference"),

    /** Set on fee rows, so a student's payments and the cash ledger are one record. */
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    enrolmentId: uuid("enrolment_id").references(() => enrolments.id, { onDelete: "restrict" }),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    /** Denormalised so the ledger reads without a join, as the sheet does. */
    studentName: text("student_name"),
    course: text("course"),

    /** The two legs of one transfer share this, so they can be shown as a pair. */
    transferGroupId: uuid("transfer_group_id"),

    /**
     * The row this one reverses. A transaction is "reversed" when some
     * other row points at it — DERIVED, never a status column that would
     * have to be updated. Updating a row in an append-only ledger is the
     * thing this design exists to prevent, and the workbook's `Status`
     * column was the one place it broke its own rule.
     */
    reversesTransactionId: uuid("reverses_transaction_id").references(
      (): AnyPgColumn => financeTransactions.id,
      { onDelete: "restrict" },
    ),
    reversalReason: text("reversal_reason"),

    recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    /** Which screen it came from, for the audit trail. */
    source: text("source"),

    // No updatedAt and no deletedAt, deliberately: a row here is never
    // touched again after insert. The RLS migration backs this up with no
    // UPDATE or DELETE policy for any role.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("finance_txn_account_date_idx").on(t.accountId, t.occurredOn),
    index("finance_txn_center_date_idx").on(t.centerId, t.occurredOn),
    index("finance_txn_kind_date_idx").on(t.kind, t.occurredOn),
    uniqueIndex("finance_txn_no_uq").on(t.txnNo),
    // One reversal per transaction. Without this, two people hitting
    // reverse at the same moment would each append a mirror row and the
    // account would end up short by the amount, twice.
    uniqueIndex("finance_txn_reverses_uq")
      .on(t.reversesTransactionId)
      .where(sql`reverses_transaction_id is not null`),
    check("finance_txn_amount_nonzero", sql`amount_paise <> 0`),
  ],
);

export const bankLineStatusEnum = pgEnum("bank_line_status", ["pending", "posted", "skipped"]);

/**
 * One line from a bank statement, waiting for the accountant to say what it
 * was.
 *
 * This is a worklist, not the ledger and not a copy of the statement. The
 * uploaded file is parsed in memory and thrown away (see
 * `lib/finance/bank-statement.ts`); what is saved is each transaction's
 * date, narration, direction and amount, which is the minimum needed to
 * categorise it and to recognise it if the same line turns up in a later,
 * overlapping upload. No file, no account number, no bank login.
 *
 * Because it is a worklist it changes: `pending` → `posted` (a ledger row
 * was appended and is linked here) or `skipped` (money that is not income
 * or an expense, such as a student fee already in the fee ledger). The
 * ledger it feeds stays append-only; nothing here ever edits it.
 */
export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: idColumn(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "restrict" }),
    /** Copied from the account when imported, as the ledger does. */
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "restrict" }),

    occurredOn: date("occurred_on").notNull(),
    particulars: text("particulars").notNull(),
    direction: text("direction").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    /** The bank's running balance after this line, kept to help spot a misread. */
    balancePaise: bigint("balance_paise", { mode: "number" }),
    /** What the accountant had already written beside the row, if anything. */
    note: text("note"),
    dateGuessed: boolean("date_guessed").notNull().default(false),

    /** Hash of the line's content: re-uploading the same line adds nothing. */
    fingerprint: text("fingerprint").notNull(),

    status: bankLineStatusEnum("status").notNull().default("pending"),
    transactionId: uuid("transaction_id").references(() => financeTransactions.id, {
      onDelete: "restrict",
    }),
    skipReason: text("skip_reason"),

    importedBy: uuid("imported_by").references(() => profiles.id, { onDelete: "set null" }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("bank_lines_fingerprint_uq").on(t.accountId, t.fingerprint),
    index("bank_lines_status_idx").on(t.accountId, t.status, t.occurredOn),
    index("bank_lines_center_idx").on(t.centerId, t.status),
    index("bank_lines_txn_idx").on(t.transactionId),
    check("bank_lines_direction", sql`direction in ('in', 'out')`),
    check("bank_lines_amount_positive", sql`amount_paise > 0`),
  ],
);

/**
 * One pairing of a bank statement line with the ledger entry it belongs to.
 *
 * The point of the whole table: every rupee the bank shows is accounted for
 * by an entry in the books, and every entry in a bank account is proved by a
 * line on the statement. A line or entry with no active pair is an exception
 * and is listed until somebody deals with it.
 *
 * Pairs are never deleted. Undoing one sets `active = false` and records who
 * and why, so a pair that was made and later undone is still visible. A
 * `waived` row (no ledger entry) is a line somebody with authority accepted
 * as having none, and is reviewable the same way.
 */
export const bankMatches = pgTable(
  "bank_matches",
  {
    id: idColumn(),
    bankLineId: uuid("bank_line_id")
      .notNull()
      .references(() => bankStatementLines.id, { onDelete: "restrict" }),
    transactionId: uuid("transaction_id").references(() => financeTransactions.id, {
      onDelete: "restrict",
    }),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "restrict" }),
    /** auto | categorised | manual | waived */
    method: text("method").$type<"auto" | "categorised" | "manual" | "waived">().notNull(),
    matchedBy: uuid("matched_by").references(() => profiles.id, { onDelete: "set null" }),
    note: text("note"),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
    unmatchedBy: uuid("unmatched_by").references(() => profiles.id, { onDelete: "set null" }),
    unmatchedAt: timestamp("unmatched_at", { withTimezone: true }),
    unmatchReason: text("unmatch_reason"),
  },
  (t) => [
    uniqueIndex("bank_matches_line_active_uq").on(t.bankLineId).where(sql`active`),
    uniqueIndex("bank_matches_txn_active_uq")
      .on(t.transactionId)
      .where(sql`active and transaction_id is not null`),
    index("bank_matches_center_idx").on(t.centerId, t.active),
    check("bank_matches_waiver_check", sql`(method = 'waived') = (transaction_id is null)`),
  ],
);
