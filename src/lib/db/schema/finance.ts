import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
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
import { leads } from "./leads";

/**
 * Phase 4 foundation (docs/02-BUILD-PHASES.md § Phase 4, docs/01-DATA-MODEL.md
 * § Fees, enrolment, payments): the object model CLAUDE.md lists as
 * "Fixed in code" — lead → enrolment → student, and the two gates between
 * them. This session's pass deliberately scopes down from the full phase
 * (promos, discount_approvals, installments, documents, the registration
 * form builder, refunds) — see docs/DECISIONS.md for exactly what's
 * deferred and why. What's here is real: the ledger is genuinely
 * append-only from day one, both gates are genuinely irreversible via the
 * normal app paths, and nothing here will need a shape change to grow
 * into the fuller phase later — only new tables alongside it.
 */

export const feeStructures = pgTable(
  "fee_structures",
  {
    id: idColumn(),
    course: text("course").notNull(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "restrict" }),
    mode: text("mode").notNull(),
    academicYear: text("academic_year").notNull(),
    baseFeePaise: bigint("base_fee_paise", { mode: "number" }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("fee_structures_course_center_mode_year_uq").on(
      t.course,
      t.centerId,
      t.mode,
      t.academicYear,
    ),
  ],
);

export const enrolmentStatusEnum = pgEnum("enrolment_status", [
  "pending_payment",
  "active",
  "cancelled",
  "refunded",
]);

/**
 * The commercial record accounts owns. `lead_id` is required (an
 * enrolment always starts from a lead being confirmed); `student_id` is
 * null until the second gate creates the academic record.
 * `sales_to_accounts_at`/`accounts_to_academics_at` are the two named
 * gates (CLAUDE.md's lifecycle chain) — both timestamped, both set only
 * by the dedicated gate functions (`confirmAdmission()`,
 * `recordPayment()`'s first-payment branch), never by a generic field
 * edit. `batch_id` stays null until batch management exists (deferred).
 */
export const enrolments = pgTable("enrolments", {
  id: idColumn(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").references((): AnyPgColumn => students.id, { onDelete: "set null" }),
  course: text("course").notNull(),
  batchId: uuid("batch_id").references((): AnyPgColumn => batches.id, { onDelete: "set null" }),
  centerId: uuid("center_id")
    .notNull()
    .references(() => centers.id, { onDelete: "restrict" }),
  mode: text("mode").notNull(),
  academicYear: text("academic_year").notNull(),
  totalFeePaise: bigint("total_fee_paise", { mode: "number" }).notNull(),
  discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
  netFeePaise: bigint("net_fee_paise", { mode: "number" }).notNull(),
  status: enrolmentStatusEnum("status").notNull().default("pending_payment"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  salesToAccountsAt: timestamp("sales_to_accounts_at", { withTimezone: true }),
  salesToAccountsBy: uuid("sales_to_accounts_by").references(() => profiles.id, { onDelete: "set null" }),
  accountsToAcademicsAt: timestamp("accounts_to_academics_at", { withTimezone: true }),
  accountsToAcademicsBy: uuid("accounts_to_academics_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  ...timestamps(),
  ...softDelete(),
});

export const paymentDirectionEnum = pgEnum("payment_direction", ["credit", "debit"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "upi",
  "card",
  "neft",
  "cheque",
  "other",
]);

/**
 * CLAUDE.md non-negotiable #7: append-only. No `updated_at`, no
 * `deleted_at` — a row here is never touched again after insert, by
 * design, not just convention (the RLS migration backs this with no
 * UPDATE/DELETE policy for any role). A correction is a new row: another
 * insert with `reverses_payment_id` pointing at the original and
 * `direction: 'debit'`.
 */
export const payments = pgTable("payments", {
  id: idColumn(),
  enrolmentId: uuid("enrolment_id")
    .notNull()
    .references(() => enrolments.id, { onDelete: "restrict" }),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  direction: paymentDirectionEnum("direction").notNull(),
  method: paymentMethodEnum("method").notNull(),
  reference: text("reference"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
  reversesPaymentId: uuid("reverses_payment_id").references((): AnyPgColumn => payments.id, {
    onDelete: "set null",
  }),
  reversalReason: text("reversal_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `receipt_no` is `bigserial` — same gapless-via-DB-sequence approach
 * already used for `leads.lead_number`, not a second hand-rolled
 * mechanism. A sequence can skip a value on a rolled-back transaction;
 * that's the accepted meaning of "gapless" here (no receipt number is
 * ever reused or assigned by application code), same as any real
 * accounting system built on a DB sequence.
 */
export const receipts = pgTable("receipts", {
  id: idColumn(),
  receiptNo: bigserial("receipt_no", { mode: "number" }).notNull(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "restrict" }),
  enrolmentId: uuid("enrolment_id")
    .notNull()
    .references(() => enrolments.id, { onDelete: "restrict" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  issuedBy: uuid("issued_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studentStatusEnum = pgEnum("student_status", ["active", "on_hold", "completed", "dropped"]);

/**
 * The academics object, created only at the accounts->academics gate.
 * `lead_id` is provenance, not a dependency (CLAUDE.md: "academics must
 * never have to query the sales table") — profile fields are copied at
 * creation time, deliberately denormalised, and diverge from the lead
 * afterward on purpose.
 */
export const students = pgTable("students", {
  id: idColumn(),
  /**
   * The literal default is set in migration 0017 (`student_code_seq`),
   * not by drizzle-kit — mirrored here only so `.insert()` callers can
   * omit it, same as `leads.leadNumber`'s bigserial default. Keep this
   * expression in sync with 0017 if it ever changes.
   */
  studentCode: text("student_code")
    .notNull()
    .default(sql`('STU'::text || lpad((nextval('student_code_seq'::regclass))::text, 6, '0'::text))`),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  parentPhone: text("parent_phone"),
  email: text("email"),
  dob: date("dob"),
  centerId: uuid("center_id")
    .notNull()
    .references(() => centers.id, { onDelete: "restrict" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  status: studentStatusEnum("status").notNull().default("active"),
  targetExams: text("target_exams").array(),
  targetExamYear: text("target_exam_year"),
  currentCourse: text("current_course"),
  currentBatchId: uuid("current_batch_id").references((): AnyPgColumn => batches.id, {
    onDelete: "set null",
  }),
  /** Escape hatch for custom fields (field_definitions, entity='student', is_core=false) — no migration needed, same pattern as leads.custom. */
  custom: jsonb("custom").$type<Record<string, unknown>>(),
  ...timestamps(),
  ...softDelete(),
}, (t) => [uniqueIndex("students_student_code_uq").on(t.studentCode)]);

/**
 * Schema only this pass — no batch-management UI yet (deferred, see
 * docs/DECISIONS.md), so `batch_id` columns elsewhere stay null until a
 * later session builds the screen that creates rows here.
 */
export const batches = pgTable("batches", {
  id: idColumn(),
  name: text("name").notNull(),
  centerId: uuid("center_id")
    .notNull()
    .references(() => centers.id, { onDelete: "restrict" }),
  course: text("course").notNull(),
  mode: text("mode").notNull(),
  academicYear: text("academic_year").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  capacity: integer("capacity"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
  ...softDelete(),
});

export const studentBatches = pgTable("student_batches", {
  id: idColumn(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  reason: text("reason"),
});
