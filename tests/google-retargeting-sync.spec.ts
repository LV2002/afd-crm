/**
 * Integration test for the Google Customer Match retargeting sync cron
 * route — needs a real database with migrations applied and
 * INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * Mocks the OAuth token refresh and the three Customer Match API calls;
 * eligibility, the diff, and `ad_audience_members` bookkeeping all run for
 * real against Postgres — same standard as the Meta retargeting suite.
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

vi.mock("../src/lib/integrations/google/ads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/integrations/google/ads-client")>();
  return { ...actual, getGoogleAdsAccessToken: vi.fn() };
});
vi.mock("../src/lib/integrations/google/audience-client", () => ({
  createUserList: vi.fn(),
  addUsersToList: vi.fn(),
  removeUsersFromList: vi.fn(),
}));

const { getGoogleAdsAccessToken } = await import("../src/lib/integrations/google/ads-client");
const { createUserList, addUsersToList, removeUsersFromList } = await import("../src/lib/integrations/google/audience-client");
const { GET } = await import("../src/app/api/cron/retargeting-sync/google/route");
const { db } = await import("../src/lib/db/client");
const { adAudienceMembers, leads } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const MARKER = "GoogleRetargetingTest";

function request(): Request {
  return new Request("https://example.com/api/cron/retargeting-sync/google", {
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
  await setIntegrationCredential("google", "client_id", "fake-client-id");
  await setIntegrationCredential("google", "client_secret", "fake-client-secret");
  await setIntegrationCredential("google", "refresh_token", "fake-refresh-token");
  await setIntegrationCredential("google", "developer_token", "fake-dev-token");
  await setIntegrationCredential("google", "customer_id", "test-customer-1");
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("google", "client_id");
  await deleteIntegrationCredential("google", "client_secret");
  await deleteIntegrationCredential("google", "refresh_token");
  await deleteIntegrationCredential("google", "developer_token");
  await deleteIntegrationCredential("google", "customer_id");
  await deleteIntegrationCredential("google", "user_list_resource_name");
});

afterEach(() => {
  vi.mocked(getGoogleAdsAccessToken).mockReset().mockResolvedValue("fake-access-token");
  vi.mocked(createUserList).mockReset();
  vi.mocked(addUsersToList).mockReset();
  vi.mocked(removeUsersFromList).mockReset();
});

describe("GET /api/cron/retargeting-sync/google", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    const res = await GET(new Request("https://example.com/api/cron/retargeting-sync/google"));
    expect(res.status).toBe(401);
  });

  it("creates the user list once, on the first run, and reuses it after", async () => {
    vi.mocked(createUserList).mockResolvedValue("customers/test-customer-1/userLists/123");
    vi.mocked(addUsersToList).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromList).mockResolvedValue(undefined);

    await makeLead("first-run", "+919847600301");
    await GET(request());
    expect(createUserList).toHaveBeenCalledTimes(1);

    await GET(request());
    expect(createUserList).toHaveBeenCalledTimes(1); // still just once -- reused the stored resource name
  });

  it("adds an eligible consenting lead and records it in ad_audience_members", async () => {
    vi.mocked(createUserList).mockResolvedValue("customers/test-customer-1/userLists/123");
    vi.mocked(addUsersToList).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromList).mockResolvedValue(undefined);

    const leadId = await makeLead("eligible", "+919847600302");
    const res = await GET(request());
    const body = await res.json();
    expect(body.added).toBeGreaterThanOrEqual(1);

    const [member] = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, leadId));
    expect(member).toBeDefined();
    expect(addUsersToList).toHaveBeenCalled();
  });

  it("never adds a lead with no recorded consent, or one marked do-not-contact", async () => {
    vi.mocked(createUserList).mockResolvedValue("customers/test-customer-1/userLists/123");
    vi.mocked(addUsersToList).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromList).mockResolvedValue(undefined);

    const noConsentId = await makeLead("no-consent", "+919847600303", { consentStatus: null });
    const dncId = await makeLead("dnc", "+919847600304", { doNotContact: true });

    await GET(request());

    const rows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, noConsentId));
    expect(rows).toHaveLength(0);
    const dncRows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, dncId));
    expect(dncRows).toHaveLength(0);
  });

  it("removes a lead from the list once its consent is withdrawn", async () => {
    vi.mocked(createUserList).mockResolvedValue("customers/test-customer-1/userLists/123");
    vi.mocked(addUsersToList).mockResolvedValue(undefined);
    vi.mocked(removeUsersFromList).mockResolvedValue(undefined);

    const leadId = await makeLead("withdrawing", "+919847600305");
    await GET(request());
    let rows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, leadId));
    expect(rows).toHaveLength(1);

    await db.update(leads).set({ consentStatus: "withdrawn" }).where(eq(leads.id, leadId));
    const res = await GET(request());
    const body = await res.json();
    expect(body.removed).toBeGreaterThanOrEqual(1);
    expect(removeUsersFromList).toHaveBeenCalled();

    rows = await db.select().from(adAudienceMembers).where(eq(adAudienceMembers.leadId, leadId));
    expect(rows).toHaveLength(0);
  });
});
