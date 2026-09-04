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
import { enrolments, payments, students } from "./finance";

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
