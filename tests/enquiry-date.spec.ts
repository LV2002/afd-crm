import { describe, expect, it } from "vitest";

import { parseEnquiryDate, toISTInputValue } from "../src/lib/leads/enquiry-date";

const NOW = new Date("2026-10-16T10:00:00Z"); // 15:30 IST

describe("parseEnquiryDate", () => {
  it("reads the typed time as Kochi time", () => {
    const r = parseEnquiryDate("2026-10-15T18:20", NOW);
    expect(r.ok && r.at.toISOString()).toBe("2026-10-15T12:50:00.000Z");
  });

  it("refuses the future, and a nonsense year", () => {
    expect(parseEnquiryDate("2026-10-17T09:00", NOW).ok).toBe(false);
    expect(parseEnquiryDate("1999-01-01T09:00", NOW).ok).toBe(false);
  });

  it("allows a minute or two of clock drift", () => {
    expect(parseEnquiryDate("2026-10-16T15:32", NOW).ok).toBe(true);
  });

  it("refuses blank and malformed input", () => {
    expect(parseEnquiryDate("", NOW).ok).toBe(false);
    expect(parseEnquiryDate("15/10/2026", NOW).ok).toBe(false);
  });

  it("round-trips with the input formatter", () => {
    const r = parseEnquiryDate("2026-10-15T18:20", NOW);
    expect(r.ok && toISTInputValue(r.at)).toBe("2026-10-15T18:20");
  });
});

describe("toISTInputValue", () => {
  it("is empty for nothing or junk", () => {
    expect(toISTInputValue(null)).toBe("");
    expect(toISTInputValue("nope")).toBe("");
  });
});
