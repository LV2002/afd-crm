/**
 * Integration test for the Meta retargeting sync cron route — needs a real
 * database with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * Mocks only the Meta Custom Audience API calls; eligibility, the diff,
 * and `ad_audience_members` bookkeeping all run for real against Postgres.
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}
process.env.CRON_SECRET ??= "test-cron-secret";

vi.mock("../src/lib/integrations/meta/audience-client", () => ({
  createCustomAudience: vi.fn(),
  addUsersToAudience: vi.fn(),
  removeUsersFromAudience: vi.fn(),
}));

const { createCustomAudience, addUsersToAudience, removeUsersFromAudience } = await import(
  "../src/lib/integrations/meta/audience-client"
);
const { GET } = await import("../src/app/api/cron/retargeting-sync/meta/route");
const { db } = await import("../src/lib/db/client");
const { adAudienceMembers, leads } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const MARKER = "MetaRetargetingTest";

function request(): Request {
  return new Request("https://example.com/api/cron/retargeting-sync/meta", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(adAudienceMembers).where(eq(adAudienceMembers.leadId, lead.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}

interface MakeLeadOverrides {
  consentStatus?: string | null;
  doNotContact?: boolean;
}

async function makeLead(tag: string, phone: string, overrides: MakeLeadOverrides = {}) {
  const consentStatus = "consentStatus" in overrides ? overrides.consentStatus : "given";
  const [lead] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} ${tag}`,
      primaryPhone: phone,
      consentStatus,
      doNotContact: overrides.doNotContact ?? false,
    })
    .returning({ id: leads.id });
  return lead.id;
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("meta", "ad_account_id", "test-account");
  await setIntegrationCredential("meta", "ads_access_token", "fake-token");
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("meta", "ad_account_id");
  await deleteIntegrationCredential("meta", "ads_access_token");
  await deleteIntegrationCredential("meta", "custom_audience_id");
});

afterEach(() => {
  vi.mocked(createCustomAudience).mockReset();
  vi.mocked(addUsersToAudience).mockReset();
  vi.mocked(removeUsersFromAudience).mockReset();
});

describe("GET /api/cron/retargeting-sync/meta", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    const res = await GET(new Request("https://example.com/api/cron/retargeting-sync/meta"));
    expect(res.status).toBe(401);
  });

  it("creates the custom audience once, on the first run, and reuses it after", async () => {
    vi.mocked(createCustomAudience).mockResolvedValue("audience-123");
    vi.mocked(addUsersToAudience).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromAudience).mockResolvedValue(undefined);

    await makeLead("first-run", "+919847600101");
    await GET(request());
    expect(createCustomAudience).toHaveBeenCalledTimes(1);

    await GET(request());
    expect(createCustomAudience).toHaveBeenCalledTimes(1); // still just once -- reused the stored id
  });

  it("adds an eligible consenting lead and records it in ad_audience_members", async () => {
    vi.mocked(createCustomAudience).mockResolvedValue("audience-123");
    vi.mocked(addUsersToAudience).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromAudience).mockResolvedValue(undefined);

    const leadId = await makeLead("eligible", "+919847600102");
    const res = await GET(request());
    const body = await res.json();
    expect(body.added).toBeGreaterThanOrEqual(1);

    const [member] = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, leadId));
    expect(member).toBeDefined();
    expect(addUsersToAudience).toHaveBeenCalled();
  });

  it("never adds a lead with no recorded consent, or one marked do-not-contact", async () => {
    vi.mocked(createCustomAudience).mockResolvedValue("audience-123");
    vi.mocked(addUsersToAudience).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromAudience).mockResolvedValue(undefined);

    const noConsentId = await makeLead("no-consent", "+919847600103", { consentStatus: null });
    const dncId = await makeLead("dnc", "+919847600104", { doNotContact: true });

    await GET(request());

    const rows = await db
      .select()
      .from(adAudienceMembers)
      .where(eq(adAudienceMembers.leadId, noConsentId));
    expect(rows).toHaveLength(0);
    const dncRows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, dncId));
    expect(dncRows).toHaveLength(0);
  });

  it("removes a lead from the audience once its consent is withdrawn", async () => {
    vi.mocked(createCustomAudience).mockResolvedValue("audience-123");
    vi.mocked(addUsersToAudience).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromAudience).mockResolvedValue(undefined);

    const leadId = await makeLead("withdrawing", "+919847600105");
    await GET(request());
    let rows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, leadId));
    expect(rows).toHaveLength(1);

    await db.update(leads).set({ consentStatus: "withdrawn" }).where(eq(leads.id, leadId));
    const res = await GET(request());
    const body = await res.json();
    expect(body.removed).toBeGreaterThanOrEqual(1);
    expect(removeUsersFromAudience).toHaveBeenCalled();

    rows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, leadId));
    expect(rows).toHaveLength(0);
  });
});
