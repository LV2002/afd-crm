/**
 * Integration tests for removeDroppedAdmissions() — needs a real database with
 * migrations applied:
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { and, eq, isNull, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, leadIdentifiers, leads, payments, students } = await import(
  "../src/lib/db/schema"
);
const { removeDroppedAdmissions } = await import("../src/lib/enrolment/remove-dropped-admissions");

const MARKER = "RemoveDroppedTest";
const ROLLBACK = new Error("rollback");

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let centerId: string;

async function sweep() {
  const testLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
    await db.delete(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
  }
  await db.delete(students).where(like(students.fullName, `${MARKER}%`));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db
    .insert(centers)
    .values({ name: testName("center"), city: "Kochi" })
    .returning({ id: centers.id });
  centerId = center.id;
});

afterAll(sweep);

let phoneCounter = 0;

async function makeAdmission(tag: string, opts: { dropped: boolean; withStudent?: boolean }) {
  const phone = `+9190007${String(7000 + phoneCounter++)}`;
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone, centerId })
    .returning({ id: leads.id });
  await db.insert(leadIdentifiers).values({ leadId: lead.id, kind: "phone", valueNormalised: phone });

  let studentId: string | null = null;
  if (opts.withStudent) {
    const [student] = await db
      .insert(students)
      .values({ fullName: testName(tag), phone, centerId, leadId: lead.id })
      .returning({ id: students.id });
    studentId = student.id;
  }

  const [enrolment] = await db
    .insert(enrolments)
    .values({
      leadId: lead.id,
      studentId,
      course: "Foundation",
      centerId,
      mode: "Offline",
      academicYear: "2026-27",
      totalFeePaise: 10_000_00,
      netFeePaise: 10_000_00,
      droppedAt: opts.dropped ? new Date() : null,
      dropReason: opts.dropped ? "test" : null,
    })
    .returning({ id: enrolments.id });

  return { enrolmentId: enrolment.id, leadId: lead.id, studentId, phone };
}

const base = { reason: "test admissions from the workflow trial", removedBy: null as unknown as string };

describe("removeDroppedAdmissions", () => {
  it("soft-deletes the admission, the student and the lead, and releases the phone number", async () => {
    const a = await makeAdmission("full", { dropped: true, withStudent: true });
    const result = await db.transaction((tx) =>
      removeDroppedAdmissions(tx, { ...base, enrolmentIds: [a.enrolmentId], alsoDeleteLeads: true }),
    );
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].leadDeleted).toBe(true);

    const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, a.enrolmentId));
    expect(enrolment.deletedAt).not.toBeNull();
    const [student] = await db.select().from(students).where(eq(students.id, a.studentId!));
    expect(student.deletedAt).not.toBeNull();
    const [lead] = await db.select().from(leads).where(eq(leads.id, a.leadId));
    expect(lead.deletedAt).not.toBeNull();
    expect(lead.deletedReason).toBe(base.reason);
    const live = await db
      .select()
      .from(leadIdentifiers)
      .where(and(eq(leadIdentifiers.leadId, a.leadId), isNull(leadIdentifiers.deletedAt)));
    expect(live).toHaveLength(0);
  });

  it("keeps the lead when asked to", async () => {
    const a = await makeAdmission("keep-lead", { dropped: true });
    const result = await db.transaction((tx) =>
      removeDroppedAdmissions(tx, { ...base, enrolmentIds: [a.enrolmentId], alsoDeleteLeads: false }),
    );
    expect(result.removed[0].leadDeleted).toBe(false);
    const [lead] = await db.select().from(leads).where(eq(leads.id, a.leadId));
    expect(lead.deletedAt).toBeNull();
  });

  it("refuses a live admission — it has to be dropped first", async () => {
    const a = await makeAdmission("live", { dropped: false });
    const result = await db.transaction((tx) =>
      removeDroppedAdmissions(tx, { ...base, enrolmentIds: [a.enrolmentId], alsoDeleteLeads: true }),
    );
    expect(result.removed).toHaveLength(0);
    expect(result.skipped[0].why).toMatch(/live admission/i);
    const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, a.enrolmentId));
    expect(enrolment.deletedAt).toBeNull();
    const [lead] = await db.select().from(leads).where(eq(leads.id, a.leadId));
    expect(lead.deletedAt).toBeNull();
  });

  it("does not delete a lead that still has another live admission", async () => {
    const a = await makeAdmission("two", { dropped: true });
    await db.insert(enrolments).values({
      leadId: a.leadId,
      course: "Crash",
      centerId,
      mode: "Offline",
      academicYear: "2026-27",
      totalFeePaise: 5_000_00,
      netFeePaise: 5_000_00,
    });
    const result = await db.transaction((tx) =>
      removeDroppedAdmissions(tx, { ...base, enrolmentIds: [a.enrolmentId], alsoDeleteLeads: true }),
    );
    expect(result.removed[0].leadDeleted).toBe(false);
    const [lead] = await db.select().from(leads).where(eq(leads.id, a.leadId));
    expect(lead.deletedAt).toBeNull();
  });

  it("reports an already-removed admission instead of removing it twice", async () => {
    const a = await makeAdmission("twice", { dropped: true });
    await db.transaction((tx) =>
      removeDroppedAdmissions(tx, { ...base, enrolmentIds: [a.enrolmentId], alsoDeleteLeads: false }),
    );
    const again = await db.transaction((tx) =>
      removeDroppedAdmissions(tx, { ...base, enrolmentIds: [a.enrolmentId], alsoDeleteLeads: false }),
    );
    expect(again.removed).toHaveLength(0);
    expect(again.skipped[0].why).toMatch(/already removed/i);
  });

  it("requires a reason", async () => {
    await expect(
      db.transaction((tx) =>
        removeDroppedAdmissions(tx, { ...base, reason: " ", enrolmentIds: ["x"], alsoDeleteLeads: false }),
      ),
    ).rejects.toThrow(/reason/);
  });

  it("leaves payments on the ledger and reports them (rolled back after, the ledger is append-only)", async () => {
    await expect(
      db.transaction(async (tx) => {
        const a = await makeAdmission("paid", { dropped: true, withStudent: true });
        await tx.insert(payments).values([
          { enrolmentId: a.enrolmentId, amountPaise: 5_000_00, direction: "credit", method: "cash" },
          { enrolmentId: a.enrolmentId, amountPaise: 1_000_00, direction: "debit", method: "cash" },
        ]);
        const result = await removeDroppedAdmissions(tx, {
          ...base,
          enrolmentIds: [a.enrolmentId],
          alsoDeleteLeads: true,
        });
        expect(result.removed[0].paymentCount).toBe(2);
        expect(result.removed[0].netPaymentPaise).toBe(4_000_00);
        const stillThere = await tx.select().from(payments).where(eq(payments.enrolmentId, a.enrolmentId));
        expect(stillThere).toHaveLength(2);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
  });
});
