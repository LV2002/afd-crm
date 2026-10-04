import { describe, expect, it } from "vitest";

import {
  computeAudienceDiff,
  DEFAULT_RETARGETING_WINDOW_DAYS,
  isRetargetingEligible,
  isWithinRetargetingWindow,
  type RetargetingCandidate,
} from "../src/lib/integrations/audience-sync";

/** A fixed "now" for the window tests, so they do not drift with the calendar. */
const NOW = new Date("2026-10-04T06:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function candidate(overrides: Partial<RetargetingCandidate> = {}): RetargetingCandidate {
  return {
    id: "lead1",
    deletedAt: null,
    consentStatus: "given",
    doNotContact: false,
    optedOutChannels: null,
    primaryPhone: "+919847100100",
    email: null,
    createdAt: daysAgo(10),
    lastActivityAt: daysAgo(10),
    ...overrides,
  };
}

/** The eligibility tests below are about consent and contactability, not recency — pinned so a fixed `now` applies to them too. */
const WINDOW = { windowDays: DEFAULT_RETARGETING_WINDOW_DAYS, now: NOW };

describe("isRetargetingEligible", () => {
  it("is eligible when consent is given, not opted out, and has a phone", () => {
    expect(isRetargetingEligible(candidate(), WINDOW)).toBe(true);
  });

  it("excludes a soft-deleted lead", () => {
    expect(isRetargetingEligible(candidate({ deletedAt: new Date() }), WINDOW)).toBe(false);
  });

  it("excludes a do-not-contact lead", () => {
    expect(isRetargetingEligible(candidate({ doNotContact: true }), WINDOW)).toBe(false);
  });

  it("excludes a lead with any opted-out channel, regardless of which one", () => {
    expect(isRetargetingEligible(candidate({ optedOutChannels: ["whatsapp"] }), WINDOW)).toBe(false);
  });

  it("excludes a lead with no recorded consent (null) -- never defaults to eligible", () => {
    expect(isRetargetingEligible(candidate({ consentStatus: null }), WINDOW)).toBe(false);
  });

  it("excludes a lead whose consent was withdrawn", () => {
    expect(isRetargetingEligible(candidate({ consentStatus: "withdrawn" }), WINDOW)).toBe(false);
  });

  it("excludes a lead with pending consent", () => {
    expect(isRetargetingEligible(candidate({ consentStatus: "pending" }), WINDOW)).toBe(false);
  });

  it("excludes a lead with neither phone nor email", () => {
    expect(isRetargetingEligible(candidate({ primaryPhone: null, email: null }), WINDOW)).toBe(false);
  });

  it("is eligible with only an email and no phone", () => {
    expect(isRetargetingEligible(candidate({ primaryPhone: null, email: "a@b.com" }), WINDOW)).toBe(true);
  });

  it("excludes a lead older than the window, however consenting", () => {
    // The whole point of the window: a 2024 enquirer who sat their exam
    // and moved on is somebody the institute was still paying to advertise
    // to, about a course they no longer want.
    const old = candidate({ createdAt: daysAgo(400), lastActivityAt: daysAgo(400) });
    expect(isRetargetingEligible(old, WINDOW)).toBe(false);
  });

  it("defaults to a six-month window when none is given", () => {
    expect(
      isRetargetingEligible(candidate({ createdAt: daysAgo(400), lastActivityAt: daysAgo(400) })),
    ).toBe(false);
    expect(isRetargetingEligible(candidate())).toBe(true);
  });
});

describe("isWithinRetargetingWindow", () => {
  it("keeps an older lead that is still being worked", () => {
    // Eight months since they arrived, spoken to last week. Dropping them
    // out of the audience mid-conversation is the opposite of the point.
    expect(
      isWithinRetargetingWindow(
        { createdAt: daysAgo(240), lastActivityAt: daysAgo(7) },
        { windowDays: 180, now: NOW },
      ),
    ).toBe(true);
  });

  it("drops a lead whose last activity is also outside the window", () => {
    expect(
      isWithinRetargetingWindow(
        { createdAt: daysAgo(240), lastActivityAt: daysAgo(200) },
        { windowDays: 180, now: NOW },
      ),
    ).toBe(false);
  });

  it("keeps everything when the window is zero or null — the behaviour this replaced", () => {
    const ancient = { createdAt: daysAgo(3000), lastActivityAt: daysAgo(3000) };
    expect(isWithinRetargetingWindow(ancient, { windowDays: 0, now: NOW })).toBe(true);
    expect(isWithinRetargetingWindow(ancient, { windowDays: null, now: NOW })).toBe(true);
  });

  it("keeps a lead with no usable dates rather than quietly dropping it", () => {
    // A row that predates the columns, or a bad import. Consent is the
    // gate that decides whether somebody may be advertised to; a missing
    // timestamp is not evidence of age.
    expect(
      isWithinRetargetingWindow({ createdAt: null, lastActivityAt: null }, { windowDays: 180, now: NOW }),
    ).toBe(true);
    expect(
      isWithinRetargetingWindow(
        { createdAt: "not a date", lastActivityAt: null },
        { windowDays: 180, now: NOW },
      ),
    ).toBe(true);
  });

  it("reads an ISO string as well as a Date, because that is what the db client returns", () => {
    expect(
      isWithinRetargetingWindow(
        { createdAt: daysAgo(30).toISOString(), lastActivityAt: null },
        { windowDays: 180, now: NOW },
      ),
    ).toBe(true);
  });

  it("includes a lead exactly on the boundary", () => {
    expect(
      isWithinRetargetingWindow(
        { createdAt: daysAgo(180), lastActivityAt: null },
        { windowDays: 180, now: NOW },
      ),
    ).toBe(true);
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
