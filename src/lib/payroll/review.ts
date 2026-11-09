import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { employeePay, employees, payslips } from "@/lib/db/schema";
import { loadAttendanceReport } from "@/lib/attendance/load";

import type { PayrollEntry, PayrollResult } from "./calc";
import { approvedLeaveEntries, generatePayslip } from "./service";

/**
 * The month laid out for review before anything is generated: what each
 * person's payslip would be from the leave already approved and the
 * biometric punches, and what is missing or odd. Nothing here is saved.
 */

export type ReviewState = "generated" | "ready" | "blocked";

export interface ReviewRow {
  employeeId: string;
  name: string;
  state: ReviewState;
  /** Why it can't be generated, when blocked. */
  blocker?: string;
  /** The suggested entries the preview used. */
  entries: PayrollEntry[];
  result?: PayrollResult;
  flags: string[];
  slipId?: string;
}

export async function reviewMonth(
  tx: DbExecutor,
  month: string,
): Promise<ReviewRow[]> {
  const people = await tx
    .select()
    .from(employees)
    .where(and(isNull(employees.deletedAt), eq(employees.status, "active")))
    .orderBy(employees.name);

  // One person at a time cost a round of queries each; they are independent,
  // so run them together. Order is kept by mapping over the sorted list.
  return Promise.all(people.map((e) => reviewOne(tx, e, month)));
}

async function reviewOne(
  tx: DbExecutor,
  e: typeof employees.$inferSelect,
  month: string,
): Promise<ReviewRow> {
  {
    const [existing] = await tx
      .select({ id: payslips.id })
      .from(payslips)
      .where(
        and(
          eq(payslips.employeeId, e.id),
          eq(payslips.month, month),
          eq(payslips.status, "current"),
        ),
      );
    if (existing) {
      return {
        employeeId: e.id,
        name: e.name,
        state: "generated",
        entries: [],
        flags: [],
        slipId: existing.id,
      };
    }

    const [pay] = await tx
      .select({ id: employeePay.employeeId })
      .from(employeePay)
      .where(eq(employeePay.employeeId, e.id));
    if (!pay) {
      return {
        employeeId: e.id,
        name: e.name,
        state: "blocked",
        blocker: "No salary set yet",
        entries: [],
        flags: [],
      };
    }
    if (e.dateOfJoining && e.dateOfJoining > `${month}-31`) {
      return {
        employeeId: e.id,
        name: e.name,
        state: "blocked",
        blocker: "Joins after this month",
        entries: [],
        flags: [],
      };
    }

    const flags: string[] = [];
    let entries: PayrollEntry[] = [];
    const report = await loadAttendanceReport(tx, e.id, month);
    if (!report) {
      flags.push("No biometric code, so attendance wasn't checked");
    } else {
      const locked = new Set(
        (await approvedLeaveEntries(tx, e.id, month)).map((l) => l.date),
      );
      entries = report.suggestions.filter((s) => !locked.has(s.date));
      if (report.absentDays > 0)
        flags.push(
          `${report.absentDays} day${report.absentDays === 1 ? "" : "s"} with no punch`,
        );
      if (report.singlePunchDays > 0)
        flags.push(`${report.singlePunchDays} with one punch`);
      if (report.compOffTaken > 0)
        flags.push(`${report.compOffTaken} comp-off`);
      if (report.compWorkMissed > 0) flags.push(`${report.compWorkMissed} comp working day${report.compWorkMissed === 1 ? "" : "s"} with no punch`);
      if (report.workedOffDays > 0)
        flags.push(`${report.workedOffDays} worked on a day off`);
    }

    const preview = await generatePayslip(tx, {
      employeeId: e.id,
      month,
      money: {
        overtime: 0,
        arrears: 0,
        incentives: 0,
        insurance: 0,
        bonus: 0,
        advanceGiven: 0,
        advanceRepaid: 0,
      },
      entries,
      regenerate: false,
      userId: "",
      dryRun: true,
    });
    if (!preview.ok) {
      return {
        employeeId: e.id,
        name: e.name,
        state: "blocked",
        blocker: preview.error,
        entries,
        flags,
      };
    }
    return {
      employeeId: e.id,
      name: e.name,
      state: "ready",
      entries,
      result: preview.result,
      flags,
    };
  }
}
