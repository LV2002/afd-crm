/**
 * End-to-end test of the full Phase 4 lifecycle chain: a lead crosses
 * Gate 1 (confirmAdmission — sales -> accounts) and then Gate 2
 * (recordPayment — accounts -> academics), same as a counsellor followed
 * by an accounts user would drive it through the real UI. Individual gate
 * behaviour has its own focused suites (confirm-admission.spec.ts,
 * record-payment.spec.ts); this one only checks that the two compose
 * correctly end to end. Needs a real database with migrations applied:
 *
 *   npm run db:migrate && npm test
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
const { centers, enrolments, feeStructures, leads, payments, pipelineStages, receipts, students } = await import(
  "../src/lib/db/schema"
);
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");

const MARKER = "Phase4E2E";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let centerId: string;

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    const enrolmentRows = await db.select({ id: enrolments.id }).from(enrolments).where(eq(enrolments.leadId, lead.id));
    for (const enrolment of enrolmentRows) {
      const paymentRows = await db.select({ id: payments.id }).from(payments).where(eq(payments.enrolmentId, enrolment.id));
      for (const payment of paymentRows) {
        await db.delete(receipts).where(eq(receipts.paymentId, payment.id));
      }
      await db.delete(payments).where(eq(payments.enrolmentId, enrolment.id));
    }
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
  }
  await db.delete(students).where(like(students.fullName, `${MARKER}%`));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(feeStructures).where(like(feeStructures.course, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db.insert(centers).values({ name: testName("center"), city: "Kannur" }).returning({ id: centers.id });
  centerId = center.id;
});

afterAll(async () => {
  await sweep();
});

describe("Phase 4 lifecycle chain", () => {
  it("takes a lead from admission confirmed through to a created student record", async () => {
    const course = testName("course");
    await db.insert(feeStructures).values({
      course,
      centerId,
      mode: "offline",
      academicYear: "2026-27",
      baseFeePaise: 18000000,
    });

    const [lead] = await db
      .insert(leads)
      .values({
        studentName: testName("student"),
        primaryPhone: "+919847400101",
        parentPhone: "+919847400102",
        centerId,
        interestedExams: ["UCEED"],
        examYear: "2027",
      })
      .returning({ id: leads.id });

    // Gate 1: sales confirms the admission.
    const gate1 = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId: lead.id,
        course,
        centerId,
        mode: "offline",
        academicYear: "2026-27",
        discountPaise: 1000000,
        confirmedBy: null,
      }),
    );
    expect(gate1.netFeePaise).toBe(17000000);

    const [leadAfterGate1] = await db.select().from(leads).where(eq(leads.id, lead.id));
    const [wonStage] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.stageType, "won"));
    expect(leadAfterGate1.stageId).toBe(wonStage.id);

    const [enrolmentAfterGate1] = await db.select().from(enrolments).where(eq(enrolments.id, gate1.enrolmentId));
    expect(enrolmentAfterGate1.status).toBe("pending_payment");
    expect(enrolmentAfterGate1.studentId).toBeNull();
    expect(enrolmentAfterGate1.accountsToAcademicsAt).toBeNull();

    // A partial payment shouldn't yet cross Gate 2 on its own — only the
    // FIRST payment does, regardless of whether it covers the full fee.
    // Gate 2: accounts records the first payment.
    const gate2 = await db.transaction((tx) =>
      recordPayment(tx, {
        enrolmentId: gate1.enrolmentId,
        amountPaise: 5000000,
        method: "upi",
        reference: "UTR-E2E-1",
        recordedBy: null,
      }),
    );
    expect(gate2.isFirstPayment).toBe(true);
    expect(gate2.studentId).not.toBeNull();

    const [enrolmentAfterGate2] = await db.select().from(enrolments).where(eq(enrolments.id, gate1.enrolmentId));
    expect(enrolmentAfterGate2.status).toBe("active");
    expect(enrolmentAfterGate2.studentId).toBe(gate2.studentId);
    expect(enrolmentAfterGate2.accountsToAcademicsAt).not.toBeNull();

    const [student] = await db.select().from(students).where(eq(students.id, gate2.studentId!));
    expect(student.leadId).toBe(lead.id);
    expect(student.centerId).toBe(centerId);
    expect(student.currentCourse).toBe(course);
    expect(student.parentPhone).toBe("+919847400102");
    expect(student.targetExams).toEqual(["UCEED"]);

    // A second, later instalment against the same enrolment must not spawn
    // a second student record or re-fire the gate.
    const secondPayment = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId: gate1.enrolmentId, amountPaise: 12000000, method: "cash", recordedBy: null }),
    );
    expect(secondPayment.isFirstPayment).toBe(false);
    expect(secondPayment.studentId).toBe(gate2.studentId);

    const studentRows = await db.select().from(students).where(eq(students.leadId, lead.id));
    expect(studentRows).toHaveLength(1);

    const allPayments = await db.select().from(payments).where(eq(payments.enrolmentId, gate1.enrolmentId));
    const totalPaid = allPayments.reduce((sum, p) => sum + (p.direction === "credit" ? p.amountPaise : -p.amountPaise), 0);
    expect(totalPaid).toBe(17000000);
    expect(totalPaid).toBe(gate1.netFeePaise);
  });
});
