/**
 * Integration test for the "mandatory next action" CHECK constraint on
 * `interactions` (migrations 0009 and 0087) — needs a real database with
 * migrations applied, same DATABASE_URL as the other integration suites:
 *
 *   npm run db:migrate && npm test
 *
 * Runs on the direct Drizzle client, same as identity/assignment's
 * integration tests — this is a raw Postgres constraint, so it doesn't
 * need the RLS-bound Supabase client the app itself uses for this table.
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
const { interactions, leads } = await import("../src/lib/db/schema");

const MARKER = "InteractionConstraintTest";
let leadId: string;

async function sweep() {
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} lead`, primaryPhone: "+919800000099" })
    .returning({ id: leads.id });
  leadId = lead.id;
});

afterAll(async () => {
  await sweep();
});

describe("interactions_next_action_required CHECK constraint", () => {
  it("rejects a manual-source interaction with no next_action", async () => {
    // drizzle-orm's own error message is just "Failed query: ..."; the
    // actual Postgres constraint name is one level down, on `.cause`.
    await expect(
      db.insert(interactions).values({ leadId, type: "call", source: "manual", nextAction: null }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining("interactions_next_action_required") }),
    });
  });

  // Migration 0087 tightened this: a next action now needs a date beside
  // it. The old version of this test passed a row with no date, which is
  // the row the new rule exists to stop — so it gains the date rather
  // than being relaxed. `tests/interaction-follow-up.spec.ts` covers the
  // new half of the rule in full.
  it("accepts a manual-source interaction that has a next_action and a date", async () => {
    const [row] = await db
      .insert(interactions)
      .values({
        leadId,
        type: "call",
        source: "manual",
        nextAction: "Call back tomorrow",
        nextFollowupAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: interactions.id });
    expect(row.id).toBeTruthy();
    await db.delete(interactions).where(eq(interactions.id, row.id));
  });

  it("rejects a next action with no date", async () => {
    await expect(
      db
        .insert(interactions)
        .values({ leadId, type: "call", source: "manual", nextAction: "Call back sometime" }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining("interactions_next_action_required"),
      }),
    });
  });

  it("exempts a system-source interaction from needing a next_action", async () => {
    const [row] = await db
      .insert(interactions)
      .values({ leadId, type: "note", source: "system", nextAction: null })
      .returning({ id: interactions.id });
    expect(row.id).toBeTruthy();
    await db.delete(interactions).where(eq(interactions.id, row.id));
  });
});
