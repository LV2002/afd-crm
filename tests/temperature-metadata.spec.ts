/**
 * What an admin may change about a temperature's meaning, and what they
 * may not. Pure: every refusal here is a case where a plausible edit would
 * quietly break the rule that the status and the admission agree.
 */
import { describe, expect, it } from "vitest";

import { applyTemperatureMeaning, kindChangeError } from "@/lib/leads/temperature-metadata";

const base = { kind: "open", probability: "30", requiresReason: false, interested: true };

describe("applyTemperatureMeaning", () => {
  it("merges into existing metadata instead of replacing it", () => {
    // `metadata` holds other keys. Overwriting the column is how a setting
    // disappears months later with nobody able to say when.
    const result = applyTemperatureMeaning({ rank: 5, somethingElse: "keep me" }, base);
    expect(result).toEqual({
      ok: true,
      metadata: {
        rank: 5,
        somethingElse: "keep me",
        kind: "open",
        probability: 30,
        interested: true,
        requires_reason: false,
      },
    });
  });

  it("rejects a kind it does not know", () => {
    expect(applyTemperatureMeaning({}, { ...base, kind: "archived" })).toMatchObject({ ok: false });
    expect(applyTemperatureMeaning({}, { ...base, kind: null })).toMatchObject({ ok: false });
  });

  it("rejects a probability outside 0-100, and anything that is not a number", () => {
    expect(applyTemperatureMeaning({}, { ...base, probability: "101" })).toMatchObject({ ok: false });
    expect(applyTemperatureMeaning({}, { ...base, probability: "-1" })).toMatchObject({ ok: false });
    expect(applyTemperatureMeaning({}, { ...base, probability: "lots" })).toMatchObject({ ok: false });
  });

  it("clears the probability when it is left blank", () => {
    const result = applyTemperatureMeaning({ probability: 40 }, { ...base, probability: "" });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect("probability" in result.metadata).toBe(false);
  });

  it("only lets a closing outcome ask why", () => {
    // A tick left on something else would be a requirement nothing enforces.
    const open = applyTemperatureMeaning({}, { ...base, kind: "open", requiresReason: true });
    const lost = applyTemperatureMeaning({}, { ...base, kind: "lost", requiresReason: true });
    expect(open).toMatchObject({ ok: true, metadata: { requires_reason: false } });
    expect(lost).toMatchObject({ ok: true, metadata: { requires_reason: true } });
  });
});

describe("kindChangeError", () => {
  it("allows any change when nobody is on the temperature", () => {
    expect(kindChangeError("open", "won", 0)).toBeNull();
    expect(kindChangeError("won", "open", 0)).toBeNull();
  });

  it("allows changes that never touch Took admission, however many leads are on it", () => {
    expect(kindChangeError("open", "lost", 40)).toBeNull();
    expect(kindChangeError("lost", "parked", 40)).toBeNull();
    expect(kindChangeError("parked", "open", 12)).toBeNull();
  });

  it("refuses to make leads with no admission count as admissions", () => {
    expect(kindChangeError("open", "won", 5)).toMatch(/5 leads already have this temperature/);
    expect(kindChangeError("open", "won", 1)).toMatch(/1 lead already has this temperature/);
  });

  it("refuses to reclassify confirmed admissions as ordinary leads", () => {
    // They would re-enter the queue and be chased as if unsold.
    expect(kindChangeError("won", "open", 1)).toMatch(/1 lead has a confirmed admission/);
    expect(kindChangeError("won", "open", 3)).toMatch(/3 leads have confirmed admissions/);
  });

  it("is happy when the kind does not change at all", () => {
    expect(kindChangeError("won", "won", 100)).toBeNull();
  });
});
