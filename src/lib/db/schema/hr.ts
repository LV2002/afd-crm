import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";
import { profiles } from "./auth";
import { financeTransactions } from "./finance-ledger";
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
    /** The code this person has on the biometric device. */
    biometricCode: text("biometric_code"),
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

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export const payrollSettings = pgTable("payroll_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("afdindia"),
  companyAddress: text("company_address").notNull().default("3rd Floor, MI Arcade, Edapally Toll, Kochi"),
  lateAllowanceMin: integer("late_allowance_min").notNull().default(60),
  earlyAllowanceMin: integer("early_allowance_min").notNull().default(60),
  /** Null means the days in the month. */
  divisor: integer("divisor"),
  deductionFactor: numeric("deduction_factor", { precision: 4, scale: 2, mode: "number" }).notNull().default(0.5),
  contactEmail: text("contact_email").notNull().default("accounts@afdindia.com"),
  requireApproval: boolean("require_approval").notNull().default(true),
  /** HH:MM:SS. The shift the attendance report measures punches against. */
  shiftStart: time("shift_start").notNull().default("09:30"),
  shiftEnd: time("shift_end").notNull().default("17:30"),
  attendanceKeyHash: text("attendance_key_hash"),
  attendanceKeySetAt: timestamp("attendance_key_set_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeePay = pgTable("employee_pay", {
  employeeId: uuid("employee_id")
    .primaryKey()
    .references(() => employees.id, { onDelete: "restrict" }),
  basicPaise: bigint("basic_paise", { mode: "number" }).notNull().default(0),
  hraPaise: bigint("hra_paise", { mode: "number" }).notNull().default(0),
  otherPaise: bigint("other_paise", { mode: "number" }).notNull().default(0),
  medicalPaise: bigint("medical_paise", { mode: "number" }).notNull().default(0),
  pan: text("pan"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  openingAdvancePaise: bigint("opening_advance_paise", { mode: "number" }).notNull().default(0),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payRevisions = pgTable("pay_revisions", {
  id: idColumn(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" }),
  month: text("month").notNull(),
  effectiveDate: date("effective_date").notNull(),
  oldComponents: jsonb("old_components").$type<Record<string, number>>().notNull(),
  newComponents: jsonb("new_components").$type<Record<string, number>>().notNull(),
  oldDesignation: text("old_designation"),
  newDesignation: text("new_designation"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payslips = pgTable(
  "payslips",
  {
    id: idColumn(),
    slipNo: bigserial("slip_no", { mode: "number" }).notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    month: text("month").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"current" | "superseded">().notNull().default("current"),
    imported: boolean("imported").notNull().default(false),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    baseComponents: jsonb("base_components").$type<Record<string, number>>().notNull(),
    netPaise: bigint("net_paise", { mode: "number" }).notNull(),
    earningsPaise: bigint("earnings_paise", { mode: "number" }).notNull(),
    slClosing: numeric("sl_closing", { precision: 4, scale: 1, mode: "number" }).notNull(),
    clClosing: numeric("cl_closing", { precision: 4, scale: 1, mode: "number" }).notNull(),
    advanceClosingPaise: bigint("advance_closing_paise", { mode: "number" }).notNull().default(0),
    approvedBy: uuid("approved_by").references(() => profiles.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    generatedBy: uuid("generated_by").references(() => profiles.id, { onDelete: "set null" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payslips_slip_no_uq").on(t.slipNo),
    uniqueIndex("payslips_current_uq").on(t.employeeId, t.month).where(sql`status = 'current'`),
    index("payslips_month_idx").on(t.month, t.status),
  ],
);

export const payslipPayments = pgTable(
  "payslip_payments",
  {
    id: idColumn(),
    payslipId: uuid("payslip_id")
      .notNull()
      .references(() => payslips.id, { onDelete: "restrict" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => financeTransactions.id, { onDelete: "restrict" }),
    /** The part of this payment that was more than the payslip owed. It is an advance. */
    advancePaise: bigint("advance_paise", { mode: "number" }).notNull().default(0),
    /** The payslip whose "advance given" figure it was added to; null until the next payslip. */
    advanceAbsorbedBy: uuid("advance_absorbed_by").references((): AnyPgColumn => payslips.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payslip_payments_txn_uq").on(t.transactionId),
    index("payslip_payments_slip_idx").on(t.payslipId),
  ],
);

export const employeeSchedules = pgTable(
  "employee_schedules",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    isWorking: boolean("is_working").notNull().default(true),
    startTime: time("start_time"),
    endTime: time("end_time"),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.weekday] })],
);

export type AdjustmentKind = "present" | "comp_off" | "excused" | "worked_off_day";

export const attendanceAdjustments = pgTable(
  "attendance_adjustments",
  {
    id: idColumn(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    onDate: date("on_date").notNull(),
    kind: text("kind").$type<AdjustmentKind>().notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedBy: uuid("removed_by").references(() => profiles.id, { onDelete: "set null" }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("attendance_adjustments_live_uq").on(t.employeeId, t.onDate).where(sql`removed_at is null`)],
);

export const biometricDevices = pgTable(
  "biometric_devices",
  {
    id: idColumn(),
    serial: text("serial").notNull(),
    name: text("name"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("biometric_devices_serial_uq").on(t.serial)],
);

export const attendancePunches = pgTable(
  "attendance_punches",
  {
    id: idColumn(),
    deviceCode: text("device_code").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    punchedAt: timestamp("punched_at", { withTimezone: true }).notNull(),
    deviceSerial: text("device_serial").notNull().default(""),
    source: text("source").$type<"device" | "relay" | "csv">().notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attendance_punches_uq").on(t.deviceCode, t.punchedAt, t.deviceSerial),
    index("attendance_punches_employee_idx").on(t.employeeId, t.punchedAt),
  ],
);
