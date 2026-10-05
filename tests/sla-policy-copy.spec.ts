/**
 * What the SLA screens say, and the join they say it across.
 *
 * The thing worth testing here is not the string formatting — it is that
 * the **policy list describes a ladder by reading it through the sweep's
 * own parser**. A summary built any other way can claim a rung the sweep
 * will silently skip, which is exactly the failure the old form shipped:
 * its placeholder taught `flag_breach`, nothing has ever read that key,
 * and anybody who copied the example got a step that did nothing.
 *
 * Pure — no database, no clock.
 */
import { describe, expect, it } from "vitest";

import { evaluateConditions } from "../src/lib/assignment/evaluate-conditions";
import { parseConditions } from "../src/lib/rules/parse-rule";
import { parseEscalationStep } from "../src/lib/sla/escalations";
import {
  MEASURE_COPY,
  SLA_MEASURES,
  describeEscalationLadder,
  describeHours,
  escalationsToJson,
} from "../src/lib/sla/policy-copy";

describe("every measure the form offers has copy for it", () => {
  it("has a label and a clock sentence", () => {
    // The form shows `.clock` under the dropdown and the policy list
    // shows `.label`. A measure missing from the table renders
    // `undefined` on both screens.
    for (const measure of SLA_MEASURES) {
      expect(MEASURE_COPY[measure]?.label).toBeTruthy();
      expect(MEASURE_COPY[measure]?.clock).toBeTruthy();
    }
  });
});

describe("the ladder summary on the policy list", () => {
  it("says plainly when nothing is configured", () => {
    // The case that mattered: a policy with no ladder used to look
    // identical on the list to one that notifies a centre head.
    expect(describeEscalationLadder(null)).toMatch(/Nothing happens/);
    expect(describeEscalationLadder([])).toMatch(/Nothing happens/);
  });

  it("round-trips what the editor writes", () => {
    const stored = escalationsToJson([
      { atHours: 2, notifyOwner: true, unassign: false },
      { atHours: 8, notifyOwner: false, unassign: true },
    ]);
    const summary = describeEscalationLadder(stored);
    expect(summary.split(" · ")).toHaveLength(2);
    expect(summary).toMatch(/2 hours late: tell the counsellor/);
    expect(summary).toMatch(/take it off them/);
  });

  it("does not claim a rung does nothing when it still notifies", () => {
    // `notify_owner: false` with no roles is not an inert rung — the
    // sweep still raises the SLA alert to its configured roles.
    const summary = describeEscalationLadder([{ at_hours: 8 }]);
    expect(summary).toMatch(/8 hours late/);
    expect(summary).toMatch(/notify whoever/);
  });

  it("ignores a rung the sweep cannot read", () => {
    const summary = describeEscalationLadder([
      { at_hours: 2, notify_owner: true },
      { nonsense: true },
    ]);
    expect(summary.split(" · ")).toHaveLength(1);
  });

  it("keeps a rung at zero hours, which means as soon as it is late", () => {
    // `parseEscalationStep` rejects a negative `at_hours` and must not
    // reject zero — the "tell somebody immediately" rung.
    expect(parseEscalationStep({ at_hours: 0, notify_owner: true })?.atHours).toBe(0);
    expect(describeEscalationLadder([{ at_hours: 0 }])).toMatch(/as soon as it is late/);
  });
});

describe("an empty condition builder means everybody", () => {
  it("accepts what the builder posts when no condition was added", () => {
    // The builder always posts `{"all":[]}`, never an empty string, so
    // the server has to read that as a catch-all. If it did not, the
    // first policy anybody creates would match no leads at all.
    const parsed = parseConditions(JSON.stringify({ all: [] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(evaluateConditions(parsed.value, { district: "Kannur" } as never)).toBe(true);
  });

  it("refuses a field the evaluator does not know", () => {
    // Stored unchecked, this reaches `evaluateConditions` once per lead
    // inside the hourly sweep, where nobody sees it throw.
    const parsed = parseConditions(
      JSON.stringify({ all: [{ field: "favourite_colour", op: "equals", value: "blue" }] }),
    );
    expect(parsed.ok).toBe(false);
  });
});

describe("hours, as a person would say them", () => {
  it("says days and weeks where it should", () => {
    expect(describeHours(1)).toBe("1 hour");
    expect(describeHours(4)).toBe("4 hours");
    expect(describeHours(24)).toBe("1 day");
    expect(describeHours(48)).toBe("2 days");
    expect(describeHours(336)).toBe("2 weeks");
  });
});
