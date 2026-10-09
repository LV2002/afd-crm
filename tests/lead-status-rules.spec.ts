/**
 * Integration tests for the `enforce_lead_status` and
 * `write_temperature_history` triggers (migration 0099).
 *
 * This is the spec for the rule Leon asked for: "if my counsellors or
 * anybody tries to mark a lead's temperature to took admission and the
 * lead has not been marked as admission confirmed … it should not allow
 * the temperature to change." It runs against the real database because
 * the rule's whole value is that it holds for EVERY write path — the
 * edit form, an import, a script, a direct SQL session — and a unit test
 * of application code cannot show that.
 *
 * Needs a real database with migrations applied, same DATABASE_URL as the
 * other integration suites:
 *
 *   npm run db:migrate && npm test
 *
 * Runs on the direct Drizzle client: this is a raw Postgres trigger, so it
 * doesn't need the RLS-bound Supabase client the status bar itself uses.
 */
import { config as loadEnv } from "dotenv";
import { asc, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { centers, enrolments, leads, temperatureHistory } = await import("../src/lib/db/schema");

const MARKER = "LeadStatusRulesTest";

let centerId: string;
let seq = 0;

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [center] = await db
    .insert(centers)
    .values({ name: `${MARKER} centre`, city: "Kochi" })
    .returning({ id: centers.id });
  centerId = center.id;
});

afterAll(async () => {
  await sweep();
});

async function makeLead(temperature: string | null = "hot", extra: Partial<typeof leads.$inferInsert> = {}) {
  seq += 1;
  const [lead] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} ${seq}`,
      primaryPhone: `+91980000${String(1000 + seq).padStart(4, "0")}`,
      centerId,
      temperature,
      ...extra,
    })
    .returning({ id: leads.id });
  return lead.id;
}

async function addEnrolment(leadId: string, over: Partial<typeof enrolments.$inferInsert> = {}) {
  const [row] = await db
    .insert(enrolments)
    .values({
      leadId,
      course: `${MARKER} course`,
      centerId,
      mode: "offline",
      academicYear: "2026-27",
      totalFeePaise: 1000000,
      netFeePaise: 1000000,
      ...over,
    })
    .returning({ id: enrolments.id });
  return row.id;
}

/** The Postgres error text, which drizzle hangs off `cause`. */
const refusedWith = (fragment: string) =>
  expect.objectContaining({
    cause: expect.objectContaining({ message: expect.stringContaining(fragment) }),
  });

describe("Took admission needs a confirmed admission", () => {
  it("refuses to mark a lead Took admission when there is no admission behind it", async () => {
    const leadId = await makeLead("hot");

    await expect(
      db.update(leads).set({ temperature: "took_admission" }).where(eq(leads.id, leadId)),
    ).rejects.toMatchObject(refusedWith("confirming the admission"));

    const [after] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(after.temperature).toBe("hot");
  });

  it("refuses to CREATE a lead already at Took admission", async () => {
    await expect(makeLead("took_admission")).rejects.toMatchObject(refusedWith("confirming the admission"));
  });

  it("allows it once the admission exists — which is what confirmAdmission() does, in that order", async () => {
    const leadId = await makeLead("hot");
    await addEnrolment(leadId);

    const [after] = await db
      .update(leads)
      .set({ temperature: "took_admission" })
      .where(eq(leads.id, leadId))
      .returning({ temperature: leads.temperature });

    expect(after.temperature).toBe("took_admission");
  });

  it("does not count an admission that has been deleted", async () => {
    const leadId = await makeLead("hot");
    const enrolmentId = await addEnrolment(leadId);
    await db.update(enrolments).set({ deletedAt: new Date() }).where(eq(enrolments.id, enrolmentId));

    await expect(
      db.update(leads).set({ temperature: "took_admission" }).where(eq(leads.id, leadId)),
    ).rejects.toMatchObject(refusedWith("confirming the admission"));
  });

  it("holds a lead at Took admission while its admission stands", async () => {
    const leadId = await makeLead("hot");
    await addEnrolment(leadId);
    await db.update(leads).set({ temperature: "took_admission" }).where(eq(leads.id, leadId));

    await expect(
      db.update(leads).set({ temperature: "hot" }).where(eq(leads.id, leadId)),
    ).rejects.toMatchObject(refusedWith("admission is confirmed"));

    const [after] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(after.temperature).toBe("took_admission");
  });

  it("lets the status change once the admission is dropped", async () => {
    const leadId = await makeLead("hot");
    const enrolmentId = await addEnrolment(leadId);
    await db.update(leads).set({ temperature: "took_admission" }).where(eq(leads.id, leadId));
    await db.update(enrolments).set({ droppedAt: new Date() }).where(eq(enrolments.id, enrolmentId));

    const [after] = await db
      .update(leads)
      .set({ temperature: "future_prospect" })
      .where(eq(leads.id, leadId))
      .returning({ temperature: leads.temperature });

    expect(after.temperature).toBe("future_prospect");
  });

  it("does not interfere with an edit that leaves the status alone", async () => {
    const leadId = await makeLead("hot");
    await addEnrolment(leadId);
    await db.update(leads).set({ temperature: "took_admission" }).where(eq(leads.id, leadId));

    const [after] = await db
      .update(leads)
      .set({ district: "Ernakulam" })
      .where(eq(leads.id, leadId))
      .returning({ district: leads.district, temperature: leads.temperature });

    expect(after).toEqual({ district: "Ernakulam", temperature: "took_admission" });
  });
});

describe("closing outcomes and their reasons", () => {
  it("refuses Negative with no reason", async () => {
    const leadId = await makeLead("hot");

    await expect(
      db.update(leads).set({ temperature: "negative" }).where(eq(leads.id, leadId)),
    ).rejects.toMatchObject(refusedWith("lost_reason is required"));
  });

  it("accepts Negative with a reason, and stamps lost_at", async () => {
    const leadId = await makeLead("hot");

    const [updated] = await db
      .update(leads)
      .set({ temperature: "negative", lostReason: "not_interested" })
      .where(eq(leads.id, leadId))
      .returning({ temperature: leads.temperature, lostReason: leads.lostReason, lostAt: leads.lostAt });

    expect(updated.temperature).toBe("negative");
    expect(updated.lostReason).toBe("not_interested");
    expect(updated.lostAt).not.toBeNull();
  });

  it("asks for a reason on Joined competitor too", async () => {
    const leadId = await makeLead("warm");
    await expect(
      db.update(leads).set({ temperature: "joined_competitor" }).where(eq(leads.id, leadId)),
    ).rejects.toMatchObject(refusedWith("lost_reason is required"));
  });

  it("does not ask for a reason where the admin has not asked for one", async () => {
    const leadId = await makeLead("cold");

    const [updated] = await db
      .update(leads)
      .set({ temperature: "wrong_target" })
      .where(eq(leads.id, leadId))
      .returning({ temperature: leads.temperature, lostAt: leads.lostAt });

    expect(updated.temperature).toBe("wrong_target");
    expect(updated.lostAt).not.toBeNull();
  });

  it("clears the reason and lost_at when the lead is re-opened", async () => {
    const leadId = await makeLead("hot");
    await db
      .update(leads)
      .set({ temperature: "negative", lostReason: "budget_constraint", lostReasonDetail: "Couldn't afford it" })
      .where(eq(leads.id, leadId));

    const [reopened] = await db
      .update(leads)
      .set({ temperature: "warm" })
      .where(eq(leads.id, leadId))
      .returning({
        lostReason: leads.lostReason,
        lostReasonDetail: leads.lostReasonDetail,
        lostAt: leads.lostAt,
      });

    expect(reopened.lostReason).toBeNull();
    expect(reopened.lostReasonDetail).toBeNull();
    expect(reopened.lostAt).toBeNull();
  });

  it("never touches a lead's lost fields when the status does not change", async () => {
    // The trap the old stage trigger set, and why migration 0099 replaced
    // it before backfilling anything: a lead that is Negative with its
    // reason must keep that reason through every unrelated edit.
    const leadId = await makeLead("hot");
    await db
      .update(leads)
      .set({ temperature: "negative", lostReason: "not_reachable" })
      .where(eq(leads.id, leadId));

    const [after] = await db
      .update(leads)
      .set({ city: "Kochi" })
      .where(eq(leads.id, leadId))
      .returning({ lostReason: leads.lostReason, lostAt: leads.lostAt });

    expect(after.lostReason).toBe("not_reachable");
    expect(after.lostAt).not.toBeNull();
  });

  it("does not refuse an unrelated edit to a closed lead that has lost its reason", async () => {
    // Leads closed before this rule existed (Dead, with no reason) were
    // carried over by the migration as Negative. Refusing every later edit
    // to them for want of a reason that was never recorded would lock them.
    const leadId = await makeLead("hot");
    await db
      .update(leads)
      .set({ temperature: "negative", lostReason: "other" })
      .where(eq(leads.id, leadId));
    await db.update(leads).set({ lostReason: null }).where(eq(leads.id, leadId));

    const [after] = await db
      .update(leads)
      .set({ district: "Thrissur" })
      .where(eq(leads.id, leadId))
      .returning({ district: leads.district });

    expect(after.district).toBe("Thrissur");
  });
});

describe("a temperature the list does not know", () => {
  it("is treated as in-progress, not refused", async () => {
    // A value an admin removed, or typed into an import. Guessing it means
    // something stronger than "being worked" would either lock a lead or
    // trip the admission rule by accident.
    const leadId = await makeLead("some_retired_value");
    const [row] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(row.temperature).toBe("some_retired_value");
  });
});

describe("the status history", () => {
  it("records where a lead started and every change after it", async () => {
    const leadId = await makeLead("not_contacted");
    await db.update(leads).set({ temperature: "contacted" }).where(eq(leads.id, leadId));
    await db.update(leads).set({ temperature: "hot" }).where(eq(leads.id, leadId));

    const rows = await db
      .select()
      .from(temperatureHistory)
      .where(eq(temperatureHistory.leadId, leadId))
      .orderBy(asc(temperatureHistory.changedAt));

    expect(rows.map((r) => [r.fromTemperature, r.toTemperature])).toEqual([
      [null, "not_contacted"],
      ["not_contacted", "contacted"],
      ["contacted", "hot"],
    ]);
    // The first move has nothing to measure from beyond the start, the
    // later ones have a duration in the status they left.
    expect(rows[1].durationInPreviousSeconds).not.toBeNull();
  });

  it("is not written for an edit that leaves the status alone", async () => {
    const leadId = await makeLead("hot");
    await db.update(leads).set({ city: "Kochi" }).where(eq(leads.id, leadId));

    const rows = await db.select().from(temperatureHistory).where(eq(temperatureHistory.leadId, leadId));
    expect(rows).toHaveLength(1);
  });
});
