/**
 * Integration tests for reporting outcomes — needs a real database with
 * migrations applied (see confirm-admission.spec.ts).
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { batches, centers, enrolments, leads, outcomeEvents } = await import("../src/lib/db/schema");
const { confirmAdmission } = await import("../src/lib/enrolment/confirm-admission");
const { queueOutcomes, sendPendingOutcomes } = await import("../src/lib/outcomes/publish");
const { signOutcome } = await import("../src/lib/outcomes/protocol");

const MARKER = "OutcomesTest";
let centerId: string;

async function sweep() {
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  const ids = ls.map((l) => l.id);
  if (ids.length) {
    await db.delete(outcomeEvents).where(inArray(outcomeEvents.leadId, ids));
    await db.delete(enrolments).where(inArray(enrolments.leadId, ids));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(batches).where(like(batches.name, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [c] = await db.insert(centers).values({ name: `${MARKER} Kochi`, city: "Kochi" }).returning({ id: centers.id });
  centerId = c.id;
});
afterAll(sweep);

async function makeLead(tag: string, submissionId: string | null) {
  const [l] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} ${tag}`,
      primaryPhone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}`,
      centerId,
      temperature: "not_contacted",
      submissionId,
    })
    .returning({ id: leads.id });
  return l.id;
}

const mine = (leadId: string) => db.select().from(outcomeEvents).where(eq(outcomeEvents.leadId, leadId));

describe("queueOutcomes", () => {
  it("reports a website lead's status changes once, skipping a repeat of the same outcome", async () => {
    const leadId = await makeLead("a", "web-1");
    await db.update(leads).set({ temperature: "contacted" }).where(eq(leads.id, leadId));
    await db.update(leads).set({ temperature: "warm" }).where(eq(leads.id, leadId)); // still "contacted"
    await db.update(leads).set({ temperature: "wrong_target" }).where(eq(leads.id, leadId));

    await queueOutcomes();
    await queueOutcomes(); // idempotent

    const rows = (await mine(leadId)).sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
    const sendable = rows.filter((r) => !r.skippedReason).map((r) => r.status);
    expect(sendable).toEqual(["contacted", "lost"]);
    expect(rows).toHaveLength(4); // not_contacted (not an outcome), contacted, warm (unchanged), wrong_target
    expect(rows.every((r) => r.submissionId === "web-1")).toBe(true);
  });

  it("ignores leads that did not come from a website form", async () => {
    const leadId = await makeLead("b", null);
    await db.update(leads).set({ temperature: "contacted" }).where(eq(leads.id, leadId));
    await queueOutcomes();
    expect(await mine(leadId)).toHaveLength(0);
  });

  it("sets aside an id the sheet would refuse, instead of sending it", async () => {
    const leadId = await makeLead("c", "+919847:1700");
    await db.update(leads).set({ temperature: "contacted" }).where(eq(leads.id, leadId));
    await queueOutcomes();
    const rows = await mine(leadId);
    expect(rows.every((r) => r.skippedReason)).toBe(true);
  });

  it("sends the fee, course and centre — and no name — for an admission", async () => {
    const leadId = await makeLead("d", "web-4");
    const [batch] = await db
      .insert(batches)
      .values({ name: `${MARKER} batch`, centerId, course: "Foundation", mode: "online", academicYear: "2026-27", feePaise: 8500000 })
      .returning({ id: batches.id });
    await db.transaction((tx) =>
      confirmAdmission(tx, { leadId, course: "Foundation", centerId, mode: "online", academicYear: "2026-27", batchId: batch.id, confirmedBy: null }),
    );
    await queueOutcomes();

    const won = (await mine(leadId)).find((r) => r.status === "admitted");
    expect(won).toMatchObject({ revenueInr: 85000, note: `Foundation, ${MARKER} Kochi` });
    expect(won?.note).not.toContain(MARKER + " d");
  });
});

describe("sendPendingOutcomes", () => {
  it("posts a correctly signed batch and marks it sent; keeps events pending when refused", async () => {
    const leadId = await makeLead("e", "web-5");
    await db.update(leads).set({ temperature: "contacted" }).where(eq(leads.id, leadId));
    await queueOutcomes();

    // Anything left over from other tests in this file is also pending; only ours matter.
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const refuse = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response('{"ok":false,"error":"the request is too old or has no time"}');
    }) as unknown as typeof fetch;

    const failed = await sendPendingOutcomes({ execUrl: "https://example.test/exec", secret: "s3cret-phrase" }, refuse);
    expect(failed.error).toMatch(/too old/);
    const stillPending = (await mine(leadId)).filter((r) => !r.skippedReason);
    expect(stillPending.every((r) => r.sentAt === null && r.attempts === 1)).toBe(true);

    const accept = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response('{"ok":true,"added":1,"duplicates":0}');
    }) as unknown as typeof fetch;
    const sent = await sendPendingOutcomes({ execUrl: "https://example.test/exec", secret: "s3cret-phrase" }, accept);
    expect(sent.error).toBeNull();
    expect((await mine(leadId)).filter((r) => !r.skippedReason).every((r) => r.sentAt !== null)).toBe(true);

    const last = calls.at(-1)!.body as { timestamp: number; payloadJson: string; signature: string };
    expect(last.signature).toBe(signOutcome("s3cret-phrase", last.timestamp, last.payloadJson));
    expect(JSON.parse(last.payloadJson).events.some((e: { submission_id: string }) => e.submission_id === "web-5")).toBe(true);

    // Nothing left to send: no second request.
    const before = calls.length;
    await sendPendingOutcomes({ execUrl: "https://example.test/exec", secret: "s3cret-phrase" }, accept);
    expect(calls.length).toBe(before);
  });

  it("sets aside only the event the sheet names as invalid", async () => {
    const leadId = await makeLead("f", "web-6");
    await db.update(leads).set({ temperature: "contacted" }).where(eq(leads.id, leadId));
    await queueOutcomes();
    // Make this one the oldest pending so it is event number 1.
    await db.update(outcomeEvents).set({ eventAt: new Date("2000-01-01") }).where(eq(outcomeEvents.leadId, leadId));

    let n = 0;
    const picky = vi.fn(async () =>
      n++ === 0
        ? new Response('{"ok":false,"error":"an outcome is not valid (number 1)"}')
        : new Response('{"ok":true,"added":1,"duplicates":0}'),
    ) as unknown as typeof fetch;
    await sendPendingOutcomes({ execUrl: "https://example.test/exec", secret: "s3cret-phrase" }, picky);

    const rows = (await mine(leadId)).filter((r) => r.status === "contacted");
    expect(rows[0].skippedReason).toMatch(/refused by the sheet/);
  });
});
