/**
 * Every interaction has to say what happens next, and when.
 *
 * Needs a real database with migrations applied:
 *
 *   npm run db:migrate && npm test
 *
 * The rule is stated three times — the form disables the button, the
 * server action refuses, and the CHECK constraint rejects the row — and
 * this covers the last one, because it is the only one that holds for a
 * write that did not come through the form.
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
const { CONVERTED_OUTCOME, needsFollowUp } = await import(
  "../src/lib/leads/interaction-follow-up"
);

const MARKER = "InteractionFollowUpTest";

let leadId: string;

/**
 * Drizzle wraps the driver error, putting its own "Failed query: …" text
 * in `message` and Postgres's actual complaint in `cause`. Asserting on
 * `message` therefore passes for any failed insert whatsoever, which is
 * not what these tests mean to prove.
 */
async function rejectionFrom(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("expected the insert to be rejected, and it was accepted");
}

async function sweep() {
  const rows = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const row of rows) {
    await db.delete(interactions).where(eq(interactions.leadId, row.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} lead`, primaryPhone: "+919847209901" })
    .returning({ id: leads.id });
  leadId = lead.id;
});

afterAll(sweep);

describe("needsFollowUp", () => {
  it("exempts the outcomes that end the conversation, and only those", () => {
    for (const outcome of [CONVERTED_OUTCOME, "not_interested", "dropped", "wrong_target_audience"]) {
      expect(needsFollowUp(outcome), outcome).toBe(false);
    }
    for (const outcome of ["connected", "not_reachable", "call_back_later", "interested"]) {
      expect(needsFollowUp(outcome), outcome).toBe(true);
    }
  });

  it("treats an unchosen outcome as needing a follow-up", () => {
    // Otherwise the rule would be avoidable by leaving the dropdown
    // alone, which is the one thing a counsellor in a hurry will do.
    expect(needsFollowUp(null)).toBe(true);
    expect(needsFollowUp(undefined)).toBe(true);
    expect(needsFollowUp("")).toBe(true);
  });
});

describe("the interactions CHECK constraint", () => {
  it("rejects a next action with no date", async () => {
    // The whole point of the change. A next action nobody will be shown
    // again is the shape of a lead quietly abandoned mid-conversation.
    const reason = await rejectionFrom(
      db.insert(interactions).values({
        leadId,
        type: "call",
        outcome: "connected",
        nextAction: "Call again about the NIFT batch",
        source: "manual",
      }),
    );
    expect(reason).toMatch(/interactions_next_action_required/);
  });

  it("rejects a date with no next action", async () => {
    const reason = await rejectionFrom(
      db.insert(interactions).values({
        leadId,
        type: "call",
        outcome: "connected",
        nextFollowupAt: new Date(Date.now() + 86_400_000),
        source: "manual",
      }),
    );
    expect(reason).toMatch(/interactions_next_action_required/);
  });

  it("accepts both together", async () => {
    const [row] = await db
      .insert(interactions)
      .values({
        leadId,
        type: "call",
        outcome: "connected",
        nextAction: "Send the fee structure",
        nextFollowupAt: new Date(Date.now() + 86_400_000),
        source: "manual",
      })
      .returning({ id: interactions.id });
    expect(row.id).toBeTruthy();
  });

  it("accepts a converted interaction with neither", async () => {
    // They joined. There is no next call, and demanding one would have
    // counsellors typing "nothing" into a field forever.
    const [row] = await db
      .insert(interactions)
      .values({
        leadId,
        type: "call",
        outcome: CONVERTED_OUTCOME,
        source: "manual",
      })
      .returning({ id: interactions.id });
    expect(row.id).toBeTruthy();
  });

  it.each(["not_interested", "dropped", "wrong_target_audience"])(
    "accepts a %s interaction with neither",
    async (outcome) => {
      const [row] = await db
        .insert(interactions)
        .values({ leadId, type: "call", outcome, source: "manual" })
        .returning({ id: interactions.id });
      expect(row.id).toBeTruthy();
    },
  );

  it("still exempts a system-written interaction", async () => {
    // An automatic log entry has no counsellor to have decided anything.
    // This exemption predates the change and must survive it.
    const [row] = await db
      .insert(interactions)
      .values({ leadId, type: "whatsapp", source: "system" })
      .returning({ id: interactions.id });
    expect(row.id).toBeTruthy();
  });
});

import { nextFollowupUpdate } from "../src/lib/leads/interaction-follow-up";

describe("nextFollowupUpdate", () => {
  it("a new date replaces the old follow-up", () => {
    expect(nextFollowupUpdate("call_back_later", "2026-10-20T10:00")).toEqual({ set: "2026-10-20T10:00" });
  });

  it("a finished conversation with no date clears the follow-up", () => {
    for (const outcome of ["converted", "not_interested", "dropped", "wrong_target_audience"]) {
      expect(nextFollowupUpdate(outcome, null)).toEqual({ clear: true });
    }
  });

  it("an open conversation with no date changes nothing", () => {
    expect(nextFollowupUpdate("connected", null)).toBeNull();
  });
});
