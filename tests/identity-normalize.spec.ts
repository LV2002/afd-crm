import { describe, expect, it } from "vitest";

import { normalizeEmail } from "../src/lib/identity/normalize-email";
import { normalizePhone } from "../src/lib/identity/normalize-phone";

describe("normalizePhone", () => {
  it("normalises the exact three-formats-for-one-number case from docs/03-V1-AUDIT.md D5", () => {
    const bare = normalizePhone("9847123456");
    const withCountryCode = normalizePhone("919847123456");
    const withPlus = normalizePhone("+919847123456");

    expect(bare).toBe("+919847123456");
    expect(withCountryCode).toBe("+919847123456");
    expect(withPlus).toBe("+919847123456");
    expect(bare).toBe(withCountryCode);
    expect(bare).toBe(withPlus);
  });

  it("strips spaces, hyphens and parentheses before parsing", () => {
    expect(normalizePhone("98471 23456")).toBe("+919847123456");
    expect(normalizePhone("98471-23456")).toBe("+919847123456");
    expect(normalizePhone("+91 98471 23456")).toBe("+919847123456");
    expect(normalizePhone("(98471) 23456")).toBe("+919847123456");
  });

  it("handles a domestic dialing prefix (0 + 10 digits)", () => {
    expect(normalizePhone("09847123456")).toBe("+919847123456");
  });

  it("handles an explicit international dialing prefix (00)", () => {
    expect(normalizePhone("00919847123456")).toBe("+919847123456");
  });

  it("preserves a non-Indian number that already carries its own country code", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("returns null rather than guessing for unparseable input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("not a phone number")).toBeNull();
    expect(normalizePhone("12345")).toBeNull(); // too short, no confident interpretation
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Student@Example.COM  ")).toBe("student@example.com");
  });

  it("returns null for empty or non-email input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
