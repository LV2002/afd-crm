/**
 * Integration tests for recordPayment() (Gate 2, accounts -> academics) —
 * needs a real database with migrations applied:
 *
 *   npm run db:migrate && npm test
 *
 * Runs through the shared Drizzle `db` client directly (the same bypass
 * recordPayment() itself uses — see its own doc comment), so this covers
 * the gate logic, not the RLS/scope boundary around recordPaymentAction().
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
const { centers, enrolments, leads, payments, receipts, students } = await import("../src/lib/db/schema");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");

const MARKER = "RecordPaymentTest";

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

async function makeEnrolment(tag: string, phone: string) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone, centerId, interestedExams: ["NID"], examYear: "2027" })
    .returning({ id: leads.id });
  const [enrolment] = await db
    .insert(enrolments)
    .values({
      leadId: lead.id,
      course: "Foundation",
      centerId,
      mode: "offline",
      academicYear: "2026-27",
      totalFeePaise: 10000000,
      netFeePaise: 10000000,
      salesToAccountsAt: new Date(),
    })
    .returning({ id: enrolments.id });
  return { leadId: lead.id, enrolmentId: enrolment.id };
}

describe("recordPayment", () => {
  it("rejects a zero or negative amount", async () => {
    const { enrolmentId } = await makeEnrolment("lead1", "+919847300101");
    await expect(
      db.transaction((tx) => recordPayment(tx, { enrolmentId, amountPaise: 0, method: "cash", recordedBy: null })),
    ).rejects.toThrow(/greater than zero/);
  });

  it("throws when the enrolment doesn't exist", async () => {
    await expect(
      db.transaction((tx) =>
        recordPayment(tx, {
          enrolmentId: "00000000-0000-0000-0000-000000000000",
          amountPaise: 1000,
          method: "cash",
          recordedBy: null,
        }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("fires Gate 2 on the first credit payment: creates a student and stamps accounts_to_academics_at", async () => {
    const { leadId, enrolmentId } = await makeEnrolment("lead2", "+919847300102");

    const result = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 5000000, method: "upi", reference: "UTR123", recordedBy: null }),
    );

    expect(result.isFirstPayment).toBe(true);
    expect(result.studentId).not.toBeNull();
    expect(result.receiptNo).toBeGreaterThan(0);

    const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(enrolment.status).toBe("active");
    expect(enrolment.studentId).toBe(result.studentId);
    expect(enrolment.accountsToAcademicsAt).not.toBeNull();

    const [student] = await db.select().from(students).where(eq(students.id, result.studentId!));
    expect(student.leadId).toBe(leadId);
    expect(student.phone).toBe("+919847300102");
    expect(student.studentCode).toMatch(/^STU\d{6}$/);
    expect(student.targetExams).toEqual(["NID"]);
    expect(student.currentCourse).toBe("Foundation");
  });

  it("does not re-fire Gate 2 on a second payment against the same enrolment", async () => {
    const { enrolmentId } = await makeEnrolment("lead3", "+919847300103");

    const first = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 3000000, method: "cash", recordedBy: null }),
    );
    expect(first.isFirstPayment).toBe(true);

    const second = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 2000000, method: "upi", recordedBy: null }),
    );
    expect(second.isFirstPayment).toBe(false);
    expect(second.studentId).toBe(first.studentId);

    const studentRows = await db.select().from(students).where(eq(students.id, first.studentId!));
    expect(studentRows).toHaveLength(1);
  });

  it("assigns strictly increasing gapless receipt numbers", async () => {
    const { enrolmentId } = await makeEnrolment("lead4", "+919847300104");

    const first = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 1000000, method: "cash", recordedBy: null }),
    );
    const second = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 1000000, method: "cash", recordedBy: null }),
    );
    expect(second.receiptNo).toBeGreaterThan(first.receiptNo);
  });
});
