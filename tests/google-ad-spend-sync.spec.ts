/**
 * Integration test for the Google Ads spend sync cron route — needs a real
 * database with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * Mocks the two real network calls (`getGoogleAdsAccessToken`, the OAuth
 * token refresh, and `searchGoogleAds`, the Ads API call) at the
 * `ads-client` module boundary — `fetchGoogleAdsSpend`/`mapGoogleAdsRow`
 * (which build the GAQL query and map the response) and the upsert itself
 * run for real, same standard as the Meta ad spend sync suite.
 */
import { config as loadEnv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  return { ...actual, getGoogleAdsAccessToken: vi.fn(), searchGoogleAds: vi.fn() };
});

const { getGoogleAdsAccessToken, searchGoogleAds } = await import("../src/lib/integrations/google/ads-client");
const { GET } = await import("../src/app/api/cron/ad-spend-sync/google/route");
const { db } = await import("../src/lib/db/client");
const { adSpendDaily } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const TEST_CUSTOMER_ID = "test-customer-1";

function request(): Request {
  return new Request("https://example.com/api/cron/ad-spend-sync/google", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

async function sweep() {
  await db.delete(adSpendDaily).where(eq(adSpendDaily.accountId, TEST_CUSTOMER_ID));
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("google", "client_id", "fake-client-id");
  await setIntegrationCredential("google", "client_secret", "fake-client-secret");
  await setIntegrationCredential("google", "refresh_token", "fake-refresh-token");
  await setIntegrationCredential("google", "developer_token", "fake-dev-token");
  await setIntegrationCredential("google", "customer_id", TEST_CUSTOMER_ID);
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("google", "client_id");
  await deleteIntegrationCredential("google", "client_secret");
  await deleteIntegrationCredential("google", "refresh_token");
  await deleteIntegrationCredential("google", "developer_token");
  await deleteIntegrationCredential("google", "customer_id");
});

beforeEach(() => {
  vi.mocked(getGoogleAdsAccessToken).mockReset().mockResolvedValue("fake-access-token");
  vi.mocked(searchGoogleAds).mockReset();
});

describe("GET /api/cron/ad-spend-sync/google", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    const res = await GET(new Request("https://example.com/api/cron/ad-spend-sync/google"));
    expect(res.status).toBe(401);
  });

  it("inserts a real ad_spend_daily row from the (mocked) Ads API response", async () => {
    vi.mocked(searchGoogleAds).mockResolvedValue([
      {
        campaign: { id: "c1", name: "Foundation" },
        adGroup: { id: "ag1", name: "Group A" },
        adGroupAd: { ad: { id: "ad1", name: "Creative A" } },
        metrics: { costMicros: "5000000000", impressions: "1000", clicks: "20", conversions: 3 },
      },
    ]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(1);

    const [row] = await db
      .select()
      .from(adSpendDaily)
      .where(and(eq(adSpendDaily.accountId, TEST_CUSTOMER_ID), eq(adSpendDaily.adId, "ad1")));
    expect(row.spendPaise).toBe(500000);
    expect(row.campaignName).toBe("Foundation");
    expect(row.leadsReported).toBe(3);
  });

  it("upserts (updates in place) rather than duplicating on a second run for the same day", async () => {
    vi.mocked(searchGoogleAds).mockResolvedValue([
      { campaign: { id: "c1", name: "Foundation" }, adGroupAd: { ad: { id: "ad1", name: "Creative A" } }, metrics: { costMicros: "5000000000" } },
    ]);
    await GET(request());

    vi.mocked(searchGoogleAds).mockResolvedValue([
      { campaign: { id: "c1", name: "Foundation" }, adGroupAd: { ad: { id: "ad1", name: "Creative A" } }, metrics: { costMicros: "5255000000" } },
    ]);
    await GET(request());

    const rows = await db
      .select()
      .from(adSpendDaily)
      .where(and(eq(adSpendDaily.accountId, TEST_CUSTOMER_ID), eq(adSpendDaily.adId, "ad1")));
    expect(rows).toHaveLength(1);
    expect(rows[0].spendPaise).toBe(525500);
  });

  it("skips a row missing campaign or ad id rather than erroring", async () => {
    vi.mocked(searchGoogleAds).mockResolvedValue([{ metrics: { costMicros: "1000000" } }]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).synced).toBe(0);
  });
});
