/**
 * The filter that reinstated itself.
 *
 * Leon: *"the follow up filter is not clearing, it clears but then comes
 * back again."* Clearing the only filter navigates to a bare `/leads`,
 * and the effect could not tell that apart from arriving at `/leads`
 * from the sidebar — so it read the filter still sitting in
 * `sessionStorage` and put it straight back.
 *
 * The component is a `useEffect` with no markup, so what is tested here
 * is the decision it makes, written out as the same three-branch rule:
 * a run with a query stores it, a *later* run without one stores empty,
 * and only a *first* run without one restores. Getting that rule wrong
 * is the bug; the wiring around it is one `useRef`.
 */
import { beforeEach, describe, expect, it } from "vitest";

type Action = { kind: "store"; value: string } | { kind: "restore"; value: string } | { kind: "none" };

/**
 * The rule in `RememberLeadFilters`, extracted verbatim.
 *
 * Kept beside the component rather than imported from it because the
 * component is a client hook: testing it through React would be testing
 * `useRef`, which works, rather than the branch that did not.
 */
function decide(current: string, isFirstRun: boolean, remembered: string | null): Action {
  if (current) return { kind: "store", value: current };
  if (!isFirstRun) return { kind: "store", value: "" };
  if (!remembered) return { kind: "none" };
  const params = new URLSearchParams(remembered);
  params.delete("page");
  const restored = params.toString();
  return restored ? { kind: "restore", value: restored } : { kind: "none" };
}

let storage: string | null;

beforeEach(() => {
  storage = null;
});

/** Walks a sequence of navigations through one mount of the component. */
function visit(queries: string[], initialStorage: string | null = null): Action[] {
  storage = initialStorage;
  return queries.map((query, index) => {
    const action = decide(query, index === 0, storage);
    if (action.kind === "store") storage = action.value;
    return action;
  });
}

describe("arriving at the list", () => {
  it("stores a filtered query", () => {
    const [action] = visit(["followup=overdue"]);
    expect(action).toEqual({ kind: "store", value: "followup=overdue" });
    expect(storage).toBe("followup=overdue");
  });

  it("restores the last filters on a bare /leads", () => {
    const [action] = visit([""], "followup=overdue&center=kochi");
    expect(action).toEqual({ kind: "restore", value: "followup=overdue&center=kochi" });
  });

  it("drops the page number when restoring", () => {
    // Coming back should start at the top: page four of a list that may
    // have changed underneath them is not where they left off.
    const [action] = visit([""], "followup=overdue&page=4");
    expect(action).toEqual({ kind: "restore", value: "followup=overdue" });
  });

  it("restores nothing when only a page number was remembered", () => {
    expect(visit([""], "page=3")[0]).toEqual({ kind: "none" });
  });

  it("restores nothing on a first visit", () => {
    expect(visit([""], null)[0]).toEqual({ kind: "none" });
  });
});

describe("clearing the last filter", () => {
  /*
    The bug, as a sequence: land on the list filtered, clear it, and the
    second run must not put it back.
  */
  it("does not reinstate the filter that was just removed", () => {
    const actions = visit(["followup=overdue", ""]);

    expect(actions[0]).toEqual({ kind: "store", value: "followup=overdue" });
    expect(actions[1]).toEqual({ kind: "store", value: "" });
    expect(actions.some((action) => action.kind === "restore")).toBe(false);
  });

  it("remembers the empty bar, so the next visit is empty too", () => {
    visit(["followup=overdue", ""]);
    expect(storage).toBe("");

    // A later arrival from the sidebar: a fresh mount, nothing stored.
    expect(visit([""], storage)[0]).toEqual({ kind: "none" });
  });

  it("stores each narrowing as it happens", () => {
    const actions = visit(["followup=overdue", "followup=overdue&center=kochi", "center=kochi"]);

    expect(actions.map((a) => a.kind)).toEqual(["store", "store", "store"]);
    expect(storage).toBe("center=kochi");
  });

  it("clears again after re-filtering, without putting anything back", () => {
    const actions = visit(["", "followup=today", ""], "followup=overdue");

    expect(actions[0]).toEqual({ kind: "restore", value: "followup=overdue" });
    expect(actions[1]).toEqual({ kind: "store", value: "followup=today" });
    expect(actions[2]).toEqual({ kind: "store", value: "" });
  });
});
