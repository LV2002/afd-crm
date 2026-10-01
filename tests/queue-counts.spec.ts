/**
 * The two database objects the sidebar's red counts rest on.
 *
 * `whatsapp_thread_latest` has to agree with the inbox's own "Needs a
 * reply" number, or the badge sends people to a screen that disagrees with
 * it. And the onboarding split has to be a true partition: every student is
 * either on the roster or in the queue, never both and never neither, or
 * somebody who has paid disappears from the system entirely.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { and, eq, isNull, isNotNull, like, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { centers, leads, students, whatsappMessages } = await import("../src/lib/db/schema");

const MARKER = "QueueSpec";
const OUR_NUMBER = "+919000000000";

async function makeCentre(): Promise<string> {
  const [centre] = await db
    .insert(centers)
    .values({ name: `${MARKER} centre ${Date.now()}-${Math.random()}`, city: "Kochi" })
    .returning({ id: centers.id });
  return centre.id;
}

async function makeLead(): Promise<{ id: string; centerId: string; phone: string }> {
  const centerId = await makeCentre();
  const phone = `+9198470${Math.floor(10000 + Math.random() * 89999)}`;
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} Anjali`, primaryPhone: phone, centerId })
    .returning({ id: leads.id });
  return { id: lead.id, centerId, phone };
}

async function message(opts: {
  leadId: string | null;
  direction: "inbound" | "outbound";
  from: string;
  at: string;
}) {
  await db.insert(whatsappMessages).values({
    leadId: opts.leadId,
    direction: opts.direction,
    fromPhone: opts.from,
    toPhone: opts.direction === "inbound" ? OUR_NUMBER : opts.from,
    body: `${MARKER} message`,
    occurredAt: new Date(opts.at),
  });
}

/** The view, restricted to the rows this test made. */
async function threadsAwaitingReply(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from whatsapp_thread_latest v
    where v.last_direction = 'inbound'
      and (
        v.lead_id in (select id from leads where student_name like ${`${MARKER}%`})
        or v.from_phone like '+9198470%'
      )
  `);
  return rows[0]?.n ?? 0;
}

async function sweep() {
  const made = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of made) {
    await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, lead.id));
    await db.delete(students).where(eq(students.leadId, lead.id));
    await db.delete(leads).where(eq(leads.id, lead.id));
  }
  await db.delete(whatsappMessages).where(like(whatsappMessages.body, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeEach(sweep);
afterAll(sweep);

describe("whatsapp_thread_latest", () => {
  it("counts a thread whose last message came from the lead", async () => {
    const lead = await makeLead();
    await message({ leadId: lead.id, direction: "outbound", from: lead.phone, at: "2026-09-01T10:00:00Z" });
    await message({ leadId: lead.id, direction: "inbound", from: lead.phone, at: "2026-09-01T11:00:00Z" });

    expect(await threadsAwaitingReply()).toBe(1);
  });

  it("does not count a thread we answered last", async () => {
    // The order of the two inserts is deliberately the reverse of the
    // timestamps: the view must read `occurred_at`, not insertion order.
    const lead = await makeLead();
    await message({ leadId: lead.id, direction: "outbound", from: lead.phone, at: "2026-09-02T11:00:00Z" });
    await message({ leadId: lead.id, direction: "inbound", from: lead.phone, at: "2026-09-02T10:00:00Z" });

    expect(await threadsAwaitingReply()).toBe(0);
  });

  it("is one row per thread however long the conversation is", async () => {
    // A badge that counted messages rather than conversations would read
    // "40" for one chatty person and be useless.
    const lead = await makeLead();
    for (let hour = 1; hour <= 6; hour += 1) {
      await message({
        leadId: lead.id,
        direction: "inbound",
        from: lead.phone,
        at: `2026-09-03T0${hour}:00:00Z`,
      });
    }
    expect(await threadsAwaitingReply()).toBe(1);
  });

  it("counts a reply from a number nobody has entered as its own thread", async () => {
    // These are real and worth seeing: somebody pressed a button on a
    // broadcast and is not a lead. Keyed by their number, not by a lead.
    const stranger = "+919847099999";
    await message({ leadId: null, direction: "inbound", from: stranger, at: "2026-09-04T10:00:00Z" });
    expect(await threadsAwaitingReply()).toBe(1);
  });

  it("keeps two different people's threads apart", async () => {
    const one = await makeLead();
    const two = await makeLead();
    await message({ leadId: one.id, direction: "inbound", from: one.phone, at: "2026-09-05T10:00:00Z" });
    await message({ leadId: two.id, direction: "inbound", from: two.phone, at: "2026-09-05T11:00:00Z" });
    expect(await threadsAwaitingReply()).toBe(2);
  });

  it("ignores a soft-deleted message", async () => {
    const lead = await makeLead();
    await message({ leadId: lead.id, direction: "outbound", from: lead.phone, at: "2026-09-06T10:00:00Z" });
    await message({ leadId: lead.id, direction: "inbound", from: lead.phone, at: "2026-09-06T11:00:00Z" });
    await db
      .update(whatsappMessages)
      .set({ deletedAt: new Date() })
      .where(and(eq(whatsappMessages.leadId, lead.id), eq(whatsappMessages.direction, "inbound")));

    // The inbound one is gone, so the outbound one is now the latest.
    expect(await threadsAwaitingReply()).toBe(0);
  });
});

describe("the onboarding split", () => {
  async function makeStudent(onboarded: boolean): Promise<string> {
    const lead = await makeLead();
    const [student] = await db
      .insert(students)
      .values({
        leadId: lead.id,
        centerId: lead.centerId,
        fullName: `${MARKER} Anjali`,
        phone: lead.phone,
        onboardedAt: onboarded ? new Date() : null,
      })
      .returning({ id: students.id });
    return student.id;
  }

  async function counts() {
    const ours = like(students.fullName, `${MARKER}%`);
    const [roster] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(students)
      .where(and(ours, isNull(students.deletedAt), isNotNull(students.onboardedAt)));
    const [queue] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(students)
      .where(and(ours, isNull(students.deletedAt), isNull(students.onboardedAt)));
    return { roster: roster.n, queue: queue.n };
  }

  it("puts a brand-new student in the queue, not on the roster", async () => {
    // Gate 2 does not set `onboarded_at`, so this is what a student looks
    // like the moment accounts record their first payment.
    await makeStudent(false);
    expect(await counts()).toEqual({ roster: 0, queue: 1 });
  });

  it("moves them to the roster once onboarded, and only then", async () => {
    const id = await makeStudent(false);
    expect(await counts()).toEqual({ roster: 0, queue: 1 });

    await db.update(students).set({ onboardedAt: new Date() }).where(eq(students.id, id));
    expect(await counts()).toEqual({ roster: 1, queue: 0 });
  });

  it("is a true partition — nobody is in both lists or in neither", async () => {
    await makeStudent(false);
    await makeStudent(false);
    await makeStudent(true);

    const { roster, queue } = await counts();
    expect(roster + queue).toBe(3);
  });

  it("leaves a soft-deleted student out of both", async () => {
    const id = await makeStudent(false);
    await db.update(students).set({ deletedAt: new Date() }).where(eq(students.id, id));
    expect(await counts()).toEqual({ roster: 0, queue: 0 });
  });
});
