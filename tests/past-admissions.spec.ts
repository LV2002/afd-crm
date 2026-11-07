import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, financeAccounts, financeTransactions, leads, payments, receipts, students } = await import("../src/lib/db/schema");
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");
const { programmeYears } = await import("../src/lib/enrolment/course-catalog");
const { parsePastAdmissions, parseLooseDate } = await import("../src/lib/enrolment/parse-past-admissions");

const MARKER = "PastAdmissionTest";
let centerId: string;

async function sweep() {
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const l of ls) {
    for (const e of await db.select({ id: enrolments.id }).from(enrolments).where(eq(enrolments.leadId, l.id))) {
      await db.delete(financeTransactions).where(eq(financeTransactions.enrolmentId, e.id));
      await db.delete(receipts).where(eq(receipts.enrolmentId, e.id));
      await db.delete(payments).where(eq(payments.enrolmentId, e.id));
    }
    await db.delete(enrolments).where(eq(enrolments.leadId, l.id));
  }
  await db.delete(students).where(like(students.fullName, `${MARKER}%`));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [c] = await db.insert(centers).values({ name: `${MARKER} centre`, city: "Kochi" }).returning({ id: centers.id });
  centerId = c.id;
});
afterAll(sweep);

describe("parsePastAdmissions", () => {
  const courses = new Map([["nid", "nid"], ["foundation", "foundation"]]);
  it("reads commas and tabs, dates day-first, fees in rupees, and says what it could not read", () => {
    const out = parsePastAdmissions(
      "Name,Phone,Course\nAsha Nair, 98470 12345, NID, 14/07/2025, 85000\nBad Phone, 12, NID\nNo Course, 9847012346, Karate\nTab Kid\t9847012347\tFoundation\t2025-08-01",
      courses,
    );
    expect(out.rows.map((r) => [r.name, r.phone, r.course, r.joinedOn])).toEqual([
      ["Asha Nair", "+919847012345", "nid", "2025-07-14"],
      ["Tab Kid", "+919847012347", "foundation", "2025-08-01"],
    ]);
    expect(out.problems.map((p) => p.line)).toEqual([3, 4]);
    expect(out.rows[0].feePaise).toBe(8500000);
    expect(parsePastAdmissions("A, 9847012345, NID, 14/07/2025, 85,000", courses).problems).toHaveLength(1);
  });
  it("rejects impossible dates", () => {
    expect(parseLooseDate("31/02/2025")).toBeNull();
    expect(parseLooseDate("03/07/2025")).toBe("2025-07-03");
  });
});

describe("a past admission", () => {
  it("is dated in the past, takes dated payments, and is not announced or onboarded", async () => {
    const [lead] = await db.insert(leads).values({ studentName: `${MARKER} one`, primaryPhone: "+919800000099", centerId }).returning({ id: leads.id });
    const joined = new Date("2025-07-14T12:00:00+05:30");
    const result = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId: lead.id, course: "Foundation", centerId, mode: "hybrid", academicYear: "2025-26",
        totalFeePaiseOverride: 0, confirmedBy: null, enrolledAt: joined, historical: true,
      }),
    );
    const [e] = await db.select().from(enrolments).where(eq(enrolments.id, result.enrolmentId));
    expect(e.isHistorical).toBe(true);
    expect(e.enrolledAt.toISOString()).toBe(joined.toISOString());

    const paidOn = new Date("2025-08-02T12:00:00+05:30");
    const paid = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId: e.id, amountPaise: 2500000, method: "upi", recordedBy: null, receivedAt: paidOn }),
    );
    const [p] = await db.select().from(payments).where(eq(payments.id, paid.paymentId));
    expect(p.receivedAt.toISOString()).toBe(paidOn.toISOString());
    expect(paid.financeTransactionId).toBeNull();
    const [s] = await db.select().from(students).where(eq(students.id, paid.studentId!));
    expect(s.onboardedAt).not.toBeNull();
  });
});

describe("past income in the ledger", () => {
  it("posts on the date received, tagged as history, and records the intake year", async () => {
    const [account] = await db.insert(financeAccounts).values({ name: `${MARKER} bank`, centerId, type: "bank" }).returning({ id: financeAccounts.id });
    const [lead] = await db.insert(leads).values({ studentName: `${MARKER} two`, primaryPhone: "+919800000098", centerId }).returning({ id: leads.id });
    const { enrolmentId } = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId: lead.id, course: "Foundation", centerId, mode: "hybrid", academicYear: "2025-26",
        totalFeePaiseOverride: 5000000, confirmedBy: null, enrolledAt: new Date("2025-07-01T12:00:00+05:30"), historical: true,
      }),
    );
    const paid = await db.transaction((tx) =>
      recordPayment(tx, { enrolmentId, amountPaise: 1000000, method: "neft", recordedBy: null, accountId: account.id, receivedAt: new Date("2025-08-05T12:00:00+05:30") }),
    );
    const [t] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, paid.financeTransactionId!));
    expect(t.occurredOn).toBe("2025-08-05");
    expect(t.source).toBe("history");
    const [s] = await db.select().from(students).where(eq(students.id, paid.studentId!));
    expect(s.intakeYear).toBe("2025-26");
  });
});

describe("programme length", () => {
  it("defaults to one year and accepts 1 to 5", () => {
    expect(programmeYears(null)).toBe(1);
    expect(programmeYears({ years: 2 })).toBe(2);
    expect(programmeYears({ years: "3" })).toBe(3);
    expect(programmeYears({ years: 9 })).toBe(1);
    expect(programmeYears({ years: 1.5 })).toBe(1);
  });
});
