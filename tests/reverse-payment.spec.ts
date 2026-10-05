/**
 * Integration tests for reversePayment() — needs a real database with
 * migrations applied:
 *
 *   npm run db:migrate && npm test
 *
 * Runs through the shared Drizzle `db` client directly, the same bypass
 * reversePayment() itself uses, so this covers the ledger logic rather
 * than the RLS/scope boundary around reversePaymentAction().
 *
 * The thing worth testing here is not that a row appears. It is that the
 * two kinds behave differently on the cash side — a reversal says the
 * money never arrived and undoes the original entry; a refund says it
 * arrived and has now gone back, so the original stands and a new
 * outgoing entry is posted. Get that wrong and the bank reconciliation
 * is wrong on two separate days, in opposite directions.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, financeAccounts, financeTransactions, leads, payments, receipts, students } =
  await import("../src/lib/db/schema");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");
const { reversePayment } = await import("../src/lib/enrolment/reverse-payment");

const MARKER = "ReversePaymentTest";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let centerId: string;
let accountId: string;

async function sweep() {
  const testLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    const enrolmentRows = await db
      .select({ id: enrolments.id })
      .from(enrolments)
      .where(eq(enrolments.leadId, lead.id));
    for (const enrolment of enrolmentRows) {
      await db.delete(financeTransactions).where(eq(financeTransactions.enrolmentId, enrolment.id));
      const paymentRows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.enrolmentId, enrolment.id));
      for (const payment of paymentRows) {
        await db.delete(receipts).where(eq(receipts.paymentId, payment.id));
      }
      await db.delete(payments).where(eq(payments.enrolmentId, enrolment.id));
    }
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
  }
  await db.delete(students).where(like(students.fullName, `${MARKER}%`));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db
    .insert(centers)
    .values({ name: testName("center"), city: "Kochi" })
    .returning({ id: centers.id });
  centerId = center.id;
  const [account] = await db
    .insert(financeAccounts)
    .values({ name: testName("account"), type: "bank", centerId })
    .returning({ id: financeAccounts.id });
  accountId = account.id;
});

afterAll(async () => {
  await sweep();
});

async function paidEnrolment(tag: string, phone: string, amountPaise = 5_000_00) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone, centerId })
    .returning({ id: leads.id });
  const [enrolment] = await db
    .insert(enrolments)
    .values({
      leadId: lead.id,
      course: "Foundation",
      centerId,
      mode: "offline",
      academicYear: "2026-27",
      totalFeePaise: 10_000_00,
      netFeePaise: 10_000_00,
      salesToAccountsAt: new Date(),
    })
    .returning({ id: enrolments.id });

  const payment = await db.transaction((tx) =>
    recordPayment(tx, {
      enrolmentId: enrolment.id,
      amountPaise,
      method: "upi",
      recordedBy: null,
      accountId,
    }),
  );

  return { enrolmentId: enrolment.id, paymentId: payment.paymentId, amountPaise };
}

/** Credits minus debits, the way every balance in this system is worked out. */
async function netPaid(enrolmentId: string): Promise<number> {
  const rows = await db
    .select({ amountPaise: payments.amountPaise, direction: payments.direction })
    .from(payments)
    .where(eq(payments.enrolmentId, enrolmentId));
  return rows.reduce((sum, r) => sum + (r.direction === "credit" ? r.amountPaise : -r.amountPaise), 0);
}

describe("reversePayment", () => {
  it("refuses an empty reason", async () => {
    const { paymentId } = await paidEnrolment("r1", "+919847400101");
    await expect(
      db.transaction((tx) =>
        reversePayment(tx, { paymentId, kind: "reversal", reason: "   ", recordedBy: null }),
      ),
    ).rejects.toThrow(/Say why/);
  });

  it("takes the money back off the balance without touching the original", async () => {
    const { enrolmentId, paymentId, amountPaise } = await paidEnrolment("r2", "+919847400102");
    expect(await netPaid(enrolmentId)).toBe(amountPaise);

    await db.transaction((tx) =>
      reversePayment(tx, {
        paymentId,
        kind: "reversal",
        reason: "Entered against the wrong student",
        recordedBy: null,
      }),
    );

    expect(await netPaid(enrolmentId)).toBe(0);

    // The original is untouched — non-negotiable #7. A correction is a
    // second row, never an edit of the first.
    const [original] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(original.direction).toBe("credit");
    expect(original.amountPaise).toBe(amountPaise);
    expect(original.reversalReason).toBeNull();
  });

  it("records the reason on the reversal, where the note prints it", async () => {
    const { enrolmentId, paymentId } = await paidEnrolment("r3", "+919847400103");
    await db.transaction((tx) =>
      reversePayment(tx, { paymentId, kind: "reversal", reason: "Duplicate entry", recordedBy: null }),
    );

    const [reversal] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.enrolmentId, enrolmentId), eq(payments.direction, "debit")));
    expect(reversal.reversesPaymentId).toBe(paymentId);
    expect(reversal.reversalReason).toBe("Duplicate entry");
  });

  it("undoes the cash entry for a reversal", async () => {
    const { enrolmentId, paymentId, amountPaise } = await paidEnrolment("r4", "+919847400104");

    await db.transaction((tx) =>
      reversePayment(tx, { paymentId, kind: "reversal", reason: "Never arrived", recordedBy: null }),
    );

    const ledger = await db
      .select({
        amountPaise: financeTransactions.amountPaise,
        reverses: financeTransactions.reversesTransactionId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.enrolmentId, enrolmentId));

    // The original entry plus its negative, netting to nothing: the
    // institute's cash for that day is back to what it really was.
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(0);
    expect(ledger.some((row) => row.reverses !== null)).toBe(true);
    expect(ledger.some((row) => row.amountPaise === amountPaise)).toBe(true);
  });

  it("posts a refund as new money going out, leaving the original entry standing", async () => {
    const { enrolmentId, paymentId, amountPaise } = await paidEnrolment("r5", "+919847400105");

    await db.transaction((tx) =>
      reversePayment(tx, {
        paymentId,
        kind: "refund",
        reason: "Family withdrew after one week",
        recordedBy: null,
        method: "neft",
        accountId,
      }),
    );

    const ledger = await db
      .select({
        direction: financeTransactions.direction,
        amountPaise: financeTransactions.amountPaise,
        reverses: financeTransactions.reversesTransactionId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.enrolmentId, enrolmentId));

    expect(ledger).toHaveLength(2);
    // Nothing was reversed: the payment really did arrive, and the books
    // for that day were right.
    expect(ledger.every((row) => row.reverses === null)).toBe(true);
    expect(ledger.filter((row) => row.direction === "in")).toHaveLength(1);
    expect(ledger.filter((row) => row.direction === "out")).toHaveLength(1);
    expect(ledger.find((row) => row.direction === "out")?.amountPaise).toBe(amountPaise);

    // Either way the student owes the money again.
    expect(await netPaid(enrolmentId)).toBe(0);
  });

  it("refuses a refund with no account to pay it from", async () => {
    const { paymentId } = await paidEnrolment("r6", "+919847400106");
    await expect(
      db.transaction((tx) =>
        reversePayment(tx, {
          paymentId,
          kind: "refund",
          reason: "Withdrew",
          recordedBy: null,
          method: "neft",
        }),
      ),
    ).rejects.toThrow(/which account/);
  });

  it("refuses to reverse the same payment twice", async () => {
    const { paymentId } = await paidEnrolment("r7", "+919847400107");
    await db.transaction((tx) =>
      reversePayment(tx, { paymentId, kind: "reversal", reason: "Wrong student", recordedBy: null }),
    );

    await expect(
      db.transaction((tx) =>
        reversePayment(tx, { paymentId, kind: "reversal", reason: "Again", recordedBy: null }),
      ),
    ).rejects.toThrow(/already been reversed/);
  });

  it("refuses to reverse a reversal", async () => {
    const { enrolmentId, paymentId } = await paidEnrolment("r8", "+919847400108");
    await db.transaction((tx) =>
      reversePayment(tx, { paymentId, kind: "reversal", reason: "Wrong student", recordedBy: null }),
    );

    const [reversal] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.enrolmentId, enrolmentId), eq(payments.direction, "debit")));

    await expect(
      db.transaction((tx) =>
        reversePayment(tx, { paymentId: reversal.id, kind: "reversal", reason: "No", recordedBy: null }),
      ),
    ).rejects.toThrow(/itself a reversal/);
  });

  it("leaves the student record alone — a gate is a thing that happened", async () => {
    const { enrolmentId, paymentId } = await paidEnrolment("r9", "+919847400109");

    const [before] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(before.studentId).not.toBeNull();

    await db.transaction((tx) =>
      reversePayment(tx, { paymentId, kind: "reversal", reason: "Wrong student", recordedBy: null }),
    );

    const [after] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(after.studentId).toBe(before.studentId);
    expect(after.accountsToAcademicsAt).not.toBeNull();

    const [student] = await db
      .select({ id: students.id, deletedAt: students.deletedAt })
      .from(students)
      .where(eq(students.id, after.studentId!));
    expect(student.deletedAt).toBeNull();
  });

  it("still corrects the balance for a payment that never reached the ledger", async () => {
    // Payments recorded before the finance ledger existed have no cash
    // entry. Reversing one is still a valid correction to what the
    // student owes; there is simply nothing to undo on the cash side.
    const [lead] = await db
      .insert(leads)
      .values({ studentName: testName("r10"), primaryPhone: "+919847400110", centerId })
      .returning({ id: leads.id });
    const [enrolment] = await db
      .insert(enrolments)
      .values({
        leadId: lead.id,
        course: "Foundation",
        centerId,
        mode: "offline",
        academicYear: "2026-27",
        totalFeePaise: 10_000_00,
        netFeePaise: 10_000_00,
        salesToAccountsAt: new Date(),
      })
      .returning({ id: enrolments.id });

    const payment = await db.transaction((tx) =>
      recordPayment(tx, {
        enrolmentId: enrolment.id,
        amountPaise: 2_000_00,
        method: "cash",
        recordedBy: null,
      }),
    );

    await db.transaction((tx) =>
      reversePayment(tx, {
        paymentId: payment.paymentId,
        kind: "reversal",
        reason: "Legacy row, never happened",
        recordedBy: null,
      }),
    );

    expect(await netPaid(enrolment.id)).toBe(0);
    const ledger = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.enrolmentId, enrolment.id));
    expect(ledger).toHaveLength(0);
  });

  it("refuses a payment that does not exist", async () => {
    await expect(
      db.transaction((tx) =>
        reversePayment(tx, {
          paymentId: "00000000-0000-0000-0000-000000000000",
          kind: "reversal",
          reason: "Nope",
          recordedBy: null,
        }),
      ),
    ).rejects.toThrow(/no longer exists/);
  });
});
