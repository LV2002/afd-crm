import { describe, expect, it } from "vitest";

import { coerceImportValue } from "../src/lib/leads/coerce-import-value";

const TEXT_FIELD = { key: "student_name", type: "text" as const, label: "Student Name" };
const PHONE_FIELD = { key: "primary_phone", type: "phone" as const, label: "Primary Phone" };
const NUMBER_FIELD = { key: "previous_attempts", type: "number" as const, label: "Previous Attempts" };
const BOOLEAN_FIELD = { key: "brochure_sent", type: "boolean" as const, label: "Brochure Sent" };
const DATE_FIELD = { key: "dob", type: "date" as const, label: "Date of Birth" };
const SELECT_FIELD = { key: "temperature", type: "select" as const, label: "Temperature" };
const MULTISELECT_FIELD = { key: "interested_exams", type: "multiselect" as const, label: "Interested Exams" };

const TEMPERATURE_OPTIONS = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];
const EXAM_OPTIONS = [
  { value: "nid", label: "NID" },
  { value: "nift", label: "NIFT" },
  { value: "uceed", label: "UCEED" },
];

describe("coerceImportValue", () => {
  it("returns undefined for an empty cell, on any field type", () => {
    expect(coerceImportValue(TEXT_FIELD, "", []).value).toBeUndefined();
    expect(coerceImportValue(TEXT_FIELD, "   ", []).value).toBeUndefined();
    expect(coerceImportValue(TEXT_FIELD, undefined, []).value).toBeUndefined();
    expect(coerceImportValue(TEXT_FIELD, null, []).value).toBeUndefined();
  });

  it("passes plain text through trimmed", () => {
    expect(coerceImportValue(TEXT_FIELD, "  Rahul Kumar  ", []).value).toBe("Rahul Kumar");
  });

  it("normalises a phone number to E.164", () => {
    expect(coerceImportValue(PHONE_FIELD, "9847123456", []).value).toBe("+919847123456");
  });

  it("flags an unparseable phone number with a warning, not a thrown error", () => {
    const result = coerceImportValue(PHONE_FIELD, "not-a-phone", []);
    expect(result.value).toBeUndefined();
    expect(result.warning).toContain("not-a-phone");
  });

  it("parses a number", () => {
    expect(coerceImportValue(NUMBER_FIELD, "3", []).value).toBe(3);
  });

  it("warns on an unparseable number", () => {
    const result = coerceImportValue(NUMBER_FIELD, "three", []);
    expect(result.value).toBeUndefined();
    expect(result.warning).toContain("three");
  });

  it.each([
    ["yes", true],
    ["Yes", true],
    ["TRUE", true],
    ["1", true],
    ["no", false],
    ["false", false],
    ["0", false],
  ])("parses boolean %s -> %s", (raw, expected) => {
    expect(coerceImportValue(BOOLEAN_FIELD, raw, []).value).toBe(expected);
  });

  it("warns on an unrecognised boolean", () => {
    const result = coerceImportValue(BOOLEAN_FIELD, "maybe", []);
    expect(result.value).toBeUndefined();
    expect(result.warning).toBeDefined();
  });

  it("parses a date to YYYY-MM-DD", () => {
    expect(coerceImportValue(DATE_FIELD, "2005-06-15", []).value).toBe("2005-06-15");
  });

  it("warns on an unparseable date", () => {
    const result = coerceImportValue(DATE_FIELD, "not a date", []);
    expect(result.value).toBeUndefined();
    expect(result.warning).toBeDefined();
  });

  it("matches a select option by label, case-insensitively", () => {
    expect(coerceImportValue(SELECT_FIELD, "hot", TEMPERATURE_OPTIONS).value).toBe("hot");
    expect(coerceImportValue(SELECT_FIELD, "HOT", TEMPERATURE_OPTIONS).value).toBe("hot");
  });

  it("matches a select option by its raw value too", () => {
    expect(coerceImportValue(SELECT_FIELD, "warm", TEMPERATURE_OPTIONS).value).toBe("warm");
  });

  it("warns when a select value doesn't match any option", () => {
    const result = coerceImportValue(SELECT_FIELD, "Lukewarm", TEMPERATURE_OPTIONS);
    expect(result.value).toBeUndefined();
    expect(result.warning).toContain("Lukewarm");
  });

  it("splits a multiselect cell on commas and matches each token", () => {
    const result = coerceImportValue(MULTISELECT_FIELD, "NID, NIFT", EXAM_OPTIONS);
    expect(result.value).toEqual(["nid", "nift"]);
    expect(result.warning).toBeUndefined();
  });

  it("keeps recognised multiselect tokens and warns about the rest", () => {
    const result = coerceImportValue(MULTISELECT_FIELD, "NID, NEET", EXAM_OPTIONS);
    expect(result.value).toEqual(["nid"]);
    expect(result.warning).toContain("NEET");
  });

  it("warns and returns undefined when no multiselect token matches", () => {
    const result = coerceImportValue(MULTISELECT_FIELD, "NEET, JEE Main", EXAM_OPTIONS);
    expect(result.value).toBeUndefined();
    expect(result.warning).toBeDefined();
  });
});
