import { describe, expect, it } from "vitest";

import { evaluateConditions, type RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { CONDITION_FIELD_KEYS, opsFor } from "@/lib/rules/condition-fields";
import { describeAction, describeConditions } from "@/lib/rules/describe-rule";
import { parseAction, parseConditions } from "@/lib/rules/parse-rule";

const LABELS = (kind: "center" | "user" | "option", value: string) => {
  const names: Record<string, string> = {
    "center-kannur": "Kannur",
    "user-athira": "Athira",
    "user-rahul": "Rahul",
    "user-meera": "Meera",
  };
  return names[value] ?? `${kind}:${value}`.replace(/^option:/, "");
};

describe("describeConditions", () => {
  it("says an empty rule is a catch-all", () => {
    expect(describeConditions({ all: [] })).toBe("Every lead");
    expect(describeConditions({})).toBe("Every lead");
  });

  it("reads back Leon's example rule", () => {
    const sentence = describeConditions(
      {
        all: [
          { field: "center_id", op: "equals", value: "center-kannur" },
          { field: "source", op: "equals", value: "Meta" },
          { field: "interested_exams", op: "contains", value: "NIFT UG" },
        ],
      },
      LABELS,
    );
    expect(sentence).toBe(
      "Centre is Kannur, and Lead source is Meta, and Interested exams includes NIFT UG",
    );
  });

  it("drops the value for the emptiness operators", () => {
    expect(describeConditions({ all: [{ field: "district", op: "is_empty" }] })).toBe(
      "District is blank",
    );
  });

  it("joins a list and reads between as a range", () => {
    expect(
      describeConditions({ all: [{ field: "state", op: "in", value: ["Kerala", "Tamil Nadu", "Goa"] }] }),
    ).toBe("State is any of Kerala, Tamil Nadu and Goa");
    expect(
      describeConditions({ all: [{ field: "exam_year", op: "between", value: [2026, 2028] }] }),
    ).toBe("Exam year is between 2026 and 2028");
  });
});

describe("describeAction", () => {
  it("names the person for a fixed assignment", () => {
    expect(describeAction({ strategy: "fixed", assignTo: "user-athira" }, LABELS)).toBe(
      "Assign to Athira",
    );
  });

  it("mentions a centre move when the action carries one", () => {
    expect(
      describeAction({ strategy: "fixed", assignTo: "user-athira", centerId: "center-kannur" }, LABELS),
    ).toBe("Assign to Athira, and move them to Kannur");
  });

  it("lists a round robin", () => {
    expect(
      describeAction({ strategy: "round_robin", userIds: ["user-athira", "user-rahul", "user-meera"] }, LABELS),
    ).toBe("Share out in turn between Athira, Rahul and Meera");
  });

  it("is honest about an action that would do nothing", () => {
    expect(describeAction({ strategy: "round_robin", userIds: [] }, LABELS)).toContain("assigns nothing");
    expect(describeAction({ strategy: "hand_wave" }, LABELS)).toContain("Does nothing");
  });
});

describe("parseConditions", () => {
  it("accepts a well-formed rule and hands back typed conditions", () => {
    const result = parseConditions('{"all":[{"field":"source","op":"equals","value":"Meta"}]}');
    expect(result).toEqual({ ok: true, value: { all: [{ field: "source", op: "equals", value: "Meta" }] } });
  });

  it("treats blank input as a catch-all rather than an error", () => {
    expect(parseConditions("")).toEqual({ ok: true, value: { all: [] } });
  });

  it("refuses a field that is not on the whitelist", () => {
    // The failure this prevents is not cosmetic: evaluateConditions throws
    // on an unknown field, at ingestion, for every lead.
    const result = parseConditions('{"all":[{"field":"primary_phone","op":"equals","value":"x"}]}');
    expect(result.ok).toBe(false);
    expect(() =>
      evaluateConditions(
        { all: [{ field: "primary_phone" as never, op: "equals", value: "x" }] } as RuleConditions,
        {} as never,
      ),
    ).toThrow();
  });

  it("refuses an unknown operator and malformed JSON", () => {
    expect(parseConditions('{"all":[{"field":"source","op":"sounds_like","value":"Meta"}]}').ok).toBe(false);
    expect(parseConditions("{not json").ok).toBe(false);
    expect(parseConditions('{"all":"everything"}').ok).toBe(false);
  });

  it("requires a value where the operator needs one, and none where it doesn't", () => {
    expect(parseConditions('{"all":[{"field":"city","op":"equals","value":""}]}').ok).toBe(false);
    expect(parseConditions('{"all":[{"field":"city","op":"in","value":[]}]}').ok).toBe(false);
    expect(parseConditions('{"all":[{"field":"city","op":"is_empty"}]}').ok).toBe(true);
    expect(parseConditions('{"all":[{"field":"exam_year","op":"between","value":[2026]}]}').ok).toBe(false);
  });
});

describe("parseAction", () => {
  it("accepts a fixed assignment", () => {
    expect(parseAction("fixed", "user-athira", null, "")).toEqual({
      ok: true,
      value: { strategy: "fixed", assignTo: "user-athira", centerId: undefined },
    });
  });

  it("carries a centre override through", () => {
    const result = parseAction("fixed", "user-athira", null, "center-kannur");
    expect(result.ok && result.value.centerId).toBe("center-kannur");
  });

  it("de-duplicates a round robin and demands at least two people", () => {
    const result = parseAction("round_robin", null, ["a", "b", "a"], null);
    expect(result.ok && result.value.userIds).toEqual(["a", "b"]);
    expect(parseAction("round_robin", null, ["a", "a"], null).ok).toBe(false);
    expect(parseAction("round_robin", null, [], null).ok).toBe(false);
  });

  it("refuses an action that names nobody", () => {
    // A matching rule that assigns nobody swallows the lead: it never
    // reaches the lower-priority rule that would have caught it.
    expect(parseAction("fixed", "", null, null).ok).toBe(false);
    expect(parseAction("magic", null, null, null).ok).toBe(false);
  });
});

describe("opsFor", () => {
  it("offers only contains on an array column", () => {
    // `equals` compares with === against a text[] and can never be true.
    expect(opsFor("interested_exams")).toEqual(["contains", "is_empty", "is_not_empty"]);
    expect(opsFor("courses_interested")).not.toContain("equals");
  });

  it("offers range operators only where a number makes sense", () => {
    expect(opsFor("exam_year")).toContain("between");
    expect(opsFor("source")).not.toContain("between");
  });

  it("covers every field the evaluator whitelists", () => {
    for (const field of CONDITION_FIELD_KEYS) {
      expect(opsFor(field).length).toBeGreaterThan(0);
    }
  });
});
