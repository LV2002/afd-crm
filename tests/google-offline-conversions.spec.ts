/**
 * Telling Google Ads which clicks became students.
 *
 * Google optimises against whatever it is told converted, so both ways
 * this goes wrong are expensive and silent: reporting the same admission
 * twice teaches Google one click was worth double and the budget follows
 * that lie, and reporting a click Google has already forgotten fails at
 * the API with an error nobody reads.
 */
import { describe, expect, it } from "vitest";

import {
  CLICK_WINDOW_DAYS,
  formatConversionDateTime,
  planConversions,
  toConversionValue,
  type ConversionCandidate,
} from "../src/lib/integrations/google/offline-conversions";

const ASOF = "2026-04-01T00:00:00.000Z";

function candidate(overrides: Partial<ConversionCandidate> = {}): ConversionCandidate {
  return {
    enrolmentId: "e1",
    gclid: "Cj0KCQ_example",
    clickedAt: "2026-03-01T00:00:00.000Z",
    convertedAt: "2026-03-12T00:00:00.000Z",
    valuePaise: 85_000_00,
    droppedAt: null,
    ...overrides,
  };
}

describe("planConversions", () => {
  it("reports a paid admission that came from a Google click", () => {
    const plan = planConversions([candidate()], new Set(), ASOF);
    expect(plan.upload).toHaveLength(1);
    expect(plan.upload[0].gclid).toBe("Cj0KCQ_example");
    expect(plan.upload[0].valuePaise).toBe(85_000_00);
  });

  it("never reports the same admission twice", () => {
    // The whole double-count defence. Backed by a unique index in the
    // database as well, because a retry after a timeout must not tell
    // Google about the same money again.
    const plan = planConversions([candidate()], new Set(["e1"]), ASOF);
    expect(plan.upload).toEqual([]);
    // Not even as a skip: it is done, not skipped, and a row already
    // exists saying so.
    expect(plan.skipped).toEqual([]);
  });

  it("passes over an admission that never came from Google", () => {
    // Most of them. Meta, walk-ins and referrals have nothing for Google
    // to learn from.
    const plan = planConversions([candidate({ gclid: null })], new Set(), ASOF);
    expect(plan.upload).toEqual([]);
    expect(plan.skipped[0].reason).toBe("Not a Google click.");
  });

  it("refuses a click Google has already forgotten", () => {
    // Google discards a click after 90 days; a conversion attached to an
    // older one is rejected at the API with an error nobody reads.
    const old = candidate({ clickedAt: "2025-11-01T00:00:00.000Z" });
    const plan = planConversions([old], new Set(), ASOF);
    expect(plan.upload).toEqual([]);
    expect(plan.skipped[0].reason).toContain("only keeps 90");
    expect(CLICK_WINDOW_DAYS).toBe(90);
  });

  it("accepts a click right on the edge of the window", () => {
    const edge = candidate({ clickedAt: "2026-01-02T00:00:00.000Z" }); // 89 days
    expect(planConversions([edge], new Set(), ASOF).upload).toHaveLength(1);
  });

  it("never reports a dropped admission", () => {
    // Reporting one would teach Google to buy more people who drop out.
    const plan = planConversions(
      [candidate({ droppedAt: "2026-03-20T00:00:00.000Z" })],
      new Set(),
      ASOF,
    );
    expect(plan.upload).toEqual([]);
    expect(plan.skipped[0].reason).toBe("Dropped.");
  });

  it("ignores an admission that hasn't paid yet", () => {
    const plan = planConversions([candidate({ convertedAt: null })], new Set(), ASOF);
    expect(plan.upload).toEqual([]);
    expect(plan.skipped[0].reason).toBe("Hasn't converted yet.");
  });

  it("refuses a conversion dated in the future", () => {
    const plan = planConversions(
      [candidate({ convertedAt: "2026-06-01T00:00:00.000Z" })],
      new Set(),
      ASOF,
    );
    expect(plan.skipped[0].reason).toBe("Dated in the future.");
  });

  it("still reports when the click date is unknown", () => {
    // An imported lead may carry a GCLID with no enquiry timestamp. The
    // 90-day check cannot run, so Google decides — a rejection there is
    // better than never trying.
    const plan = planConversions([candidate({ clickedAt: null })], new Set(), ASOF);
    expect(plan.upload).toHaveLength(1);
  });

  it("never sends a negative value", () => {
    const plan = planConversions([candidate({ valuePaise: -500 })], new Set(), ASOF);
    expect(plan.upload[0].valuePaise).toBe(0);
  });
});

describe("formatConversionDateTime", () => {
  it("uses Google's format, not ISO 8601", () => {
    // A "T" or a "Z" is rejected outright, and the offset is mandatory.
    expect(formatConversionDateTime("2026-03-12T04:30:00.000Z")).toBe("2026-03-12 10:00:00+05:30");
  });

  it("carries an IST-evening conversion onto the right calendar day", () => {
    // 20:00 UTC is 01:30 the NEXT day in Kochi. Reporting it against the
    // wrong day misattributes the click.
    expect(formatConversionDateTime("2026-03-12T20:00:00.000Z")).toBe("2026-03-13 01:30:00+05:30");
  });

  it("refuses a value that isn't a date rather than sending nonsense", () => {
    expect(() => formatConversionDateTime("not a date")).toThrow();
  });
});

describe("toConversionValue", () => {
  it("turns paise into the rupees Google expects", () => {
    // The one place paise and Google's decimal meet. Getting it wrong by
    // a factor of 100 would tell Google every student is worth ₹850.
    expect(toConversionValue(85_000_00)).toBe(85000);
    expect(toConversionValue(1_50)).toBe(1.5);
    expect(toConversionValue(0)).toBe(0);
  });
});
