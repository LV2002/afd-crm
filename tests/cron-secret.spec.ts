import { describe, expect, it, afterEach } from "vitest";

import { requireCronSecret } from "@/lib/cron/require-secret";

const ORIGINAL = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

function request(authorization?: string): Request {
  return new Request("https://example.test/api/cron/sla-sweep", {
    headers: authorization ? { authorization } : {},
  });
}

describe("requireCronSecret", () => {
  it("lets the right bearer token through", () => {
    process.env.CRON_SECRET = "a-long-random-secret";
    expect(requireCronSecret(request("Bearer a-long-random-secret"))).toBeNull();
  });

  it("refuses a wrong, short, long or absent token", async () => {
    process.env.CRON_SECRET = "a-long-random-secret";
    for (const header of [undefined, "", "Bearer wrong", "Bearer a-long-random-secre", "Bearer a-long-random-secret-extra", "a-long-random-secret"]) {
      const denied = requireCronSecret(request(header));
      expect(denied, String(header)).not.toBeNull();
      expect(denied!.status).toBe(401);
    }
  });

  it("refuses everything when no secret is configured", () => {
    // The failure mode that matters most: a deploy missing CRON_SECRET
    // must not leave the sweep endpoints open to the internet.
    delete process.env.CRON_SECRET;
    expect(requireCronSecret(request("Bearer anything"))?.status).toBe(401);
    expect(requireCronSecret(request())?.status).toBe(401);
  });
});

/**
 * The four refusals are four different mistakes, in three different
 * places, and they look identical from outside.
 *
 * This cost a real round trip: an hourly schedule was failing 401 while
 * the ten-minute one succeeded, and "Unauthorized" could not distinguish
 * a header that was never added from a secret that went stale after a
 * rotation. One is the scheduler's Advanced tab; the other is a value to
 * repaste. The person reading it is looking at a failed run in a
 * scheduler's history, not at a log.
 *
 * Nothing here leaks: a caller already knows whether it sent a header and
 * what was in it. The expected value is never named, and the comparison
 * stays constant-time.
 */
describe("the 401 says which mistake it was", () => {
  async function reasonFor(authorization?: string): Promise<string> {
    const denied = requireCronSecret(request(authorization));
    expect(denied).not.toBeNull();
    const body = (await denied!.json()) as { error: string; reason: string };
    expect(body.error).toBe("Unauthorized");
    return body.reason;
  }

  it("names a missing CRON_SECRET on the deployment", async () => {
    delete process.env.CRON_SECRET;
    expect(await reasonFor("Bearer anything")).toMatch(/no CRON_SECRET set/i);
    expect(await reasonFor("Bearer anything")).toMatch(/redeploy/i);
  });

  it("names a missing Authorization header, and where to add it", async () => {
    process.env.CRON_SECRET = "a-long-random-secret";
    const reason = await reasonFor(undefined);
    expect(reason).toMatch(/No Authorization header/i);
    expect(reason).toMatch(/Advanced tab/i);
  });

  it("names a header that is not a bearer token", async () => {
    process.env.CRON_SECRET = "a-long-random-secret";
    expect(await reasonFor("a-long-random-secret")).toMatch(/not a bearer token/i);
  });

  it("names a mismatch, and the two things that usually cause one", async () => {
    process.env.CRON_SECRET = "a-long-random-secret";
    const reason = await reasonFor("Bearer the-old-secret");
    expect(reason).toMatch(/does not match/i);
    expect(reason).toMatch(/rotation/i);
    expect(reason).toMatch(/trailing space/i);
  });

  it("never repeats the expected secret back", async () => {
    // The one thing that must not appear in any of them.
    process.env.CRON_SECRET = "a-long-random-secret";
    for (const header of [undefined, "Basic abc", "Bearer wrong"]) {
      expect(await reasonFor(header)).not.toContain("a-long-random-secret");
    }
  });
});
