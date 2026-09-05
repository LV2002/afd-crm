/**
 * Where an automation sends somebody next.
 *
 * The consequences of getting this wrong are specific and expensive: a
 * person's phone buzzing eleven times in a row because a branch loops, or
 * a whole audience silently falling out of a sequence because a branch
 * points at a step somebody deleted. Both are decisions made here, so
 * both are tested here, without a database or Meta in the way.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_STEPS_PER_ADVANCE,
  describeHours,
  describeStep,
  firstStep,
  matchBranch,
  nextStep,
  normaliseReply,
  resolveGoto,
  stepAt,
  validateFlow,
  waitConfig,
  waitMs,
  type FlowStep,
} from "../src/lib/whatsapp/flow-engine";

function step(position: number, kind: FlowStep["kind"], config: Record<string, unknown> = {}): FlowStep {
  return { id: `s${position}`, position, kind, config };
}

const FLOW: FlowStep[] = [
  step(1, "send_template", { templateName: "nift_intro", templateLanguage: "en_US", params: [] }),
  step(2, "wait_for_reply", {
    hours: 48,
    branches: [
      { match: "Yes, interested", goto: 3 },
      { match: "Not now", goto: 5 },
    ],
    onTimeout: 4,
    onOther: "next",
  }),
  step(3, "notify_owner", { message: "Call them today" }),
  step(4, "send_template", { templateName: "nift_nudge", templateLanguage: "en_US" }),
  step(5, "stop"),
];

describe("walking the list", () => {
  it("finds steps by number and start", () => {
    expect(firstStep(FLOW)?.position).toBe(1);
    expect(stepAt(FLOW, 3)?.kind).toBe("notify_owner");
    expect(stepAt(FLOW, 99)).toBeNull();
  });

  it("carries on to the next number, gaps and all", () => {
    // Deleting a step leaves a gap on purpose — renumbering would send
    // every branch pointing at step 4 somewhere else.
    const gappy = [step(1, "wait"), step(4, "stop")];
    expect(nextStep(gappy, 1)?.position).toBe(4);
  });

  it("ends the run at the end of the list", () => {
    expect(nextStep(FLOW, 5)).toBeNull();
  });
});

describe("resolveGoto", () => {
  it("continues, stops, or jumps", () => {
    expect(resolveGoto(FLOW, 2, "next")?.position).toBe(3);
    expect(resolveGoto(FLOW, 2, "stop")).toBeNull();
    expect(resolveGoto(FLOW, 2, 5)?.position).toBe(5);
  });

  it("jumps backwards, because 'not now' looping back is a real sequence", () => {
    expect(resolveGoto(FLOW, 4, 1)?.position).toBe(1);
  });

  it("ends the run quietly when the target was deleted", () => {
    // A half-edited flow must not strand people mid-conversation with an
    // error nobody sees.
    expect(resolveGoto(FLOW, 2, 42)).toBeNull();
  });
});

describe("matchBranch", () => {
  const branches = [
    { match: "Yes, interested", goto: 3 as const },
    { match: "Not now", goto: 5 as const },
  ];

  it("matches the button text exactly", () => {
    expect(matchBranch("Yes, interested", branches)?.goto).toBe(3);
  });

  it("ignores case and stray spacing", () => {
    expect(matchBranch("  NOT NOW  ", branches)?.goto).toBe(5);
    expect(normaliseReply(" Yes,   interested ")).toBe("yes, interested");
  });

  it("matches somebody who typed around the words instead of pressing the button", () => {
    // On WhatsApp most people type. A branch that only understood button
    // taps would drop the majority of real replies.
    expect(matchBranch("not now, maybe next year", branches)?.goto).toBe(5);
  });

  it("prefers the exact match over a longer message that contains another answer", () => {
    const tricky = [
      { match: "yes", goto: 3 as const },
      { match: "yes but later", goto: 5 as const },
    ];
    expect(matchBranch("yes", tricky)?.goto).toBe(3);
  });

  it("matches nothing on an empty or unrecognised reply", () => {
    expect(matchBranch("", branches)).toBeNull();
    expect(matchBranch(null, branches)).toBeNull();
    expect(matchBranch("what are the fees", branches)).toBeNull();
  });
});

describe("waitConfig and waitMs", () => {
  it("reads the branches and the timings", () => {
    const config = waitConfig(FLOW[1]);
    expect(config.hours).toBe(48);
    expect(config.branches).toHaveLength(2);
    expect(config.onTimeout).toBe(4);
  });

  it("defaults to carrying on rather than silently ending a run", () => {
    const bare = step(1, "wait_for_reply", {});
    const config = waitConfig(bare);
    expect(config.onTimeout).toBe("next");
    expect(config.onOther).toBe("next");
    expect(config.branches).toEqual([]);
  });

  it("drops a branch with no words to match, rather than matching everything", () => {
    const sloppy = step(1, "wait_for_reply", { branches: [{ match: "   ", goto: 2 }, null] });
    expect(waitConfig(sloppy).branches).toEqual([]);
  });

  it("falls back to a day for a missing or nonsense wait", () => {
    expect(waitMs(step(1, "wait", {}))).toBe(86_400_000);
    expect(waitMs(step(1, "wait", { hours: -5 }))).toBe(86_400_000);
    expect(waitMs(step(1, "wait", { hours: 2 }))).toBe(7_200_000);
  });
});

describe("validateFlow", () => {
  it("passes a flow that makes sense", () => {
    expect(validateFlow(FLOW)).toEqual([]);
  });

  it("refuses an empty flow", () => {
    expect(validateFlow([])).toHaveLength(1);
  });

  it("notices a flow that never sends anything", () => {
    const issues = validateFlow([step(1, "add_tag", { tagId: "t" }), step(2, "stop")]);
    expect(issues.map((issue) => issue.message)).toContain("This flow never sends anything.");
  });

  it("catches a branch pointing at a step that does not exist", () => {
    // The whole reason this check gates switching a flow ON: an active
    // flow with a dangling branch silently ends everybody's run.
    const broken = [
      step(1, "send_template", { templateName: "x" }),
      step(2, "wait_for_reply", { branches: [{ match: "Yes", goto: 9 }] }),
    ];
    expect(validateFlow(broken).some((issue) => issue.message.includes("no step 9"))).toBe(true);
  });

  it("catches a wait-for-reply with nothing to look for", () => {
    const broken = [
      step(1, "send_template", { templateName: "x" }),
      step(2, "wait_for_reply", { branches: [] }),
    ];
    expect(validateFlow(broken).some((issue) => issue.message.includes("no answers"))).toBe(true);
  });

  it("catches a send step with no template chosen", () => {
    expect(validateFlow([step(1, "send_template", {})]).some((i) => i.position === 1)).toBe(true);
  });
});

describe("describing steps", () => {
  it("reads the way somebody would say it", () => {
    expect(describeStep(FLOW[0])).toBe('Send "nift_intro"');
    expect(describeStep(FLOW[1])).toBe("Wait 2 days for a reply — Yes, interested, Not now");
    expect(describeStep(step(1, "wait", { hours: 6 }))).toBe("Wait 6 hours");
    expect(describeHours(24)).toBe("1 day");
    expect(describeHours(168)).toBe("7 days");
    expect(describeHours(1)).toBe("1 hour");
  });
});

describe("the loop guard", () => {
  it("is small enough to be harmless and larger than any real sequence", () => {
    // Branches may jump backwards, so a flow CAN be written as a loop. The
    // runner stops after this many steps in one pass; without it a loop of
    // tag steps would spin inside a single request.
    expect(MAX_STEPS_PER_ADVANCE).toBeGreaterThan(10);
    expect(MAX_STEPS_PER_ADVANCE).toBeLessThan(50);
  });
});
