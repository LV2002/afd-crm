/**
 * Integration test for the Meta ad spend sync cron route — needs a real
 * database with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * Mocks only `fetchMetaInsights` (the real network call); the upsert
 * itself runs for real against Postgres.
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

vi.mock("../src/lib/integrations/meta/insights-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/integrations/meta/insights-client")>();
  return { ...actual, fetchMetaInsights: vi.fn() };
});

const { fetchMetaInsights } = await import("../src/lib/integrations/meta/insights-client");
const { GET } = await import("../src/app/api/cron/ad-spend-sync/meta/route");
const { db } = await import("../src/lib/db/client");
const { adSpendDaily } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const TEST_AD_ACCOUNT_ID = "test-account-1";

function request(): Request {
  return new Request("https://example.com/api/cron/ad-spend-sync/meta", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

async function sweep() {
  await db.delete(adSpendDaily).where(eq(adSpendDaily.accountId, TEST_AD_ACCOUNT_ID));
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("meta", "ad_account_id", TEST_AD_ACCOUNT_ID);
  await setIntegrationCredential("meta", "page_access_token", "fake-token");
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("meta", "ad_account_id");
  await deleteIntegrationCredential("meta", "page_access_token");
});

beforeEach(() => {
  vi.mocked(fetchMetaInsights).mockReset();
});

describe("GET /api/cron/ad-spend-sync/meta", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    const res = await GET(new Request("https://example.com/api/cron/ad-spend-sync/meta"));
    expect(res.status).toBe(401);
  });

  it("inserts a real ad_spend_daily row from the (mocked) Insights response", async () => {
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { campaign_id: "c1", campaign_name: "Foundation", ad_id: "ad1", ad_name: "Creative A", spend: "500.00", impressions: "1000", clicks: "20" },
    ]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(1);

    const [row] = await db
      .select()
      .from(adSpendDaily)
      .where(and(eq(adSpendDaily.accountId, TEST_AD_ACCOUNT_ID), eq(adSpendDaily.adId, "ad1")));
    expect(row.spendPaise).toBe(50000);
    expect(row.campaignName).toBe("Foundation");
  });

  it("upserts (updates in place) rather than duplicating on a second run for the same day", async () => {
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { campaign_id: "c1", campaign_name: "Foundation", ad_id: "ad1", ad_name: "Creative A", spend: "500.00" },
    ]);
    await GET(request());

    // A later run for the same (date, platform, ad_id) with revised numbers
    // — Meta's own reporting can restate a day's figures for up to 28 days.
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { campaign_id: "c1", campaign_name: "Foundation", ad_id: "ad1", ad_name: "Creative A", spend: "525.50" },
    ]);
    await GET(request());

    const rows = await db
      .select()
      .from(adSpendDaily)
      .where(and(eq(adSpendDaily.accountId, TEST_AD_ACCOUNT_ID), eq(adSpendDaily.adId, "ad1")));
    expect(rows).toHaveLength(1);
    expect(rows[0].spendPaise).toBe(52550);
  });
});
