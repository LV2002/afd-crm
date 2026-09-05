/**
 * Batch rosters.
 *
 * `batches` has had a table since Phase 4 and no screen, so none of this
 * has ever run. The two rules worth pinning before it does: a student who
 * LEFT a batch must not count towards its capacity, and a batch at another
 * centre must never be offered for a student who does not attend there.
 */
import { describe, expect, it } from "vitest";

import {
  assignableBatches,
  batchCapacity,
  checkAssignment,
  describeBatch,
  liveMemberCount,
  type BatchSummary,
  type Membership,
} from "../src/lib/batches/roster";

const KOCHI = "centre-kochi";
const KANNUR = "centre-kannur";

function batch(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    id: "b1",
    name: "NIFT Foundation A",
    centerId: KOCHI,
    centerName: "Kochi",
    course: "Foundation",
    mode: "Offline",
    academicYear: "2026-27",
    startDate: "2026-06-01",
    endDate: null,
    capacity: 30,
    isActive: true,
    ...overrides,
  };
}

function membership(overrides: Partial<Membership> = {}): Membership {
  return { studentId: crypto.randomUUID(), batchId: "b1", leftAt: null, ...overrides };
}

describe("liveMemberCount", () => {
  it("counts only students still in the batch", () => {
    // The one that matters: a student who left in March must not hold a
    // seat in June's roster.
    const count = liveMemberCount(
      [
        membership(),
        membership(),
        membership({ leftAt: new Date("2026-03-01") }),
        membership({ batchId: "other" }),
      ],
      "b1",
    );
    expect(count).toBe(2);
  });

  it("is zero for a batch nobody has joined", () => {
    expect(liveMemberCount([], "b1")).toBe(0);
  });
});

describe("batchCapacity", () => {
  it("reports spaces left", () => {
    const result = batchCapacity(22, 30);
    expect(result.spacesLeft).toBe(8);
    expect(result.isFull).toBe(false);
    expect(result.isOverCapacity).toBe(false);
  });

  it("is full at exactly the capacity", () => {
    const result = batchCapacity(30, 30);
    expect(result.spacesLeft).toBe(0);
    expect(result.isFull).toBe(true);
    expect(result.isOverCapacity).toBe(false);
  });

  it("never shows negative spaces, but does say it is over", () => {
    // "-3 spaces left" reads as a bug; over-capacity is real and worth
    // saying in its own words.
    const result = batchCapacity(33, 30);
    expect(result.spacesLeft).toBe(0);
    expect(result.isOverCapacity).toBe(true);
    expect(result.filled).toBe(33);
  });

  it("has no answer for a batch with no capacity set", () => {
    const result = batchCapacity(12, null);
    expect(result.spacesLeft).toBeNull();
    expect(result.isFull).toBe(false);
  });
});

describe("checkAssignment", () => {
  const base = { studentCenterId: KOCHI, batch: batch(), filled: 10, alreadyInBatch: false };

  it("allows an ordinary assignment with nothing to say", () => {
    const result = checkAssignment(base);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.error).toBeNull();
  });

  it("refuses a batch at another centre", () => {
    // A data-entry mistake every time, not a preference.
    const result = checkAssignment({ ...base, batch: batch({ centerId: KANNUR }) });
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/different centre/i);
  });

  it("refuses a batch that is no longer running", () => {
    const result = checkAssignment({ ...base, batch: batch({ isActive: false }) });
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/no longer running/i);
  });

  it("refuses a student who is already in it", () => {
    const result = checkAssignment({ ...base, alreadyInBatch: true });
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/already in this batch/i);
  });

  it("WARNS about a full batch rather than refusing", () => {
    // Rooms get one more chair. Refusing outright gets worked around by
    // somebody editing the capacity, which loses the information entirely.
    const result = checkAssignment({ ...base, filled: 30 });
    expect(result.allowed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.warning).toMatch(/capacity of 30/);
  });

  it("says nothing about capacity when the batch has none set", () => {
    const result = checkAssignment({ ...base, batch: batch({ capacity: null }), filled: 200 });
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("allows a student with no centre into any batch", () => {
    // Failing open here is right: a student record with no centre is
    // incomplete data, and refusing every batch would leave them stuck
    // with no way to say why.
    const result = checkAssignment({ ...base, studentCenterId: null });
    expect(result.allowed).toBe(true);
  });
});

describe("assignableBatches", () => {
  const kochiA = batch({ id: "a", name: "Kochi A" });
  const kochiB = batch({ id: "b", name: "Kochi B" });
  const kannur = batch({ id: "c", name: "Kannur A", centerId: KANNUR });
  const closed = batch({ id: "d", name: "Last year", isActive: false });

  it("offers only this student's centre, and only live batches", () => {
    const result = assignableBatches(
      [kochiA, kochiB, kannur, closed],
      new Map(),
      KOCHI,
      new Set(),
    );
    expect(result.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("does not offer a batch the student is already in", () => {
    const result = assignableBatches([kochiA, kochiB], new Map(), KOCHI, new Set(["a"]));
    expect(result.map((b) => b.id)).toEqual(["b"]);
  });

  it("puts the emptiest batch first, which is usually the one wanted", () => {
    const filled = new Map([
      ["a", 28],
      ["b", 4],
    ]);
    const result = assignableBatches([kochiA, kochiB], filled, KOCHI, new Set());
    expect(result.map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("offers every centre's batches to a student with no centre", () => {
    const result = assignableBatches([kochiA, kannur], new Map(), null, new Set());
    expect(result).toHaveLength(2);
  });
});

describe("describeBatch", () => {
  it("reads as one line under the name", () => {
    expect(describeBatch(batch())).toBe("Foundation · Offline · 2026-27");
  });
});
