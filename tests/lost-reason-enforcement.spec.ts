/**
 * Integration test for the `enforce_lost_reason` trigger (migration 0012)
 * — "Can't reach Lost without a reason" (docs/02-BUILD-PHASES.md § Session
 * plan). Needs a real database with migrations applied, same DATABASE_URL
 * as the other integration suites:
 *
 *   npm run db:migrate && npm run db:seed && npm test
 *
 * Runs on the direct Drizzle client, same as interactions-constraint's
 * suite — this is a raw Postgres trigger, so it doesn't need the
 * RLS-bound Supabase client the kanban board itself uses.
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
const { leads, pipelineStages } = await import("../src/lib/db/schema");

const MARKER = "LostReasonTest";

async function sweep() {
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}

let newStageId: string;
let lostStageId: string;

beforeAll(async () => {
  await sweep();
  const [newStage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.stageType, "new"))
    .limit(1);
  const [lostStage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.stageType, "lost"))
    .limit(1);
  if (!newStage || !lostStage) {
    throw new Error("Expected seeded 'new' and 'lost' stages — run `npm run db:seed` before `npm test`.");
  }
  newStageId = newStage.id;
  lostStageId = lostStage.id;
});

afterAll(async () => {
  await sweep();
});

describe("enforce_lost_reason trigger", () => {
  it("rejects moving a lead into a requires_reason stage with no lost_reason", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} reject`, primaryPhone: "+919800000101", stageId: newStageId })
      .returning({ id: leads.id });

    await expect(
      db.update(leads).set({ stageId: lostStageId }).where(eq(leads.id, lead.id)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining("lost_reason is required") }),
    });
  });

  it("accepts the move once a lost_reason is provided, and stamps lost_at", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} accept`, primaryPhone: "+919800000102", stageId: newStageId })
      .returning({ id: leads.id });

    const [updated] = await db
      .update(leads)
      .set({ stageId: lostStageId, lostReason: "not_interested" })
      .where(eq(leads.id, lead.id))
      .returning({ stageId: leads.stageId, lostReason: leads.lostReason, lostAt: leads.lostAt });

    expect(updated.stageId).toBe(lostStageId);
    expect(updated.lostReason).toBe("not_interested");
    expect(updated.lostAt).not.toBeNull();
  });

  it("clears lost_reason/lost_reason_detail/lost_at when the lead moves back out", async () => {
    const [lead] = await db
      .insert(leads)
      .values({
        studentName: `${MARKER} clear`,
        primaryPhone: "+919800000103",
        stageId: lostStageId,
        lostReason: "budget_constraint",
        lostReasonDetail: "Couldn't afford the fee",
      })
      .returning({ id: leads.id });

    const [reopened] = await db
      .update(leads)
      .set({ stageId: newStageId })
      .where(eq(leads.id, lead.id))
      .returning({ lostReason: leads.lostReason, lostReasonDetail: leads.lostReasonDetail, lostAt: leads.lostAt });

    expect(reopened.lostReason).toBeNull();
    expect(reopened.lostReasonDetail).toBeNull();
    expect(reopened.lostAt).toBeNull();
  });
});
