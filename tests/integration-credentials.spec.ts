/**
 * Integration test for the encrypted credential store — needs a real
 * database with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { afterEach, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}

const { db } = await import("../src/lib/db/client");
const { integrationCredentials } = await import("../src/lib/db/schema");
const { setIntegrationCredential, getIntegrationCredential, getIntegrationCredentials, hasIntegrationCredential, deleteIntegrationCredential } =
  await import("../src/lib/integrations/credentials");

const TEST_KEY = "test_credential_key";

afterEach(async () => {
  await deleteIntegrationCredential("meta", TEST_KEY);
  await deleteIntegrationCredential("whatsapp", TEST_KEY, "11111111-1111-1111-1111-111111111111");
  await deleteIntegrationCredential("whatsapp", TEST_KEY, "22222222-2222-2222-2222-222222222222");
});

describe("integration credential store", () => {
  it("returns null for a credential that was never set", async () => {
    expect(await getIntegrationCredential("meta", "never-set-" + randomUUID())).toBeNull();
    expect(await hasIntegrationCredential("meta", "never-set-" + randomUUID())).toBe(false);
  });

  it("round-trips a value through encryption", async () => {
    await setIntegrationCredential("meta", TEST_KEY, "super-secret-app-token");
    expect(await getIntegrationCredential("meta", TEST_KEY)).toBe("super-secret-app-token");
    expect(await hasIntegrationCredential("meta", TEST_KEY)).toBe(true);
  });

  it("stores the value encrypted at rest, not as plaintext", async () => {
    await setIntegrationCredential("meta", TEST_KEY, "super-secret-app-token");
    const match = (await db.select().from(integrationCredentials)).find(
      (r) => r.provider === "meta" && r.key === TEST_KEY,
    );
    expect(match).toBeDefined();
    expect(match!.valueEncrypted).not.toContain("super-secret-app-token");
  });

  it("overwrites the previous value when set again (rotation)", async () => {
    await setIntegrationCredential("meta", TEST_KEY, "first-value");
    await setIntegrationCredential("meta", TEST_KEY, "second-value");
    expect(await getIntegrationCredential("meta", TEST_KEY)).toBe("second-value");

    const matches = (await db.select().from(integrationCredentials)).filter(
      (r) => r.provider === "meta" && r.key === TEST_KEY,
    );
    expect(matches).toHaveLength(1); // rotation updates in place, never leaves a stale second row
  });

  it("keeps org-wide (scope null) and per-scope values for the same key independent", async () => {
    await setIntegrationCredential("meta", TEST_KEY, "org-wide-value");
    await setIntegrationCredential("whatsapp", TEST_KEY, "counsellor-1-value", "11111111-1111-1111-1111-111111111111");
    await setIntegrationCredential("whatsapp", TEST_KEY, "counsellor-2-value", "22222222-2222-2222-2222-222222222222");

    expect(await getIntegrationCredential("meta", TEST_KEY)).toBe("org-wide-value");
    expect(await getIntegrationCredential("whatsapp", TEST_KEY, "11111111-1111-1111-1111-111111111111")).toBe(
      "counsellor-1-value",
    );
    expect(await getIntegrationCredential("whatsapp", TEST_KEY, "22222222-2222-2222-2222-222222222222")).toBe(
      "counsellor-2-value",
    );
  });

  it("fetches several keys for one provider/scope at once", async () => {
    await setIntegrationCredential("meta", TEST_KEY, "value-a");
    const result = await getIntegrationCredentials("meta", [TEST_KEY, "not-set-" + randomUUID()]);
    expect(result[TEST_KEY]).toBe("value-a");
  });

  it("deleting a credential makes it unavailable again", async () => {
    await setIntegrationCredential("meta", TEST_KEY, "to-be-deleted");
    await deleteIntegrationCredential("meta", TEST_KEY);
    expect(await getIntegrationCredential("meta", TEST_KEY)).toBeNull();
  });
});
