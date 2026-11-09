import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { companyHolidays, employeeOptionalHolidays, employees, hrSettings, leaveRequests, type LeaveKind } from "@/lib/db/schema";

import { countLeaveDays, rangesOverlap, type LeavePolicy } from "./leave";
import { loadWeek, weeklyOffOf } from "./schedule";

/**
 * The writes behind leave: applying, deciding, cancelling. Kept apart from
 * the Server Actions so the rules can be tested against a real database
 * without a login. Callers have already established who is asking; what is
 * checked here is what is true of the request, and who may act on it.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function loadPolicy(tx: DbExecutor): Promise<LeavePolicy> {
  const [row] = await tx.select().from(hrSettings).where(eq(hrSettings.id, 1));
  return {
    annualSick: row?.annualSick ?? 6,
    annualCasual: row?.annualCasual ?? 6,
    joiningMonthCounts: row?.joiningMonthCounts ?? true,
    probationMonths: row?.probationMonths ?? 6,
    probationPaidPerMonth: row?.probationPaidPerMonth ?? 1,
    weeklyOff: row?.weeklyOff ?? [0],
  };
}

/**
 * Company holidays that apply to a centre (or to every centre).
 *
 * Optional holidays are left out unless `employeeId` is given and that person
 * has chosen them: an optional holiday is a holiday only for whoever took it.
 */
export async function loadHolidays(
  tx: DbExecutor,
  centerId: string | null,
  employeeId?: string | null,
): Promise<Array<{ onDate: string; name: string }>> {
  const [rows, picks] = await Promise.all([
    tx
      .select({
        id: companyHolidays.id,
        onDate: companyHolidays.onDate,
        name: companyHolidays.name,
        centerId: companyHolidays.centerId,
        isOptional: companyHolidays.isOptional,
      })
      .from(companyHolidays)
      .where(isNull(companyHolidays.deletedAt))
      .orderBy(companyHolidays.onDate),
    employeeId
      ? tx.select({ holidayId: employeeOptionalHolidays.holidayId }).from(employeeOptionalHolidays).where(eq(employeeOptionalHolidays.employeeId, employeeId))
      : Promise.resolve([] as Array<{ holidayId: string }>),
  ]);
  const chosen = new Set(picks.map((p) => p.holidayId));
  return rows
    .filter((r) => (r.centerId === null || r.centerId === centerId) && (!r.isOptional || chosen.has(r.id)))
    .map((r) => ({ onDate: r.onDate, name: r.name }));
}

export async function employeeForUser(tx: DbExecutor, userId: string) {
  const [row] = await tx
    .select()
    .from(employees)
    .where(and(eq(employees.userId, userId), isNull(employees.deletedAt)));
  return row ?? null;
}

/** The manager's login, if the employee has a manager who has one. */
export async function managerUserId(tx: DbExecutor, employeeId: string): Promise<string | null> {
  const [row] = await tx.execute<{ user_id: string | null }>(sql`
    select m.user_id from employees e join employees m on m.id = e.reports_to_id
    where e.id = ${employeeId}::uuid and m.deleted_at is null
  `);
  return row?.user_id ?? null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function applyForLeave(
  tx: DbExecutor,
  input: { employeeId: string; kind: LeaveKind; fromDate: string; toDate: string; reason: string | null },
): Promise<Result<{ id: string; leaveNo: number; days: number; approverUserId: string | null }>> {
  const { employeeId, kind } = input;
  if (!DATE.test(input.fromDate) || !DATE.test(input.toDate)) return { ok: false, error: "Pick the dates." };
  const toDate = kind === "half_day" ? input.fromDate : input.toDate;
  if (toDate < input.fromDate) return { ok: false, error: "The last day can't be before the first." };

  const [employee] = await tx.select().from(employees).where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)));
  if (!employee || employee.status !== "active") return { ok: false, error: "You can't apply for leave right now." };

  const policy = await loadPolicy(tx);
  const holidays = new Set((await loadHolidays(tx, employee.centerId, employee.id)).map((h) => h.onDate));
  // Their own working week: somebody whose day off is a Saturday is not charged leave for it.
  const weeklyOff = weeklyOffOf((await loadWeek(tx, employeeId)).week);
  const days = countLeaveDays(kind, input.fromDate, toDate, holidays, weeklyOff);
  if (days <= 0) return { ok: false, error: "Those dates are all days off or company holidays, so there is nothing to apply for." };

  // One person can't be on two leaves at once, and a cancelled or rejected
  // request no longer holds its days.
  const live = await tx
    .select({ fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, employeeId), inArray(leaveRequests.status, ["pending", "approved"])));
  if (live.some((r) => rangesOverlap(r.fromDate, r.toDate, input.fromDate, toDate))) {
    return { ok: false, error: "You already have leave applied for on some of those days." };
  }

  const approverUserId = await managerUserId(tx, employeeId);
  const [row] = await tx
    .insert(leaveRequests)
    .values({
      employeeId,
      kind,
      fromDate: input.fromDate,
      toDate,
      days,
      reason: input.reason?.trim() || null,
      approverUserId,
    })
    .returning({ id: leaveRequests.id, leaveNo: leaveRequests.leaveNo });
  return { ok: true, id: row.id, leaveNo: row.leaveNo, days, approverUserId };
}

/**
 * Who may approve or reject a request: HR, or the employee's manager, and
 * never the employee themselves, even if they are also HR.
 */
export async function canDecide(
  tx: DbExecutor,
  user: { id: string; isHr: boolean },
  request: { employeeId: string },
): Promise<boolean> {
  const [employee] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, request.employeeId));
  if (!employee) return false;
  if (employee.userId === user.id) return false;
  if (user.isHr) return true;
  return (await managerUserId(tx, request.employeeId)) === user.id;
}

export async function decideLeave(
  tx: DbExecutor,
  input: { requestId: string; user: { id: string; isHr: boolean }; decision: "approved" | "rejected"; note: string | null },
): Promise<Result<{ employeeId: string; employeeUserId: string | null; leaveNo: number }>> {
  const [request] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, input.requestId));
  if (!request) return { ok: false, error: "That request no longer exists." };
  if (!(await canDecide(tx, input.user, request))) return { ok: false, error: "You can't decide this one." };
  if (input.decision === "rejected" && !input.note?.trim()) return { ok: false, error: "Say why it is being turned down." };

  // Conditional on still being pending: two people deciding at once decide it once.
  const [done] = await tx
    .update(leaveRequests)
    .set({
      status: input.decision,
      decidedBy: input.user.id,
      decidedAt: sql`now()`,
      decisionNote: input.note?.trim() || null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(leaveRequests.id, input.requestId), eq(leaveRequests.status, "pending")))
    .returning({ id: leaveRequests.id });
  if (!done) return { ok: false, error: "That request was already decided." };

  const [employee] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, request.employeeId));
  return { ok: true, employeeId: request.employeeId, employeeUserId: employee?.userId ?? null, leaveNo: request.leaveNo };
}

/** The employee withdraws a request: while pending, or approved leave that has not started. */
export async function cancelLeave(
  tx: DbExecutor,
  input: { requestId: string; userId: string; today: string },
): Promise<Result> {
  const [request] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, input.requestId));
  if (!request) return { ok: false, error: "That request no longer exists." };
  const [employee] = await tx.select({ userId: employees.userId }).from(employees).where(eq(employees.id, request.employeeId));
  if (employee?.userId !== input.userId) return { ok: false, error: "That isn't your request." };
  if (request.status === "approved" && request.fromDate <= input.today) {
    return { ok: false, error: "That leave has already started. Ask HR." };
  }
  const [done] = await tx
    .update(leaveRequests)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(and(eq(leaveRequests.id, input.requestId), inArray(leaveRequests.status, ["pending", "approved"])))
    .returning({ id: leaveRequests.id });
  return done ? { ok: true } : { ok: false, error: "That request can't be withdrawn any more." };
}

/** Would giving somebody this manager create a loop (A reports to B who reports to A)? */
export async function wouldCreateCycle(tx: DbExecutor, employeeId: string, managerId: string): Promise<boolean> {
  let cursor: string | null = managerId;
  for (let hops = 0; cursor && hops < 50; hops++) {
    if (cursor === employeeId) return true;
    const [row]: Array<{ reportsToId: string | null }> = await tx
      .select({ reportsToId: employees.reportsToId })
      .from(employees)
      .where(eq(employees.id, cursor));
    cursor = row?.reportsToId ?? null;
  }
  return false;
}
