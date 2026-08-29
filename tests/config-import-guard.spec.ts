/**
 * Integration test for importConfig()'s emptiness guard — needs a real,
 * already-seeded database (same DATABASE_URL as the other integration
 * suites):
 *
 *   npm run db:migrate && npm run db:seed && npm test
 *
 * Only the guard is tested here, against the already-seeded (non-empty)
 * database this suite runs on — that's actually the easy, deterministic
 * case to automate. The successful path (import onto a genuinely empty,
 * freshly-migrated instance) needs a second, separate database to spin up
 * cleanly, which this suite's fixtures don't provide; that path was
 * verified by hand end-to-end instead (export from a seeded instance,
 * `npm run db:config-import` into a fresh one, confirm identical roles/
 * centres/permission grants) — see docs/PROGRESS.md.
 */
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { importConfig } = await import("../src/lib/config/import-config");
const { CONFIG_BUNDLE_VERSION } = await import("../src/lib/config/bundle-schema");

function emptyBundle() {
  return {
    version: CONFIG_BUNDLE_VERSION as typeof CONFIG_BUNDLE_VERSION,
    exportedAt: new Date(),
    orgSettings: [],
    terminology: [],
    centers: [],
    dropdownCategories: [],
    dropdownOptions: [],
    pipelineStages: [],
    fieldDefinitions: [],
    roles: [],
    rolePermissions: [],
    temperatureRules: [],
    slaPolicies: [],
    businessHours: [],
    holidays: [],
    feeStructures: [],
  };
}

describe("importConfig() emptiness guard", () => {
  it("refuses to run against an already-configured instance", async () => {
    // This suite runs on a db:seed'd database, so org_settings (seeded
    // first, per seed.ts) is guaranteed non-empty — exactly the case the
    // guard exists for.
    const result = await importConfig(emptyBundle());
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/already has .* configured/);
    expect(result.counts).toBeUndefined();
  });
});
