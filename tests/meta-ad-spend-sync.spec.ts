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
  await setIntegrationCredential("meta", "ads_access_token", "fake-token");
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("meta", "ad_account_id");
  await deleteIntegrationCredential("meta", "ads_access_token");
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
      { date_start: "2026-09-30", campaign_id: "c1", campaign_name: "Foundation", ad_id: "ad1", ad_name: "Creative A", spend: "500.00", impressions: "1000", clicks: "20" },
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
    // Stored under the row's OWN date, not the date the run asked for.
    // With `time_increment=1` a single response covers many days, and
    // filing them all under one would pile a whole backfill onto one
    // Tuesday and make every figure on the Ad performance page wrong in
    // the most convincing way possible.
    expect(row.date).toBe("2026-09-30");
  });

  it("stores each day of a multi-day response under its own date", async () => {
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { date_start: "2026-09-28", campaign_id: "c1", ad_id: "ad-multi", spend: "100.00" },
      { date_start: "2026-09-29", campaign_id: "c1", ad_id: "ad-multi", spend: "200.00" },
      { date_start: "2026-09-30", campaign_id: "c1", ad_id: "ad-multi", spend: "300.00" },
    ]);

    const res = await GET(request());
    const body = await res.json();
    expect(body.synced).toBe(3);
    expect(body.daysWithSpend).toBe(3);

    const rows = await db
      .select()
      .from(adSpendDaily)
      .where(and(eq(adSpendDaily.accountId, TEST_AD_ACCOUNT_ID), eq(adSpendDaily.adId, "ad-multi")));
    expect(rows.map((r) => [r.date, r.spendPaise]).sort()).toEqual([
      ["2026-09-28", 10000],
      ["2026-09-29", 20000],
      ["2026-09-30", 30000],
    ]);
  });

  it("skips a row with no date rather than guessing one", async () => {
    // There is no honest date to file it under, and a wrong date is worse
    // than a missing row.
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { campaign_id: "c1", ad_id: "ad-undated", spend: "100.00" },
    ]);

    const res = await GET(request());
    const body = await res.json();
    expect(body.synced).toBe(0);

    const rows = await db
      .select()
      .from(adSpendDaily)
      .where(and(eq(adSpendDaily.accountId, TEST_AD_ACCOUNT_ID), eq(adSpendDaily.adId, "ad-undated")));
    expect(rows).toEqual([]);
  });

  it("asks for a backfill window on the first run, and honours ?days=", async () => {
    vi.mocked(fetchMetaInsights).mockResolvedValue([]);
    await GET(
      new Request("https://example.com/api/cron/ad-spend-sync/meta?days=30", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );

    const [, , since, until] = vi.mocked(fetchMetaInsights).mock.calls[0];
    expect(typeof since).toBe("string");
    expect(typeof until).toBe("string");
    // 30 days ending yesterday.
    const days = (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
    expect(days).toBe(29);
  });

  it("upserts (updates in place) rather than duplicating on a second run for the same day", async () => {
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { date_start: "2026-09-30", campaign_id: "c1", campaign_name: "Foundation", ad_id: "ad1", ad_name: "Creative A", spend: "500.00" },
    ]);
    await GET(request());

    // A later run for the same (date, platform, ad_id) with revised numbers
    // — Meta's own reporting can restate a day's figures for up to 28 days.
    vi.mocked(fetchMetaInsights).mockResolvedValue([
      { date_start: "2026-09-30", campaign_id: "c1", campaign_name: "Foundation", ad_id: "ad1", ad_name: "Creative A", spend: "525.50" },
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
