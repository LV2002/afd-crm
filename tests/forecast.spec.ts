/**
 * Pace and weighted pipeline.
 *
 * Two arithmetic traps live here. A run rate on day one multiplies a
 * single admission by thirty and calls it a forecast; and a stage
 * probability stored as 60 rather than 0.6 turns a demo into sixty
 * admissions. Both produce a confident-looking number, which is what
 * makes them worth a test each.
 */
import { describe, expect, it } from "vitest";

import {
  EARLY_DAYS,
  monthEndCeiling,
  pace,
  stageProbability,
  weightedPipeline,
  type PipelineLead,
} from "../src/lib/reports/forecast";

describe("pace", () => {
  it("projects a steady month onto its end", () => {
    const result = pace({ achieved: 15, target: 30, dayOfMonth: 15, daysInMonth: 30 });
    expect(result.runRate).toBe(1);
    expect(result.projected).toBe(30);
    expect(result.expectedByNow).toBe(15);
    expect(result.aheadBy).toBe(0);
    expect(result.verdict).toBe("on_track");
  });

  it("calls a month that lands well over the target ahead", () => {
    expect(pace({ achieved: 20, target: 30, dayOfMonth: 15, daysInMonth: 30 }).verdict).toBe(
      "ahead",
    );
  });

  it("calls a month that lands well under it behind", () => {
    const result = pace({ achieved: 5, target: 30, dayOfMonth: 15, daysInMonth: 30 });
    expect(result.projected).toBe(10);
    expect(result.aheadBy).toBe(-10);
    expect(result.verdict).toBe("behind");
  });

  it("does not report a near miss as a miss", () => {
    // 29 against 30 is a rounding difference, not a failure.
    expect(pace({ achieved: 29, target: 30, dayOfMonth: 30, daysInMonth: 30 }).verdict).toBe(
      "on_track",
    );
  });

  it("withholds every target-shaped number when no target is set", () => {
    const result = pace({ achieved: 9, target: null, dayOfMonth: 10, daysInMonth: 30 });
    expect(result.verdict).toBe("no_target");
    expect(result.attainment).toBeNull();
    expect(result.expectedByNow).toBeNull();
    expect(result.aheadBy).toBeNull();
    // The run rate is still real — it needs no target to be true.
    expect(result.projected).toBe(27);
  });

  it("treats a zero target as no target rather than dividing by it", () => {
    const result = pace({ achieved: 4, target: 0, dayOfMonth: 10, daysInMonth: 30 });
    expect(result.verdict).toBe("no_target");
    expect(Number.isFinite(result.projected)).toBe(true);
  });

  it("flags the first few days as too early to read", () => {
    expect(pace({ achieved: 2, target: 30, dayOfMonth: 1, daysInMonth: 30 }).isEarly).toBe(true);
    expect(pace({ achieved: 2, target: 30, dayOfMonth: EARLY_DAYS, daysInMonth: 30 }).isEarly).toBe(
      false,
    );
  });

  it("survives a day zero rather than returning infinity", () => {
    const result = pace({ achieved: 3, target: 30, dayOfMonth: 0, daysInMonth: 30 });
    expect(Number.isFinite(result.runRate)).toBe(true);
    expect(result.runRate).toBe(3);
  });

  it("survives a zero-length month", () => {
    const result = pace({ achieved: 3, target: 30, dayOfMonth: 1, daysInMonth: 0 });
    expect(Number.isFinite(result.projected)).toBe(true);
  });

  it("never projects from more days than the month has", () => {
    const result = pace({ achieved: 30, target: 30, dayOfMonth: 45, daysInMonth: 30 });
    expect(result.projected).toBe(30);
  });

  it("is zero-but-honest with nothing achieved", () => {
    const result = pace({ achieved: 0, target: 30, dayOfMonth: 20, daysInMonth: 30 });
    expect(result.attainment).toBe(0);
    expect(result.projected).toBe(0);
    expect(result.verdict).toBe("behind");
  });
});

describe("stageProbability", () => {
  it("reads a stored percentage as a fraction", () => {
    expect(stageProbability("60.00")).toBe(0.6);
    expect(stageProbability(25)).toBe(0.25);
  });

  it("keeps null as null rather than as zero", () => {
    expect(stageProbability(null)).toBeNull();
    expect(stageProbability("not a number")).toBeNull();
  });

  it("clamps a nonsense percentage instead of dropping the stage", () => {
    expect(stageProbability(120)).toBe(1);
    expect(stageProbability(-5)).toBe(0);
  });
});

describe("weightedPipeline", () => {
  function lead(stage: string, probability: number | null, id = `${stage}-${Math.random()}`) {
    return { leadId: id, stageId: stage, stageName: stage, probability } satisfies PipelineLead;
  }

  it("weights each stage by its probability", () => {
    const result = weightedPipeline([
      lead("demo", 0.6),
      lead("demo", 0.6),
      lead("new", 0.1),
      lead("new", 0.1),
      lead("new", 0.1),
    ]);
    expect(result.openLeads).toBe(5);
    expect(result.expectedAdmissions).toBeCloseTo(1.5);
  });

  it("counts leads in unconfigured stages separately rather than at zero silently", () => {
    const result = weightedPipeline([lead("demo", 0.5), lead("limbo", null), lead("limbo", null)]);
    expect(result.expectedAdmissions).toBeCloseTo(0.5);
    expect(result.unweightedLeads).toBe(2);
    // They are still open leads — they have not disappeared, they are
    // just contributing nothing.
    expect(result.openLeads).toBe(3);
  });

  it("orders stages by what they are worth, not by how many they hold", () => {
    const result = weightedPipeline([
      ...Array.from({ length: 20 }, (_, i) => lead("new", 0.05, `n${i}`)),
      ...Array.from({ length: 4 }, (_, i) => lead("payment", 0.9, `p${i}`)),
    ]);
    expect(result.byStage[0].stageName).toBe("payment");
  });

  it("groups leads with no stage at all under one bucket", () => {
    const result = weightedPipeline([
      { leadId: "a", stageId: null, stageName: "No stage", probability: null },
      { leadId: "b", stageId: null, stageName: "No stage", probability: null },
    ]);
    expect(result.byStage).toHaveLength(1);
    expect(result.unweightedLeads).toBe(2);
  });

  it("is empty rather than broken with no open leads", () => {
    const result = weightedPipeline([]);
    expect(result.openLeads).toBe(0);
    expect(result.expectedAdmissions).toBe(0);
    expect(result.byStage).toEqual([]);
  });
});

describe("monthEndCeiling", () => {
  it("adds what is in hand to what has already happened", () => {
    const pipeline = weightedPipeline([
      { leadId: "a", stageId: "s", stageName: "Demo", probability: 0.5 },
      { leadId: "b", stageId: "s", stageName: "Demo", probability: 0.5 },
    ]);
    expect(monthEndCeiling(9, pipeline)).toBe(10);
  });
});
