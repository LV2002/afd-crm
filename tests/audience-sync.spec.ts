import { describe, expect, it } from "vitest";

import { computeAudienceDiff, isRetargetingEligible, type RetargetingCandidate } from "../src/lib/integrations/audience-sync";

function candidate(overrides: Partial<RetargetingCandidate> = {}): RetargetingCandidate {
  return {
    id: "lead1",
    deletedAt: null,
    consentStatus: "given",
    doNotContact: false,
    optedOutChannels: null,
    primaryPhone: "+919847100100",
    email: null,
    ...overrides,
  };
}

describe("isRetargetingEligible", () => {
  it("is eligible when consent is given, not opted out, and has a phone", () => {
    expect(isRetargetingEligible(candidate())).toBe(true);
  });

  it("excludes a soft-deleted lead", () => {
    expect(isRetargetingEligible(candidate({ deletedAt: new Date() }))).toBe(false);
  });

  it("excludes a do-not-contact lead", () => {
    expect(isRetargetingEligible(candidate({ doNotContact: true }))).toBe(false);
  });

  it("excludes a lead with any opted-out channel, regardless of which one", () => {
    expect(isRetargetingEligible(candidate({ optedOutChannels: ["whatsapp"] }))).toBe(false);
  });

  it("excludes a lead with no recorded consent (null) -- never defaults to eligible", () => {
    expect(isRetargetingEligible(candidate({ consentStatus: null }))).toBe(false);
  });

  it("excludes a lead whose consent was withdrawn", () => {
    expect(isRetargetingEligible(candidate({ consentStatus: "withdrawn" }))).toBe(false);
  });

  it("excludes a lead with pending consent", () => {
    expect(isRetargetingEligible(candidate({ consentStatus: "pending" }))).toBe(false);
  });

  it("excludes a lead with neither phone nor email", () => {
    expect(isRetargetingEligible(candidate({ primaryPhone: null, email: null }))).toBe(false);
  });

  it("is eligible with only an email and no phone", () => {
    expect(isRetargetingEligible(candidate({ primaryPhone: null, email: "a@b.com" }))).toBe(true);
  });
});

describe("computeAudienceDiff", () => {
  it("adds newly eligible leads not already synced", () => {
    const diff = computeAudienceDiff(["a", "b"], []);
    expect(diff.toAdd.sort()).toEqual(["a", "b"]);
    expect(diff.toRemove).toEqual([]);
  });

  it("removes previously-synced leads that are no longer eligible", () => {
    const diff = computeAudienceDiff(["a"], ["a", "b"]);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual(["b"]);
  });

  it("leaves already-synced, still-eligible leads untouched", () => {
    const diff = computeAudienceDiff(["a", "b"], ["a", "b"]);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  it("handles a lead becoming ineligible and a new one becoming eligible in the same run", () => {
    const diff = computeAudienceDiff(["a", "c"], ["a", "b"]);
    expect(diff.toAdd).toEqual(["c"]);
    expect(diff.toRemove).toEqual(["b"]);
  });

  it("returns empty diffs for two empty lists", () => {
    expect(computeAudienceDiff([], [])).toEqual({ toAdd: [], toRemove: [] });
  });
});
