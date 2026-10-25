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
const { batches, centers, dropdownOptions, enrolments, feeStructures, leads } = await import("../src/lib/db/schema");
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");

const MARKER = "ConfirmAdmissionTest";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let centerId: string;

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(batches).where(like(batches.name, `${MARKER}%`));
  await db.delete(feeStructures).where(like(feeStructures.course, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db.insert(centers).values({ name: testName("center"), city: "Kochi" }).returning({ id: centers.id });
  centerId = center.id;
});

afterAll(async () => {
  await sweep();
});

async function makeLead(tag: string, phone: string) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone, centerId, temperature: "not_contacted" })
    .returning({ id: leads.id });
  return lead.id;
}

describe("confirmAdmission", () => {
  it("takes the batch fee and computes the net fee from a discount", async () => {
    const course = testName("course-lookup");
    const [batch] = await db
      .insert(batches)
      .values({
        name: testName("batch-lookup"),
        centerId,
        course,
        mode: "online",
        academicYear: "2026-27",
        feePaise: 20000000,
      })
      .returning({ id: batches.id });
    const leadId = await makeLead("lead1", "+919847200101");

    const result = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId,
        course,
        centerId,
        mode: "online",
        academicYear: "2026-27",
        batchId: batch.id,
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

    // Confirming the admission IS what moves the lead to Took admission —
    // automatically, in the same transaction, from whatever it was before.
    const [leadRow] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(leadRow.temperature).toBe("took_admission");
    // Reported, not just done. The caller writes the audit row, starts the
    // automations and tells the counsellor on the strength of this.
    expect(result.statusChange).toEqual({ from: "not_contacted", to: "took_admission" });
  });

  it("moves a lead that was Hot, and the status survives the move", async () => {
    const leadId = await makeLead("hot", "+919847200198");
    await db.update(leads).set({ temperature: "hot" }).where(eq(leads.id, leadId));

    const result = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId,
        course: testName("hot"),
        centerId,
        mode: "offline",
        academicYear: "2026-27",
        totalFeePaiseOverride: 1000000,
        confirmedBy: null,
      }),
    );

    expect(result.statusChange).toEqual({ from: "hot", to: "took_admission" });
  });

  it("reports no admission status rather than silently leaving the lead where it was", async () => {
    // The real failure this reporting exists for: an institute that
    // deleted or re-kinded "Took admission". The admission must still be
    // recorded — refusing one over a settings problem would be absurd —
    // but the caller has to be able to say the temperature did not move,
    // which it could not when this returned nothing.
    const leadId = await makeLead("nowon", "+919847200199");

    const [leadBefore] = await db.select().from(leads).where(eq(leads.id, leadId));
    const statusBefore = leadBefore.temperature;

    await db.update(dropdownOptions).set({ isActive: false }).where(eq(dropdownOptions.value, "took_admission"));
    try {
      const result = await db.transaction((tx) =>
        confirmAdmission(tx, {
          leadId,
          course: testName("nowon"),
          centerId,
          mode: "offline",
          academicYear: "2026-27",
          totalFeePaiseOverride: 1000000,
          confirmedBy: null,
        }),
      );

      expect(result.enrolmentId).toBeTruthy();
      expect(result.statusChange).toBeNull();

      const [leadRow] = await db.select().from(leads).where(eq(leads.id, leadId));
      expect(leadRow.temperature).toBe(statusBefore);
    } finally {
      await db.update(dropdownOptions).set({ isActive: true }).where(eq(dropdownOptions.value, "took_admission"));
    }
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

  it("throws when there is no batch fee and no custom fee", async () => {
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
    ).rejects.toThrow(/no fee yet/);
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

  it("takes the fee from the batch, and lets a typed figure win", async () => {
    const course = testName("batch-fee");
    const [batch] = await db
      .insert(batches)
      .values({
        name: testName("batch"),
        centerId,
        course,
        mode: "online",
        academicYear: "2026-27",
        feePaise: 5000000,
      })
      .returning({ id: batches.id });

    const leadA = await makeLead("batch-fee-a", "+919847200106");
    const a = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId: leadA,
        course,
        centerId,
        mode: "online",
        academicYear: "2026-27",
        batchId: batch.id,
        confirmedBy: null,
      }),
    );
    expect(a.totalFeePaise).toBe(5000000);

    const leadB = await makeLead("batch-fee-b", "+919847200107");
    const b = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId: leadB,
        course,
        centerId,
        mode: "online",
        academicYear: "2026-27",
        batchId: batch.id,
        totalFeePaiseOverride: 4000000,
        confirmedBy: null,
      }),
    );
    expect(b.totalFeePaise).toBe(4000000);
  });
});
