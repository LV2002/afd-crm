/**
 * Lead status changes reported to Meta's CRM funnel, against a real database
 * with only the HTTP call to Meta faked.
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");

const { db } = await import("../src/lib/db/client");
const { enquiries, leadIdentifiers, leads, metaCapiEvents } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");
const { capiEventName, sendCrmEventsToMeta } = await import("../src/lib/integrations/meta/send-crm-events");

const MARK = "MetaCapiTest";
const fetchMock = vi.fn();
interface Ev {
  event_name: string;
  action_source: string;
  custom_data: unknown;
  user_data: { lead_id: string; ph?: string[] };
}

async function sweep() {
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARK}%`));
  const ids = ls.map((l) => l.id);
  if (ids.length) {
    await db.delete(metaCapiEvents).where(inArray(metaCapiEvents.leadId, ids));
    await db.delete(enquiries).where(inArray(enquiries.leadId, ids));
    await db.delete(leadIdentifiers).where(inArray(leadIdentifiers.leadId, ids));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARK}%`));
}

async function makeLead(name: string, phone: string, metaLeadId: string | null) {
  const [lead] = await db.insert(leads).values({ studentName: `${MARK} ${name}`, primaryPhone: phone }).returning({ id: leads.id });
  await db.insert(leadIdentifiers).values({ leadId: lead.id, kind: "phone", valueNormalised: phone });
  if (metaLeadId) await db.insert(enquiries).values({ leadId: lead.id, source: "meta", dedupeKey: metaLeadId });
  return lead.id;
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("meta", "dataset_id", "999000111");
  await setIntegrationCredential("meta", "ads_access_token", "tok");
  vi.stubGlobal("fetch", fetchMock);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await sweep();
  await deleteIntegrationCredential("meta", "dataset_id");
  await deleteIntegrationCredential("meta", "ads_access_token");
});
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("capiEventName", () => {
  it("title-cases a status label the way the funnel names it", () => {
    expect(capiEventName("Took admission")).toBe("Took Admission");
    expect(capiEventName("AFD India student")).toBe("AFD India Student");
    expect(capiEventName("hot")).toBe("Hot");
  });
});

describe("sending status changes to Meta", () => {
  it("sends the new status of a Meta lead-ad lead once, with its lead id, and skips others", async () => {
    const fromAd = await makeLead("ad", "+919847800001", "123456789012345");
    const walkIn = await makeLead("walkin", "+919847800002", null);
    await db.update(leads).set({ temperature: "hot" }).where(eq(leads.id, fromAd));
    await db.update(leads).set({ temperature: "hot" }).where(eq(leads.id, walkIn));

    const first = await sendCrmEventsToMeta();
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const bodies = fetchMock.mock.calls
      .filter((c) => String(c[0]).includes("/999000111/events"))
      .flatMap((c) => (JSON.parse(c[1].body as string) as { data: Ev[] }).data);
    const mine = bodies.filter((e) => e.user_data.lead_id === "123456789012345");
    expect(mine).toHaveLength(1);
    expect(mine[0].event_name).toBe("Hot");
    expect(mine[0].action_source).toBe("system_generated");
    expect(mine[0].custom_data).toMatchObject({ event_source: "crm" });
    expect(mine[0].user_data.ph?.[0]).toMatch(/^[0-9a-f]{64}$/);
    // The raw phone never leaves.
    expect(JSON.stringify(bodies)).not.toContain("9847800001");

    // A second run sends nothing for them again.
    fetchMock.mockClear();
    await sendCrmEventsToMeta();
    const again = fetchMock.mock.calls.flatMap((c) => (JSON.parse(c[1].body as string) as { data: Ev[] }).data);
    expect(again.filter((e) => e.user_data.lead_id === "123456789012345")).toHaveLength(0);

    const skipped = await db.select().from(metaCapiEvents).where(eq(metaCapiEvents.leadId, walkIn));
    expect(skipped.every((r) => r.status === "skipped")).toBe(true);
  });

  it("keeps a failed event to retry, and says why", async () => {
    const id = await makeLead("retry", "+919847800003", "223456789012345");
    await db.update(leads).set({ temperature: "warm" }).where(eq(leads.id, id));
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid dataset" } }) });
    const failed = await sendCrmEventsToMeta();
    expect(failed.failed).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(metaCapiEvents).where(eq(metaCapiEvents.leadId, id));
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/Invalid dataset/);

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await sendCrmEventsToMeta();
    const [after] = await db.select().from(metaCapiEvents).where(eq(metaCapiEvents.leadId, id));
    expect(after.status).toBe("sent");
  });

  it("does nothing, and says so, when the dataset is not set", async () => {
    await deleteIntegrationCredential("meta", "dataset_id");
    const result = await sendCrmEventsToMeta();
    expect(result.reason).toMatch(/dataset/i);
    await setIntegrationCredential("meta", "dataset_id", "999000111");
  });
});
