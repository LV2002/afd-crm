/**
 * Storing punches, mapping codes, and the endpoints that receive them, against a real database.
 */
import { createHash } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { attendancePunches, biometricDevices, employees, payrollSettings } = await import("../src/lib/db/schema");
const { ingestPunches, mapCode } = await import("../src/lib/attendance/ingest");
const { parsePunchTime } = await import("../src/lib/attendance/parse");
const relay = await import("../src/app/api/webhooks/essl/route");
const device = await import("../src/app/iclock/cdata/route");

const MARK = "AttendanceTest";
const CODE = "T91001";
const KEY = "afd_test_key_for_attendance";
let empId: string;

async function sweep() {
  await db.delete(attendancePunches).where(like(attendancePunches.deviceCode, "T9%"));
  await db.delete(biometricDevices).where(like(biometricDevices.serial, "TEST%"));
  await db.delete(employees).where(like(employees.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const [e] = await db.insert(employees).values({ empNo: `${MARK}-1`, name: `${MARK} Ravi`, biometricCode: CODE }).returning({ id: employees.id });
  empId = e.id;
  await db.update(payrollSettings).set({ attendanceKeyHash: createHash("sha256").update(KEY).digest("hex") }).where(eq(payrollSettings.id, 1));
});
afterAll(async () => {
  await sweep();
  await db.update(payrollSettings).set({ attendanceKeyHash: null, attendanceKeySetAt: null }).where(eq(payrollSettings.id, 1));
});

const at = (s: string) => parsePunchTime(s) as Date;

describe("ingesting punches", () => {
  it("stores a punch once, however many times it is sent, and attaches it to the employee", async () => {
    const punches = [{ code: CODE, at: at("2026-11-03 09:41:00") }, { code: CODE, at: at("2026-11-03 17:35:00") }];
    expect(await ingestPunches(db, punches, { source: "relay" })).toMatchObject({ received: 2, added: 2, unmapped: [] });
    expect(await ingestPunches(db, punches, { source: "relay" })).toMatchObject({ received: 2, added: 0 });
    const rows = await db.select().from(attendancePunches).where(eq(attendancePunches.deviceCode, CODE));
    expect(rows.every((r) => r.employeeId === empId)).toBe(true);
  });

  it("keeps a punch whose code is nobody's, and gives it to them once they are mapped", async () => {
    const r = await ingestPunches(db, [{ code: "T91777", at: at("2026-11-03 09:00:00") }], { source: "csv" });
    expect(r.unmapped).toEqual(["T91777"]);
    const [orphan] = await db.select().from(attendancePunches).where(eq(attendancePunches.deviceCode, "T91777"));
    expect(orphan.employeeId).toBeNull();

    const [other] = await db.insert(employees).values({ empNo: `${MARK}-2`, name: `${MARK} Sita` }).returning({ id: employees.id });
    expect(await mapCode(db, { code: "T91777", employeeId: other.id })).toEqual({ ok: true, claimed: 1 });
    const [claimed] = await db.select().from(attendancePunches).where(eq(attendancePunches.deviceCode, "T91777"));
    expect(claimed.employeeId).toBe(other.id);
    // A code can belong to one person only.
    expect(await mapCode(db, { code: "T91777", employeeId: empId })).toMatchObject({ ok: false });
  });
});

describe("the relay endpoint", () => {
  const post = (body: unknown, key?: string) =>
    relay.POST(
      new Request("http://x/api/webhooks/essl", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
      }),
    );

  it("refuses a missing or wrong key, and stores nothing", async () => {
    const before = (await db.select().from(attendancePunches)).length;
    expect((await post({ punches: [{ code: CODE, time: "2026-11-04 09:00:00" }] })).status).toBe(401);
    expect((await post({ punches: [{ code: CODE, time: "2026-11-04 09:00:00" }] }, "wrong")).status).toBe(401);
    expect((await db.select().from(attendancePunches)).length).toBe(before);
  });

  it("accepts punches with the right key, and says what it could not read", async () => {
    const res = await post({ punches: [{ code: CODE, time: "2026-11-04 09:10:00" }, { code: CODE, time: "garbage" }] }, KEY);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, added: 1, skipped: 1 });
  });

  it("refuses a body that is not what it expects", async () => {
    expect((await post({ nope: true }, KEY)).status).toBe(400);
  });
});

describe("the device endpoint", () => {
  const url = (q: string) => `http://x/iclock/cdata?${q}`;

  it("ignores a device nobody registered", async () => {
    expect((await device.GET(new Request(url("SN=TESTUNKNOWN1")))).status).toBe(403);
    expect((await device.POST(new Request(url("SN=TESTUNKNOWN1&table=ATTLOG"), { method: "POST", body: `${CODE}\t2026-11-05 09:00:00\t0\t1` }))).status).toBe(403);
  });

  it("answers a registered device's handshake and stores what it pushes", async () => {
    await db.insert(biometricDevices).values({ serial: "TEST1234", name: "test" });
    const hello = await device.GET(new Request(url("SN=TEST1234&options=all")));
    expect(hello.status).toBe(200);
    expect(await hello.text()).toContain("ATTLOGStamp=None");

    const push = await device.POST(
      new Request(url("SN=TEST1234&table=ATTLOG&Stamp=1"), { method: "POST", body: `${CODE}\t2026-11-05 09:02:00\t0\t1\t0\n${CODE}\t2026-11-05 17:40:00\t1\t1\t0\n` }),
    );
    expect(await push.text()).toBe("OK: 2");
    const rows = await db.select().from(attendancePunches).where(eq(attendancePunches.deviceSerial, "TEST1234"));
    expect(rows).toHaveLength(2);
    const [dev] = await db.select().from(biometricDevices).where(eq(biometricDevices.serial, "TEST1234"));
    expect(dev.lastSeenAt).not.toBeNull();
  });
});

