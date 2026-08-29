/**
 * Integration tests for mergeLeads() — needs a real database with
 * migrations applied (same DATABASE_URL as tests/identity-resolve.spec.ts):
 *
 *   npm run db:migrate && npm test
 *
 * Runs through the shared Drizzle `db` client directly (the same bypass
 * mergeLeads() itself uses — see its own doc comment), so this covers the
 * merge logic, not the RLS boundary around confirmMerge()/rejectMerge().
 */
import { config as loadEnv } from "dotenv";
import { eq, like, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const {
  enquiries,
  interactions,
  leadIdentifiers,
  leadMerges,
  leads,
  mergeReviewQueue,
  tasks,
} = await import("../src/lib/db/schema");
const { mergeLeads } = await import("../src/lib/identity/merge-leads");

const MARKER = "MergeLeadsTest";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sweepTestLeads() {
  // lead_merges references leads with onDelete: restrict (never cascade —
  // a merge record must never silently vanish), so it has to go first;
  // everything else cascades off leads.id.
  const testLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(like(leads.studentName, `${MARKER}%`));
  const ids = testLeads.map((l) => l.id);
  if (ids.length > 0) {
    await db.delete(leadMerges).where(or(...ids.map((id) => eq(leadMerges.survivorLeadId, id))));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}

beforeAll(async () => {
  await sweepTestLeads();
});

afterAll(async () => {
  await sweepTestLeads();
});

async function makeLead(tag: string, phone: string) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: testName(tag), primaryPhone: phone })
    .returning({ id: leads.id });
  await db.insert(leadIdentifiers).values({ leadId: lead.id, kind: "phone", valueNormalised: phone, isPrimary: true });
  return lead.id;
}

describe("mergeLeads", () => {
  it("refuses to merge a lead into itself", async () => {
    const leadId = await makeLead("self", "+919847100101");
    await expect(
      db.transaction((tx) => mergeLeads(tx, { survivorLeadId: leadId, mergedLeadId: leadId, mergedBy: null })),
    ).rejects.toThrow(/cannot be merged into itself/);
  });

  it("throws when the merged lead doesn't exist", async () => {
    const survivorId = await makeLead("survivor-only", "+919847100102");
    await expect(
      db.transaction((tx) =>
        mergeLeads(tx, {
          survivorLeadId: survivorId,
          mergedLeadId: "00000000-0000-0000-0000-000000000000",
          mergedBy: null,
        }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("reassigns enquiries, interactions, tasks and identifiers onto the survivor, and soft-deletes the merged lead", async () => {
    const survivorId = await makeLead("survivor", "+919847100103");
    const mergedId = await makeLead("merged", "+919847100104");

    await db.insert(enquiries).values({ leadId: mergedId, source: "Meta" });
    await db.insert(interactions).values({ leadId: mergedId, type: "call", nextAction: "follow up", source: "manual" });
    await db.insert(tasks).values({ leadId: mergedId, title: "Send brochure" });

    await db.transaction((tx) =>
      mergeLeads(tx, {
        survivorLeadId: survivorId,
        mergedLeadId: mergedId,
        mergedBy: null,
        reason: "same person, confirmed by phone",
      }),
    );

    const [enquiryRow] = await db.select().from(enquiries).where(eq(enquiries.leadId, survivorId));
    expect(enquiryRow).toBeDefined();
    const [interactionRow] = await db.select().from(interactions).where(eq(interactions.leadId, survivorId));
    expect(interactionRow).toBeDefined();
    const [taskRow] = await db.select().from(tasks).where(eq(tasks.leadId, survivorId));
    expect(taskRow).toBeDefined();

    const identifierRows = await db.select().from(leadIdentifiers).where(eq(leadIdentifiers.leadId, survivorId));
    expect(identifierRows.map((r) => r.valueNormalised)).toContain("+919847100104");

    const [mergedLeadRow] = await db.select().from(leads).where(eq(leads.id, mergedId));
    expect(mergedLeadRow.deletedAt).not.toBeNull();
    expect(mergedLeadRow.mergedIntoLeadId).toBe(survivorId);

    const [mergeRecord] = await db.select().from(leadMerges).where(eq(leadMerges.mergedLeadId, mergedId));
    expect(mergeRecord.survivorLeadId).toBe(survivorId);
    expect(mergeRecord.reason).toBe("same person, confirmed by phone");
    expect(mergeRecord.snapshot).toBeTruthy();
  });

  it("reassigns other pending merge_review_queue rows referencing the merged lead onto the survivor", async () => {
    const survivorId = await makeLead("survivor2", "+919847100105");
    const mergedId = await makeLead("merged2", "+919847100106");
    const thirdLeadId = await makeLead("third", "+919847100107");

    const [otherReview] = await db
      .insert(mergeReviewQueue)
      .values({ leadId: mergedId, candidateLeadId: thirdLeadId, status: "pending" })
      .returning({ id: mergeReviewQueue.id });

    await db.transaction((tx) =>
      mergeLeads(tx, { survivorLeadId: survivorId, mergedLeadId: mergedId, mergedBy: null }),
    );

    const [reassigned] = await db
      .select()
      .from(mergeReviewQueue)
      .where(eq(mergeReviewQueue.id, otherReview.id));
    expect(reassigned.leadId).toBe(survivorId);
    expect(reassigned.candidateLeadId).toBe(thirdLeadId);
    expect(reassigned.status).toBe("pending");
  });

  it("auto-rejects a pending queue row that would become self-referencing after reassignment", async () => {
    const survivorId = await makeLead("survivor3", "+919847100108");
    const mergedId = await makeLead("merged3", "+919847100109");

    // A pairing between these exact two leads, independent of whichever
    // row triggered this merge (confirmMerge's own row is handled by the
    // caller immediately afterward) — after mergedId is reassigned to
    // survivorId, this row would read (survivorId, survivorId).
    const [selfPair] = await db
      .insert(mergeReviewQueue)
      .values({ leadId: survivorId, candidateLeadId: mergedId, status: "pending" })
      .returning({ id: mergeReviewQueue.id });

    await db.transaction((tx) =>
      mergeLeads(tx, { survivorLeadId: survivorId, mergedLeadId: mergedId, mergedBy: null }),
    );

    const [row] = await db.select().from(mergeReviewQueue).where(eq(mergeReviewQueue.id, selfPair.id));
    expect(row.leadId).toBe(survivorId);
    expect(row.candidateLeadId).toBe(survivorId);
    expect(row.status).toBe("rejected");
  });
});
