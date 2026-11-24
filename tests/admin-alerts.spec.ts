/**
 * The admin hears about money a month late and leads nobody has touched in a
 * week, once each. Real database. The recipient is a throwaway user given the
 * event by a saved setting, so the test never depends on who is an admin.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const s = await import("../src/lib/db/schema");
const { alertOverduePayments, alertUncontactedLeads, severelyOverdue, ADMIN_OVERDUE_DAYS, ADMIN_UNCONTACTED_DAYS } = await import("../src/lib/alerts/admin-alerts");
const { NOTIFICATION_EVENTS } = await import("../src/lib/notifications/events");
const { createTestUsers } = await import("./helpers/fixture-users");

const MARK = "AdminAlertTest";
let userId: string;
let cleanupUsers: (() => Promise<void>) | undefined;
let centerId: string;
const leadIds: string[] = [];
const instalmentIds: string[] = [];

const dayOffset = (days: number) => new Date(Date.now() - days * 86_400_000);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const told = async (eventKey: string) =>
  db.select().from(s.notifications).where(and(eq(s.notifications.eventKey, eventKey), eq(s.notifications.recipientId, userId)));

async function newLead(tag: string, over: Record<string, unknown> = {}) {
  const [l] = await db
    .insert(s.leads)
    .values({ studentName: `${MARK} ${tag}`, primaryPhone: `+9198470${String(Math.floor(Math.random() * 90000) + 10000)}`, centerId, temperature: "not_contacted", interestedExams: ["NID"], examYear: "2027", ...over } as never)
    .returning({ id: s.leads.id });
  leadIds.push(l.id);
  return l.id;
}
const age = (id: string, days: number) => db.update(s.leads).set({ createdAt: dayOffset(days) }).where(eq(s.leads.id, id));

async function sweep() {
  const ls = await db.select({ id: s.leads.id }).from(s.leads).where(like(s.leads.studentName, `${MARK}%`));
  const ids = ls.map((l) => l.id);
  if (ids.length) {
    await db.delete(s.notifications).where(inArray(s.notifications.entityId, ids));
    await db.delete(s.interactions).where(inArray(s.interactions.leadId, ids));
    const es = await db.select({ id: s.enrolments.id }).from(s.enrolments).where(inArray(s.enrolments.leadId, ids));
    if (es.length) {
      const eIds = es.map((e) => e.id);
      const inst = await db.select({ id: s.enrolmentInstalments.id }).from(s.enrolmentInstalments).where(inArray(s.enrolmentInstalments.enrolmentId, eIds));
      if (inst.length) await db.delete(s.notifications).where(inArray(s.notifications.entityId, inst.map((i) => i.id)));
      await db.delete(s.enrolmentInstalments).where(inArray(s.enrolmentInstalments.enrolmentId, eIds));
      await db.delete(s.enrolments).where(inArray(s.enrolments.id, eIds));
    }
    await db.delete(s.leads).where(inArray(s.leads.id, ids));
  }
  await db.delete(s.notificationSettings).where(inArray(s.notificationSettings.eventKey, ["lead.uncontacted", "payment.overdue_severe"]));
  if (centerId) await db.delete(s.userCenters).where(eq(s.userCenters.centerId, centerId));
  await db.delete(s.centers).where(like(s.centers.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const users = await createTestUsers(["accounts"]);
  cleanupUsers = users.cleanup;
  userId = users.ids[0];
  centerId = (await db.insert(s.centers).values({ name: `${MARK} centre`, city: "Kochi" }).returning({ id: s.centers.id }))[0].id;
  await db.insert(s.userCenters).values({ userId, centerId });
  const [role] = await db.select({ id: s.roles.id }).from(s.roles).where(eq(s.roles.code, "accounts"));
  for (const key of ["lead.uncontacted", "payment.overdue_severe"]) {
    const def = NOTIFICATION_EVENTS.find((e) => e.key === key)!;
    await db.insert(s.notificationSettings).values({ eventKey: key, isEnabled: true, notifyRoles: [role.id], notifyOwner: false, channels: ["in_app"], titleTemplate: def.defaultTitle, bodyTemplate: def.defaultBody });
  }
});
afterAll(async () => {
  await sweep();
  await cleanupUsers?.();
});

describe("who counts as a month late", () => {
  const o = (id: string, dueDate: string) => ({ instalmentId: id, enrolmentId: "e", dueDate, outstandingPaise: 100 });
  it("takes instalments at least 30 days past due, oldest first, and leaves the rest", () => {
    const rows = severelyOverdue([o("a", "2026-10-25"), o("b", "2026-09-01"), o("c", "2026-10-26"), o("d", "2026-11-20")], "2026-11-24", ADMIN_OVERDUE_DAYS);
    expect(rows.map((r) => r.instalmentId)).toEqual(["b", "a"]);
    expect(rows[1].daysOverdue).toBe(30);
  });
  it("uses a month and a week as agreed", () => {
    expect(ADMIN_OVERDUE_DAYS).toBe(30);
    expect(ADMIN_UNCONTACTED_DAYS).toBe(7);
  });
});

describe("the admin's alert for a lead nobody has contacted in 7 days", () => {
  it("tells them once, and not again on the next run", async () => {
    const id = await newLead("stale");
    await age(id, 9);
    await alertUncontactedLeads();
    const first = (await told("lead.uncontacted")).filter((n) => n.entityId === id);
    expect(first).toHaveLength(1);
    expect(first[0].title).toContain(`${MARK} stale`);
    await alertUncontactedLeads();
    expect((await told("lead.uncontacted")).filter((n) => n.entityId === id)).toHaveLength(1);
  });

  it("leaves out a lead that is less than a week old", async () => {
    const id = await newLead("fresh");
    await age(id, 3);
    await alertUncontactedLeads();
    expect((await told("lead.uncontacted")).filter((n) => n.entityId === id)).toHaveLength(0);
  });

  it("leaves out a lead somebody has logged contact with", async () => {
    const id = await newLead("touched");
    await age(id, 12);
    await db.insert(s.interactions).values({ leadId: id, type: "call", direction: "outbound", nextAction: "Call back", nextFollowupAt: new Date(Date.now() + 86_400_000) } as never);
    await alertUncontactedLeads();
    expect((await told("lead.uncontacted")).filter((n) => n.entityId === id)).toHaveLength(0);
  });

  it("leaves out a lead that has moved on from Not contacted", async () => {
    const id = await newLead("moved", { temperature: "warm" });
    await age(id, 12);
    await alertUncontactedLeads();
    expect((await told("lead.uncontacted")).filter((n) => n.entityId === id)).toHaveLength(0);
  });

  it("leaves out a lead marked do not contact", async () => {
    const id = await newLead("dnc", { doNotContact: true });
    await age(id, 12);
    await alertUncontactedLeads();
    expect((await told("lead.uncontacted")).filter((n) => n.entityId === id)).toHaveLength(0);
  });
});

describe("the admin's alert for an instalment 30 days late", () => {
  async function admission(tag: string, dueDaysAgo: number) {
    const leadId = await newLead(tag);
    const [e] = await db
      .insert(s.enrolments)
      .values({ leadId, course: "Foundation", centerId, mode: "offline", academicYear: "2026-27", totalFeePaise: 5_000_000, netFeePaise: 5_000_000, salesToAccountsAt: dayOffset(80) })
      .returning({ id: s.enrolments.id });
    const [i] = await db.insert(s.enrolmentInstalments).values({ enrolmentId: e.id, sequence: 1, dueDate: dateOnly(dayOffset(dueDaysAgo)), amountPaise: 5_000_000 }).returning({ id: s.enrolmentInstalments.id });
    instalmentIds.push(i.id);
    return i.id;
  }
  const asOf = () => dateOnly(new Date());

  it("tells them once, with the days and the amount", async () => {
    const id = await admission("late40", 40);
    await alertOverduePayments(asOf());
    const rows = (await told("payment.overdue_severe")).filter((n) => n.entityId === id);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toMatch(/40 days late/);
    await alertOverduePayments(asOf());
    expect((await told("payment.overdue_severe")).filter((n) => n.entityId === id)).toHaveLength(1);
  });

  it("does not tell them about one that is only a little late", async () => {
    const id = await admission("late10", 10);
    await alertOverduePayments(asOf());
    expect((await told("payment.overdue_severe")).filter((n) => n.entityId === id)).toHaveLength(0);
  });
});

describe("who the new alerts go to by default", () => {
  it("is the admin, and nobody else", () => {
    for (const key of ["payment.overdue_severe", "lead.uncontacted"]) {
      const e = NOTIFICATION_EVENTS.find((x) => x.key === key)!;
      expect([...e.defaultNotifyRoleCodes]).toEqual(["admin"]);
      expect(e.defaultNotifyOwner).toBe(false);
    }
  });
  it("keeps the admin off the earlier payment alerts, and on leave and comp-day requests", () => {
    for (const key of ["payment.overdue", "payment.recorded", "payment.reversed"]) {
      expect([...NOTIFICATION_EVENTS.find((x) => x.key === key)!.defaultNotifyRoleCodes]).not.toContain("admin");
    }
    for (const key of ["leave.requested", "comp.requested"]) {
      expect([...NOTIFICATION_EVENTS.find((x) => x.key === key)!.defaultNotifyRoleCodes]).toContain("admin");
    }
  });
});
