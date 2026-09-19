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
    pipelineStages: [],
    fieldDefinitions: [],
    roles: [],
    rolePermissions: [],
    temperatureRules: [],
    slaPolicies: [],
    businessHours: [],
    holidays: [],
    feeStructures: [],
    tags: [],
    dashboardLayouts: [],
    syllabusModules: [],
    syllabusTopics: [],
    courseCurricula: [],
    curriculumItems: [],
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

  it("accepts a bundle with a real-shaped tag row", () => {
    const bundle = emptyBundle();
    bundle.tags = [
      {
        id: randomUUID(),
        name: "High intent",
        color: "#22c55e",
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ] as unknown as (typeof bundle)["tags"];
    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
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

  it("accepts a syllabus, with hours as the string the driver returns", () => {
    // numeric(5,2) comes back from node-postgres as "1.75", not 1.75.
    // A bundle that only ever round-tripped a number would pass here and
    // fail on a real export.
    const bundle = emptyBundle();
    const moduleId = randomUUID();
    const topicId = randomUUID();
    const curriculumId = randomUUID();
    const now = new Date().toISOString();

    bundle.syllabusModules = [
      {
        id: moduleId,
        name: "Drawing Fundamentals",
        subject: "drawing",
        description: null,
        sortOrder: 10,
        isActive: true,
        createdAt: now,
        updatedAt: null,
      },
    ] as unknown as (typeof bundle)["syllabusModules"];
    bundle.syllabusTopics = [
      {
        id: topicId,
        moduleId,
        name: "Two-point perspective",
        description: null,
        sortOrder: 10,
        isActive: true,
        createdAt: now,
        updatedAt: null,
      },
    ] as unknown as (typeof bundle)["syllabusTopics"];
    bundle.courseCurricula = [
      {
        id: curriculumId,
        course: "foundation",
        academicYear: "2026-27",
        teachingEndDate: "2026-11-15",
        notes: null,
        isActive: true,
        createdAt: now,
        updatedAt: null,
      },
    ] as unknown as (typeof bundle)["courseCurricula"];
    bundle.curriculumItems = [
      {
        id: randomUUID(),
        curriculumId,
        moduleId,
        topicId,
        kind: "teaching",
        hours: "1.75",
        coverage: "One- and two-point only. Three-point is Foundation.",
        sortOrder: 10,
        isActive: true,
        createdAt: now,
        updatedAt: null,
      },
    ] as unknown as (typeof bundle)["curriculumItems"];

    const result = configBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it("refuses a curriculum block with a kind the generator cannot place", () => {
    const bundle = emptyBundle();
    bundle.curriculumItems = [
      {
        id: randomUUID(),
        curriculumId: randomUUID(),
        moduleId: randomUUID(),
        topicId: null,
        kind: "field_trip",
        hours: "2",
        coverage: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      },
    ] as unknown as (typeof bundle)["curriculumItems"];

    expect(configBundleSchema.safeParse(bundle).success).toBe(false);
  });
});
