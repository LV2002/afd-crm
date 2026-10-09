/**
 * What a temperature MEANS — the kind, not the label.
 *
 * Pure. The behaviour of a lead (is it still chased? forecast? allowed to
 * be reached by hand?) hangs off these functions, so the cases are the
 * ones where a plausible shortcut would be wrong: an option nobody has
 * given a kind to, a lead with no status, an admin who reordered the list.
 */
import { describe, expect, it } from "vitest";

import {
  firstContactTemperature,
  indexByValue,
  initialTemperature,
  isClosedKind,
  isNoLongerWorked,
  isTerminalKind,
  kindOf,
  sortTemperatures,
  terminalValuesOf,
  toTemperatureOption,
  valuesOfKinds,
  type TemperatureOption,
} from "@/lib/leads/temperature-kinds";

function option(over: Partial<TemperatureOption> & Pick<TemperatureOption, "value" | "kind">): TemperatureOption {
  return {
    label: over.value,
    color: null,
    rank: 0,
    probability: null,
    requiresReason: false,
    interested: false,
    isActive: true,
    ...over,
  };
}

const SHIPPED: TemperatureOption[] = [
  option({ value: "not_contacted", kind: "new", rank: 1 }),
  option({ value: "contacted", kind: "open", rank: 2 }),
  option({ value: "cold", kind: "open", rank: 3 }),
  option({ value: "warm", kind: "open", rank: 4 }),
  option({ value: "hot", kind: "open", rank: 5 }),
  option({ value: "took_admission", kind: "won", rank: 6 }),
  option({ value: "future_prospect", kind: "parked", rank: 7 }),
  option({ value: "negative", kind: "lost", rank: 8 }),
  option({ value: "wrong_target", kind: "lost", rank: 9 }),
  option({ value: "afd_india_student", kind: "lost", rank: 10 }),
  option({ value: "joined_competitor", kind: "lost", rank: 11 }),
];

describe("kindOf", () => {
  it("reads the kind off the option's metadata", () => {
    expect(kindOf({ kind: "lost" })).toBe("lost");
    expect(kindOf({ kind: "won" })).toBe("won");
  });

  it("treats an option with no kind as in-progress", () => {
    // An admin who added a temperature in the generic dropdown editor,
    // before kinds existed. The safe default is the behaviour a plain
    // temperature always had — worked, queued, forecast — because a
    // stronger default would either silently stop the chasing or trip the
    // admission rule on an innocent new option.
    expect(kindOf(null)).toBe("open");
    expect(kindOf({})).toBe("open");
    expect(kindOf({ rank: 3 })).toBe("open");
  });

  it("does not trust a kind it does not recognise", () => {
    expect(kindOf({ kind: "archived" })).toBe("open");
    expect(kindOf({ kind: 7 })).toBe("open");
  });
});

describe("toTemperatureOption", () => {
  it("unpacks the metadata into typed fields", () => {
    const parsed = toTemperatureOption({
      value: "negative",
      label: "Negative",
      color: "#6b7280",
      sort_order: 8,
      metadata: { kind: "lost", probability: 0, requires_reason: true, interested: false },
    });
    expect(parsed).toMatchObject({
      value: "negative",
      kind: "lost",
      probability: 0,
      requiresReason: true,
      interested: false,
      rank: 8,
      isActive: true,
    });
  });

  it("orders by sort_order, the order the admin sees, not the seed's stale rank", () => {
    // 'Move up' in Settings changes sort_order. Reading metadata.rank
    // instead would change the settings list and nothing else.
    const parsed = toTemperatureOption({
      value: "hot",
      label: "Hot",
      sort_order: 2,
      metadata: { rank: 5, kind: "open" },
    });
    expect(parsed.rank).toBe(2);
  });

  it("clamps a nonsense probability instead of dropping the option", () => {
    expect(toTemperatureOption({ value: "a", label: "A", metadata: { probability: 120 } }).probability).toBe(100);
    expect(toTemperatureOption({ value: "a", label: "A", metadata: { probability: -5 } }).probability).toBe(0);
  });

  it("reads a probability stored as text, and a missing one as unset", () => {
    expect(toTemperatureOption({ value: "a", label: "A", metadata: { probability: "60" } }).probability).toBe(60);
    expect(toTemperatureOption({ value: "a", label: "A", metadata: {} }).probability).toBeNull();
    expect(toTemperatureOption({ value: "a", label: "A", metadata: { probability: "" } }).probability).toBeNull();
  });
});

describe("which statuses are finished", () => {
  it("counts Took admission and every closing outcome, nothing else", () => {
    const terminal = terminalValuesOf(SHIPPED);
    expect([...terminal].sort()).toEqual(
      ["afd_india_student", "joined_competitor", "negative", "took_admission", "wrong_target"].sort(),
    );
  });

  it("leaves a future prospect in the queue — it has a follow-up date", () => {
    expect(isTerminalKind("parked")).toBe(false);
    expect(terminalValuesOf(SHIPPED).has("future_prospect")).toBe(false);
  });

  it("excludes a future prospect from the forecast, along with the finished ones", () => {
    expect(isClosedKind("parked")).toBe(true);
    expect(isClosedKind("won")).toBe(true);
    expect(isClosedKind("lost")).toBe(true);
    expect(isClosedKind("open")).toBe(false);
    expect(isClosedKind("new")).toBe(false);
  });

  it("follows the kind, not the name: renaming changes nothing", () => {
    const renamed = SHIPPED.map((o) => (o.value === "joined_competitor" ? { ...o, label: "Went elsewhere" } : o));
    expect(terminalValuesOf(renamed).has("joined_competitor")).toBe(true);
  });

  it("treats a lead with no status as still being worked", () => {
    // An unclassified lead is exactly the one that needs somebody to look.
    const terminal = terminalValuesOf(SHIPPED);
    expect(isNoLongerWorked(null, terminal)).toBe(false);
    expect(isNoLongerWorked(undefined, terminal)).toBe(false);
    expect(isNoLongerWorked("hot", terminal)).toBe(false);
    expect(isNoLongerWorked("negative", terminal)).toBe(true);
    expect(isNoLongerWorked("took_admission", terminal)).toBe(true);
  });

  it("keeps a value that is not in the list as being worked", () => {
    expect(isNoLongerWorked("some_old_value", terminalValuesOf(SHIPPED))).toBe(false);
  });
});

describe("where a lead starts, and where it goes after the first call", () => {
  it("starts on the lowest-ranked 'new' option", () => {
    expect(initialTemperature(SHIPPED)?.value).toBe("not_contacted");
  });

  it("moves on the first contact to the lowest-ranked in-progress option", () => {
    expect(firstContactTemperature(SHIPPED)?.value).toBe("contacted");
  });

  it("follows a reorder", () => {
    const reordered = SHIPPED.map((o) =>
      o.value === "cold" ? { ...o, rank: 0 } : o,
    );
    expect(firstContactTemperature(reordered)?.value).toBe("cold");
  });

  it("ignores a switched-off option", () => {
    const off = SHIPPED.map((o) => (o.value === "contacted" ? { ...o, isActive: false } : o));
    expect(firstContactTemperature(off)?.value).toBe("cold");
  });

  it("is null, not a guess, when no option of that kind exists", () => {
    const none = SHIPPED.filter((o) => o.kind !== "new");
    expect(initialTemperature(none)).toBeNull();
  });
});

describe("helpers", () => {
  it("sorts by rank then label", () => {
    const sorted = sortTemperatures([
      option({ value: "b", kind: "open", rank: 2, label: "B" }),
      option({ value: "a2", kind: "open", rank: 1, label: "Z" }),
      option({ value: "a1", kind: "open", rank: 1, label: "A" }),
    ]);
    expect(sorted.map((o) => o.value)).toEqual(["a1", "a2", "b"]);
  });

  it("indexes by value and selects values by kind", () => {
    expect(indexByValue(SHIPPED).get("hot")?.kind).toBe("open");
    expect(valuesOfKinds(SHIPPED, ["new", "open"])).toEqual(["not_contacted", "contacted", "cold", "warm", "hot"]);
  });
});
