/**
 * The analyst's one-person lookup.
 *
 * Every other tool returns aggregates only, so that `/ask` can never be
 * turned into a contact export. `find_person` and `person_history` are the
 * deliberate exception — Leon: "if I ask for a full history on a student it
 * should be able to give me their profile, their enquiry date, how long
 * they took to join, what their fee plan is, how much they paid, are they
 * currently studying with us."
 *
 * What makes that safe is who can reach them, so the refusal is the first
 * thing tested here.
 *
 *   npm run db:migrate && npm run db:seed && npm test
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { runAnalystTool } = await import("../src/lib/ai/tools");

// Type-only: erased at runtime, so it never pulls `server-only` into Node.
type SessionUser = import("../src/lib/auth/session").SessionUser;

/** runAnalystTool wraps every result in {ok, result}; these tests care about the payload. */
async function callTool<T>(name: string, args: unknown, user: SessionUser): Promise<T> {
  const outcome = await runAnalystTool(name, args, { user });
  if (!outcome.ok) throw new Error(`${name} failed: ${outcome.error}`);
  return outcome.result as T;
}
const { db } = await import("../src/lib/db/client");
const { centers, enquiries, enrolmentInstalments, enrolments, leads, payments, students } =
  await import("../src/lib/db/schema");

const MARKER = "AiPersonSpec";

function userWith(permissions: Record<string, "own" | "center" | "all">): SessionUser {
  return {
    id: randomUUID(),
    email: `${MARKER}@test.invalid`,
    fullName: `${MARKER} User`,
    avatarUrl: null,
    roleId: randomUUID(),
    roleCode: "test",
    roleName: "Test",
    centerIds: [],
    permissions,
  } as SessionUser;
}

const admin = userWith({ "report.org": "all", "ai.query": "all", "lead.reveal_phone": "all" });
const adminNoReveal = userWith({ "report.org": "all", "ai.query": "all" });
const centreHead = userWith({ "report.center": "center", "ai.query": "center" });

let centerId: string;
let leadId: string;
let enrolmentId: string;

async function sweep() {
  const testLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(sql`${leads.studentName} like ${MARKER + "%"}`);
  for (const lead of testLeads) {
    const enrolmentRows = await db
      .select({ id: enrolments.id })
      .from(enrolments)
      .where(eq(enrolments.leadId, lead.id));
    for (const enrolment of enrolmentRows) {
      await db.delete(payments).where(eq(payments.enrolmentId, enrolment.id));
      await db.delete(enrolmentInstalments).where(eq(enrolmentInstalments.enrolmentId, enrolment.id));
    }
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
    await db.delete(enquiries).where(eq(enquiries.leadId, lead.id));
  }
  await db.delete(students).where(sql`${students.fullName} like ${MARKER + "%"}`);
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
}

beforeAll(async () => {
  await sweep();
  const [centre] = await db.select({ id: centers.id }).from(centers).limit(1);
  if (!centre) throw new Error("Expected a seeded centre — run `npm run db:seed` first.");
  centerId = centre.id;

  const enquiredOn = new Date("2026-01-10T04:30:00Z");
  const confirmedOn = new Date("2026-02-09T04:30:00Z"); // 30 days later

  const [lead] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} Anjali`,
      primaryPhone: "+919847700101",
      centerId,
      createdAt: enquiredOn,
      firstTouchSource: "meta",
      city: "Ernakulam",
    })
    .returning({ id: leads.id });
  leadId = lead.id;

  await db.insert(enquiries).values({ leadId, source: "meta", receivedAt: enquiredOn });

  const [student] = await db
    .insert(students)
    .values({
      fullName: `${MARKER} Anjali`,
      phone: "+919847700101",
      centerId,
      status: "active",
      currentCourse: "Foundation",
    })
    .returning({ id: students.id });

  const [enrolment] = await db
    .insert(enrolments)
    .values({
      leadId,
      studentId: student.id,
      course: "Foundation",
      centerId,
      mode: "Offline",
      academicYear: "2026-27",
      totalFeePaise: 100_000_00,
      discountPaise: 10_000_00,
      netFeePaise: 90_000_00,
      salesToAccountsAt: confirmedOn,
    })
    .returning({ id: enrolments.id });
  enrolmentId = enrolment.id;

  await db.insert(enrolmentInstalments).values([
    { enrolmentId, sequence: 1, dueDate: "2026-02-15", amountPaise: 45_000_00 },
    { enrolmentId, sequence: 2, dueDate: "2026-05-15", amountPaise: 45_000_00 },
  ]);

  await db.insert(payments).values({
    enrolmentId,
    amountPaise: 45_000_00,
    direction: "credit",
    method: "upi",
    receivedAt: new Date("2026-02-14T04:30:00Z"),
  });
});

afterAll(async () => {
  await sweep();
});

describe("who may look up an individual", () => {
  // The whole safety argument. These tools return a named person, so they
  // are limited to the people who could already open that person's record.
  it("refuses a centre-scoped caller", async () => {
    const found = await callTool<{ error?: string }>("find_person", { nameOrPhone: "Anjali" }, centreHead);
    expect(found.error).toMatch(/organisation-wide/i);

    const history = await callTool<{ error?: string }>("person_history", { leadId }, centreHead);
    expect(history.error).toMatch(/organisation-wide/i);
  });
});

describe("find_person", () => {
  it("finds by part of a name", async () => {
    const result = await callTool<{ matches: Array<{ leadId: string }> }>(
      "find_person",
      { nameOrPhone: "Anjali" },
      admin,
    );
    expect(result.matches.map((m) => m.leadId)).toContain(leadId);
  });

  it("finds by phone number, however it was typed", async () => {
    const result = await callTool<{ matches: Array<{ leadId: string }> }>(
      "find_person",
      { nameOrPhone: "98477 00101" },
      admin,
    );
    expect(result.matches.map((m) => m.leadId)).toContain(leadId);
  });

  it("says so plainly when nobody matches", async () => {
    const result = await callTool<{ matches: unknown[]; note?: string }>(
      "find_person",
      { nameOrPhone: "NoSuchPersonXYZ" },
      admin,
    );
    expect(result.matches).toHaveLength(0);
    expect(result.note).toBeTruthy();
  });
});

describe("person_history", () => {
  interface History {
    profile: { name: string; city: string | null; phone: string };
    enquiry: { firstEnquiryAt: string | null; firstTouchSource: string | null };
    admission: { daysFromEnquiryToAdmission: number | null; dropped: boolean } | null;
    fees: { netFee: string; instalments: unknown[] } | null;
    payments: { totalPaid: string; balance: string } | null;
    student: { isActive: boolean; status: string } | null;
    error?: string;
  }

  it("answers every part of the question Leon asked", async () => {
    const history = await callTool<History>("person_history", { leadId }, admin);

    expect(history.profile.name).toBe(`${MARKER} Anjali`);
    expect(history.profile.city).toBe("Ernakulam");
    expect(history.enquiry.firstEnquiryAt).toContain("2026-01-10");
    expect(history.enquiry.firstTouchSource).toBe("meta");
    // 10 Jan → 9 Feb.
    expect(history.admission?.daysFromEnquiryToAdmission).toBe(30);
    expect(history.admission?.dropped).toBe(false);
    expect(history.fees?.netFee).toContain("90,000");
    expect(history.fees?.instalments).toHaveLength(2);
    expect(history.payments?.totalPaid).toContain("45,000");
    expect(history.payments?.balance).toContain("45,000");
    expect(history.student?.isActive).toBe(true);
    expect(history.student?.status).toBe("active");
  });

  it("gives an admin the full phone number", async () => {
    const history = await callTool<History>("person_history", { leadId }, admin);
    expect(history.profile.phone).toBe("+919847700101");
  });

  // Org-wide report access and permission to see a raw phone number are
  // two different grants, and this tool respects the second one too.
  it("masks the phone for an org-wide caller without lead.reveal_phone", async () => {
    const history = await callTool<History>("person_history", { leadId }, adminNoReveal);
    expect(history.profile.phone).not.toBe("+919847700101");
    expect(history.profile.phone).toContain("\u2022");
  });

  it("says so rather than throwing when the id is unknown", async () => {
    const history = await callTool<History>("person_history", { leadId: randomUUID() }, admin);
    expect(history.error).toBeTruthy();
  });
});
