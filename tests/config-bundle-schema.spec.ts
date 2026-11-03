import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { configBundleSchema, CONFIG_BUNDLE_VERSION } from "../src/lib/config/bundle-schema";

function emptyBundle() {
  return {
    version: CONFIG_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    orgSettings: [],
    terminology: [],
    centers: [],
    dropdownCategories: [],
    dropdownOptions: [],
    fieldDefinitions: [],
    roles: [],
    rolePermissions: [],
    temperatureRules: [],
    slaPolicies: [],
    businessHours: [],
    holidays: [],
    feeStructures: [],
    dashboardLayouts: [],
  };
}

describe("configBundleSchema", () => {
  it("accepts a well-formed empty bundle", () => {
    const result = configBundleSchema.safeParse(emptyBundle());
    expect(result.success).toBe(true);
  });

  it("accepts a bundle with real-shaped rows", () => {
    const bundle = emptyBundle();
    bundle.centers = [
      {
        id: randomUUID(),
        name: "Kochi",
        city: "Kochi",
        isActive: true,
        timezone: "Asia/Kolkata",
        createdAt: new Date().toISOString(),
      },
    ] as unknown as (typeof bundle)["centers"];
    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it("accepts a bundle with a real-shaped fee structure row", () => {
    const bundle = emptyBundle();
    bundle.feeStructures = [
      {
        id: randomUUID(),
        course: "Foundation",
        centerId: randomUUID(),
        mode: "offline",
        academicYear: "2026-27",
        baseFeePaise: 20000000,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ] as unknown as (typeof bundle)["feeStructures"];
    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it("still accepts an older export that carries tags, and drops them", () => {
    // Tags were removed from the CRM. A bundle exported before that has a
    // `tags` list; importing it must not fail, and must not bring them back.
    const bundle = {
      ...emptyBundle(),
      tags: [{ id: randomUUID(), name: "High intent", color: "#22c55e", isActive: true, createdAt: new Date().toISOString() }],
    };
    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
    expect(result.success && "tags" in result.data).toBe(false);
  });

  it("rejects a bundle with the wrong version", () => {
    const bundle = { ...emptyBundle(), version: "999" };
    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
  });

  it("rejects a row missing a required field", () => {
    const bundle = emptyBundle();
    bundle.roles = [{ id: randomUUID(), code: "admin" }] as unknown as (typeof bundle)["roles"];
    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
  });

  it("rejects a completely malformed upload (not an object)", () => {
    expect(configBundleSchema.safeParse("not a bundle").success).toBe(false);
    expect(configBundleSchema.safeParse(null).success).toBe(false);
    expect(configBundleSchema.safeParse([1, 2, 3]).success).toBe(false);
  });
});
