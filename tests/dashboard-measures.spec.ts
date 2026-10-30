/**
 * A dashboard figure and the list behind it must be the same number.
 *
 * Every tile links to the leads page with a measure; the page lists leads
 * with `matchesMeasure`'s database twin (`applyMeasure`), and the dashboard
 * counts with `buildCounsellorScoreboard`. These tests run both in-memory
 * definitions over the same rows and require them to agree for every
 * measure, so a tile can never promise 42 and open a list of 40.
 */
import { describe, expect, it } from "vitest";

import { MEASURE_KEYS, criteriaFor, matchesMeasure, type MeasureKey } from "../src/lib/dashboard/measures";
import {
  buildCentreScoreboard,
  buildCounsellorScoreboard,
  type Boundaries,
  type ScoreboardEnrolment,
  type ScoreboardLead,
} from "../src/lib/dashboard/scoreboard";

const D = (iso: string) => new Date(iso);

const boundaries: Boundaries = {
  startOfToday: D("2026-10-28T18:30:00Z"),
  startOfTomorrow: D("2026-10-29T18:30:00Z"),
  startOfMonth: D("2026-09-30T18:30:00Z"),
  startOfPreviousMonth: D("2026-08-31T18:30:00Z"),
  startOfCycleYear: D("2026-03-31T18:30:00Z"),
};
const terminal = new Set(["took_admission", "negative"]);
const interested = new Set(["hot", "warm"]);

// A deliberately awkward spread: every combination of the facts the
// measures look at, repeated with different dates.
const temperatures = [null, "hot", "warm", "cold", "negative", "took_admission"];
const created = ["2026-02-01T05:00:00Z", "2026-05-01T05:00:00Z", "2026-10-10T05:00:00Z", "2026-10-29T05:00:00Z"];
const followups = [null, "2026-10-01T05:00:00Z", "2026-10-29T10:00:00Z", "2026-11-20T05:00:00Z"];
const responded = [null, "2026-10-11T05:00:00Z"];
const owners = ["a", "b", null];

const leads: ScoreboardLead[] = [];
let n = 0;
for (const temperature of temperatures)
  for (const createdAt of created)
    for (const nextFollowupAt of followups)
      for (const firstResponseAt of responded)
        for (const assignedTo of owners) {
          n += 1;
          leads.push({
            id: `lead-${n}`,
            assignedTo,
            centerId: "c1",
            createdAt,
            assignedAt: n % 5 === 0 ? "2026-10-29T06:00:00Z" : n % 3 === 0 ? "2026-09-01T06:00:00Z" : null,
            firstResponseAt,
            nextFollowupAt,
            slaBreached: n % 7 === 0,
            temperature,
          });
        }

// One admission on every 11th lead; some this month, some earlier this year, some dropped.
const enrolments: ScoreboardEnrolment[] = leads
  .filter((_, index) => index % 11 === 0)
  .map((lead, index) => ({
    leadId: lead.id,
    salesToAccountsAt: index % 3 === 0 ? "2026-10-12T05:00:00Z" : index % 3 === 1 ? "2026-06-12T05:00:00Z" : "2026-01-12T05:00:00Z",
    droppedAt: index % 4 === 0 ? "2026-10-20T05:00:00Z" : null,
  }));

const ctx = { boundaries, terminalTemperatures: terminal, interestedTemperatures: interested };

function count(measure: MeasureKey, rows: ScoreboardLead[] = leads): number {
  return rows.filter((lead) => matchesMeasure(measure, lead, enrolments, ctx)).length;
}

describe("every dashboard figure equals the leads its link lists", () => {
  const board = buildCounsellorScoreboard({
    leads,
    enrolments,
    terminalTemperatures: terminal,
    boundaries,
    interestedTemperatures: interested,
  });

  const expected: Record<MeasureKey, number | null> = {
    active: board.activeLeads,
    assigned_today: board.assignedToday,
    new_month: board.newThisMonth,
    responded_month: board.respondedThisMonth,
    never_contacted: board.neverContacted,
    overdue: board.overdueFollowups,
    due_today: board.dueToday,
    sla_breached: board.slaBreached,
    admissions_month: board.admissionsThisMonth,
    attention: board.attentionLeads,
    y_active: board.year.activeLeads,
    y_new: board.year.newLeads,
    y_contacted: board.year.contacted,
    y_never_contacted: board.year.neverContacted,
    y_overdue: board.year.overdueFollowups,
    y_interested: board.year.interested,
    y_enrolments: board.year.enrolments,
    // Centre-level figures, checked separately below.
    unassigned: null,
    unowned_or_unanswered: null,
  };

  for (const measure of MEASURE_KEYS) {
    const want = expected[measure];
    if (want === null) continue;
    it(`${measure}`, () => {
      expect(count(measure)).toBe(want);
      // Guard against a vacuous pass.
      expect(want).toBeGreaterThanOrEqual(0);
    });
  }

  it("covers the centre-level figures", () => {
    const centre = buildCentreScoreboard({ leads, enrolments, terminalTemperatures: terminal, boundaries });
    expect(count("unassigned")).toBe(centre.unassigned);
    expect(count("unowned_or_unanswered")).toBe(centre.unownedOrUnanswered);
  });

  it("has non-trivial counts, so the comparisons above mean something", () => {
    const nonZero = MEASURE_KEYS.filter((measure) => count(measure) > 0 && count(measure) < leads.length);
    expect(nonZero.length).toBeGreaterThanOrEqual(15);
  });

  it("never counts a lead twice in the combined figures", () => {
    expect(board.attentionLeads).toBeLessThanOrEqual(board.overdueFollowups + board.neverContacted);
    expect(board.attentionLeads).toBeGreaterThanOrEqual(Math.max(board.overdueFollowups, board.neverContacted));
  });

  it("needs enrolments only for the admission measures", () => {
    const joined = MEASURE_KEYS.filter((measure) => criteriaFor(measure, ctx).admittedFrom !== undefined);
    expect(joined).toEqual(["admissions_month", "y_enrolments"]);
  });
});
