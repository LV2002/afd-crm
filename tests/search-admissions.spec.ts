import { describe, expect, it } from "vitest";

import { admissionMatches } from "../src/lib/enrolment/search-admissions";

const row = { studentName: "Asha Nair", phone: "+919847012345", course: "Design Regular", centreName: "Kochi", academicYear: "2026-27" };

describe("searching admissions", () => {
  it("matches a name in any case, and part of it", () => {
    expect(admissionMatches(row, "asha")).toBe(true);
    expect(admissionMatches(row, "NAIR")).toBe(true);
    expect(admissionMatches(row, "sha na")).toBe(true);
    expect(admissionMatches(row, "priya")).toBe(false);
  });
  it("needs every word to match, anywhere: name, course, centre or year", () => {
    expect(admissionMatches(row, "asha kochi")).toBe(true);
    expect(admissionMatches(row, "asha kannur")).toBe(false);
    expect(admissionMatches(row, "regular 2026-27")).toBe(true);
  });
  it("finds a phone number however it is written, but not on two digits", () => {
    expect(admissionMatches(row, "98470")).toBe(true);
    expect(admissionMatches(row, "+91 98470 12345")).toBe(true);
    expect(admissionMatches(row, "9847012345")).toBe(true);
    expect(admissionMatches(row, "+919847012345")).toBe(true);
    expect(admissionMatches(row, "98")).toBe(false);
  });
  it("shows everything for an empty search", () => {
    expect(admissionMatches(row, "   ")).toBe(true);
  });
});
