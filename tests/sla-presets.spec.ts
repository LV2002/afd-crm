/**
 * The starting points the SLA form offers must survive the round trip.
 *
 * A preset is a filled-in form, so it is one `Create` press away from
 * being a stored policy the hourly sweep acts on. That makes it the one
 * piece of this screen that can be wrong *silently*: a rung whose keys
 * the sweep's reader does not recognise is skipped, and an administrator
 * is left believing they configured an escalation that will never fire.
 * That is exactly what the old form's placeholder did, by teaching a key
 * (`flag_breach`) nothing has ever read.
 *
 * So these tests assert the join, not the halves: every preset, written
 * the way the form writes it, is read back by the sweep's own parser as
 * the thing the button promised.
 *
 * Pure — no database, no clock.
 */
import { describe, expect, it } from "vitest";

import { evaluateConditions } from "../src/lib/assignment/evaluate-conditions";
import { parseConditions } from "../src/lib/rules/parse-rule";
import { parseEscalationStep, policyEscalationSteps } from "../src/lib/sla/escalations";
import {
  MEASURE_COPY,
  SLA_PRESETS,
  describeEscalationLadder,
  describeHours,
  escalationsToJson,
} from "../src/lib/sla/presets";

describe("every preset is a policy the sweep can read", () => {
  it.each(SLA_PRESETS.map((preset) => [preset.name, preset] as const))(
    "%s",
    (_name, preset) => {
      const stored = escalationsToJson(preset.escalations);
      const read = policyEscalationSteps(stored);

      // Not just "parses" — the same number of rungs, at the same hours,
      // meaning the same thing. A tolerant reader dropping one rung is
      // the failure this exists to catch.
      expect(read).toHaveLength(preset.escalations.length);
      read.forEach((step, index) => {
        expect(step.atHours).toBe(preset.escalations[index].atHours);
        expect(step.notifyOwner).toBe(preset.escalations[index].notifyOwner);
        expect(step.unassign).toBe(preset.escalations[index].unassign);
      });
    },
  );

  it("offers copy for each measure it can set", () => {
    // The form shows `MEASURE_COPY[measure].clock` under the dropdown and
    // the policy list shows `.label`. A preset naming a measure that
    // table lacks renders `undefined` on both.
    for (const preset of SLA_PRESETS) {
      expect(MEASURE_COPY[preset.measure]).toBeTruthy();
    }
  });

  it("gives every preset a distinct priority, so one of them wins", () => {
    // A lead gets exactly one policy — the highest-priority match. Two
    // presets created at the same priority would make which one applies
    // depend on insertion order, which is not a thing anybody can see.
    const priorities = SLA_PRESETS.map((preset) => preset.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("keeps the targets ordered the way the presets are described", () => {
    // "Same day" has to be tighter than "a fortnight", or the names lie.
    const byKey = Object.fromEntries(SLA_PRESETS.map((p) => [p.key, p]));
    expect(byKey.first_response.targetHours).toBeLessThan(byKey.followup_kept.targetHours);
    expect(byKey.followup_kept.targetHours).toBeLessThan(byKey.stuck_in_stage.targetHours);
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
    const parsed = parseConditions(JSON.stringify({ all: [{ field: "favourite_colour", op: "equals", value: "blue" }] }));
    expect(parsed.ok).toBe(false);
  });
});

describe("the ladder's hour wording", () => {
  it("says days and weeks where a person would", () => {
    expect(describeHours(4)).toBe("4 hours");
    expect(describeHours(1)).toBe("1 hour");
    expect(describeHours(24)).toBe("1 day");
    expect(describeHours(48)).toBe("2 days");
    expect(describeHours(336)).toBe("2 weeks");
  });

  it("keeps a rung at zero hours, which means as soon as it is late", () => {
    // `parseEscalationStep` rejects a negative `at_hours` and must not
    // reject zero — the "tell somebody immediately" rung the in-stage
    // preset relies on.
    expect(parseEscalationStep({ at_hours: 0, notify_owner: true })?.atHours).toBe(0);
  });
});

describe("the ladder summary on the policy list", () => {
  it("says plainly when nothing is configured", () => {
    // The case that mattered: a policy with no ladder used to look
    // identical on the list to one that notifies a centre head.
    expect(describeEscalationLadder(null)).toMatch(/Nothing happens/);
    expect(describeEscalationLadder([])).toMatch(/Nothing happens/);
  });

  it("describes each preset's ladder without inventing a rung", () => {
    for (const preset of SLA_PRESETS) {
      const summary = describeEscalationLadder(escalationsToJson(preset.escalations));
      expect(summary).not.toMatch(/Nothing happens/);
      // One clause per readable rung, so a rung the sweep would skip
      // cannot pad the sentence.
      expect(summary.split(" · ")).toHaveLength(preset.escalations.length);
    }
  });

  it("does not claim a rung does nothing when it still notifies", () => {
    // `notify_owner: false` with no roles is not an inert rung — the
    // sweep still raises the SLA alert to its configured roles.
    const summary = describeEscalationLadder([{ at_hours: 8 }]);
    expect(summary).toMatch(/8 hours late/);
    expect(summary).toMatch(/notify whoever/);
  });

  it("ignores a rung the sweep cannot read", () => {
    const summary = describeEscalationLadder([{ at_hours: 2, notify_owner: true }, { nonsense: true }]);
    expect(summary.split(" · ")).toHaveLength(1);
  });
});
