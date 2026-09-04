/**
 * Integration tests for dropAdmission()/restoreAdmission() — needs a real
 * database with migrations applied:
 *
 *   npm run db:migrate && npm test
 *
 * Runs through the shared Drizzle `db` client directly (the same bypass
 * the functions themselves use — see their doc comment), so this covers
 * the drop logic, not the RLS/scope boundary around dropAdmissionAction().
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
const { centers, enrolments, leads, students } = await import("../src/lib/db/schema");
const { dropAdmission, restoreAdmission } = await import("../src/lib/enrolment/drop-admission");

const MARKER = "DropAdmissionTest";

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

afterAll(async () => {
  await sweep();
});

/** An enrolment, optionally already past Gate 2 (so it has a student row). */
async function makeEnrolment(tag: string, phone: string, withStudent: boolean) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone, centerId })
    .returning({ id: leads.id });

  let studentId: string | null = null;
  if (withStudent) {
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
    })
    .returning({ id: enrolments.id });

  return { enrolmentId: enrolment.id, leadId: lead.id, studentId };
}

describe("dropAdmission", () => {
  it("records when they left, who said so, and why", async () => {
    const { enrolmentId } = await makeEnrolment("plain", "+919000000101", false);

    await db.transaction((tx) =>
      dropAdmission(tx, { enrolmentId, reason: "Moved to Bangalore", droppedBy: null }),
    );

    const [row] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(row.droppedAt).not.toBeNull();
    expect(row.dropReason).toBe("Moved to Bangalore");
  });

  // Academics read `students` and never the sales or commercial tables,
  // so unless the drop lands there they keep marking a register for
  // somebody who left.
  it("takes the student off the register too", async () => {
    const { enrolmentId, studentId } = await makeEnrolment("student", "+919000000102", true);

    await db.transaction((tx) =>
      dropAdmission(tx, { enrolmentId, reason: "Financial", droppedBy: null }),
    );

    const [student] = await db.select().from(students).where(eq(students.id, studentId!));
    expect(student.status).toBe("dropped");
  });

  it("refuses a drop with no reason — three departments read it", async () => {
    const { enrolmentId } = await makeEnrolment("noreason", "+919000000103", false);

    await expect(
      db.transaction((tx) => dropAdmission(tx, { enrolmentId, reason: "   ", droppedBy: null })),
    ).rejects.toThrow(/reason is required/);
  });

  it("refuses to drop the same admission twice", async () => {
    const { enrolmentId } = await makeEnrolment("twice", "+919000000104", false);
    await db.transaction((tx) =>
      dropAdmission(tx, { enrolmentId, reason: "Left", droppedBy: null }),
    );

    await expect(
      db.transaction((tx) => dropAdmission(tx, { enrolmentId, reason: "Left", droppedBy: null })),
    ).rejects.toThrow(/already marked dropped/);
  });

  it("leaves the lead alone — the sales record stops changing at the first gate", async () => {
    const { enrolmentId, leadId } = await makeEnrolment("lead", "+919000000105", false);
    const [before] = await db.select().from(leads).where(eq(leads.id, leadId));

    await db.transaction((tx) =>
      dropAdmission(tx, { enrolmentId, reason: "Left", droppedBy: null }),
    );

    const [after] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(after.stageId).toEqual(before.stageId);
    expect(after.lostAt).toBeNull();
  });
});

describe("restoreAdmission", () => {
  it("clears the drop and puts the student back on the register", async () => {
    const { enrolmentId, studentId } = await makeEnrolment("restore", "+919000000106", true);
    await db.transaction((tx) =>
      dropAdmission(tx, { enrolmentId, reason: "Recorded by mistake", droppedBy: null }),
    );

    await db.transaction((tx) => restoreAdmission(tx, { enrolmentId }));

    const [row] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(row.droppedAt).toBeNull();
    expect(row.dropReason).toBeNull();

    const [student] = await db.select().from(students).where(eq(students.id, studentId!));
    expect(student.status).toBe("active");
  });

  it("refuses to restore an admission that was never dropped", async () => {
    const { enrolmentId } = await makeEnrolment("notdropped", "+919000000107", false);

    await expect(
      db.transaction((tx) => restoreAdmission(tx, { enrolmentId })),
    ).rejects.toThrow(/not marked dropped/);
  });
});
