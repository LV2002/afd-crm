import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { compDayRequests, employees, leaveRequests, type CompPart } from "@/lib/db/schema";

import { rangesOverlap } from "./leave";
import { loadWeek } from "./schedule";
import { canDecide, loadHolidays, managerUserId, type Result } from "./service";

/**
 * Working a day off in return for another day off.
 *
 * An employee asks to work on a day they would not (a weekly off or a holiday)
 * and to take a working day off instead, each as a full or a half day. Their
 * approver decides. Once approved, the attendance report treats the work day
 * as expected and the off day as covered, so payroll neither pays extra for
 * the first nor charges loss of pay for the second.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** How many days back a day already worked may be claimed. */
const BACKDATE_DAYS = 14;

export const PART_LABEL: Record<CompPart, string> = { full: "full day", half: "half day" };

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function applyCompDay(
  tx: DbExecutor,
  input: { employeeId: string; workDate: string; workPart: CompPart; offDate: string; offPart: CompPart; reason: string | null; today: string },
): Promise<Result<{ id: string; approverUserId: string | null }>> {
  const { employeeId, workDate, offDate, workPart, offPart } = input;
  if (!DATE.test(workDate) || !DATE.test(offDate)) return { ok: false, error: "Pick both dates." };
  if (workDate === offDate) return { ok: false, error: "The day you work and the day you take off have to be different days." };
  if (workPart !== "full" && workPart !== "half") return { ok: false, error: "Say whether you work a full or a half day." };
  if (offPart !== "full" && offPart !== "half") return { ok: false, error: "Say whether you take a full or a half day off." };
  if (offPart === "full" && workPart === "half") return { ok: false, error: "A half day's work earns a half day off, not a full one." };
  if (offDate < input.today) return { ok: false, error: "The day off can't be in the past." };
  if (workDate < addDays(input.today, -BACKDATE_DAYS)) return { ok: false, error: `A day worked more than ${BACKDATE_DAYS} days ago can't be claimed. Ask HR.` };

  const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee || employee.status !== "active" || employee.deletedAt) return { ok: false, error: "You can't make this request right now." };

  const { week } = await loadWeek(tx, employeeId);
  const holidays = new Set((await loadHolidays(tx, employee.centerId, employeeId)).map((h) => h.onDate));

  if (week[dow(workDate)].working && !holidays.has(workDate)) {
    return { ok: false, error: "That is one of your working days. A comp working day is for a day off or a holiday." };
  }
  if (holidays.has(offDate) || !week[dow(offDate)].working) {
    return { ok: false, error: "The day you take off has to be one of your normal working days." };
  }

  // Neither day may already be committed: to another swap, or to leave.
  const live = await tx
    .select()
    .from(compDayRequests)
    .where(and(eq(compDayRequests.employeeId, employeeId), inArray(compDayRequests.status, ["pending", "approved"])));
  const taken = new Set(live.flatMap((r) => [r.workDate, r.offDate]));
  if (taken.has(workDate) || taken.has(offDate)) return { ok: false, error: "One of those days is already part of another comp request." };

  const leave = await tx
    .select({ fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, employeeId), inArray(leaveRequests.status, ["pending", "approved"])));
  if (leave.some((r) => rangesOverlap(r.fromDate, r.toDate, offDate, offDate) || rangesOverlap(r.fromDate, r.toDate, workDate, workDate))) {
    return { ok: false, error: "You have leave applied for on one of those days." };
  }

  const approverUserId = await managerUserId(tx, employeeId);
  const [row] = await tx
    .insert(compDayRequests)
    .values({ employeeId, workDate, workPart, offDate, offPart, reason: input.reason?.trim() || null, approverUserId })
    .returning({ id: compDayRequests.id });
  return { ok: true, id: row.id, approverUserId };
}

export async function decideCompDay(
  tx: DbExecutor,
  input: { requestId: string; user: { id: string; isHr: boolean }; decision: "approved" | "rejected"; note: string | null },
): Promise<Result<{ employeeUserId: string | null }>> {
  const [request] = await tx.select().from(compDayRequests).where(eq(compDayRequests.id, input.requestId));
  if (!request) return { ok: false, error: "That request no longer exists." };
  if (!(await canDecide(tx, input.user, request))) return { ok: false, error: "You can't decide this one." };
  if (input.decision === "rejected" && !input.note?.trim()) return { ok: false, error: "Say why it is being turned down." };

  const [done] = await tx
    .update(compDayRequests)
    .set({ status: input.decision, decidedBy: input.user.id, decidedAt: sql`now()`, decisionNote: input.note?.trim() || null, updatedAt: sql`now()` })
    .where(and(eq(compDayRequests.id, input.requestId), eq(compDayRequests.status, "pending")))
    .returning({ id: compDayRequests.id });
  if (!done) return { ok: false, error: "That request was already decided." };

  const [employee] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, request.employeeId));
  return { ok: true, employeeUserId: employee?.userId ?? null };
}

/** The employee withdraws a request: while pending, or approved with the day off still to come. */
export async function cancelCompDay(tx: DbExecutor, input: { requestId: string; userId: string; today: string }): Promise<Result> {
  const [request] = await tx.select().from(compDayRequests).where(eq(compDayRequests.id, input.requestId));
  if (!request) return { ok: false, error: "That request no longer exists." };
  const [employee] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, request.employeeId));
  if (employee?.userId !== input.userId) return { ok: false, error: "That isn't your request." };
  if (request.status === "approved" && (request.offDate <= input.today || request.workDate <= input.today)) {
    return { ok: false, error: "That has already started. Ask HR." };
  }
  const [done] = await tx
    .update(compDayRequests)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(and(eq(compDayRequests.id, input.requestId), inArray(compDayRequests.status, ["pending", "approved"])))
    .returning({ id: compDayRequests.id });
  return done ? { ok: true } : { ok: false, error: "That request can't be withdrawn any more." };
}

/** Approved swaps that touch a month, as the attendance report reads them. */
export async function approvedCompDays(
  tx: DbExecutor,
  employeeId: string,
  month: string,
): Promise<{ work: Map<string, CompPart>; off: Map<string, CompPart> }> {
  const rows = await tx
    .select()
    .from(compDayRequests)
    .where(
      and(
        eq(compDayRequests.employeeId, employeeId),
        eq(compDayRequests.status, "approved"),
        or(sql`${compDayRequests.workDate}::text like ${`${month}-%`}`, sql`${compDayRequests.offDate}::text like ${`${month}-%`}`),
      ),
    );
  const work = new Map<string, CompPart>();
  const off = new Map<string, CompPart>();
  for (const r of rows) {
    if (r.workDate.startsWith(month)) work.set(r.workDate, r.workPart);
    if (r.offDate.startsWith(month)) off.set(r.offDate, r.offPart);
  }
  return { work, off };
}
