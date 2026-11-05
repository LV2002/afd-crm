/**
 * Applying for, approving and withdrawing leave, against a real database.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { companyHolidays, employees, leaveRequests } = await import("../src/lib/db/schema");
const { applyForLeave, cancelLeave, canDecide, decideLeave, wouldCreateCycle } = await import("../src/lib/hr/service");

const MARK = "HrLeaveTest";
let staff: string; // an employee
let boss: string; // their manager
let hr: string; // some other person
let staffUser: string;
let bossUser: string;
let hrUser: string;

async function sweep() {
  await db.execute(sql`delete from leave_requests where employee_id in (select id from employees where name like ${MARK + "%"})`);
  await db.delete(companyHolidays).where(like(companyHolidays.name, `${MARK}%`));
  await db.delete(employees).where(like(employees.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const profs = [...(await db.execute<{ id: string }>(sql`select id from profiles order by created_at limit 3`))].map((p) => p.id);
  if (profs.length < 3) throw new Error("Needs three profiles in the test database.");
  [staffUser, bossUser, hrUser] = profs;
  const [b] = await db.insert(employees).values({ empNo: `${MARK}-1`, name: `${MARK} boss`, userId: bossUser, dateOfJoining: "2020-01-01" }).returning({ id: employees.id });
  const [s] = await db
    .insert(employees)
    .values({ empNo: `${MARK}-2`, name: `${MARK} staff`, userId: staffUser, reportsToId: b.id, dateOfJoining: "2020-01-01" })
    .returning({ id: employees.id });
  const [h] = await db.insert(employees).values({ empNo: `${MARK}-3`, name: `${MARK} orphan`, dateOfJoining: "2020-01-01" }).returning({ id: employees.id });
  boss = b.id;
  staff = s.id;
  hr = h.id;
});
afterAll(sweep);

// Mon 2 Nov 2026 is a working day; Sunday 8 Nov is the weekly off.
const apply = (over: Partial<Parameters<typeof applyForLeave>[1]> = {}) =>
  applyForLeave(db, { employeeId: staff, kind: "casual", fromDate: "2026-11-02", toDate: "2026-11-04", reason: null, ...over });

describe("applying", () => {
  it("counts working days only, and names the manager as the approver", async () => {
    await db.execute(sql`delete from leave_requests where employee_id = ${staff}::uuid`);
    await db.insert(companyHolidays).values({ onDate: "2026-11-03", name: `${MARK} holiday` });
    const r = await apply();
    expect(r).toMatchObject({ ok: true, days: 2, approverUserId: bossUser });
  });

  it("refuses overlapping leave, but a withdrawn one frees its days", async () => {
    const clash = await apply({ fromDate: "2026-11-04", toDate: "2026-11-05" });
    expect(clash).toMatchObject({ ok: false });
    const [first] = await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, staff));
    expect(await cancelLeave(db, { requestId: first.id, userId: staffUser, today: "2026-11-01" })).toEqual({ ok: true });
    expect(await apply({ fromDate: "2026-11-04", toDate: "2026-11-05" })).toMatchObject({ ok: true });
  });

  it("refuses a request that is all days off, and a half day on a day off", async () => {
    expect(await apply({ fromDate: "2026-11-08", toDate: "2026-11-08" })).toMatchObject({ ok: false });
    expect(await apply({ kind: "half_day", fromDate: "2026-11-08", toDate: "2026-11-08" })).toMatchObject({ ok: false });
  });

  it("makes a half day one date and half a day", async () => {
    const r = await apply({ kind: "half_day", fromDate: "2026-11-16", toDate: "2026-11-20" });
    expect(r).toMatchObject({ ok: true, days: 0.5 });
  });

  it("sends an employee with no manager to HR (no approver named)", async () => {
    const r = await applyForLeave(db, { employeeId: hr, kind: "sick", fromDate: "2026-11-09", toDate: "2026-11-09", reason: null });
    expect(r).toMatchObject({ ok: true, approverUserId: null });
  });
});

describe("deciding", () => {
  it("lets the manager and HR decide, but never the employee, even if they are HR", async () => {
    const [req] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.employeeId, staff), eq(leaveRequests.status, "pending")));
    expect(await canDecide(db, { id: bossUser, isHr: false }, req)).toBe(true);
    expect(await canDecide(db, { id: hrUser, isHr: true }, req)).toBe(true);
    expect(await canDecide(db, { id: hrUser, isHr: false }, req)).toBe(false);
    expect(await canDecide(db, { id: staffUser, isHr: true }, req)).toBe(false);
  });

  it("decides once: a second decision on the same request is refused", async () => {
    const [req] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.employeeId, staff), eq(leaveRequests.status, "pending")));
    const first = await decideLeave(db, { requestId: req.id, user: { id: bossUser, isHr: false }, decision: "approved", note: null });
    const second = await decideLeave(db, { requestId: req.id, user: { id: hrUser, isHr: true }, decision: "rejected", note: "too late" });
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: false });
    const [after] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, req.id));
    expect(after).toMatchObject({ status: "approved", decidedBy: bossUser });
  });

  it("needs a reason to turn a request down", async () => {
    const [req] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.employeeId, hr), eq(leaveRequests.status, "pending")));
    const r = await decideLeave(db, { requestId: req.id, user: { id: hrUser, isHr: true }, decision: "rejected", note: " " });
    expect(r).toMatchObject({ ok: false });
  });

  it("will not let anybody else decide, and the employee cannot withdraw once it has started", async () => {
    const [approved] = await db.select().from(leaveRequests).where(eq(leaveRequests.status, "approved"));
    expect(await cancelLeave(db, { requestId: approved.id, userId: staffUser, today: approved.fromDate })).toMatchObject({ ok: false });
    expect(await cancelLeave(db, { requestId: approved.id, userId: bossUser, today: "2026-01-01" })).toMatchObject({ ok: false });
  });
});

describe("reporting lines", () => {
  it("refuses a loop in who reports to whom", async () => {
    expect(await wouldCreateCycle(db, boss, staff)).toBe(true);
    expect(await wouldCreateCycle(db, hr, staff)).toBe(false);
  });
});

describe("the database", () => {
  it("refuses a half day over several dates and a range that ends before it begins", async () => {
    await expect(
      db.insert(leaveRequests).values({ employeeId: staff, kind: "half_day", fromDate: "2026-12-01", toDate: "2026-12-02", days: 0.5 }),
    ).rejects.toThrow();
    await expect(
      db.insert(leaveRequests).values({ employeeId: staff, kind: "casual", fromDate: "2026-12-05", toDate: "2026-12-01", days: 1 }),
    ).rejects.toThrow();
  });
});
