/**
 * Integration tests for resolveOrCreateLead() — needs a real database with
 * migrations + seed applied (same DATABASE_URL as tests/rls.spec.ts):
 *
 *   npm run db:migrate && npm run db:seed && npm test
 *
 * Runs through the shared Drizzle `db` client directly (not RLS-bound —
 * see the note on resolveOrCreateLead itself for why), so these tests
 * cover the identity/dedup *logic*, not the RLS boundary. That's
 * tests/rls.spec.ts's job.
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
const { leads, leadIdentifiers, enquiries, mergeReviewQueue } = await import("../src/lib/db/schema");
const { resolveOrCreateLead } = await import("../src/lib/identity/resolve-or-create-lead");

const MARKER = "IdentityTest";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sweepTestLeads() {
  // FK cascades (lead_identifiers, enquiries, merge_review_queue all
  // reference leads.id with onDelete cascade) mean deleting the lead rows
  // is enough to clean up everything this suite creates.
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}

beforeAll(async () => {
  await sweepTestLeads(); // in case a previous run crashed before cleaning up
});

afterAll(async () => {
  await sweepTestLeads();
});

describe("resolveOrCreateLead", () => {
  it("the same phone submitted twice produces one lead and two enquiries", async () => {
    const name = testName("dedup");
    const first = await resolveOrCreateLead({
      studentName: name,
      primaryPhone: "9847100001",
      source: "Meta",
    });
    expect(first.isNewLead).toBe(true);
    expect(first.wasDuplicate).toBe(false);

    // Same number, deliberately in a different raw format, to prove the
    // dedup match happens on the *normalised* value.
    const second = await resolveOrCreateLead({
      studentName: name,
      primaryPhone: "+919847100001",
      source: "Meta",
    });
    expect(second.isNewLead).toBe(false);
    expect(second.wasDuplicate).toBe(true);
    expect(second.leadId).toBe(first.leadId);
    expect(second.enquiryId).not.toBe(first.enquiryId);

    const leadRows = await db.select().from(leads).where(eq(leads.id, first.leadId));
    expect(leadRows).toHaveLength(1);

    const enquiryRows = await db.select().from(enquiries).where(eq(enquiries.leadId, first.leadId));
    expect(enquiryRows).toHaveLength(2);
    expect(enquiryRows.find((e) => e.id === first.enquiryId)?.wasDuplicate).toBe(false);
    expect(enquiryRows.find((e) => e.id === second.enquiryId)?.wasDuplicate).toBe(true);

    const identifierRows = await db
      .select()
      .from(leadIdentifiers)
      .where(eq(leadIdentifiers.leadId, first.leadId));
    expect(identifierRows).toHaveLength(1);
    expect(identifierRows[0].valueNormalised).toBe("+919847100001");
  });

  it("first_touch_source survives a second enquiry from a different source; last_touch_source updates", async () => {
    const name = testName("touch");
    const first = await resolveOrCreateLead({
      studentName: name,
      primaryPhone: "9847100002",
      source: "Meta",
      subSource: "Lead Ad A",
    });

    await resolveOrCreateLead({
      studentName: name,
      primaryPhone: "9847100002",
      source: "Website",
      subSource: "Contact Form",
    });

    const [lead] = await db.select().from(leads).where(eq(leads.id, first.leadId));
    expect(lead.firstTouchSource).toBe("Meta");
    expect(lead.firstTouchSubSource).toBe("Lead Ad A");
    expect(lead.lastTouchSource).toBe("Website");
    expect(lead.lastTouchSubSource).toBe("Contact Form");
  });

  it("never rejects a duplicate even across many repeats", async () => {
    const name = testName("repeat");
    const first = await resolveOrCreateLead({
      studentName: name,
      primaryPhone: "9847100003",
      source: "Walk-in",
    });

    for (let i = 0; i < 4; i++) {
      const repeat = await resolveOrCreateLead({
        studentName: name,
        primaryPhone: "9847100003",
        source: "Walk-in",
      });
      expect(repeat.leadId).toBe(first.leadId);
      expect(repeat.wasDuplicate).toBe(true);
    }

    const enquiryRows = await db.select().from(enquiries).where(eq(enquiries.leadId, first.leadId));
    expect(enquiryRows).toHaveLength(5);
  });

  it("an ambiguous match (phone matches one lead, email matches another) is flagged for review, not guessed", async () => {
    const nameA = testName("ambiguous-a");
    const nameB = testName("ambiguous-b");

    const leadA = await resolveOrCreateLead({
      studentName: nameA,
      primaryPhone: "9847100004",
      source: "Meta",
    });
    const leadB = await resolveOrCreateLead({
      studentName: nameB,
      primaryPhone: "9847100005",
      email: "shared-family@example.com",
      source: "Google",
    });

    // A new enquiry: phone matches lead A, but the email on it matches lead B.
    const result = await resolveOrCreateLead({
      studentName: nameA,
      primaryPhone: "9847100004",
      email: "shared-family@example.com",
      source: "Referral",
    });

    // Never dropped, never guessed which lead is "right": attaches to the
    // phone match and raises a review instead of silently merging.
    expect(result.leadId).toBe(leadA.leadId);
    expect(result.wasDuplicate).toBe(true);
    expect(result.mergeReviewQueueId).not.toBeNull();

    const reviewRows = await db
      .select()
      .from(mergeReviewQueue)
      .where(eq(mergeReviewQueue.leadId, leadA.leadId));
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0].candidateLeadId).toBe(leadB.leadId);
    expect(reviewRows[0].status).toBe("pending");

    // Calling it again with the same ambiguous pair doesn't spam the queue.
    await resolveOrCreateLead({
      studentName: nameA,
      primaryPhone: "9847100004",
      email: "shared-family@example.com",
      source: "Referral",
    });
    const reviewRowsAfter = await db
      .select()
      .from(mergeReviewQueue)
      .where(eq(mergeReviewQueue.leadId, leadA.leadId));
    expect(reviewRowsAfter).toHaveLength(1);
  });

  it("creates a fresh lead with no identifier match, and no merge review row", async () => {
    const name = testName("fresh");
    const result = await resolveOrCreateLead({
      studentName: name,
      primaryPhone: "9847100006",
      email: "fresh-lead@example.com",
      source: "Website",
    });

    expect(result.isNewLead).toBe(true);
    expect(result.mergeReviewQueueId).toBeNull();

    const identifierRows = await db
      .select()
      .from(leadIdentifiers)
      .where(eq(leadIdentifiers.leadId, result.leadId));
    expect(identifierRows.map((r) => r.kind).sort()).toEqual(["email", "phone"]);
  });

  it("rejects an unparseable phone number rather than silently creating a bad lead", async () => {
    await expect(
      resolveOrCreateLead({
        studentName: testName("bad-phone"),
        primaryPhone: "not a phone number",
        source: "Website",
      }),
    ).rejects.toThrow(/could not normalise/);
  });
});
