/**
 * Editing a confirmed admission.
 *
 * Two judgements, both with consequences. "What changed" decides whether
 * three departments get told anything at all — a Save on an untouched
 * form must be silent, or the notification becomes noise people learn to
 * ignore. "Is this fee legal" is the one that protects the ledger: a fee
 * set below what has already been collected would leave a student owing a
 * negative amount, which is not a balance, it is a refund nobody recorded.
 */
import { describe, expect, it } from "vitest";

import {
  checkFeeFloor,
  describeChanges,
  planChanges,
  type PlanLabels,
  type PlanSnapshot,
} from "../src/lib/enrolment/plan-change";

const LABELS: PlanLabels = {
  course: (value) => ({ foundation: "Foundation", dwo: "DWO", drh: "DRH" })[value] ?? value,
  mode: (value) => ({ offline: "Offline", online: "Online" })[value] ?? value,
  batch: (id) =>
    id === null ? "No batch" : ({ "batch-a": "Kochi A", "batch-b": "Kochi B" })[id] ?? id,
};

const BEFORE: PlanSnapshot = {
  course: "foundation",
  batchId: "batch-a",
  mode: "offline",
  academicYear: "2026-27",
};

describe("planChanges", () => {
  it("finds nothing when nothing moved", () => {
    expect(planChanges(BEFORE, { ...BEFORE }, LABELS)).toEqual([]);
  });

  it("names a course change in words, not codes", () => {
    const changes = planChanges(BEFORE, { ...BEFORE, course: "dwo" }, LABELS);

    expect(changes).toEqual([
      { field: "course", label: "Course", from: "Foundation", to: "DWO" },
    ]);
  });

  it("treats moving out of a batch as a change, not as nothing", () => {
    // null is a real value here: a student taken out of their class group
    // and not yet put in another one is exactly the state academics need
    // to hear about.
    const changes = planChanges(BEFORE, { ...BEFORE, batchId: null }, LABELS);

    expect(changes).toEqual([
      { field: "batch", label: "Batch", from: "Kochi A", to: "No batch" },
    ]);
  });

  it("reports every field that moved, in reading order", () => {
    const changes = planChanges(
      BEFORE,
      { course: "drh", batchId: "batch-b", mode: "online", academicYear: "2027-28" },
      LABELS,
    );

    expect(changes.map((c) => c.field)).toEqual(["course", "batch", "mode", "academicYear"]);
  });

  it("describes a multi-field change as one line", () => {
    const changes = planChanges(BEFORE, { ...BEFORE, course: "dwo", batchId: "batch-b" }, LABELS);

    expect(describeChanges(changes)).toBe(
      "Course: Foundation → DWO · Batch: Kochi A → Kochi B",
    );
  });

  it("falls back to the raw value when a label is unknown", () => {
    // A course option an admin deleted from the dropdown after somebody
    // was enrolled on it. Showing the code is ugly; showing "undefined"
    // is a bug report.
    const changes = planChanges(BEFORE, { ...BEFORE, course: "retired-course" }, LABELS);

    expect(changes[0].to).toBe("retired-course");
  });
});

describe("checkFeeFloor", () => {
  it("allows a fee above what has been paid", () => {
    expect(checkFeeFloor({ netFeePaise: 5_000_00, netPaidPaise: 2_000_00 })).toEqual({
      allowed: true,
      error: null,
    });
  });

  it("allows a fee exactly equal to what has been paid", () => {
    // Settling a fee at what the family actually handed over is a real
    // correction, and the balance it leaves is zero, not negative.
    expect(checkFeeFloor({ netFeePaise: 2_000_00, netPaidPaise: 2_000_00 })).toEqual({
      allowed: true,
      error: null,
    });
  });

  it("refuses a fee below what has been paid", () => {
    expect(checkFeeFloor({ netFeePaise: 1_000_00, netPaidPaise: 2_000_00 })).toEqual({
      allowed: false,
      error: "below-paid",
    });
  });

  it("allows any fee when nothing has been collected yet", () => {
    expect(checkFeeFloor({ netFeePaise: 0, netPaidPaise: 0 }).allowed).toBe(true);
  });

  it("counts a refund as money no longer held", () => {
    // netPaid is credits minus debits. ₹5,000 in and ₹3,000 refunded
    // leaves ₹2,000, so a fee of ₹2,000 is fine even though ₹5,000 was
    // once received.
    expect(checkFeeFloor({ netFeePaise: 2_000_00, netPaidPaise: 5_000_00 - 3_000_00 }).allowed).toBe(
      true,
    );
  });
});
