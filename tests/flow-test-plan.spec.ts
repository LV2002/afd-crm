import { describe, expect, it } from "vitest";

import { planFlowTest, sampleParams } from "../src/lib/whatsapp/flow-test";
import type { FlowStep } from "../src/lib/whatsapp/flow-engine";

const step = (position: number, kind: FlowStep["kind"], config: Record<string, unknown> = {}): FlowStep => ({ id: `s${position}`, position, kind, config });

describe("planFlowTest", () => {
  it("sends messages and skips waits, conditions and lead changes", () => {
    const plan = planFlowTest([step(2, "wait"), step(1, "send_text"), step(3, "set_temperature"), step(4, "condition"), step(5, "ask_question")]);
    expect(plan.map((p) => [p.position, p.action])).toEqual([[1, "send"], [2, "skip"], [3, "skip"], [4, "skip"], [5, "send"]]);
  });
});

describe("sampleParams", () => {
  it("keeps fixed text and samples merge variables", () => {
    expect(sampleParams({ params: [{ kind: "variable", key: "first_name", fallback: "there" }, { kind: "text", value: "NIFT 2027" }] })).toEqual(["Anjali", "NIFT 2027"]);
  });
  it("never produces an empty value", () => {
    expect(sampleParams({ params: [{ kind: "variable", key: "unknown_thing", fallback: "" }] })).toEqual(["sample"]);
  });
});
