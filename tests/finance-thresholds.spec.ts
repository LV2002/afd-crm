/**
 * Money approaching a mark: when it is announced, that it is announced once,
 * and who is told.
 */
import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { centers, financeAccounts, financeAlertRules, financeAlertState, financeTransactions, notifications } = await import("../src/lib/db/schema");
const { checkFinanceThresholds, financialYearOf, thresholdStage } = await import("../src/lib/finance/thresholds");
const { postEntry } = await import("../src/lib/finance/post");

import { createTestUsers } from "./helpers/fixture-users";

describe("thresholdStage", () => {
  it("is below, then warns at 90 percent, then reached", () => {
    const limit = 200_000_000; // 20 lakh
    expect(thresholdStage(179_999_999, limit, 90)).toBe("below");
    expect(thresholdStage(180_000_000, limit, 90)).toBe("warn");
    expect(thresholdStage(199_999_999, limit, 90)).toBe("warn");
    expect(thresholdStage(200_000_000, limit, 90)).toBe("reached");
    expect(thresholdStage(900_000_000, 1_000_000_000, 90)).toBe("warn"); // 90 lakh of 1 crore
  });
});

describe("financialYearOf", () => {
  it("runs April to March by default", () => {
    expect(financialYearOf("2026-11-10", 4)).toEqual({ key: "2026-27", from: "2026-04-01", to: "2027-03-31" });
    expect(financialYearOf("2027-02-01", 4)).toEqual({ key: "2026-27", from: "2026-04-01", to: "2027-03-31" });
    expect(financialYearOf("2026-04-01", 4).key).toBe("2026-27");
    expect(financialYearOf("2026-03-31", 4).key).toBe("2025-26");
  });
  it("can be the calendar year", () => {
    expect(financialYearOf("2026-11-10", 1)).toEqual({ key: "2026-27", from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("checking the marks", () => {
  const MARK = "ThresholdTest";
  let centerId: string;
  let accountId: string;
  let ruleId: string;
  let cleanupUsers: () => Promise<void>;
  let accountsUser: string;
  const L = 200_000_000; // ₹20 lakh

  const stages = async () => (await db.select().from(financeAlertState).where(eq(financeAlertState.ruleId, ruleId))).map((s) => s.stage).sort();
  const heard = async () => db.select().from(notifications).where(eq(notifications.entityId, ruleId));
  const at = (balancePaise: number, incomePaise = 0) => checkFinanceThresholds(new Date(), { balancePaise, incomePaise });

  async function sweep() {
    await db.execute(sql`delete from notifications where entity_id in (select id from finance_alert_rules where label like ${MARK + "%"})`);
    await db.delete(financeAlertRules).where(like(financeAlertRules.label, `${MARK}%`));
    await db.execute(sql`delete from finance_transactions where description like ${MARK + "%"}`);
    await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARK}%`));
    await db.delete(centers).where(like(centers.name, `${MARK}%`));
  }

  beforeAll(async () => {
    await sweep();
    // Park the real marks, so only this test's rule is judged.
    await db.execute(sql`update finance_alert_rules set is_active = false where label not like ${MARK + "%"}`);
    const users = await createTestUsers(["accounts"]);
    cleanupUsers = users.cleanup;
    accountsUser = users.ids[0];
    const [c] = await db.insert(centers).values({ name: `${MARK} centre`, city: "x" }).returning({ id: centers.id });
    centerId = c.id;
    const [a] = await db.insert(financeAccounts).values({ name: `${MARK} bank`, centerId, type: "bank" }).returning({ id: financeAccounts.id });
    accountId = a.id;
    const [r] = await db
      .insert(financeAlertRules)
      .values({ label: `${MARK} 20 lakh`, metric: "bank_balance", limitPaise: L, warnPercent: 90 })
      .returning({ id: financeAlertRules.id });
    ruleId = r.id;
  });
  afterAll(async () => {
    await sweep();
    await db.execute(sql`update finance_alert_rules set is_active = true where label not like ${MARK + "%"}`);
    await cleanupUsers();
  });

  it("says nothing below 18 lakh", async () => {
    expect(await at(179_999_999)).toMatchObject({ checked: 1, announced: 0 });
    expect(await stages()).toEqual([]);
    expect(await heard()).toHaveLength(0);
  });

  it("warns once at 18 lakh, and tells accounts but not nobody", async () => {
    expect((await at(180_000_000)).announced).toBe(1);
    expect(await stages()).toEqual(["warn"]);
    expect((await at(185_000_000)).announced).toBe(0); // said once
    const told = await heard();
    expect(told.length).toBeGreaterThan(0);
    expect(told.some((n) => n.recipientId === accountsUser)).toBe(true);
    expect(told[0].title).toContain("close to");
  });

  it("announces passing 20 lakh once more, and only once", async () => {
    expect((await at(201_000_000)).announced).toBe(1);
    expect(await stages()).toEqual(["reached", "warn"]);
    expect((await at(250_000_000)).announced).toBe(0);
    expect((await heard()).some((n) => n.title.includes("over"))).toBe(true);
  });

  it("arms the balance again once it falls back under the line", async () => {
    await at(100_000_000);
    expect(await stages()).toEqual([]);
    expect((await at(181_000_000)).announced).toBe(1);
  });

  it("jumping straight past the mark announces it once, not twice", async () => {
    await at(0);
    const before = (await heard()).length;
    expect((await at(300_000_000)).announced).toBe(1);
    expect((await heard()).length - before).toBeGreaterThan(0);
    expect(await stages()).toEqual(["reached", "warn"]);
  });

  it("reads the bank balance from the ledger, leaving out entries on or before the opening date", async () => {
    const { bankBalancePaise } = await import("../src/lib/finance/thresholds");
    const base = await bankBalancePaise();
    await db.update(financeAccounts).set({ openingBalancePaise: 50_000_00, openingAsOf: "2025-03-31" }).where(eq(financeAccounts.id, accountId));
    const post = (on: string, rupees: number) =>
      postEntry(db, { occurredOn: on, direction: "in", kind: "other_income", accountId, category: "Other", amountPaise: rupees * 100, description: `${MARK} entry` });
    await post("2025-03-30", 1000); // already inside the opening balance
    await post("2025-04-02", 250);
    expect((await bankBalancePaise()) - base).toBe(50_000_00 + 250 * 100);
  });
});
