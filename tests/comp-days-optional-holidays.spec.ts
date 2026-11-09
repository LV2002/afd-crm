/**
 * Comp working days, optional holidays, and what they do to attendance.
 */
import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { companyHolidays, employees, leaveRequests } = await import("../src/lib/db/schema");
const { applyCompDay, approvedCompDays, cancelCompDay, decideCompDay } = await import("../src/lib/hr/comp-days");
const { chooseOptionalHoliday, clearOptionalChoice, optionalChoices } = await import("../src/lib/hr/optional-holidays");
const { applyForLeave, loadHolidays } = await import("../src/lib/hr/service");
const { buildAttendance } = await import("../src/lib/attendance/report");
const { defaultWeek } = await import("../src/lib/hr/schedule");

import { createTestUsers } from "./helpers/fixture-users";

const MARK = "CompOptTest";
let cleanupUsers: () => Promise<void>;
let staff: string;
let staffUser: string;
let bossUser: string;
let strangerUser: string;

async function sweep() {
  await db.execute(sql`delete from comp_day_requests where employee_id in (select id from employees where name like ${MARK + "%"})`);
  await db.execute(sql`delete from leave_requests where employee_id in (select id from employees where name like ${MARK + "%"})`);
  await db.delete(companyHolidays).where(like(companyHolidays.name, `${MARK}%`));
  await db.delete(employees).where(like(employees.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const users = await createTestUsers(["counsellor", "counsellor", "counsellor"]);
  cleanupUsers = users.cleanup;
  [staffUser, bossUser, strangerUser] = users.ids;
  const [b] = await db.insert(employees).values({ empNo: `${MARK}-1`, name: `${MARK} boss`, userId: bossUser, dateOfJoining: "2020-01-01" }).returning({ id: employees.id });
  const [s] = await db
    .insert(employees)
    .values({ empNo: `${MARK}-2`, name: `${MARK} staff`, userId: staffUser, reportsToId: b.id, dateOfJoining: "2020-01-01" })
    .returning({ id: employees.id });
  staff = s.id;
});
afterAll(async () => {
  await sweep();
  await cleanupUsers();
});

// Sunday 8 Nov 2026 is the weekly off; Mon 9, Tue 10, Wed 11 are working days.
const today = "2026-11-01";
const ask = (over: Partial<Parameters<typeof applyCompDay>[1]> = {}) =>
  applyCompDay(db, { employeeId: staff, workDate: "2026-11-08", workPart: "full", offDate: "2026-11-09", offPart: "full", reason: null, today, ...over });

describe("comp working days", () => {
  it("asks the manager, and refuses a working day as the day worked or a day off as the day taken", async () => {
    expect(await ask({ workDate: "2026-11-10" })).toMatchObject({ ok: false });
    expect(await ask({ offDate: "2026-11-15" })).toMatchObject({ ok: false });
    expect(await ask({ workPart: "half", offPart: "full" })).toMatchObject({ ok: false });
    expect(await ask({ offDate: "2026-10-30" })).toMatchObject({ ok: false });
    const r = await ask();
    expect(r).toMatchObject({ ok: true, approverUserId: bossUser });
  });

  it("will not use a day twice, and only the manager decides", async () => {
    expect(await ask({ offDate: "2026-11-10" })).toMatchObject({ ok: false });
    expect(await ask({ workDate: "2026-11-15", offDate: "2026-11-09" })).toMatchObject({ ok: false });
    const [{ id }] = await db.execute<{ id: string }>(sql`select id from comp_day_requests where employee_id = ${staff}::uuid`);
    expect(await decideCompDay(db, { requestId: id, user: { id: staffUser, isHr: false }, decision: "approved", note: null })).toMatchObject({ ok: false });
    expect(await decideCompDay(db, { requestId: id, user: { id: strangerUser, isHr: false }, decision: "approved", note: null })).toMatchObject({ ok: false });
    expect(await decideCompDay(db, { requestId: id, user: { id: bossUser, isHr: false }, decision: "approved", note: null })).toMatchObject({ ok: true });
    expect(await decideCompDay(db, { requestId: id, user: { id: bossUser, isHr: false }, decision: "approved", note: null })).toMatchObject({ ok: false });
  });

  it("reads approved swaps by month, and lets the employee withdraw one only before it starts", async () => {
    const comp = await approvedCompDays(db, staff, "2026-11");
    expect(comp.work.get("2026-11-08")).toBe("full");
    expect(comp.off.get("2026-11-09")).toBe("full");
    const [{ id }] = await db.execute<{ id: string }>(sql`select id from comp_day_requests where employee_id = ${staff}::uuid`);
    expect(await cancelCompDay(db, { requestId: id, userId: strangerUser, today })).toMatchObject({ ok: false });
    expect(await cancelCompDay(db, { requestId: id, userId: staffUser, today: "2026-11-08" })).toMatchObject({ ok: false });
    expect(await cancelCompDay(db, { requestId: id, userId: staffUser, today })).toEqual({ ok: true });
    expect((await approvedCompDays(db, staff, "2026-11")).off.size).toBe(0);
  });

  it("refuses a day that is already on leave", async () => {
    await applyForLeave(db, { employeeId: staff, kind: "casual", fromDate: "2026-11-11", toDate: "2026-11-11", reason: null });
    expect(await ask({ offDate: "2026-11-11" })).toMatchObject({ ok: false });
  });
});

describe("attendance with comp days", () => {
  const week = defaultWeek([0], "09:30", "17:30");
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
  const base = { month: "2026-11", week, holidays: new Set<string>(), dateOfJoining: "2020-01-01", leave: new Map<string, string>(), today: "2026-11-30" };

  it("does not charge a full comp day off, and notes the day worked", () => {
    const r = buildAttendance({
      ...base,
      compWork: new Map([["2026-11-08", "full" as const]]),
      compOff: new Map([["2026-11-09", "full" as const]]),
      punches: [at("2026-11-08", "09:30"), at("2026-11-08", "17:30")],
    });
    const day = (d: string) => r.days.find((x) => x.date === d)!;
    expect(day("2026-11-09").status).toBe("comp_off");
    expect(day("2026-11-08")).toMatchObject({ status: "off", workedOffDay: true, compWork: "full" });
    expect(r.suggestions.find((s) => s.date === "2026-11-09")).toBeUndefined();
    expect(r.compWorkMissed).toBe(0);
  });

  it("charges half a day for a half comp day with no punch at all, and nothing if they worked the other half", () => {
    const none = buildAttendance({ ...base, compOff: new Map([["2026-11-10", "half" as const]]), punches: [] });
    expect(none.suggestions).toContainEqual({ date: "2026-11-10", type: "half_day", notes: "Half-day comp off, and no punch for the other half" });
    const worked = buildAttendance({ ...base, compOff: new Map([["2026-11-10", "half" as const]]), punches: [at("2026-11-10", "09:30"), at("2026-11-10", "13:30")] });
    expect(worked.suggestions.filter((s) => s.date === "2026-11-10")).toEqual([]);
  });

  it("flags a comp working day that passed with no punch", () => {
    const r = buildAttendance({ ...base, compWork: new Map([["2026-11-08", "half" as const]]), punches: [] });
    expect(r.compWorkMissed).toBe(1);
  });
});

describe("optional holidays", () => {
  let goodFriday: string;
  let diwali: string;
  let muharram: string;

  beforeAll(async () => {
    const rows = await db
      .insert(companyHolidays)
      .values([
        { onDate: "2027-03-26", name: `${MARK} Good Friday`, isOptional: true },
        { onDate: "2027-11-05", name: `${MARK} Diwali`, isOptional: true },
        { onDate: "2027-07-17", name: `${MARK} Muharram`, isOptional: true },
      ])
      .returning({ id: companyHolidays.id, name: companyHolidays.name });
    const id = (n: string) => rows.find((r) => r.name.endsWith(n))!.id;
    goodFriday = id("Good Friday");
    diwali = id("Diwali");
    muharram = id("Muharram");
  });

  const take = (holidayId: string, t = "2027-01-02") =>
    chooseOptionalHoliday(db, { employeeId: staff, centerId: null, holidayId, userId: staffUser, today: t });

  it("is not a holiday for anybody until they take it", async () => {
    expect((await loadHolidays(db, null, staff)).filter((h) => h.name.startsWith(MARK))).toEqual([]);
    expect((await loadHolidays(db, null)).filter((h) => h.name.startsWith(MARK))).toEqual([]);
  });

  it("lets a person take one, closes the rest for the year, and makes it their holiday alone", async () => {
    expect(await take(diwali)).toMatchObject({ ok: true, name: `${MARK} Diwali` });
    expect(await take(goodFriday)).toMatchObject({ ok: false });
    expect(await take(muharram)).toMatchObject({ ok: false });
    expect((await loadHolidays(db, null, staff)).filter((h) => h.name.startsWith(MARK)).map((h) => h.name)).toEqual([`${MARK} Diwali`]);
    const choices = await optionalChoices(db, staff, null, 2027);
    expect(choices.options).toHaveLength(3);
    expect(choices.chosen?.name).toBe(`${MARK} Diwali`);
    const [other] = await db.insert(employees).values({ empNo: `${MARK}-9`, name: `${MARK} other` }).returning({ id: employees.id });
    expect((await loadHolidays(db, null, other.id)).filter((h) => h.name.startsWith(MARK))).toEqual([]);
  });

  it("cannot be applied for as leave once taken", async () => {
    const l = await applyForLeave(db, { employeeId: staff, kind: "casual", fromDate: "2027-11-05", toDate: "2027-11-05", reason: null });
    expect(l).toMatchObject({ ok: false });
  });

  it("can be reset by HR only while the day is still ahead", async () => {
    expect(await clearOptionalChoice(db, { employeeId: staff, year: 2027, today: "2027-11-05" })).toMatchObject({ ok: false });
    expect(await clearOptionalChoice(db, { employeeId: staff, year: 2027, today: "2027-01-02" })).toEqual({ ok: true });
    expect(await take(muharram)).toMatchObject({ ok: true });
  });

  it("cannot be taken after the day", async () => {
    await clearOptionalChoice(db, { employeeId: staff, year: 2027, today: "2027-01-02" });
    expect(await take(goodFriday, "2027-03-26")).toMatchObject({ ok: false });
  });
});
