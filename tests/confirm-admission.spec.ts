/**
 * Integration tests for confirmAdmission() (Gate 1, sales -> accounts) —
 * needs a real database with migrations applied:
 *
 *   npm run db:migrate && npm test
 *
 * Runs through the shared Drizzle `db` client directly (the same bypass
 * confirmAdmission() itself uses — see its own doc comment), so this covers
 * the gate logic, not the RLS/scope boundary around confirmAdmissionAction().
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, feeStructures, leads, pipelineStages } = await import("../src/lib/db/schema");
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");

const MARKER = "ConfirmAdmissionTest";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let centerId: string;
let wonStageId: string;

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(feeStructures).where(like(feeStructures.course, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db.insert(centers).values({ name: testName("center"), city: "Kochi" }).returning({ id: centers.id });
  centerId = center.id;

  const [wonStage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.stageType, "won"));
  if (!wonStage) throw new Error("Seed data is missing a stage_type='won' pipeline stage.");
  wonStageId = wonStage.id;
});

afterAll(async () => {
  await sweep();
});

async function makeLead(tag: string, phone: string) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone, centerId })
    .returning({ id: leads.id });
  return lead.id;
}

describe("confirmAdmission", () => {
  it("looks up fee_structures and computes the net fee from a discount", async () => {
    const course = testName("course-lookup");
    await db.insert(feeStructures).values({
      course,
      centerId,
      mode: "offline",
      academicYear: "2026-27",
      baseFeePaise: 20000000,
    });
    const leadId = await makeLead("lead1", "+919847200101");

    const result = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId,
        course,
        centerId,
        mode: "offline",
        academicYear: "2026-27",
        discountPaise: 500000,
        confirmedBy: null,
      }),
    );

    expect(result.totalFeePaise).toBe(20000000);
    expect(result.netFeePaise).toBe(19500000);

    const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, result.enrolmentId));
    expect(enrolment.leadId).toBe(leadId);
    expect(enrolment.status).toBe("pending_payment");
    expect(enrolment.salesToAccountsAt).not.toBeNull();
    expect(enrolment.accountsToAcademicsAt).toBeNull();

    const [leadRow] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(leadRow.stageId).toBe(wonStageId);
  });

  it("uses totalFeePaiseOverride when no fee structure matches", async () => {
    const leadId = await makeLead("lead2", "+919847200102");

    const result = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId,
        course: testName("no-such-course"),
        centerId,
        mode: "online",
        academicYear: "2026-27",
        totalFeePaiseOverride: 15000000,
        confirmedBy: null,
      }),
    );

    expect(result.totalFeePaise).toBe(15000000);
    expect(result.netFeePaise).toBe(15000000);
  });

  it("throws when no fee structure matches and no override is given", async () => {
    const leadId = await makeLead("lead3", "+919847200103");

    await expect(
      db.transaction((tx) =>
        confirmAdmission(tx, {
          leadId,
          course: testName("no-such-course-2"),
          centerId,
          mode: "online",
          academicYear: "2026-27",
          confirmedBy: null,
        }),
      ),
    ).rejects.toThrow(/no fee structure/);
  });

  it("throws when the discount exceeds the total fee", async () => {
    const leadId = await makeLead("lead4", "+919847200104");

    await expect(
      db.transaction((tx) =>
        confirmAdmission(tx, {
          leadId,
          course: testName("over-discount"),
          centerId,
          mode: "online",
          academicYear: "2026-27",
          totalFeePaiseOverride: 1000000,
          discountPaise: 2000000,
          confirmedBy: null,
        }),
      ),
    ).rejects.toThrow(/discount cannot exceed/);
  });

  it("refuses a second admission for a lead that already has one", async () => {
    const leadId = await makeLead("lead5", "+919847200105");
    await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId,
        course: testName("first"),
        centerId,
        mode: "online",
        academicYear: "2026-27",
        totalFeePaiseOverride: 1000000,
        confirmedBy: null,
      }),
    );

    await expect(
      db.transaction((tx) =>
        confirmAdmission(tx, {
          leadId,
          course: testName("second"),
          centerId,
          mode: "online",
          academicYear: "2026-27",
          totalFeePaiseOverride: 1000000,
          confirmedBy: null,
        }),
      ),
    ).rejects.toThrow(/already has an enrolment/);
  });
});
