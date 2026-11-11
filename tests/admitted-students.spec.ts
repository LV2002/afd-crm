import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { matchCourse, matchExams, parseAdmittedCsv, type CourseOption } from "../src/lib/enrolment/admitted-students";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { batches, centers, enrolments, leads, payments, receipts, studentBatches, students } = await import("../src/lib/db/schema");
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");
const { createStudentFromEnrolment } = await import("../src/lib/enrolment/create-student");
const { dropAdmission } = await import("../src/lib/enrolment/drop-admission");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");

describe("matching the sheet's course to the CRM's", () => {
  const courses: CourseOption[] = [
    { value: "design_regular", label: "Design Regular", mode: "hybrid", modeLabel: "Hybrid" },
    { value: "design_weekend_online", label: "Design Weekend", mode: "online", modeLabel: "Online" },
    { value: "design_weekend_hybrid", label: "Design Weekend", mode: "hybrid", modeLabel: "Hybrid" },
    { value: "dwo", label: "DWO", mode: "online", modeLabel: "Online" },
  ];
  it("reads 'Name - Mode' as a course of that name running in that mode", () => {
    expect(matchCourse("Design Regular - Hybrid", courses)).toMatchObject({ kind: "ok", course: { value: "design_regular" } });
    expect(matchCourse("Design Weekend - Online", courses)).toMatchObject({ kind: "ok", course: { value: "design_weekend_online" } });
    expect(matchCourse("Design Weekend - Hybrid", courses)).toMatchObject({ kind: "ok", course: { value: "design_weekend_hybrid" } });
  });
  it("matches a course that is named exactly as the sheet writes it", () => {
    const one: CourseOption[] = [{ value: "dr_h", label: "Design Regular - Hybrid", mode: "hybrid", modeLabel: "Hybrid" }];
    expect(matchCourse("design regular - hybrid", one)).toMatchObject({ kind: "ok" });
  });
  it("says so when a course is not there, and never guesses between two", () => {
    expect(matchCourse("Architecture Weekend - Online", courses)).toEqual({ kind: "none" });
    expect(matchCourse("Design Regular - Online", courses)).toEqual({ kind: "none" });
    const twins: CourseOption[] = [courses[1], { ...courses[1], value: "other" }];
    expect(matchCourse("Design Weekend - Online", twins)).toMatchObject({ kind: "ambiguous" });
  });
  it("matches exams it knows and reports the rest", () => {
    expect(matchExams(["NID", "Ceed", "UCEED"], [{ value: "nid", label: "NID" }, { value: "uceed", label: "UCEED" }])).toEqual({ values: ["nid", "uceed"], unmatched: ["Ceed"] });
  });
});

describe("reading the file", () => {
  const csv = [
    "centre,name,phone,email,course,joined_on,exam_year,dropped,parent_phone,dob",
    "Kochi,Asha Nair,98470 12345,ASHA@X.COM,Design Regular - Hybrid,2026-07-14,2027,,+966563890109,2008-12-24",
    "Kochi,No Phone,,,Design Regular - Hybrid,2026-07-14,2027,,,",
    "Kochi,Bad Date,9847012346,,Design Regular - Hybrid,14/07/2026,2027,,,",
    "Kannur,Left Early,9847012347,,Design Weekend - Online,,2027,yes,,",
  ].join("\n");
  it("reads people, normalises phones and flags what it cannot import", () => {
    const out = parseAdmittedCsv(csv);
    expect(out.rows.map((r) => [r.name, r.phone, r.email, r.joinedOn, r.dropped, r.parentPhone, r.dob])).toEqual([
      ["Asha Nair", "+919847012345", "asha@x.com", "2026-07-14", false, "+966563890109", "2008-12-24"],
      ["Left Early", "+919847012347", null, null, true, null, null],
    ]);
    expect(out.problems.map((p) => p.name)).toEqual(["No Phone", "Bad Date"]);
  });
});

describe("a student made without a payment", () => {
  const MARK = "AdmittedStudentTest";
  let centerId: string;
  async function sweep() {
    const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARK}%`));
    for (const l of ls) {
      for (const e of await db.select({ id: enrolments.id }).from(enrolments).where(eq(enrolments.leadId, l.id))) {
        await db.delete(receipts).where(eq(receipts.enrolmentId, e.id));
        await db.delete(payments).where(eq(payments.enrolmentId, e.id));
      }
      await db.delete(enrolments).where(eq(enrolments.leadId, l.id));
    }
    await db.delete(students).where(like(students.fullName, `${MARK}%`));
    await db.delete(batches).where(like(batches.name, `${MARK}%`));
    await db.delete(leads).where(like(leads.studentName, `${MARK}%`));
    await db.delete(centers).where(like(centers.name, `${MARK}%`));
  }
  beforeAll(async () => {
    await sweep();
    const [c] = await db.insert(centers).values({ name: `${MARK} centre`, city: "x" }).returning({ id: centers.id });
    centerId = c.id;
  });
  afterAll(sweep);

  async function admit(tag: string) {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARK} ${tag}`, primaryPhone: `+9199000${Math.floor(10000 + Math.random() * 89999)}`, centerId, email: "a@b.c", dob: "2008-12-24" })
      .returning({ id: leads.id });
    const joined = new Date("2026-05-20T12:00:00+05:30");
    const adm = await db.transaction((tx) =>
      confirmAdmission(tx, { leadId: lead.id, course: "Foundation", centerId, mode: "hybrid", academicYear: "2026-27", totalFeePaiseOverride: 0, confirmedBy: null, enrolledAt: joined, historical: true }),
    );
    return { leadId: lead.id, enrolmentId: adm.enrolmentId, joined };
  }

  it("is a student dated the day they joined, already onboarded, with no fee", async () => {
    const { enrolmentId, joined } = await admit("one");
    const { studentId } = await db.transaction((tx) => createStudentFromEnrolment(tx, { enrolmentId, recordedBy: null, joinedAt: joined, onboarded: true }));
    const [s] = await db.select().from(students).where(eq(students.id, studentId));
    expect(s.joinedAt.toISOString()).toBe(joined.toISOString());
    expect(s.onboardedAt).not.toBeNull();
    expect(s.email).toBe("a@b.c");
    expect(s.dob).toBe("2008-12-24");
    const [e] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(e).toMatchObject({ studentId, status: "active", netFeePaise: 0 });
    // Asked twice, it is still one student.
    const again = await db.transaction((tx) => createStudentFromEnrolment(tx, { enrolmentId, recordedBy: null }));
    expect(again.studentId).toBe(studentId);
  });

  it("does not make a second student when the first payment is recorded later", async () => {
    const { enrolmentId, leadId, joined } = await admit("two");
    const { studentId } = await db.transaction((tx) => createStudentFromEnrolment(tx, { enrolmentId, recordedBy: null, joinedAt: joined, onboarded: true }));
    const paid = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 1000000, method: "upi", recordedBy: null, receivedAt: new Date("2026-06-01T12:00:00+05:30") }),
    );
    expect(paid.isFirstPayment).toBe(true);
    expect(paid.studentId).toBe(studentId);
    const count = await db.execute<{ n: string }>(sql`select count(*) as n from students where lead_id = ${leadId}::uuid`);
    expect(Number([...count][0].n)).toBe(1);
  });

  it("a dropped student is marked dropped on the student record too", async () => {
    const { enrolmentId, joined } = await admit("three");
    const { studentId } = await db.transaction((tx) => createStudentFromEnrolment(tx, { enrolmentId, recordedBy: null, joinedAt: joined, onboarded: true }));
    await db.transaction((tx) => dropAdmission(tx, { enrolmentId, reason: "Dropped — struck out in the admission ledger", droppedBy: null }));
    const [s] = await db.select().from(students).where(eq(students.id, studentId));
    expect(s.status).toBe("dropped");
  });

  it("joins the chosen batch: the student sits in it and the batch's fee is not charged", async () => {
    const [batch] = await db
      .insert(batches)
      .values({ name: `${MARK} batch`, centerId, course: "Foundation", mode: "hybrid", academicYear: "2026-27", feePaise: 8_000_000 })
      .returning({ id: batches.id });
    const [lead] = await db.insert(leads).values({ studentName: `${MARK} batch kid`, primaryPhone: "+919900099911", centerId }).returning({ id: leads.id });
    const joined = new Date("2026-05-20T12:00:00+05:30");
    const adm = await db.transaction((tx) =>
      confirmAdmission(tx, { leadId: lead.id, course: "Foundation", centerId, mode: "hybrid", academicYear: "2026-27", batchId: batch.id, totalFeePaiseOverride: 0, confirmedBy: null, enrolledAt: joined, historical: true }),
    );
    const { studentId } = await db.transaction((tx) => createStudentFromEnrolment(tx, { enrolmentId: adm.enrolmentId, recordedBy: null, joinedAt: joined, onboarded: true }));
    const [s] = await db.select().from(students).where(eq(students.id, studentId));
    expect(s.currentBatchId).toBe(batch.id);
    const rows = await db.select().from(studentBatches).where(eq(studentBatches.studentId, studentId));
    expect(rows).toHaveLength(1);
    const [e] = await db.select().from(enrolments).where(eq(enrolments.id, adm.enrolmentId));
    expect(e).toMatchObject({ batchId: batch.id, netFeePaise: 0, totalFeePaise: 0 });
  });
});
