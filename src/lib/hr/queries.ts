import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { centers, compDayRequests, companyHolidays, employeeOptionalHolidays, employees, leaveRequests, profiles } from "@/lib/db/schema";

import { leaveBalance, workingDates, type LeaveBalance, type LeavePolicy } from "./leave";
import { probationLopDays } from "@/lib/payroll/calc";
import { loadHolidays, loadPolicy } from "./service";
import { loadWeek, weeklyOffOf } from "./schedule";

/**
 * Reads for the HR pages, on the direct connection. Each page checks who is
 * asking before calling these: they apply no scoping of their own.
 */

export type EmployeeRow = typeof employees.$inferSelect;

export async function getEmployees(): Promise<Array<EmployeeRow & { managerName: string | null; centerName: string | null; loginName: string | null }>> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select e.*, m.name as manager_name, c.name as center_name, p.full_name as login_name
    from employees e
    left join employees m on m.id = e.reports_to_id
    left join centers c on c.id = e.center_id
    left join profiles p on p.id = e.user_id
    where e.deleted_at is null
    order by e.status, e.name
  `);
  return [...rows].map((r) => ({
    id: String(r.id),
    empNo: String(r.emp_no),
    userId: (r.user_id as string | null) ?? null,
    name: String(r.name),
    designation: (r.designation as string | null) ?? null,
    department: (r.department as string | null) ?? null,
    centerId: (r.center_id as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    dateOfJoining: (r.date_of_joining as string | null) ?? null,
    reportsToId: (r.reports_to_id as string | null) ?? null,
    openingSl: r.opening_sl === null ? null : Number(r.opening_sl),
    openingCl: r.opening_cl === null ? null : Number(r.opening_cl),
    openingAsOf: (r.opening_as_of as string | null) ?? null,
    biometricCode: (r.biometric_code as string | null) ?? null,
    status: r.status as "active" | "inactive",
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: new Date(String(r.created_at)),
    updatedAt: new Date(String(r.updated_at)),
    deletedAt: null,
    managerName: (r.manager_name as string | null) ?? null,
    centerName: (r.center_name as string | null) ?? null,
    loginName: (r.login_name as string | null) ?? null,
  }));
}

export async function getEmployee(id: string) {
  const [row] = await db.select().from(employees).where(and(eq(employees.id, id), isNull(employees.deletedAt)));
  return row ?? null;
}

/** Logins that could be linked to an employee: active users. */
export async function getLoginOptions(): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({ id: profiles.id, name: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.isActive, true))
    .orderBy(asc(profiles.fullName));
  return rows;
}

export async function getCenterOptions(): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: centers.id, name: centers.name }).from(centers).where(eq(centers.isActive, true)).orderBy(asc(centers.name));
}

export interface RequestRow {
  id: string;
  leaveNo: number;
  employeeId: string;
  employeeName: string;
  kind: "sick" | "casual" | "lop" | "half_day";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approverUserId: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

export async function getRequests(filter: { employeeId?: string; employeeIds?: string[]; status?: string; limit?: number } = {}): Promise<RequestRow[]> {
  const conditions = [];
  if (filter.employeeId) conditions.push(eq(leaveRequests.employeeId, filter.employeeId));
  if (filter.employeeIds) {
    if (filter.employeeIds.length === 0) return [];
    conditions.push(inArray(leaveRequests.employeeId, filter.employeeIds));
  }
  if (filter.status) conditions.push(eq(leaveRequests.status, filter.status as RequestRow["status"]));
  const rows = await db
    .select({
      r: leaveRequests,
      employeeName: employees.name,
      decidedByName: profiles.fullName,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(profiles, eq(profiles.id, leaveRequests.decidedBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leaveRequests.createdAt))
    .limit(filter.limit ?? 300);
  return rows.map(({ r, employeeName, decidedByName }) => ({
    id: r.id,
    leaveNo: r.leaveNo,
    employeeId: r.employeeId,
    employeeName,
    kind: r.kind,
    fromDate: r.fromDate,
    toDate: r.toDate,
    days: r.days,
    reason: r.reason,
    status: r.status,
    approverUserId: r.approverUserId,
    decidedByName,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt,
  }));
}

export async function getRequest(id: string): Promise<RequestRow | null> {
  const [row] = await db
    .select({ r: leaveRequests, employeeName: employees.name, decidedByName: profiles.fullName })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(profiles, eq(profiles.id, leaveRequests.decidedBy))
    .where(eq(leaveRequests.id, id));
  if (!row) return null;
  const { r, employeeName, decidedByName } = row;
  return {
    id: r.id,
    leaveNo: r.leaveNo,
    employeeId: r.employeeId,
    employeeName,
    kind: r.kind,
    fromDate: r.fromDate,
    toDate: r.toDate,
    days: r.days,
    reason: r.reason,
    status: r.status,
    approverUserId: r.approverUserId,
    decidedByName,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt,
  };
}

/** Direct reports of the person with this login. */
export async function getDirectReports(userId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select e.id, e.name from employees e join employees m on m.id = e.reports_to_id
    where m.user_id = ${userId}::uuid and e.deleted_at is null and e.status = 'active' order by e.name
  `);
  return [...rows];
}

const monthEnd = (month: string) =>
  `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;

/** The latest current payslip's closing leave balances for each employee, within a year. */
async function latestClosings(employeeIds: string[], year: number): Promise<Map<string, { asOf: string; sl: number; cl: number }>> {
  const out = new Map<string, { asOf: string; sl: number; cl: number }>();
  if (employeeIds.length === 0) return out;
  const rows = await db.execute<{ employee_id: string; month: string; sl: string | number; cl: string | number }>(sql`
    select distinct on (employee_id) employee_id, month, sl_closing as sl, cl_closing as cl
    from payslips
    where status = 'current' and month like ${`${year}-%`}
    order by employee_id, month desc
  `);
  for (const r of rows) out.set(r.employee_id, { asOf: monthEnd(r.month), sl: Number(r.sl), cl: Number(r.cl) });
  return out;
}

export async function balanceFor(employee: EmployeeRow, year: number, policy?: LeavePolicy): Promise<LeaveBalance & { probationLop: number }> {
  const base = policy ?? (await loadPolicy(db));
  // Their own days off, not the company's.
  const p = { ...base, weeklyOff: weeklyOffOf((await loadWeek(db, employee.id)).week) };
  const holidays = new Set((await loadHolidays(db, employee.centerId, employee.id)).map((h) => h.onDate));
  const requests = await db
    .select({ kind: leaveRequests.kind, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, employee.id));
  const closing = (await latestClosings([employee.id], year)).get(employee.id) ?? null;
  const balance = leaveBalance({ employee, year, policy: p, requests, holidays, closing });

  // Approved sick/casual days that probation will turn into loss of pay.
  const days = requests
    .filter((r) => r.status === "approved" && (r.kind === "sick" || r.kind === "casual"))
    .flatMap((r) => workingDates(r.fromDate, r.toDate, holidays, p.weeklyOff).map((date) => ({ date, type: r.kind as "sick" | "casual" })));
  const probationLop = probationLopDays({ days, year, dateOfJoining: employee.dateOfJoining, leave: p });
  return { ...balance, probationLop };
}

/** Everyone's balances for the year, in one pass. */
export async function balancesForAll(list: EmployeeRow[], year: number): Promise<Map<string, LeaveBalance>> {
  const policy = await loadPolicy(db);
  const allRequests = await db
    .select({ employeeId: leaveRequests.employeeId, kind: leaveRequests.kind, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, status: leaveRequests.status })
    .from(leaveRequests);
  const byEmployee = new Map<string, typeof allRequests>();
  for (const r of allRequests) byEmployee.set(r.employeeId, [...(byEmployee.get(r.employeeId) ?? []), r]);

  const closings = await latestClosings(list.map((e) => e.id), year);
  const holidayCache = new Map<string, Set<string>>();
  const out = new Map<string, LeaveBalance>();
  const centerKeys = [...new Set(list.map((e) => e.centerId))];
  const [weeks, holidayLists] = await Promise.all([
    Promise.all(list.map((e) => loadWeek(db, e.id))),
    Promise.all(centerKeys.map((c) => loadHolidays(db, c))),
  ]);
  centerKeys.forEach((c, i) => holidayCache.set(c ?? "all", new Set(holidayLists[i].map((h) => h.onDate))));
  // Each person's own optional holiday joins the shared list for them alone.
  const picks = await db
    .select({ employeeId: employeeOptionalHolidays.employeeId, onDate: companyHolidays.onDate })
    .from(employeeOptionalHolidays)
    .innerJoin(companyHolidays, eq(companyHolidays.id, employeeOptionalHolidays.holidayId))
    .where(isNull(companyHolidays.deletedAt));
  const picksBy = new Map<string, string[]>();
  for (const p of picks) picksBy.set(p.employeeId, [...(picksBy.get(p.employeeId) ?? []), p.onDate]);
  for (const [i, e] of list.entries()) {
    const shared = holidayCache.get(e.centerId ?? "all") ?? new Set<string>();
    const holidays = picksBy.has(e.id) ? new Set([...shared, ...(picksBy.get(e.id) ?? [])]) : shared;
    const own = { ...policy, weeklyOff: weeklyOffOf(weeks[i].week) };
    out.set(e.id, leaveBalance({ employee: e, year, policy: own, requests: byEmployee.get(e.id) ?? [], holidays, closing: closings.get(e.id) ?? null }));
  }
  return out;
}

export interface CompRow {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  workPart: "full" | "half";
  offDate: string;
  offPart: "full" | "half";
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionNote: string | null;
  decidedByName: string | null;
}

/** Comp working day requests, newest first. */
export async function getCompRequests(filter: { employeeId?: string; employeeIds?: string[]; status?: string; limit?: number } = {}): Promise<CompRow[]> {
  const conditions = [];
  if (filter.employeeId) conditions.push(eq(compDayRequests.employeeId, filter.employeeId));
  if (filter.employeeIds) {
    if (filter.employeeIds.length === 0) return [];
    conditions.push(inArray(compDayRequests.employeeId, filter.employeeIds));
  }
  if (filter.status) conditions.push(eq(compDayRequests.status, filter.status as CompRow["status"]));
  const rows = await db
    .select({ r: compDayRequests, employeeName: employees.name, decidedByName: profiles.fullName })
    .from(compDayRequests)
    .innerJoin(employees, eq(employees.id, compDayRequests.employeeId))
    .leftJoin(profiles, eq(profiles.id, compDayRequests.decidedBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(compDayRequests.createdAt))
    .limit(filter.limit ?? 100);
  return rows.map(({ r, employeeName, decidedByName }) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    decidedByName,
    workDate: r.workDate,
    workPart: r.workPart,
    offDate: r.offDate,
    offPart: r.offPart,
    reason: r.reason,
    status: r.status,
    decisionNote: r.decisionNote,
  }));
}
