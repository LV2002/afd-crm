import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashEmail,
  hashPhone,
  hashPhoneE164,
  normalizeEmailForHash,
  normalizePhoneE164ForHash,
  normalizePhoneForHash,
  sha256Hex,
} from "../src/lib/integrations/hash-pii";

describe("sha256Hex", () => {
  it("matches a known SHA-256 digest", () => {
    expect(sha256Hex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

describe("normalizePhoneForHash", () => {
  it("strips the leading + and any non-digit characters", () => {
    expect(normalizePhoneForHash("+91 98471-00100")).toBe("919847100100");
  });

  it("is a no-op on an already-clean digit string", () => {
    expect(normalizePhoneForHash("919847100100")).toBe("919847100100");
  });
});

describe("normalizeEmailForHash", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmailForHash("  John.Doe@Example.com  ")).toBe("john.doe@example.com");
  });
});

describe("hashPhone / hashEmail", () => {
  it("hashes the normalised form, not the raw input", () => {
    expect(hashPhone("+91 98471-00100")).toBe(sha256Hex("919847100100"));
  });

  it("produces the same hash for phone numbers that normalise to the same digits", () => {
    expect(hashPhone("+919847100100")).toBe(hashPhone("91-9847-100100"));
  });

  it("hashes the normalised form of an email", () => {
    expect(hashEmail("  John@Example.com  ")).toBe(sha256Hex("john@example.com"));
  });

  it("produces the same hash for emails differing only in case/whitespace", () => {
    expect(hashEmail("John@Example.com")).toBe(hashEmail(" john@example.com "));
  });

  it("cross-checked against Node's own crypto module directly", () => {
    const expected = createHash("sha256").update("919847100100", "utf8").digest("hex");
    expect(hashPhone("+919847100100")).toBe(expected);
  });
});

describe("normalizePhoneE164ForHash (Google Customer Match)", () => {
  it("keeps the leading + intact, unlike Meta's digits-only form", () => {
    expect(normalizePhoneE164ForHash("+91 98471-00100")).toBe("+919847100100");
  });

  it("trims whitespace without dropping the +", () => {
    expect(normalizePhoneE164ForHash("  +919847100100  ")).toBe("+919847100100");
  });

  it("does not invent a + for a value that never had one", () => {
    expect(normalizePhoneE164ForHash("919847100100")).toBe("919847100100");
  });
});

describe("hashPhoneE164", () => {
  it("hashes the E.164 form, not the digits-only Meta form — the two differ", () => {
    expect(hashPhoneE164("+919847100100")).toBe(sha256Hex("+919847100100"));
    expect(hashPhoneE164("+919847100100")).not.toBe(hashPhone("+919847100100"));
  });

  it("produces the same hash for values that normalise to the same E.164 form", () => {
    expect(hashPhoneE164("+919847100100")).toBe(hashPhoneE164(" +91 98471 00100 "));
  });
});
