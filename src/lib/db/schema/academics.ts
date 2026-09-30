import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { leads } from "./leads";
import { centers } from "./org";

/**
 * The academics side of the chain: students, batches, and who is in which.
 *
 * Split out of `finance.ts` in September 2026. It had grown to hold the
 * whole of accounts *and* academics in one file, which quietly worked
 * against the separation the schema is supposed to make obvious —
 * CLAUDE.md's "academics must never have to query the sales table", and
 * `docs/01-DATA-MODEL.md`'s own "one file per group". A maintainer opening
 * `finance.ts` to change a fee should not find the student record there.
 *
 * The dependency runs one way and only one way: `enrolments` (finance)
 * points at `batches` here, and nothing here points back at finance.
 * `students.lead_id` is provenance, not a dependency — profile fields are
 * copied at the gate and diverge afterwards on purpose.
 */

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
