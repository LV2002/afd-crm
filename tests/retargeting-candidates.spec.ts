/**
 * The retargeting sync's view of "has this lead taken admission", against
 * Postgres.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, leads } = await import("../src/lib/db/schema");
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");
const { loadRetargetingCandidates } = await import("../src/lib/integrations/retargeting-candidates");
const { isRetargetingEligible } = await import("../src/lib/integrations/audience-sync");

const MARKER = "RetargetAdmittedTest";
let centerId: string;

async function sweep() {
  const rows = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const row of rows) await db.delete(enrolments).where(eq(enrolments.leadId, row.id));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db.insert(centers).values({ name: `${MARKER} centre`, city: "Kochi" }).returning({ id: centers.id });
  centerId = center.id;
});

afterAll(sweep);

describe("loadRetargetingCandidates", () => {
  it("marks a lead with a confirmed admission, and leaves an ordinary lead alone", async () => {
    const [admitted] = await db
      .insert(leads)
      .values({
        studentName: `${MARKER} admitted`,
        primaryPhone: "+919847300301",
        centerId,
        consentStatus: "given",
        temperature: "not_contacted",
      })
      .returning({ id: leads.id });
    const [ordinary] = await db
      .insert(leads)
      .values({
        studentName: `${MARKER} ordinary`,
        primaryPhone: "+919847300302",
        centerId,
        consentStatus: "given",
        temperature: "not_contacted",
      })
      .returning({ id: leads.id });

    await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId: admitted.id,
        course: `${MARKER}-course`,
        centerId,
        mode: "online",
        academicYear: "2026-27",
        totalFeePaiseOverride: 1000000,
        confirmedBy: null,
      }),
    );

    const candidates = await loadRetargetingCandidates();
    const a = candidates.find((c) => c.id === admitted.id)!;
    const o = candidates.find((c) => c.id === ordinary.id)!;

    expect(a.hasAdmission).toBe(true);
    expect(o.hasAdmission).toBe(false);

    const window = { windowDays: 180, now: new Date() };
    expect(isRetargetingEligible(a, window)).toBe(false);
    expect(isRetargetingEligible(o, window)).toBe(true);
  });
});
