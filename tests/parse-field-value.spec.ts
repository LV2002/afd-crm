import { describe, expect, it } from "vitest";

import { NOT_PROVIDED, parseFieldValue } from "@/lib/fields/parse-field-value";

type Field = Parameters<typeof parseFieldValue>[0];

function field(over: Partial<Field> & { type: string }): Field {
  return {
    key: over.key ?? "test_field",
    label: over.label ?? "Test field",
    type: over.type,
    isRequired: over.isRequired ?? false,
  } as Field;
}

const OPTIONS = [
  { value: "nift_ug", label: "NIFT UG" },
  { value: "uceed", label: "UCEED" },
];

describe("numbers", () => {
  it("accepts a real number", () => {
    expect(parseFieldValue(field({ type: "number" }), "2027")).toEqual({ ok: true, value: 2027 });
  });

  it("refuses text instead of silently storing NaN", () => {
    // The bug this whole module exists for: Number("next year") is NaN,
    // and NaN was going into the column.
    const result = parseFieldValue(field({ type: "number", label: "Exam year" }), "next year");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe('Exam year: "next year" is not a number.');
  });

  it("refuses infinity and half-numbers", () => {
    expect(parseFieldValue(field({ type: "number" }), "Infinity").ok).toBe(false);
    expect(parseFieldValue(field({ type: "number" }), "12abc").ok).toBe(false);
  });

  it("treats currency the same way", () => {
    expect(parseFieldValue(field({ type: "currency" }), "45000")).toEqual({ ok: true, value: 45000 });
    expect(parseFieldValue(field({ type: "currency" }), "forty").ok).toBe(false);
  });
});

describe("blank and missing", () => {
  it("distinguishes a field the form never carried from one left blank", () => {
    // NOT_PROVIDED must never be written: a NOT NULL column would reject
    // an explicit null, and blanking a field on purpose is a real edit.
    expect(parseFieldValue(field({ type: "text" }), null)).toEqual({ ok: true, value: NOT_PROVIDED });
    expect(parseFieldValue(field({ type: "text" }), "")).toEqual({ ok: true, value: null });
    expect(parseFieldValue(field({ type: "text" }), "   ")).toEqual({ ok: true, value: null });
  });

  it("refuses a blank required field", () => {
    const result = parseFieldValue(field({ type: "text", label: "Student name", isRequired: true }), "");
    expect(result.ok === false && result.message).toBe("Student name: this is required.");
  });
});

describe("formats", () => {
  it("checks emails and web addresses", () => {
    expect(parseFieldValue(field({ type: "email" }), "a@b.com")).toEqual({ ok: true, value: "a@b.com" });
    expect(parseFieldValue(field({ type: "email" }), "not-an-email").ok).toBe(false);
    expect(parseFieldValue(field({ type: "url" }), "https://afdindia.com").ok).toBe(true);
    expect(parseFieldValue(field({ type: "url" }), "afdindia").ok).toBe(false);
  });

  it("normalises a phone to E.164 and refuses nonsense", () => {
    expect(parseFieldValue(field({ type: "phone" }), "9847012345")).toEqual({
      ok: true,
      value: "+919847012345",
    });
    expect(parseFieldValue(field({ type: "phone" }), "12").ok).toBe(false);
  });

  it("stores a date as a day and a datetime as an instant", () => {
    expect(parseFieldValue(field({ type: "date" }), "2026-09-15")).toEqual({
      ok: true,
      value: "2026-09-15",
    });
    expect(parseFieldValue(field({ type: "datetime" }), "2026-09-15T10:30:00Z").ok).toBe(true);
    expect(parseFieldValue(field({ type: "date" }), "sometime in March").ok).toBe(false);
  });
});

describe("booleans", () => {
  it("reads an unticked checkbox as false rather than missing", () => {
    // A checkbox posts nothing when unticked. Treating that as "not
    // provided" would make unticking one impossible to save.
    expect(parseFieldValue(field({ type: "boolean" }), null)).toEqual({ ok: true, value: false });
    expect(parseFieldValue(field({ type: "boolean" }), "on")).toEqual({ ok: true, value: true });
  });
});

describe("choices", () => {
  it("accepts an offered option and refuses one that was not", () => {
    expect(parseFieldValue(field({ type: "select" }), "uceed", OPTIONS).ok).toBe(true);
    // A tampered form, or a stale option an admin has since removed.
    expect(parseFieldValue(field({ type: "select" }), "ceed", OPTIONS).ok).toBe(false);
  });

  it("checks every entry of a multiselect", () => {
    expect(parseFieldValue(field({ type: "multiselect" }), ["nift_ug", "uceed"], OPTIONS)).toEqual({
      ok: true,
      value: ["nift_ug", "uceed"],
    });
    expect(parseFieldValue(field({ type: "multiselect" }), ["nift_ug", "hacked"], OPTIONS).ok).toBe(false);
  });

  it("allows an empty multiselect unless it is required", () => {
    expect(parseFieldValue(field({ type: "multiselect" }), [], OPTIONS)).toEqual({ ok: true, value: [] });
    expect(parseFieldValue(field({ type: "multiselect", isRequired: true }), [], OPTIONS).ok).toBe(false);
  });

  it("checks a reference id against what the picker offered", () => {
    const referrer = [{ value: "lead-1", label: "Anjali" }];
    expect(parseFieldValue(field({ type: "lead_ref" }), "lead-1", referrer).ok).toBe(true);
    expect(parseFieldValue(field({ type: "lead_ref" }), "lead-999", referrer).ok).toBe(false);
    // With no list to check against, the id passes — the foreign key is
    // the backstop there.
    expect(parseFieldValue(field({ type: "lead_ref" }), "lead-999").ok).toBe(true);
  });
});

describe("bounds", () => {
  it("refuses an absurdly long answer", () => {
    expect(parseFieldValue(field({ type: "long_text" }), "x".repeat(5001)).ok).toBe(false);
    expect(parseFieldValue(field({ type: "long_text" }), "x".repeat(4999)).ok).toBe(true);
  });

  it("refuses several answers where one was expected", () => {
    expect(parseFieldValue(field({ type: "text" }), ["a", "b"]).ok).toBe(false);
  });
});
