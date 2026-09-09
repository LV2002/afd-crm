/**
 * Whether the month is on course, and what the open pipeline is worth.
 *
 * Every number this system reports has been descriptive — how many leads
 * arrived, how many enrolled, what it cost. None of it was compared
 * against what anybody was trying to do, so "are we going to make it?"
 * was answered by feel on the 25th.
 *
 * ## Two different claims, deliberately kept apart
 *
 * **Pace** is arithmetic on what has already happened: nine admissions in
 * fourteen days is a run rate, and a run rate times the length of the
 * month is a projection. It assumes the rest of the month looks like the
 * first part of it, which is a weak assumption early on and a decent one
 * by the middle.
 *
 * **Weighted pipeline** is a claim about specific people: every open lead
 * counted at its stage's probability, so one lead at Demo-Scheduled 60%
 * is 0.6 of an admission. It says what the leads in hand are worth, not
 * when they land.
 *
 * Neither is a forecast on its own and this module refuses to average
 * them into one authoritative-looking number. They are reported side by
 * side because when they disagree, the disagreement is the finding: a
 * good pace on an empty pipeline is a month that ends badly, and the
 * whole point of looking on the 14th is to see that on the 14th.
 */

/** Below this many days elapsed, a run-rate projection is one good afternoon multiplied by thirty. */
export const EARLY_DAYS = 5;

export type PaceVerdict = "ahead" | "on_track" | "behind" | "no_target";

export interface Pace {
  achieved: number;
  target: number | null;
  /** Share of the target already achieved. Null without a target. */
  attainment: number | null;
  /** What a steady month would have delivered by now. Null without a target. */
  expectedByNow: number | null;
  /** Achieved minus expected. Negative is behind. Null without a target. */
  aheadBy: number | null;
  /** Per day, over the days elapsed. */
  runRate: number;
  /** Where the run rate lands by month end. */
  projected: number;
  verdict: PaceVerdict;
  /** True while the projection rests on too few days to be worth much. */
  isEarly: boolean;
}

export interface PaceInput {
  achieved: number;
  /** Null when nobody has set one. Everything target-shaped then comes back null rather than 0. */
  target: number | null;
  /** Days of the month elapsed, including today. 1 on the 1st. */
  dayOfMonth: number;
  daysInMonth: number;
}

export function pace(input: PaceInput): Pace {
  // A month cannot be zero days long and today cannot be the zeroth: both
  // would divide by nothing, and both are reachable from a bad date.
  const daysInMonth = Math.max(1, input.daysInMonth);
  const elapsed = Math.min(daysInMonth, Math.max(1, input.dayOfMonth));

  const runRate = input.achieved / elapsed;
  const projected = Math.round(runRate * daysInMonth);
  const isEarly = elapsed < EARLY_DAYS;

  if (input.target === null || input.target <= 0) {
    return {
      achieved: input.achieved,
      target: null,
      attainment: null,
      expectedByNow: null,
      aheadBy: null,
      runRate,
      projected,
      verdict: "no_target",
      isEarly,
    };
  }

  const expectedByNow = (input.target * elapsed) / daysInMonth;

  return {
    achieved: input.achieved,
    target: input.target,
    attainment: input.achieved / input.target,
    expectedByNow,
    aheadBy: input.achieved - expectedByNow,
    runRate,
    projected,
    // Judged on where the month lands, not on where it stands today.
    // "Behind by two on the 3rd" is noise; "on course for 41 against 60"
    // is the thing worth acting on. The 5% band either side keeps a
    // rounding difference from being reported as a miss.
    verdict:
      projected >= input.target * 1.05
        ? "ahead"
        : projected >= input.target * 0.95
          ? "on_track"
          : "behind",
    isEarly,
  };
}

export interface PipelineLead {
  leadId: string;
  stageId: string | null;
  stageName: string;
  /** 0–1. Null when the admin has not set one for this stage. */
  probability: number | null;
}

export interface PipelineStageWeight {
  stageId: string | null;
  stageName: string;
  leads: number;
  probability: number | null;
  /** leads × probability, or 0 for a stage with no probability set. */
  expected: number;
}

export interface WeightedPipeline {
  /** Every open lead, whether or not its stage carries a probability. */
  openLeads: number;
  /** The sum of the probabilities: how many admissions the open pipeline is worth. */
  expectedAdmissions: number;
  /**
   * Leads sitting in stages with no probability configured. They count
   * as nothing above, and saying so is the difference between a low
   * forecast and a misconfigured one.
   */
  unweightedLeads: number;
  byStage: PipelineStageWeight[];
}

export function weightedPipeline(leads: PipelineLead[]): WeightedPipeline {
  const groups = new Map<string, PipelineStageWeight>();

  for (const lead of leads) {
    const key = lead.stageId ?? "__none__";
    const existing = groups.get(key);
    if (existing) {
      existing.leads += 1;
    } else {
      groups.set(key, {
        stageId: lead.stageId,
        stageName: lead.stageName,
        leads: 1,
        probability: lead.probability,
        expected: 0,
      });
    }
  }

  let expectedAdmissions = 0;
  let unweightedLeads = 0;

  for (const group of groups.values()) {
    if (group.probability === null) {
      unweightedLeads += group.leads;
      group.expected = 0;
      continue;
    }
    group.expected = group.leads * group.probability;
    expectedAdmissions += group.expected;
  }

  return {
    openLeads: leads.length,
    expectedAdmissions,
    unweightedLeads,
    byStage: [...groups.values()].sort((a, b) => b.expected - a.expected || b.leads - a.leads),
  };
}

/**
 * Reads a stage's stored probability, which is a percentage in the
 * database (`numeric(5,2)`, 0–100) and a fraction everywhere in this
 * file. Getting that wrong turns a 60% stage into sixty admissions,
 * which is exactly the kind of error a forecast makes look plausible.
 */
export function stageProbability(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  // Out-of-range values are clamped rather than dropped: an admin who
  // typed 120 meant "very likely", and a stage silently contributing
  // nothing is worse than one contributing at 100%.
  return Math.min(1, Math.max(0, numeric / 100));
}

/**
 * What the month looks like if everything currently open behaves as its
 * stage says.
 *
 * Explicitly the optimistic end: the open pipeline does not all land this
 * month, and this makes no attempt to guess how much of it will. It is
 * the ceiling the pace projection should be read against, not a
 * prediction, and the screen says so.
 */
export function monthEndCeiling(achieved: number, pipeline: WeightedPipeline): number {
  return achieved + pipeline.expectedAdmissions;
}
