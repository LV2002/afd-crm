/**
 * First touch versus last touch.
 *
 * The trap this guards is double-counting: one lead contributes a row to
 * two different sources, and it is very easy to write a version where an
 * admission is counted once, at whichever end the loop happened to look
 * at — which quietly halves the credit for every source that both opens
 * and closes.
 */
import { describe, expect, it } from "vitest";

import {
  compareTouch,
  describeRole,
  multiTouchShare,
  type AttributionLead,
} from "../src/lib/reports/attribution";

function lead(overrides: Partial<AttributionLead> = {}): AttributionLead {
  return {
    leadId: "l1",
    firstTouchSource: "Instagram",
    lastTouchSource: "Instagram",
    admitted: false,
    ...overrides,
  };
}

describe("compareTouch", () => {
  it("credits both ends of a journey that moved", () => {
    const rows = compareTouch([
      lead({ firstTouchSource: "Instagram", lastTouchSource: "Walk-in", admitted: true }),
    ]);

    const instagram = rows.find((row) => row.source === "Instagram")!;
    const walkIn = rows.find((row) => row.source === "Walk-in")!;

    expect(instagram.firstTouchLeads).toBe(1);
    expect(instagram.firstTouchAdmissions).toBe(1);
    expect(instagram.lastTouchLeads).toBe(0);

    expect(walkIn.lastTouchLeads).toBe(1);
    expect(walkIn.lastTouchAdmissions).toBe(1);
    expect(walkIn.firstTouchLeads).toBe(0);
  });

  it("counts a lead that never moved once at each end of the same source", () => {
    const [row] = compareTouch([lead({ admitted: true })]);
    expect(row.source).toBe("Instagram");
    expect(row.firstTouchLeads).toBe(1);
    expect(row.lastTouchLeads).toBe(1);
    expect(row.introducerScore).toBe(0);
  });

  it("falls back to the first touch when no later source was recorded", () => {
    const rows = compareTouch([lead({ lastTouchSource: null })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].lastTouchLeads).toBe(1);
  });

  it("files a lead with no source at all under Unknown rather than dropping it", () => {
    const rows = compareTouch([
      lead({ firstTouchSource: null, lastTouchSource: null, admitted: true }),
    ]);
    expect(rows[0].source).toBe("Unknown");
    expect(rows[0].firstTouchAdmissions).toBe(1);
  });

  it("treats blank and whitespace sources as unknown", () => {
    const rows = compareTouch([lead({ firstTouchSource: "   ", lastTouchSource: "" })]);
    expect(rows.map((row) => row.source)).toEqual(["Unknown"]);
  });

  it("scores a source that introduces more than it closes as positive", () => {
    const rows = compareTouch([
      lead({ firstTouchSource: "Meta", lastTouchSource: "Referral", admitted: true }),
      lead({ firstTouchSource: "Meta", lastTouchSource: "Referral", admitted: true }),
      lead({ firstTouchSource: "Meta", lastTouchSource: "Meta", admitted: true }),
    ]);

    const meta = rows.find((row) => row.source === "Meta")!;
    const referral = rows.find((row) => row.source === "Referral")!;

    expect(meta.firstTouchAdmissions).toBe(3);
    expect(meta.lastTouchAdmissions).toBe(1);
    expect(meta.introducerScore).toBe(2);
    expect(referral.introducerScore).toBe(-2);
  });

  it("sorts the busiest sources first", () => {
    const rows = compareTouch([
      lead({ firstTouchSource: "Quiet", lastTouchSource: "Quiet", admitted: true }),
      lead({ firstTouchSource: "Busy", lastTouchSource: "Busy", admitted: true }),
      lead({ firstTouchSource: "Busy", lastTouchSource: "Busy", admitted: true }),
    ]);
    expect(rows[0].source).toBe("Busy");
  });

  it("returns nothing for no leads", () => {
    expect(compareTouch([])).toEqual([]);
  });
});

describe("describeRole", () => {
  const base = {
    source: "Meta",
    firstTouchLeads: 0,
    lastTouchLeads: 0,
    firstTouchAdmissions: 0,
    lastTouchAdmissions: 0,
    introducerScore: 0,
  };

  it("calls a source with no admissions balanced rather than guessing", () => {
    expect(describeRole(base)).toBe("balanced");
  });

  it("names an introducer", () => {
    expect(
      describeRole({
        ...base,
        firstTouchAdmissions: 20,
        lastTouchAdmissions: 5,
        introducerScore: 15,
      }),
    ).toBe("introducer");
  });

  it("names a closer", () => {
    expect(
      describeRole({
        ...base,
        firstTouchAdmissions: 5,
        lastTouchAdmissions: 20,
        introducerScore: -15,
      }),
    ).toBe("closer");
  });

  it("does not call a one-admission difference across a hundred a finding", () => {
    expect(
      describeRole({
        ...base,
        firstTouchAdmissions: 51,
        lastTouchAdmissions: 49,
        introducerScore: 2,
      }),
    ).toBe("balanced");
  });
});

describe("multiTouchShare", () => {
  it("is zero when nobody moved", () => {
    expect(multiTouchShare([lead(), lead()])).toBe(0);
  });

  it("counts only the leads whose source changed", () => {
    expect(
      multiTouchShare([lead(), lead({ lastTouchSource: "Walk-in" }), lead(), lead()]),
    ).toBe(0.25);
  });

  it("ignores a missing last touch rather than treating it as a move", () => {
    expect(multiTouchShare([lead({ lastTouchSource: null })])).toBe(0);
  });

  it("is zero for no leads instead of dividing by nothing", () => {
    expect(multiTouchShare([])).toBe(0);
  });
});
