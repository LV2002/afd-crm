import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";

/**
 * HR: people on the payroll, the leave policy, company holidays and leave
 * requests. Pay itself (salary, bank details, payslips) lives in tables of
 * its own, so that seeing who somebody is and who they report to never means
 * seeing what they earn.
 */

/** One row, always id 1: the leave rules. Config, not code. */
export const hrSettings = pgTable("hr_settings", {
  id: integer("id").primaryKey().default(1),
  annualSick: numeric("annual_sick", { precision: 4, scale: 1, mode: "number" }).notNull().default(6),
  annualCasual: numeric("annual_casual", { precision: 4, scale: 1, mode: "number" }).notNull().default(6),
  joiningMonthCounts: boolean("joining_month_counts").notNull().default(true),
  probationMonths: integer("probation_months").notNull().default(6),
  probationPaidPerMonth: numeric("probation_paid_per_month", { precision: 3, scale: 1, mode: "number" })
    .notNull()
    .default(1),
  /** 0 = Sunday. */
  weeklyOff: integer("weekly_off").array().notNull().default(sql`'{0}'`),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable(
  "employees",
  {
    id: idColumn(),
    empNo: text("emp_no").notNull(),
    /** The CRM login this employee uses to see their own leave and payslips. */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    designation: text("designation"),
    department: text("department"),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
    address: text("address"),
    dateOfJoining: date("date_of_joining"),
    reportsToId: uuid("reports_to_id").references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
    openingSl: numeric("opening_sl", { precision: 4, scale: 1, mode: "number" }),
    openingCl: numeric("opening_cl", { precision: 4, scale: 1, mode: "number" }),
    openingAsOf: date("opening_as_of"),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("employees_emp_no_uq").on(t.empNo).where(sql`deleted_at is null`),
    uniqueIndex("employees_user_uq").on(t.userId).where(sql`user_id is not null and deleted_at is null`),
    index("employees_reports_to_idx").on(t.reportsToId),
  ],
);

export const companyHolidays = pgTable(
  "company_holidays",
  {
    id: idColumn(),
    onDate: date("on_date").notNull(),
    name: text("name").notNull(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("company_holidays_uq").on(t.onDate, t.name).where(sql`deleted_at is null`)],
);

export type LeaveKind = "sick" | "casual" | "lop" | "half_day";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: idColumn(),
    /** Gapless reference printed on the leave slip. */
    leaveNo: bigserial("leave_no", { mode: "number" }).notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    kind: text("kind").$type<LeaveKind>().notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    days: numeric("days", { precision: 4, scale: 1, mode: "number" }).notNull(),
    reason: text("reason"),
    status: text("status").$type<LeaveStatus>().notNull().default("pending"),
    approverUserId: uuid("approver_user_id").references(() => profiles.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leave_requests_no_uq").on(t.leaveNo),
    index("leave_requests_employee_idx").on(t.employeeId, t.fromDate),
    index("leave_requests_status_idx").on(t.status, t.fromDate),
    check("leave_requests_days_positive", sql`days > 0`),
  ],
);
