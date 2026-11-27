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
  wakeTimeFor,
  validateAnswer,
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
    const issues = validateFlow([step(1, "wait", { hours: 1 }), step(2, "stop")]);
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
    // wait-less steps would spin inside a single request.
    expect(MAX_STEPS_PER_ADVANCE).toBeGreaterThan(10);
    expect(MAX_STEPS_PER_ADVANCE).toBeLessThan(50);
  });
});

describe("validateAnswer", () => {
  it("lower-cases and checks an email", () => {
    expect(validateAnswer("email", " A@B.com ")).toEqual({ ok: true, value: "a@b.com" });
    expect(validateAnswer("email", "nope").ok).toBe(false);
  });
  it("pulls a year out of a sentence", () => {
    expect(validateAnswer("exam_year", "I will write in 2027")).toEqual({ ok: true, value: "2027" });
    expect(validateAnswer("exam_year", "next year").ok).toBe(false);
  });
  it("refuses empty and over-long text", () => {
    expect(validateAnswer("city", "   ").ok).toBe(false);
    expect(validateAnswer("city", "x".repeat(121)).ok).toBe(false);
  });
});

describe("validateFlow with the new steps", () => {
  it("rejects a button step with four buttons", () => {
    const issues = validateFlow([step(1, "send_buttons", { text: "Hi", buttons: ["a", "b", "c", "d"] })]);
    expect(issues.some((i) => /button/i.test(i.message))).toBe(true);
  });
  it("rejects media without an https link", () => {
    const issues = validateFlow([step(1, "send_media", { kind: "image", url: "http://x.com/a.jpg" })]);
    expect(issues.some((i) => /https|link|address/i.test(i.message))).toBe(true);
  });
});

import { STARTER_FLOWS } from "../src/lib/whatsapp/starter-flows";

describe("starter flows", () => {
  for (const starter of STARTER_FLOWS) {
    it(`${starter.name} passes validation`, () => {
      const steps = starter.steps.map((s, i) => step(i + 1, s.kind, s.config));
      expect(validateFlow(steps, starter.triggerType)).toEqual([]);
    });
  }
});

import { stepEdges } from "../src/lib/whatsapp/flow-engine";

describe("stepEdges (the flow map)", () => {
  const steps = [
    step(1, "send_buttons", { text: "Hi", buttons: ["Yes", "No"] }),
    step(2, "wait_for_reply", { hours: 24, branches: [{ match: "Yes", goto: 4 }, { match: "No", goto: "stop" }], onTimeout: 3 }),
    step(3, "send_text", { text: "Still there?" }),
    step(4, "stop"),
  ];
  it("lists each branch with where it goes", () => {
    const edges = stepEdges(steps, steps[1]);
    expect(edges).toEqual([
      { label: '"Yes"', to: 4 },
      { label: '"No"', to: "end" },
      { label: "anything else", to: 3 },
      { label: "no reply", to: 3 },
    ]);
  });
  it("a plain step leads to the next, the last to the end, a stop to nothing", () => {
    expect(stepEdges(steps, steps[0])).toEqual([{ label: null, to: 2 }]);
    expect(stepEdges(steps, steps[2])).toEqual([{ label: null, to: 4 }]);
    expect(stepEdges(steps, steps[3])).toEqual([]);
  });
});

describe("wakeTimeFor", () => {
  // 2026-12-01 05:00 UTC is 10:30 in India.
  const now = new Date("2026-12-01T05:00:00Z");

  it("waits an amount of minutes, hours or days, and still honours the old hours-only shape", () => {
    expect(wakeTimeFor(step(1, "wait", { amount: 30, unit: "minutes" }), now).toISOString()).toBe("2026-12-01T05:30:00.000Z");
    expect(wakeTimeFor(step(1, "wait", { amount: 3, unit: "days" }), now).toISOString()).toBe("2026-12-04T05:00:00.000Z");
    expect(wakeTimeFor(step(1, "wait", { hours: 2 }), now).toISOString()).toBe("2026-12-01T07:00:00.000Z");
  });

  it("can push the wake-up on to a time of day in India time", () => {
    // After 1 day it is 10:30 IST on the 2nd; "at 10:00" means the next 10:00 IST, i.e. the 3rd.
    expect(wakeTimeFor(step(1, "wait", { amount: 1, unit: "days", atTime: "10:00" }), now).toISOString()).toBe("2026-12-03T04:30:00.000Z");
    // After 1 day, "at 18:00" is still the same day, 18:00 IST.
    expect(wakeTimeFor(step(1, "wait", { amount: 1, unit: "days", atTime: "18:00" }), now).toISOString()).toBe("2026-12-02T12:30:00.000Z");
  });

  it("waits until a fixed date and time in India time, and lets a past one straight through", () => {
    expect(wakeTimeFor(step(1, "wait_until", { at: "2026-12-10T09:00" }), now).toISOString()).toBe("2026-12-10T03:30:00.000Z");
    expect(wakeTimeFor(step(1, "wait_until", { at: "2026-11-01T09:00" }), now).toISOString()).toBe(now.toISOString());
    expect(wakeTimeFor(step(1, "wait_until", {}), now).toISOString()).toBe(now.toISOString());
  });
});
