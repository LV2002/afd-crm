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
