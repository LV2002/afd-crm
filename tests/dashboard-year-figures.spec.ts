/**
 * The counsellor dashboard's "your year so far" row.
 *
 * The rule that makes seven tiles into one row: every figure but the
 * enrolment count is about leads that **arrived this cycle year**. These
 * tests are mostly about that rule holding at its edges — a lead from
 * last cycle, a lead won since, a temperature nobody configured.
 */
import { describe, expect, it } from "vitest";

import {
  buildCounsellorScoreboard,
  type Boundaries,
  type ScoreboardEnrolment,
  type ScoreboardLead,
  type StageInfo,
} from "@/lib/dashboard/scoreboard";
import { startOfCycleYearIST } from "@/lib/dashboard/get-scoreboard";
import { isInterestedTemperature } from "@/lib/leads/interested-temperature";

const STAGES: StageInfo[] = [
  { id: "s-new", stageType: "open" },
  { id: "s-won", stageType: "won" },
  { id: "s-lost", stageType: "lost" },
];

/** 30 September 2026, 14:00 IST. The April cycle began on 1 April 2026. */
const BOUNDARIES: Boundaries = {
  startOfToday: new Date("2026-09-29T18:30:00Z"),
  startOfTomorrow: new Date("2026-09-30T18:30:00Z"),
  startOfMonth: new Date("2026-08-31T18:30:00Z"),
  startOfPreviousMonth: new Date("2026-07-31T18:30:00Z"),
  startOfCycleYear: new Date("2026-03-31T18:30:00Z"),
};

let seq = 0;
function lead(over: Partial<ScoreboardLead> = {}): ScoreboardLead {
  seq += 1;
  return {
    id: `lead-${seq}`,
    assignedTo: "athira",
    centerId: "kochi",
    stageId: "s-new",
    createdAt: "2026-06-10T06:00:00Z",
    assignedAt: "2026-06-10T06:00:00Z",
    firstResponseAt: "2026-06-10T08:00:00Z",
    nextFollowupAt: null,
    slaBreached: false,
    temperature: null,
    ...over,
  };
}

function build(leads: ScoreboardLead[], enrolments: ScoreboardEnrolment[] = []) {
  return buildCounsellorScoreboard({
    leads,
    enrolments,
    stages: STAGES,
    boundaries: BOUNDARIES,
  }).year;
}

describe("which leads the year row counts", () => {
  it("counts a lead from this cycle and ignores one from the last", () => {
    const year = build([
      lead({ createdAt: "2026-06-10T06:00:00Z" }),
      // 1 March 2026 — before the April start, so it belongs to the cycle
      // that ended. This is the figure that would be silently wrong if the
      // year were taken as a calendar one.
      lead({ createdAt: "2026-03-01T06:00:00Z" }),
    ]);

    expect(year.newLeads).toBe(1);
  });

  it("splits this year's leads into contacted and never contacted, with nothing left over", () => {
    const year = build([
      lead({ firstResponseAt: "2026-06-11T06:00:00Z" }),
      lead({ firstResponseAt: null }),
      lead({ firstResponseAt: null }),
    ]);

    expect(year.contacted).toBe(1);
    expect(year.neverContacted).toBe(2);
    expect(year.contacted + year.neverContacted).toBe(year.newLeads);
  });

  /*
    The distinction that makes the row readable: "new" is everybody who
    arrived, "active" is who is still being worked. A won lead stays in
    the first and leaves the second.
  */
  it("keeps a won lead in new leads but drops it from active", () => {
    const year = build([lead({ stageId: "s-won" }), lead({ stageId: "s-new" })]);

    expect(year.newLeads).toBe(2);
    expect(year.activeLeads).toBe(1);
  });

  it("counts an overdue follow-up only while the lead is still active", () => {
    const overdue = "2026-09-20T06:00:00Z";
    const year = build([
      lead({ nextFollowupAt: overdue }),
      // Won in the meantime: it still carries the date somebody booked,
      // and counting it would put a number on the card that cannot be
      // worked down.
      lead({ nextFollowupAt: overdue, stageId: "s-won" }),
    ]);

    expect(year.overdueFollowups).toBe(1);
  });
});

describe("the interested figure", () => {
  it("counts very hot, hot and warm", () => {
    const year = build([
      lead({ temperature: "very_hot" }),
      lead({ temperature: "hot" }),
      lead({ temperature: "warm" }),
      lead({ temperature: "cold" }),
      lead({ temperature: "dead" }),
      lead({ temperature: null }),
    ]);

    expect(year.interested).toBe(3);
  });

  it("does not count somebody who is no longer being worked", () => {
    const year = build([lead({ temperature: "hot", stageId: "s-won" })]);
    expect(year.interested).toBe(0);
  });

  it("reads the same value however it was spelled", () => {
    // Which spelling an institute ends up with depends on who added the
    // option, so all four have to mean one thing.
    for (const spelling of ["very_hot", "very-hot", "veryhot", "Very Hot"]) {
      expect(isInterestedTemperature(spelling), spelling).toBe(true);
    }
    expect(isInterestedTemperature("cold")).toBe(false);
    expect(isInterestedTemperature(null)).toBe(false);
  });
});

describe("the enrolment figure", () => {
  /*
    The one tile that is not about when the lead arrived. An admission
    confirmed in June on a lead from February is June's work, and a
    counsellor whose year-to-date admissions dropped the older ones would
    be reading a number that understates what they did.
  */
  it("counts by confirmation date, not by when the lead arrived", () => {
    const year = build(
      [lead({ id: "old", createdAt: "2026-02-01T06:00:00Z" })],
      [{ leadId: "old", salesToAccountsAt: "2026-06-01T06:00:00Z", droppedAt: null }],
    );

    expect(year.newLeads).toBe(0);
    expect(year.enrolments).toBe(1);
  });

  it("ignores one confirmed before the cycle began, and one that dropped out", () => {
    const year = build(
      [lead({ id: "a" }), lead({ id: "b" })],
      [
        { leadId: "a", salesToAccountsAt: "2026-02-01T06:00:00Z", droppedAt: null },
        { leadId: "b", salesToAccountsAt: "2026-06-01T06:00:00Z", droppedAt: "2026-07-01T06:00:00Z" },
      ],
    );

    expect(year.enrolments).toBe(0);
  });
});

describe("when the cycle year starts", () => {
  /** 30 September 2026, 14:00 IST. */
  const september = new Date("2026-09-30T08:30:00Z");

  it("runs from April by default, India's financial year", () => {
    expect(startOfCycleYearIST(september, 4).toISOString()).toBe("2026-03-31T18:30:00.000Z");
  });

  it("reaches back to last year when today is before the start month", () => {
    // February 2026 with a June cycle: the year running began in June 2025.
    const february = new Date("2026-02-10T08:30:00Z");
    expect(startOfCycleYearIST(february, 6).toISOString()).toBe("2025-05-31T18:30:00.000Z");
  });

  it("handles a January start without reaching back", () => {
    expect(startOfCycleYearIST(september, 1).toISOString()).toBe("2025-12-31T18:30:00.000Z");
  });

  /*
    The bug the lead date filters already paid for once: 1 April in Kochi
    is 31 March 18:30 UTC, so month arithmetic done on the instant lands a
    day early. Asking on the boundary itself is where that shows.
  */
  it("is right on the first morning of the cycle", () => {
    const firstMorning = new Date("2026-04-01T01:00:00Z"); // 06:30 IST, 1 April
    expect(startOfCycleYearIST(firstMorning, 4).toISOString()).toBe("2026-03-31T18:30:00.000Z");
  });

  it("is right on the last evening before it", () => {
    const lastEvening = new Date("2026-03-31T17:00:00Z"); // 22:30 IST, 31 March
    expect(startOfCycleYearIST(lastEvening, 4).toISOString()).toBe("2025-03-31T18:30:00.000Z");
  });
});
