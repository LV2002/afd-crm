/** One bank account serving several centres: each entry still belongs to one centre. Needs a real database. */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, financeAccountCenters, financeAccounts, financeTransactions, leads, payments, receipts, students } =
  await import("../src/lib/db/schema");
const { centersServedBy, pickCenter } = await import("../src/lib/finance/account-centers");
const { postEntry } = await import("../src/lib/finance/post");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");

const MARKER = "AcctCentersTest";
let kochi: string;
let kannur: string;
let thrissur: string;
let accountId: string;

async function sweep() {
  const accts = await db.select({ id: financeAccounts.id }).from(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  for (const a of accts) {
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, a.id));
    await db.delete(financeAccountCenters).where(eq(financeAccountCenters.accountId, a.id));
  }
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const l of ls) {
    const es = await db.select({ id: enrolments.id }).from(enrolments).where(eq(enrolments.leadId, l.id));
    for (const e of es) {
      const ps = await db.select({ id: payments.id }).from(payments).where(eq(payments.enrolmentId, e.id));
      for (const p of ps) await db.delete(receipts).where(eq(receipts.paymentId, p.id));
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
  const make = async (n: string) => (await db.insert(centers).values({ name: `${MARKER} ${n}`, city: n }).returning({ id: centers.id }))[0].id;
  kochi = await make("Kochi");
  kannur = await make("Kannur");
  thrissur = await make("Thrissur");
  accountId = (await db.insert(financeAccounts).values({ name: `${MARKER} Federal`, centerId: kochi, type: "bank" }).returning({ id: financeAccounts.id }))[0].id;
  await db.insert(financeAccountCenters).values({ accountId, centerId: kannur });
});
afterAll(sweep);

const base = { direction: "out" as const, kind: "expense" as const, category: "Rent", amountPaise: 1000, description: "t" };

describe("an account that serves several centres", () => {
  it("lists its main centre first, then the others", async () => {
    expect(await centersServedBy(db, accountId, kochi)).toEqual([kochi, kannur]);
  });

  it("files an entry under any centre it serves, and the main one by default", async () => {
    const own = await db.transaction((tx) => postEntry(tx, { ...base, occurredOn: "2026-11-01", accountId }));
    const other = await db.transaction((tx) => postEntry(tx, { ...base, occurredOn: "2026-11-01", accountId, centerId: kannur }));
    expect(own.centerId).toBe(kochi);
    expect(other.centerId).toBe(kannur);
    const [row] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, other.id));
    expect(row.centerId).toBe(kannur);
  });

  it("refuses a centre the account does not serve", async () => {
    await expect(db.transaction((tx) => postEntry(tx, { ...base, occurredOn: "2026-11-01", accountId, centerId: thrissur }))).rejects.toThrow(
      /not set up for that centre/,
    );
  });

  it("files a student's fee under the student's own centre", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} Meera`, primaryPhone: "+919847300888", centerId: kannur, interestedExams: ["NID"], examYear: "2027" })
      .returning({ id: leads.id });
    const [e] = await db
      .insert(enrolments)
      .values({ leadId: lead.id, course: "Foundation", centerId: kannur, mode: "offline", academicYear: "2026-27", totalFeePaise: 5_000_000, netFeePaise: 5_000_000, salesToAccountsAt: new Date() })
      .returning({ id: enrolments.id });
    const paid = await db.transaction((tx) => recordPayment(tx, { enrolmentId: e.id, amountPaise: 100_000, method: "upi", recordedBy: null, accountId }));
    const [entry] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, paid.financeTransactionId!));
    // The account's main centre is Kochi; the student is in Kannur, which the account serves.
    expect(entry.centerId).toBe(kannur);
  });

  it("falls back to the main centre for a student at a centre it does not serve", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} Anil`, primaryPhone: "+919847300889", centerId: thrissur, interestedExams: ["NID"], examYear: "2027" })
      .returning({ id: leads.id });
    const [e] = await db
      .insert(enrolments)
      .values({ leadId: lead.id, course: "Foundation", centerId: thrissur, mode: "offline", academicYear: "2026-27", totalFeePaise: 5_000_000, netFeePaise: 5_000_000, salesToAccountsAt: new Date() })
      .returning({ id: enrolments.id });
    const paid = await db.transaction((tx) => recordPayment(tx, { enrolmentId: e.id, amountPaise: 100_000, method: "upi", recordedBy: null, accountId }));
    const [entry] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, paid.financeTransactionId!));
    expect(entry.centerId).toBe(kochi);
  });
});

describe("pickCenter", () => {
  it("honours a served centre, defaults to the main, and can be strict", () => {
    expect(pickCenter(["a", "b"], "b")).toBe("b");
    expect(pickCenter(["a", "b"], null)).toBe("a");
    expect(pickCenter(["a", "b"], "c")).toBe("a");
    expect(() => pickCenter(["a", "b"], "c", true)).toThrow();
  });
});
